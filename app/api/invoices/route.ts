import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { enhanceInvoice } from '@/lib/utils/calculations'
import type { Invoice, LineItem } from '@/lib/types/database.types'

/**
 * GET /api/invoices
 * Fetch all invoices with their line items
 * Query params:
 *   - sort: 'date' | 'due_date' (default: 'date')
 *   - order: 'asc' | 'desc' (default: 'desc')
 *   - filter: 'all' | 'paid' | 'unpaid' (default: 'all')
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const sortBy = searchParams.get('sort') || 'date'
    const order = (searchParams.get('order') || 'desc') as 'asc' | 'desc'
    const filter = searchParams.get('filter') || 'all'

    // Build query for invoices
    let invoicesQuery = supabase
      .from('invoices')
      .select('*')

    // Apply filter
    if (filter === 'paid') {
      invoicesQuery = invoicesQuery.eq('paid', true)
    } else if (filter === 'unpaid') {
      invoicesQuery = invoicesQuery.eq('paid', false)
    }

    // Apply sorting
    invoicesQuery = invoicesQuery.order(sortBy, { ascending: order === 'asc' })

    const { data: invoices, error: invoicesError } = await invoicesQuery

    if (invoicesError) {
      console.error('Error fetching invoices:', invoicesError)
      return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
    }

    // Fetch all line items for these invoices
    const { data: lineItems, error: lineItemsError } = await supabase
      .from('line_items')
      .select('*')
      .in('invoice_id', invoices.map(inv => inv.id))

    if (lineItemsError) {
      console.error('Error fetching line items:', lineItemsError)
      return NextResponse.json({ error: 'Failed to fetch line items' }, { status: 500 })
    }

    // Fetch all receipts for these invoices
    const { data: receipts, error: receiptsError } = await supabase
      .from('receipts')
      .select('*')
      .in('invoice_id', invoices.map(inv => inv.id))

    if (receiptsError) {
      console.error('Error fetching receipts:', receiptsError)
      return NextResponse.json({ error: 'Failed to fetch receipts' }, { status: 500 })
    }

    // Group line items by invoice_id
    const lineItemsByInvoice: Record<number, LineItem[]> = {}
    lineItems.forEach(item => {
      if (!lineItemsByInvoice[item.invoice_id]) {
        lineItemsByInvoice[item.invoice_id] = []
      }
      lineItemsByInvoice[item.invoice_id].push(item)
    })

    // Group receipts by invoice_id
    const receiptsByInvoice: Record<number, any[]> = {}
    receipts.forEach(receipt => {
      if (!receiptsByInvoice[receipt.invoice_id]) {
        receiptsByInvoice[receipt.invoice_id] = []
      }
      receiptsByInvoice[receipt.invoice_id].push(receipt)
    })

    // Enhance invoices with calculated fields
    const enhancedInvoices = invoices.map(invoice => {
      const invoiceLineItems = lineItemsByInvoice[invoice.id] || []
      const enhanced = enhanceInvoice(invoice as Invoice, invoiceLineItems)
      enhanced.receipts = receiptsByInvoice[invoice.id] || []
      return enhanced
    })

    return NextResponse.json(enhancedInvoices)

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/invoices
 * Create a new invoice
 */
export async function POST(request: Request) {
  console.log('=== POST /api/invoices called ===')
  const supabase = await createClient()

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  console.log('User:', user?.id, 'Auth error:', authError)
  if (authError || !user) {
    console.error('Auth error:', authError)
    return NextResponse.json({
      error: 'Unauthorized',
      details: authError?.message || 'No user session found'
    }, { status: 401 })
  }

  try {
    const body = await request.json()
    console.log('Request body:', body)
    const { project_name, client, date, tax_rate } = body

    // Validation
    if (!project_name || !client || !date || tax_rate === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: project_name, client, date, tax_rate' },
        { status: 400 }
      )
    }

    // Create invoice
    const { data: invoice, error: insertError } = await supabase
      .from('invoices')
      .insert({
        project_name,
        client,
        date,
        tax_rate: parseFloat(tax_rate),
        paid: false,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating invoice:', insertError)
      return NextResponse.json({
        error: 'Failed to create invoice',
        details: insertError.message,
        code: insertError.code
      }, { status: 500 })
    }

    // Return enhanced invoice
    const enhanced = enhanceInvoice(invoice as Invoice, [])
    return NextResponse.json(enhanced, { status: 201 })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
