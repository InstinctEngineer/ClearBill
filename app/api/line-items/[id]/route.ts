import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { parseLineItem } from '@/lib/lineItems'

/**
 * Validate a partial line item update by running the provided fields through
 * the shared create-time parser, then keeping only what the caller sent.
 */
function coerce(body: Record<string, unknown>):
  | { ok: true; value: Record<string, unknown>; error?: never }
  | { ok: false; value?: never; error: string } {
  const FIELDS = [
    'description', 'quantity', 'unit_rate', 'item_type', 'date',
    'discount_percentage', 'discount_reason', 'applies_to_debt', 'client_pays',
  ] as const

  const provided = FIELDS.filter((field) => body[field] !== undefined)
  if (provided.length === 0) return { ok: true, value: {} }

  // parseLineItem validates a whole row, so fill the untouched required fields
  // with placeholders it accepts and then discard them from the result.
  const parsed = parseLineItem(
    {
      description: 'placeholder',
      quantity: 0,
      unit_rate: 0,
      item_type: 'LABOR',
      date: '2000-01-01',
      ...body,
    },
    0
  )
  if (!parsed.ok) return { ok: false, error: parsed.error }

  const value: Record<string, unknown> = {}
  for (const field of provided) value[field] = parsed.value[field]
  return { ok: true, value }
}

/**
 * PATCH /api/line-items/[id]
 * Update a line item
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

    // Only the provided fields change; each is coerced the same way the
    // create path coerces it.
    const coerced = coerce(body)
    if (!coerced.ok) return NextResponse.json({ error: coerced.error }, { status: 400 })
    const updateData = coerced.value

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Update line item
    const { data: lineItem, error: updateError } = await supabase
      .from('line_items')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating line item:', updateError)
      return NextResponse.json({ error: 'Failed to update line item' }, { status: 500 })
    }

    return NextResponse.json(lineItem)

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/line-items/[id]
 * Delete a line item
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
    const { error: deleteError } = await supabase
      .from('line_items')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting line item:', deleteError)
      return NextResponse.json({ error: 'Failed to delete line item' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
