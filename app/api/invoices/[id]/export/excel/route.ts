import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { enhanceInvoice } from '@/lib/utils/calculations'
import type { Invoice, LineItem } from '@/lib/types/database.types'

/**
 * GET /api/invoices/[id]/export/excel
 * Generate and download Excel invoice
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch invoice with line items
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const { data: lineItems } = await supabase
      .from('line_items')
      .select('*')
      .eq('invoice_id', id)
      .order('date', { ascending: false })

    const enhancedInvoice = enhanceInvoice(invoice as Invoice, lineItems as LineItem[] || [])

    // Create workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'ClearBill Invoice Tracker'
    workbook.created = new Date()

    // Invoice sheet
    const invoiceSheet = workbook.addWorksheet('Invoice')

    // Add invoice header
    invoiceSheet.addRow(['INVOICE'])
    invoiceSheet.getCell('A1').font = { size: 18, bold: true }
    invoiceSheet.addRow([])

    invoiceSheet.addRow(['Invoice #:', invoice.id])
    invoiceSheet.addRow(['Project:', invoice.project_name])
    invoiceSheet.addRow(['Client:', invoice.client])
    invoiceSheet.addRow(['Invoice Date:', new Date(invoice.date).toLocaleDateString()])
    invoiceSheet.addRow(['Due Date:', new Date(enhancedInvoice.due_date).toLocaleDateString()])
    invoiceSheet.addRow(['Status:', invoice.paid ? 'PAID' : 'UNPAID'])
    if (invoice.paid && invoice.paid_date) {
      invoiceSheet.addRow(['Paid Date:', new Date(invoice.paid_date).toLocaleDateString()])
    }
    invoiceSheet.addRow([])

    // Line items header
    invoiceSheet.addRow(['Description', 'Type', 'Date', 'Quantity', 'Unit Rate', 'Total'])
    const headerRow = invoiceSheet.lastRow
    if (headerRow) {
      headerRow.font = { bold: true }
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      }
    }

    // Add line items
    if (lineItems && lineItems.length > 0) {
      for (const item of lineItems) {
        invoiceSheet.addRow([
          item.description,
          item.item_type,
          new Date(item.date).toLocaleDateString(),
          item.quantity,
          item.unit_rate,
          item.quantity * item.unit_rate,
        ])
      }
    }

    invoiceSheet.addRow([])

    // Totals
    invoiceSheet.addRow(['', '', '', '', 'Subtotal:', enhancedInvoice.subtotal])
    invoiceSheet.addRow(['', '', '', '', `Tax (${invoice.tax_rate}%):`, enhancedInvoice.tax_set_aside])
    invoiceSheet.addRow(['', '', '', '', 'Total:', enhancedInvoice.total])

    const totalsStartRow = invoiceSheet.lastRow!.number - 2
    for (let i = 0; i < 3; i++) {
      const row = invoiceSheet.getRow(totalsStartRow + i)
      row.getCell(5).font = { bold: true }
      row.getCell(6).font = { bold: true }
    }

    // Column widths
    invoiceSheet.getColumn(1).width = 40
    invoiceSheet.getColumn(2).width = 12
    invoiceSheet.getColumn(3).width = 12
    invoiceSheet.getColumn(4).width = 10
    invoiceSheet.getColumn(5).width = 12
    invoiceSheet.getColumn(6).width = 12

    // Tax Information sheet
    const taxSheet = workbook.addWorksheet('Tax Information')
    taxSheet.addRow(['Tax Information'])
    taxSheet.getCell('A1').font = { size: 14, bold: true }
    taxSheet.addRow([])
    taxSheet.addRow(['Tax Rate:', `${invoice.tax_rate}%`])
    taxSheet.addRow(['Subtotal:', enhancedInvoice.subtotal])
    taxSheet.addRow(['Tax Set Aside:', enhancedInvoice.tax_set_aside])
    taxSheet.addRow(['Total Invoice:', enhancedInvoice.total])

    taxSheet.getColumn(1).width = 20
    taxSheet.getColumn(2).width = 15

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer()

    // Return Excel file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Invoice-${id}-${invoice.project_name.replace(/[^a-zA-Z0-9]/g, '-')}.xlsx"`,
      },
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
