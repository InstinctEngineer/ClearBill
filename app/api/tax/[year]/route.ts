import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { availableTaxYears, buildTaxYearReport, type TaxExpense } from '@/lib/tax'
import type { Invoice, LineItem } from '@/lib/types/database.types'

/**
 * GET /api/tax/[year]
 * The full tax-year report, plus the list of years that have any activity.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ year: string }> }
) {
  const supabase = await createClient()
  const { year: yearParam } = await params
  const year = Number.parseInt(yearParam, 10)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'year must be a four-digit year' }, { status: 400 })
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [invoices, lineItems, expenses, migration, taxYear] = await Promise.all([
      supabase.from('invoices').select('id, project_name, client, date, paid, paid_date, waived'),
      supabase.from('line_items').select(
        'id, invoice_id, date, description, item_type, quantity, unit_rate, discount_percentage, applies_to_debt, client_pays'
      ),
      supabase.from('receipts').select(
        'id, invoice_id, filename, expense_date, amount, category, vendor, reimbursed, notes'
      ),
      supabase.from('settings').select('value').eq('key', 'MIGRATION_DATE').maybeSingle(),
      supabase.from('tax_years').select('form_1099_nec, notes').eq('year', year).maybeSingle(),
    ])

    const failed = [invoices, lineItems, expenses].find((r) => r.error)
    if (failed?.error) {
      console.error('Error loading tax data:', failed.error)
      return NextResponse.json({ error: 'Failed to load tax data' }, { status: 500 })
    }

    const toNumber = (v: unknown) => (v === null || v === undefined ? null : Number(v))
    const report = buildTaxYearReport({
      year,
      invoices: (invoices.data ?? []) as Invoice[],
      lineItems: ((lineItems.data ?? []) as LineItem[]).map((item) => ({
        ...item,
        quantity: Number(item.quantity),
        unit_rate: Number(item.unit_rate),
        discount_percentage: Number(item.discount_percentage ?? 0),
      })),
      expenses: ((expenses.data ?? []) as TaxExpense[]).map((e) => ({ ...e, amount: toNumber(e.amount) })),
      // MIGRATION_DATE is stored as a timestamp string; only the day matters.
      migrationDate: migration.data?.value ? String(migration.data.value).slice(0, 10) : null,
      form1099Nec: toNumber(taxYear.data?.form_1099_nec),
    })

    return NextResponse.json({
      report,
      notes: taxYear.data?.notes ?? null,
      years: availableTaxYears((invoices.data ?? []) as Invoice[], (expenses.data ?? []) as TaxExpense[]),
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/tax/[year]
 * Record the 1099-NEC amount the client reported, and any notes.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ year: string }> }
) {
  const supabase = await createClient()
  const { year: yearParam } = await params
  const year = Number.parseInt(yearParam, 10)
  if (!Number.isInteger(year)) {
    return NextResponse.json({ error: 'year must be a four-digit year' }, { status: 400 })
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const row: Record<string, unknown> = { year }

    if (body.form_1099_nec !== undefined) {
      if (body.form_1099_nec === null || body.form_1099_nec === '') {
        row.form_1099_nec = null
      } else {
        const amount = Number.parseFloat(String(body.form_1099_nec).replace(/[$,\s]/g, ''))
        if (!Number.isFinite(amount) || amount < 0) {
          return NextResponse.json({ error: '1099 amount must be a number of 0 or more' }, { status: 400 })
        }
        row.form_1099_nec = Math.round(amount * 100) / 100
      }
    }
    if (body.notes !== undefined) row.notes = String(body.notes).trim() || null

    const { data, error } = await supabase
      .from('tax_years')
      .upsert(row, { onConflict: 'year' })
      .select()
      .single()

    if (error) {
      console.error('Error saving tax year:', error)
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
