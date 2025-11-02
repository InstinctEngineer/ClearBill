import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/invoices/[id]/line-items
 * Add a new line item to an invoice
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: invoiceId } = await params

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { description, quantity, unit_rate, item_type, date, discount_percentage, discount_reason, applies_to_debt } = body

    // Validation
    if (!description || !quantity || !unit_rate || !item_type || !date) {
      return NextResponse.json(
        { error: 'Missing required fields: description, quantity, unit_rate, item_type, date' },
        { status: 400 }
      )
    }

    if (!['LABOR', 'HARDWARE', 'OTHER'].includes(item_type)) {
      return NextResponse.json(
        { error: 'Invalid item_type. Must be LABOR, HARDWARE, or OTHER' },
        { status: 400 }
      )
    }

    // Verify invoice exists
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Create line item
    const { data: lineItem, error: insertError } = await supabase
      .from('line_items')
      .insert({
        invoice_id: parseInt(invoiceId),
        description,
        quantity: parseFloat(quantity),
        unit_rate: parseFloat(unit_rate),
        item_type,
        date,
        discount_percentage: discount_percentage ? parseFloat(discount_percentage) : 0,
        discount_reason: discount_reason || null,
        applies_to_debt: applies_to_debt || false,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating line item:', insertError)
      return NextResponse.json({ error: 'Failed to create line item' }, { status: 500 })
    }

    return NextResponse.json(lineItem, { status: 201 })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/invoices/[id]/line-items
 * Get all line items for an invoice
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: invoiceId } = await params

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: lineItems, error } = await supabase
      .from('line_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('date', { ascending: false })

    if (error) {
      console.error('Error fetching line items:', error)
      return NextResponse.json({ error: 'Failed to fetch line items' }, { status: 500 })
    }

    return NextResponse.json(lineItems)

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
