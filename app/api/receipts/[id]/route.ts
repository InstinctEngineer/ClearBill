import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
