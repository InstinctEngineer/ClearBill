import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { enhanceInvoice, calculateDebtDiscount } from '@/lib/utils/calculations'
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

    // Fetch all line items for debt tracking
    const { data: allLineItems } = await supabase
      .from('line_items')
      .select('*')

    // Fetch debt total from settings
    const { data: debtSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'DEBT_TOTAL')
      .single()

    const debtTotal = debtSetting ? parseFloat(debtSetting.value) : 0
    const totalDebtRepaid = calculateDebtDiscount(allLineItems as LineItem[] || [])
    const remainingDebt = Math.max(0, debtTotal - totalDebtRepaid)

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

    invoiceSheet.addRow(['Project:', invoice.project_name])
    invoiceSheet.addRow(['Client:', invoice.client])
    invoiceSheet.addRow(['Invoice Date:', new Date(invoice.date).toLocaleDateString()])
    invoiceSheet.addRow(['Status:', invoice.paid ? 'PAID' : 'UNPAID'])
    if (invoice.paid && invoice.paid_date) {
      invoiceSheet.addRow(['Paid Date:', new Date(invoice.paid_date).toLocaleDateString()])
    }
    invoiceSheet.addRow([])

    // Line items header
    invoiceSheet.addRow(['Description', 'Type', 'Date', 'Qty', 'Regular Rate', 'Discount %', 'Discounted Rate', 'Total', 'Discount Reason'])
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
        const discountPercentage = item.discount_percentage || 0
        const discountedRate = item.unit_rate * (1 - discountPercentage / 100)
        const total = item.quantity * discountedRate

        invoiceSheet.addRow([
          item.description,
          item.item_type,
          new Date(item.date).toLocaleDateString(),
          item.quantity,
          item.unit_rate,
          discountPercentage > 0 ? discountPercentage : '',
          discountedRate,
          total,
          item.discount_reason || '',
        ])
      }
    }

    invoiceSheet.addRow([])

    // Calculate original subtotal (before any discounts)
    const originalSubtotal = (lineItems as LineItem[] || []).reduce((sum, item) => {
      return sum + (item.quantity * item.unit_rate)
    }, 0)

    // Calculate total discount amount (all line item discounts)
    const totalDiscount = originalSubtotal - enhancedInvoice.subtotal

    // Totals
    invoiceSheet.addRow(['', '', '', '', '', '', 'Subtotal:', originalSubtotal])

    // Discount line (only if there are discounts)
    let discountRowAdded = false
    if (totalDiscount > 0) {
      const discountRow = invoiceSheet.addRow(['', '', '', '', '', '', 'Discount Applied:', -totalDiscount])
      discountRow.getCell(7).font = { bold: false, color: { argb: 'FFDC2626' } } // Red color
      discountRow.getCell(8).font = { bold: false, color: { argb: 'FFDC2626' } }
      discountRowAdded = true
    }

    invoiceSheet.addRow(['', '', '', '', '', '', 'Amount Due:', enhancedInvoice.subtotal])

    const totalsStartRow = invoiceSheet.lastRow!.number - (discountRowAdded ? 2 : 1)
    const totalRowCount = discountRowAdded ? 3 : 2
    for (let i = 0; i < totalRowCount; i++) {
      const row = invoiceSheet.getRow(totalsStartRow + i)
      if (i === 0 || i === totalRowCount - 1) { // Subtotal and Amount Due rows
        row.getCell(7).font = { bold: true }
        row.getCell(8).font = { bold: true }
      }
    }

    // Column widths
    invoiceSheet.getColumn(1).width = 40  // Description
    invoiceSheet.getColumn(2).width = 12  // Type
    invoiceSheet.getColumn(3).width = 12  // Date
    invoiceSheet.getColumn(4).width = 8   // Qty
    invoiceSheet.getColumn(5).width = 14  // Regular Rate
    invoiceSheet.getColumn(6).width = 12  // Discount %
    invoiceSheet.getColumn(7).width = 15  // Discounted Rate
    invoiceSheet.getColumn(8).width = 12  // Total
    invoiceSheet.getColumn(9).width = 30  // Discount Reason

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

    // Debt Tracking sheet (if debt exists)
    if (debtTotal > 0) {
      const debtSheet = workbook.addWorksheet('Debt Tracking')
      debtSheet.addRow(['Debt Repayment Progress'])
      debtSheet.getCell('A1').font = { size: 14, bold: true }
      debtSheet.addRow([])
      debtSheet.addRow(['Total Debt:', debtTotal])
      debtSheet.addRow(['Repaid to Date:', totalDebtRepaid])
      debtSheet.addRow(['Remaining Balance:', remainingDebt])

      const percentageRepaid = debtTotal > 0 ? (totalDebtRepaid / debtTotal) * 100 : 0
      debtSheet.addRow(['Progress:', `${Math.min(100, percentageRepaid).toFixed(1)}%`])

      // Style the sheet
      debtSheet.getColumn(1).width = 20
      debtSheet.getColumn(2).width = 15

      // Bold labels
      debtSheet.getCell('A3').font = { bold: true }
      debtSheet.getCell('A4').font = { bold: true }
      debtSheet.getCell('A5').font = { bold: true }
      debtSheet.getCell('A6').font = { bold: true }

      // Highlight remaining balance
      const remainingRow = debtSheet.getRow(5)
      remainingRow.font = { bold: true }
      remainingRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F4F6' },
      }
    }

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
