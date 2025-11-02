import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import jsPDF from 'jspdf'
import { enhanceInvoice } from '@/lib/utils/calculations'
import type { Invoice, LineItem } from '@/lib/types/database.types'

/**
 * GET /api/invoices/[id]/export/pdf
 * Generate and download PDF invoice
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

    // Create PDF
    const doc = new jsPDF()

    // Title
    doc.setFontSize(24)
    doc.setFont('helvetica', 'bold')
    doc.text('INVOICE', 20, 20)

    // Invoice details
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Invoice Date: ${new Date(invoice.date).toLocaleDateString()}`, 20, 35)
    doc.text(`Due Date: ${new Date(enhancedInvoice.due_date).toLocaleDateString()}`, 20, 42)
    doc.text(`Invoice #${invoice.id}`, 20, 49)

    // Client info
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Bill To:', 20, 65)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(invoice.client, 20, 72)

    // Project name
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Project:', 20, 88)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(12)
    doc.text(invoice.project_name, 20, 95)

    // Line items table
    let yPos = 115
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')

    // Table header
    doc.text('Description', 20, yPos)
    doc.text('Qty', 100, yPos)
    doc.text('Rate', 125, yPos)
    doc.text('Amount', 165, yPos, { align: 'right' })

    yPos += 7
    doc.line(20, yPos, 190, yPos) // Horizontal line
    yPos += 7

    // Table rows
    doc.setFont('helvetica', 'normal')
    if (lineItems && lineItems.length > 0) {
      for (const item of lineItems) {
        const total = item.quantity * item.unit_rate

        // Description (wrap if too long)
        const description = item.description.length > 45
          ? item.description.substring(0, 45) + '...'
          : item.description

        doc.text(description, 20, yPos)
        doc.text(item.quantity.toString(), 100, yPos)
        doc.text(`$${item.unit_rate.toFixed(2)}`, 125, yPos)
        doc.text(`$${total.toFixed(2)}`, 190, yPos, { align: 'right' })

        yPos += 7

        // Add new page if needed
        if (yPos > 250) {
          doc.addPage()
          yPos = 20
        }
      }
    } else {
      doc.text('No line items', 20, yPos)
      yPos += 7
    }

    // Totals section
    yPos += 5
    doc.line(100, yPos, 190, yPos)
    yPos += 10

    doc.setFont('helvetica', 'normal')
    doc.text('Subtotal:', 120, yPos)
    doc.text(`$${enhancedInvoice.subtotal.toFixed(2)}`, 190, yPos, { align: 'right' })

    yPos += 7
    doc.text(`Tax Set Aside (${invoice.tax_rate}%):`, 120, yPos)
    doc.text(`$${enhancedInvoice.tax_set_aside.toFixed(2)}`, 190, yPos, { align: 'right' })

    yPos += 10
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Total:', 120, yPos)
    doc.text(`$${enhancedInvoice.total.toFixed(2)}`, 190, yPos, { align: 'right' })

    // Payment status
    if (invoice.paid) {
      yPos += 15
      doc.setFontSize(14)
      doc.setTextColor(34, 197, 94) // Green
      doc.text('PAID', 20, yPos)
      if (invoice.paid_date) {
        doc.setFontSize(10)
        doc.text(`Payment received: ${new Date(invoice.paid_date).toLocaleDateString()}`, 20, yPos + 7)
      }
    }

    // Footer
    doc.setFontSize(8)
    doc.setTextColor(128, 128, 128)
    doc.text('Generated with ClearBill Invoice Tracker', 105, 285, { align: 'center' })

    // Generate PDF as buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    // Return PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Invoice-${id}-${invoice.project_name.replace(/[^a-zA-Z0-9]/g, '-')}.pdf"`,
      },
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
