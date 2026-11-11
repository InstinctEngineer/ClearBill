import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { personalStoragePath } from '@/lib/personalDeductions'

/** Same ceiling as invoice receipts. */
const MAX_BYTES = 16 * 1024 * 1024

/**
 * POST /api/personal/[id]/file
 * Attach a document to a record, replacing any it already had. Multipart
 * form with one `file` field. Files go in the same private bucket as
 * business receipts, under personal/ so the two never mix.
 */
export async function POST(
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
    const file = (await request.formData()).get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large. Maximum size is 16 MB' }, { status: 400 })
    }

    const { data: record, error: fetchError } = await supabase
      .from('personal_deductions')
      .select('id, category, tax_year, storage_path')
      .eq('id', id)
      .single()
    if (fetchError || !record) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    const storagePath = personalStoragePath(record, file.name, Date.now())
    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(storagePath, await file.arrayBuffer(), { contentType: file.type, upsert: false })
    if (uploadError) {
      console.error('Error uploading file:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    const { error: updateError } = await supabase
      .from('personal_deductions')
      .update({ filename: file.name, storage_path: storagePath })
      .eq('id', id)
    if (updateError) {
      console.error('Error saving file reference:', updateError)
      await supabase.storage.from('receipts').remove([storagePath])
      return NextResponse.json({ error: 'Failed to attach the file' }, { status: 500 })
    }

    // Only once the new file is safely recorded does the old one go.
    if (record.storage_path) {
      await supabase.storage.from('receipts').remove([record.storage_path])
    }
    return NextResponse.json({ filename: file.name, storage_path: storagePath }, { status: 201 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
