import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { ReceiptOCRData } from '@/lib/types/database.types'

/**
 * PATCH /api/receipts/[id]/ocr-data
 * Save OCR data from client-side processing
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
    const { ocrData, error: ocrError }: { ocrData?: ReceiptOCRData, error?: string } = body

    // Verify receipt exists and belongs to user
    const { data: receipt, error: fetchError } = await supabase
      .from('receipts')
      .select('id')
      .eq('id', id)
      .single()

    if (fetchError || !receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    // Update receipt with OCR data or error
    const updateData = ocrError
      ? {
          ocr_processed: true,
          ocr_error: ocrError,
          ocr_data: null
        }
      : {
          ocr_processed: true,
          ocr_data: ocrData,
          ocr_error: null
        }

    const { error: updateError } = await supabase
      .from('receipts')
      .update(updateData)
      .eq('id', id)

    if (updateError) {
      console.error('Failed to update receipt OCR data:', updateError)
      return NextResponse.json({ error: 'Failed to save OCR data' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Unexpected error saving OCR data:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
