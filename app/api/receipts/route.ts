import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { ReceiptWithUrl } from '@/lib/receiptFiles'
import { isTaxCategoryKey } from '@/lib/taxCategories'
import { cellToDateOnly, todayDateOnly } from '@/lib/utils/dates'

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
        'id, invoice_id, filename, storage_path, uploaded_at, ocr_data, amount, expense_date, category, vendor, notes, reimbursed, invoices ( project_name, client, date )'
      )
      .order('uploaded_at', { ascending: false })

    if (error) {
      console.error('Error fetching receipts:', error)
      return NextResponse.json({ error: 'Failed to fetch receipts' }, { status: 500 })
    }

    const receipts = (rows ?? []) as unknown as ReceiptRow[]

    // One storage call signs every path; a per-receipt call would be N round trips.
    const paths = receipts.map((row) => row.storage_path).filter((p): p is string => !!p)
    const { data: signed } = paths.length
      ? await supabase.storage.from('receipts').createSignedUrls(paths, SIGNED_URL_SECONDS)
      : { data: [] }
    const urlByPath = new Map((signed ?? []).map((entry) => [entry.path, entry.signedUrl ?? null]))

    const items = receipts.map((row): ReceiptWithUrl => {
      const invoice = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices
      const total = Number(row.ocr_data?.total)
      return {
        id: row.id,
        invoiceId: row.invoice_id,
        invoiceName: invoice?.project_name ?? (row.invoice_id === null ? '' : `Invoice ${row.invoice_id}`),
        client: invoice?.client ?? '',
        invoiceDate: row.expense_date ?? invoice?.date ?? row.uploaded_at.slice(0, 10),
        filename: row.filename ?? row.vendor ?? `expense-${row.id}`,
        storagePath: row.storage_path ?? '',
        uploadedAt: row.uploaded_at,
        merchant: row.vendor ?? row.ocr_data?.merchant ?? null,
        receiptDate: row.expense_date ?? row.ocr_data?.date ?? null,
        total: row.amount ?? (Number.isFinite(total) && total > 0 ? total : null),
        amount: row.amount,
        expenseDate: row.expense_date,
        category: row.category,
        vendor: row.vendor,
        notes: row.notes,
        reimbursed: row.reimbursed,
        url: row.storage_path ? (urlByPath.get(row.storage_path) ?? null) : null,
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
  invoice_id: number | null
  filename: string | null
  storage_path: string | null
  uploaded_at: string
  amount: number | null
  expense_date: string | null
  category: string | null
  vendor: string | null
  notes: string | null
  reimbursed: boolean
  ocr_data: { merchant?: string; date?: string; total?: number | string } | null
  invoices: InvoiceStub | InvoiceStub[] | null
}

/**
 * POST /api/receipts
 * Record an expense that has no file and was not billed through an invoice:
 * the phone bill, software kept for yourself. Fields can be filled in later.
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const amount = body.amount === undefined || body.amount === null || body.amount === ''
      ? null : Number.parseFloat(String(body.amount))
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      return NextResponse.json({ error: 'amount must be a number of 0 or more' }, { status: 400 })
    }
    const expenseDate = body.expense_date ? cellToDateOnly(String(body.expense_date)) : todayDateOnly()
    if (!expenseDate) {
      return NextResponse.json({ error: 'expense_date must be a valid date' }, { status: 400 })
    }
    if (body.category && !isTaxCategoryKey(body.category)) {
      return NextResponse.json({ error: 'Unknown category' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('receipts')
      .insert({
        invoice_id: null,
        filename: null,
        storage_path: null,
        expense_date: expenseDate,
        amount: amount === null ? null : Math.round(amount * 100) / 100,
        category: body.category || null,
        vendor: body.vendor ? String(body.vendor).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
        reimbursed: Boolean(body.reimbursed),
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating expense:', error)
      return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 })
    }
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
