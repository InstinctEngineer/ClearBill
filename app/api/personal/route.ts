import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  PERSONAL_RECORD_COLUMNS,
  isFilingStatus,
  parsePersonalRecord,
  toPersonalRecord,
  type FilingStatus,
  type PersonalResponse,
} from '@/lib/personalDeductions'

/** Signed URLs last long enough to download a year's documents in one sitting. */
const SIGNED_URL_SECONDS = 60 * 60

/**
 * GET /api/personal
 * Every personal deduction record with a signed URL for its document, and
 * the filing status chosen for each year. The page builds each year's report
 * from this with lib/personalDeductions.ts.
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [rows, years] = await Promise.all([
      supabase.from('personal_deductions').select(PERSONAL_RECORD_COLUMNS).order('record_date'),
      supabase.from('tax_years').select('year, filing_status'),
    ])
    if (rows.error) {
      console.error('Error fetching personal deductions:', rows.error)
      return NextResponse.json({ error: 'Failed to load personal deductions' }, { status: 500 })
    }

    const records = ((rows.data ?? []) as unknown as Record<string, unknown>[]).map(toPersonalRecord)

    // One storage call signs every path; a per-record call would be N round trips.
    const paths = records.map((record) => record.storage_path).filter((path): path is string => !!path)
    const { data: signed } = paths.length
      ? await supabase.storage.from('receipts').createSignedUrls(paths, SIGNED_URL_SECONDS)
      : { data: [] }
    const urlByPath = new Map((signed ?? []).map((entry) => [entry.path, entry.signedUrl ?? null]))

    const filingStatus: Record<number, FilingStatus> = {}
    for (const row of years.data ?? []) {
      if (isFilingStatus(row.filing_status)) filingStatus[row.year] = row.filing_status
    }

    const body: PersonalResponse = {
      records: records.map((record) => ({
        ...record,
        url: record.storage_path ? (urlByPath.get(record.storage_path) ?? null) : null,
      })),
      filingStatus,
    }
    return NextResponse.json(body)
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/personal
 * Record a gift, payment, statement or document. The file, if any, is
 * attached afterwards through /api/personal/[id]/file.
 */
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const parsed = parsePersonalRecord(await request.json())
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const { data, error } = await supabase
      .from('personal_deductions')
      .insert(parsed.value)
      .select(PERSONAL_RECORD_COLUMNS)
      .single()

    if (error) {
      console.error('Error saving personal deduction:', error)
      return NextResponse.json({ error: 'Failed to save the record' }, { status: 500 })
    }
    return NextResponse.json(toPersonalRecord(data as unknown as Record<string, unknown>), { status: 201 })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
