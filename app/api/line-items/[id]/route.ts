import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
    const { description, quantity, unit_rate, item_type, date, discount_percentage, discount_reason } = body

    // Build update object
    const updateData: any = {}
    if (description !== undefined) updateData.description = description
    if (quantity !== undefined) updateData.quantity = parseFloat(quantity)
    if (unit_rate !== undefined) updateData.unit_rate = parseFloat(unit_rate)
    if (item_type !== undefined) updateData.item_type = item_type
    if (date !== undefined) updateData.date = date
    if (discount_percentage !== undefined) updateData.discount_percentage = parseFloat(discount_percentage)
    if (discount_reason !== undefined) updateData.discount_reason = discount_reason

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
