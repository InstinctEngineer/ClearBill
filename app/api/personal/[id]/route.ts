import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { PERSONAL_RECORD_COLUMNS, parsePersonalRecord, toPersonalRecord } from '@/lib/personalDeductions'

/**
 * PATCH /api/personal/[id]
 * Change a record. Accepts any subset of its fields: the change is laid over
 * the stored row and the result validated whole, so an edit can never leave
 * a row that could not have been created.
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
    const { data: current, error: fetchError } = await supabase
      .from('personal_deductions')
      .select(PERSONAL_RECORD_COLUMNS)
      .eq('id', id)
      .single()
    if (fetchError || !current) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    const parsed = parsePersonalRecord({ ...current, ...(await request.json()) })
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { data, error } = await supabase
      .from('personal_deductions')
      .update(parsed.value)
      .eq('id', id)
      .select(PERSONAL_RECORD_COLUMNS)
      .single()

    if (error) {
      console.error('Error updating personal deduction:', error)
      return NextResponse.json({ error: 'Failed to save the record' }, { status: 500 })
    }
    return NextResponse.json(toPersonalRecord(data as unknown as Record<string, unknown>))
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/personal/[id]
 * Remove a record and its document.
 */
export async function DELETE(
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
    const { data: record, error: fetchError } = await supabase
      .from('personal_deductions')
      .select('storage_path')
      .eq('id', id)
      .single()
    if (fetchError || !record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    // The row goes first: a file with no row is clutter, a row with no file is a broken link.
    const { error } = await supabase.from('personal_deductions').delete().eq('id', id)
    if (error) {
      console.error('Error deleting personal deduction:', error)
      return NextResponse.json({ error: 'Failed to delete the record' }, { status: 500 })
    }
    if (record.storage_path) {
      await supabase.storage.from('receipts').remove([record.storage_path])
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
