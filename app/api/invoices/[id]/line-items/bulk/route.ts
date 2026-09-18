import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { parseLineItem } from '@/lib/lineItems'
import type { LineItemInsert } from '@/lib/types/database.types'

const MAX_BULK_ITEMS = 500

/**
 * POST /api/invoices/[id]/line-items/bulk
 * Insert many line items at once. Backs pasting a block of rows from a
 * spreadsheet into the line item grid. All-or-nothing: if any row fails
 * validation nothing is written, and the response names the offending rows.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: invoiceId } = await params

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const items = body?.items

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 })
    }
    if (items.length > MAX_BULK_ITEMS) {
      return NextResponse.json(
        { error: `Too many rows: ${items.length}. Limit is ${MAX_BULK_ITEMS} per request.` },
        { status: 400 }
      )
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('id')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const rows: LineItemInsert[] = []
    const rowErrors: { row: number; error: string }[] = []

    items.forEach((item, index) => {
      const parsed = parseLineItem(item ?? {}, Number.parseInt(invoiceId, 10))
      if (parsed.ok) rows.push(parsed.value)
      else rowErrors.push({ row: index + 1, error: parsed.error })
    })

    if (rowErrors.length > 0) {
      return NextResponse.json(
        { error: 'Some rows are invalid; nothing was saved', rows: rowErrors },
        { status: 400 }
      )
    }

    const { data: inserted, error: insertError } = await supabase
      .from('line_items')
      .insert(rows)
      .select()

    if (insertError) {
      console.error('Error bulk creating line items:', insertError)
      return NextResponse.json({ error: 'Failed to create line items' }, { status: 500 })
    }

    return NextResponse.json({ items: inserted }, { status: 201 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
