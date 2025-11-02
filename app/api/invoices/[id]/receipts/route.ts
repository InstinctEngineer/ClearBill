import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/invoices/[id]/receipts
 * Upload a receipt file
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
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Verify invoice exists
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select('date')
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Check file size (16 MB limit)
    const maxSize = 16 * 1024 * 1024 // 16 MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 16 MB' },
        { status: 400 }
      )
    }

    // Generate storage path: invoices/{invoice_id}/{year}/{month}/{filename}
    const invoiceDate = new Date(invoice.date)
    const year = invoiceDate.getFullYear()
    const month = String(invoiceDate.getMonth() + 1).padStart(2, '0')
    const timestamp = Date.now()
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filename = `${timestamp}_${safeFilename}`
    const storagePath = `invoices/${invoiceId}/${year}/${month}/${filename}`

    // Upload file to Supabase Storage
    const fileBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(storagePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Error uploading file:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    // Save receipt metadata to database
    const { data: receipt, error: dbError } = await supabase
      .from('receipts')
      .insert({
        invoice_id: parseInt(invoiceId),
        filename: file.name,
        storage_path: storagePath,
      })
      .select()
      .single()

    if (dbError) {
      console.error('Error saving receipt metadata:', dbError)
      // Try to clean up uploaded file
      await supabase.storage.from('receipts').remove([storagePath])
      return NextResponse.json({ error: 'Failed to save receipt metadata' }, { status: 500 })
    }

    return NextResponse.json(receipt, { status: 201 })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/invoices/[id]/receipts
 * Get all receipts for an invoice
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
    const { data: receipts, error } = await supabase
      .from('receipts')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('uploaded_at', { ascending: false })

    if (error) {
      console.error('Error fetching receipts:', error)
      return NextResponse.json({ error: 'Failed to fetch receipts' }, { status: 500 })
    }

    // Generate signed URLs for each receipt (valid for 1 hour)
    const receiptsWithUrls = await Promise.all(
      receipts.map(async (receipt) => {
        const { data: signedUrl } = await supabase.storage
          .from('receipts')
          .createSignedUrl(receipt.storage_path, 3600) // 1 hour

        return {
          ...receipt,
          url: signedUrl?.signedUrl || null,
        }
      })
    )

    return NextResponse.json(receiptsWithUrls)

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
