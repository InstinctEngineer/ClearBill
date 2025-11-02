import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'

/**
 * POST /api/invoices/import/excel
 * Import invoices from Excel file
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Read Excel file
    const buffer = await file.arrayBuffer()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    const worksheet = workbook.getWorksheet('Data') || workbook.getWorksheet(1)
    if (!worksheet) {
      return NextResponse.json({ error: 'No worksheet found in Excel file' }, { status: 400 })
    }

    // Expected columns:
    // project_name, client, invoice_date, tax_rate, description, quantity, unit_rate, item_type, lineitem_date

    const invoicesMap: Record<string, any> = {}
    const errors: string[] = []
    let rowNum = 1

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return // Skip header

      rowNum = rowNumber

      try {
        const projectName = row.getCell(1).value?.toString().trim()
        const client = row.getCell(2).value?.toString().trim()
        const invoiceDate = row.getCell(3).value
        const taxRate = parseFloat(row.getCell(4).value?.toString() || '0')
        const description = row.getCell(5).value?.toString().trim()
        const quantity = parseFloat(row.getCell(6).value?.toString() || '0')
        const unitRate = parseFloat(row.getCell(7).value?.toString() || '0')
        const itemType = row.getCell(8).value?.toString().trim().toUpperCase()
        const lineItemDate = row.getCell(9).value

        if (!projectName || !client || !invoiceDate || !description) {
          errors.push(`Row ${rowNumber}: Missing required fields`)
          return
        }

        if (!itemType || !['LABOR', 'HARDWARE', 'OTHER'].includes(itemType)) {
          errors.push(`Row ${rowNumber}: Invalid item_type. Must be LABOR, HARDWARE, or OTHER`)
          return
        }

        // Format dates
        const formattedInvoiceDate = invoiceDate instanceof Date
          ? invoiceDate.toISOString().split('T')[0]
          : new Date(invoiceDate.toString()).toISOString().split('T')[0]

        const formattedLineItemDate = lineItemDate instanceof Date
          ? lineItemDate.toISOString().split('T')[0]
          : new Date(lineItemDate?.toString() || invoiceDate.toString()).toISOString().split('T')[0]

        // Group by invoice (project_name + client + date)
        const invoiceKey = `${projectName}_${client}_${formattedInvoiceDate}`

        if (!invoicesMap[invoiceKey]) {
          invoicesMap[invoiceKey] = {
            project_name: projectName,
            client,
            date: formattedInvoiceDate,
            tax_rate: taxRate,
            line_items: [],
          }
        }

        invoicesMap[invoiceKey].line_items.push({
          description,
          quantity,
          unit_rate: unitRate,
          item_type: itemType as 'LABOR' | 'HARDWARE' | 'OTHER',
          date: formattedLineItemDate,
        })

      } catch (error) {
        errors.push(`Row ${rowNumber}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    })

    if (errors.length > 0) {
      return NextResponse.json({
        error: 'Import failed',
        errors,
      }, { status: 400 })
    }

    // Import invoices
    const importedInvoices: any[] = []
    const importErrors: string[] = []

    for (const [key, invoiceData] of Object.entries(invoicesMap)) {
      try {
        // Create invoice
        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .insert({
            project_name: invoiceData.project_name,
            client: invoiceData.client,
            date: invoiceData.date,
            tax_rate: invoiceData.tax_rate,
            paid: false,
          })
          .select()
          .single()

        if (invoiceError) {
          importErrors.push(`Failed to create invoice for ${key}: ${invoiceError.message}`)
          continue
        }

        // Create line items
        const lineItemsWithInvoiceId = invoiceData.line_items.map((item: any) => ({
          ...item,
          invoice_id: invoice.id,
        }))

        const { error: lineItemsError } = await supabase
          .from('line_items')
          .insert(lineItemsWithInvoiceId)

        if (lineItemsError) {
          importErrors.push(`Failed to create line items for invoice ${invoice.id}: ${lineItemsError.message}`)
          // Delete the invoice since line items failed
          await supabase.from('invoices').delete().eq('id', invoice.id)
          continue
        }

        importedInvoices.push(invoice)

      } catch (error) {
        importErrors.push(`Unexpected error for ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully imported ${importedInvoices.length} invoices`,
      imported: importedInvoices.length,
      errors: importErrors.length > 0 ? importErrors : undefined,
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
