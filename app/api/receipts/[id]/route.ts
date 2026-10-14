import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { isTaxCategoryKey } from '@/lib/taxCategories'
import { cellToDateOnly } from '@/lib/utils/dates'

/**
 * GET /api/receipts/[id]
 * Get a specific receipt with signed URL
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
    const { data: receipt, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    // Generate signed URL (valid for 1 hour)
    const { data: signedUrl } = await supabase.storage
      .from('receipts')
      .createSignedUrl(receipt.storage_path, 3600)

    return NextResponse.json({
      ...receipt,
      url: signedUrl?.signedUrl || null,
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/receipts/[id]
 * Delete a receipt file and metadata
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
    // Get receipt to find storage path
    const { data: receipt, error: fetchError } = await supabase
      .from('receipts')
      .select('storage_path')
      .eq('id', id)
      .single()

    if (fetchError || !receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    // Delete file from storage
    const { error: storageError } = await supabase.storage
      .from('receipts')
      .remove([receipt.storage_path])

    if (storageError) {
      console.warn('Warning: Failed to delete receipt file:', storageError)
      // Continue anyway - we'll clean up the metadata
    }

    // Delete metadata from database
    const { error: deleteError } = await supabase
      .from('receipts')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting receipt metadata:', deleteError)
      return NextResponse.json({ error: 'Failed to delete receipt' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Receipt deleted successfully' })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/receipts/[id]
 * Update the expense fields on a receipt: what it cost, when, what for.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const updates: Record<string, unknown> = {}

    if (body.amount !== undefined) {
      if (body.amount === null || body.amount === '') {
        updates.amount = null
      } else {
        const amount = Number.parseFloat(String(body.amount))
        if (!Number.isFinite(amount) || amount < 0) {
          return NextResponse.json({ error: 'amount must be a number of 0 or more' }, { status: 400 })
        }
        updates.amount = Math.round(amount * 100) / 100
      }
    }
    if (body.expense_date !== undefined) {
      const date = body.expense_date ? cellToDateOnly(String(body.expense_date)) : null
      if (body.expense_date && !date) {
        return NextResponse.json({ error: 'expense_date must be a valid date' }, { status: 400 })
      }
      updates.expense_date = date
    }
    if (body.category !== undefined) {
      if (body.category !== null && body.category !== '' && !isTaxCategoryKey(body.category)) {
        return NextResponse.json({ error: 'Unknown category' }, { status: 400 })
      }
      updates.category = body.category || null
    }
    if (body.vendor !== undefined) updates.vendor = String(body.vendor).trim() || null
    if (body.notes !== undefined) updates.notes = String(body.notes).trim() || null
    if (body.reimbursed !== undefined) updates.reimbursed = Boolean(body.reimbursed)

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data: receipt, error } = await supabase
      .from('receipts')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating receipt:', error)
      return NextResponse.json({ error: 'Failed to update receipt' }, { status: 500 })
    }
    return NextResponse.json(receipt)
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
