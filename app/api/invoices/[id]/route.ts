import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { enhanceInvoice } from '@/lib/utils/calculations'
import type { Invoice, LineItem } from '@/lib/types/database.types'

/**
 * GET /api/invoices/[id]
 * Fetch a single invoice with all its line items and receipts
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
    // Fetch invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Fetch line items
    const { data: lineItems, error: lineItemsError } = await supabase
      .from('line_items')
      .select('*')
      .eq('invoice_id', id)
      .order('date', { ascending: false })

    if (lineItemsError) {
      console.error('Error fetching line items:', lineItemsError)
      return NextResponse.json({ error: 'Failed to fetch line items' }, { status: 500 })
    }

    // Fetch receipts
    const { data: receipts, error: receiptsError } = await supabase
      .from('receipts')
      .select('*')
      .eq('invoice_id', id)
      .order('uploaded_at', { ascending: false })

    if (receiptsError) {
      console.error('Error fetching receipts:', receiptsError)
      return NextResponse.json({ error: 'Failed to fetch receipts' }, { status: 500 })
    }

    // Enhance invoice with calculated fields
    const enhanced = enhanceInvoice(invoice as Invoice, lineItems as LineItem[])
    enhanced.receipts = receipts

    return NextResponse.json(enhanced)

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/invoices/[id]
 * Update an invoice
 */
export async function PATCH(
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
    const body = await request.json()

    // Build update object (only include provided fields)
    const updates: any = {}
    if (body.project_name !== undefined) updates.project_name = body.project_name
    if (body.client !== undefined) updates.client = body.client
    if (body.date !== undefined) updates.date = body.date
    if (body.tax_rate !== undefined) updates.tax_rate = parseFloat(body.tax_rate)
    if (body.paid !== undefined) {
      updates.paid = body.paid
      // Auto-set paid_date when marking as paid
      if (body.paid) {
        updates.paid_date = new Date().toISOString().split('T')[0]
      } else {
        updates.paid_date = null
      }
    }
    if (body.waived !== undefined) updates.waived = body.waived

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Update invoice
    const { data: invoice, error: updateError } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating invoice:', updateError)
      return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 })
    }

    // Fetch line items for enhanced response
    const { data: lineItems } = await supabase
      .from('line_items')
      .select('*')
      .eq('invoice_id', id)

    const enhanced = enhanceInvoice(invoice as Invoice, lineItems as LineItem[] || [])
    return NextResponse.json(enhanced)

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/invoices/[id]
 * Delete an invoice (cascades to line items and receipts)
 */
export async function DELETE(
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
    // First, delete all receipt files from storage
    const { data: receipts } = await supabase
      .from('receipts')
      .select('storage_path')
      .eq('invoice_id', id)

    if (receipts && receipts.length > 0) {
      const filePaths = receipts.map(r => r.storage_path)
      const { error: storageError } = await supabase.storage
        .from('receipts')
        .remove(filePaths)

      if (storageError) {
        console.warn('Warning: Failed to delete some receipt files:', storageError)
        // Continue anyway - database cascade will clean up metadata
      }
    }

    // Delete invoice (this cascades to line_items and receipts tables)
    const { error: deleteError } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting invoice:', deleteError)
      return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Invoice deleted successfully' })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
