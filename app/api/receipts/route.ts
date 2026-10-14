import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { ReceiptListItem } from '@/lib/receiptExport'

/** Signed URLs last long enough to download a year's receipts in one sitting. */
const SIGNED_URL_SECONDS = 60 * 60

/**
 * GET /api/receipts
 * Every receipt, with the invoice it belongs to and a signed URL for the
 * file. Backs the Receipts page and its ZIP export.
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: rows, error } = await supabase
      .from('receipts')
      .select(
        'id, invoice_id, filename, storage_path, uploaded_at, ocr_data, invoices ( project_name, client, date )'
      )
      .order('uploaded_at', { ascending: false })

    if (error) {
      console.error('Error fetching receipts:', error)
      return NextResponse.json({ error: 'Failed to fetch receipts' }, { status: 500 })
    }

    const receipts = (rows ?? []) as unknown as ReceiptRow[]

    // One storage call signs every path; a per-receipt call would be N round trips.
    const paths = receipts.map((row) => row.storage_path)
    const { data: signed } = paths.length
      ? await supabase.storage.from('receipts').createSignedUrls(paths, SIGNED_URL_SECONDS)
      : { data: [] }
    const urlByPath = new Map((signed ?? []).map((entry) => [entry.path, entry.signedUrl ?? null]))

    const items = receipts.map((row): ReceiptListItem & { url: string | null } => {
      const invoice = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices
      const total = Number(row.ocr_data?.total)
      return {
        id: row.id,
        invoiceId: row.invoice_id,
        invoiceName: invoice?.project_name ?? `Invoice ${row.invoice_id}`,
        client: invoice?.client ?? '',
        invoiceDate: invoice?.date ?? row.uploaded_at.slice(0, 10),
        filename: row.filename,
        storagePath: row.storage_path,
        uploadedAt: row.uploaded_at,
        merchant: row.ocr_data?.merchant ?? null,
        receiptDate: row.ocr_data?.date ?? null,
        total: Number.isFinite(total) && total > 0 ? total : null,
        url: urlByPath.get(row.storage_path) ?? null,
      }
    })

    return NextResponse.json(items)
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

interface InvoiceStub {
  project_name: string
  client: string
  date: string
}

interface ReceiptRow {
  id: number
  invoice_id: number
  filename: string
  storage_path: string
  uploaded_at: string
  ocr_data: { merchant?: string; date?: string; total?: number | string } | null
  invoices: InvoiceStub | InvoiceStub[] | null
}
