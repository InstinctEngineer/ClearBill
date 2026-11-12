'use client'

import { useState } from 'react'
import { Loader2, Save, X } from 'lucide-react'
import {
  DETAIL_FIELDS,
  DETAIL_KEYS,
  PERSONAL_CATEGORIES,
  personalCategory,
  recordKind,
  recordKinds,
  type DetailKey,
  type PersonalRecord,
  type RecordKind,
  type RecordType,
} from '@/lib/personalDeductions'
import { monthOfDateOnly, todayDateOnly, yearOfDateOnly } from '@/lib/utils/dates'

/** Every field as the inputs hold it: strings and checkboxes. */
interface Draft {
  category: string
  record_type: RecordType
  form: string
  payee: string
  payee_tax_id: string
  record_date: string
  tax_year: string
  amount: string
  reference: string
  payment_method: string
  description: string
  notes: string
  counted: boolean
  expected: boolean
  no_goods_statement: boolean
  /** The extra figures, by key; which ones show depends on the kind. */
  details: Record<DetailKey, string>
  has_loan: boolean
  loan_principal: string
  loan_rate: string
  loan_term: string
  loan_first: string
  loan_closing: string
  loan_prepaid: string
}

const text = (value: string | number | null | undefined) =>
  value === null || value === undefined ? '' : String(value)

/** A draft, pre-filled from whatever the caller already knows. */
function draftFrom(record: Partial<PersonalRecord>): Draft {
  const details = record.details ?? {}
  const loan = details.loan
  const category = record.category ?? 'charity_cash'
  // Settle on a kind the category really has, so the form never opens on a
  // combination the server would refuse.
  const kind = recordKind(category, record.record_type ?? 'payment', record.form) ?? recordKinds(category)[0]
  return {
    category,
    record_type: kind.type,
    form: kind.form ?? '',
    payee: record.payee ?? '',
    payee_tax_id: text(record.payee_tax_id),
    record_date: record.record_date ?? todayDateOnly(),
    tax_year: text(record.tax_year),
    amount: text(record.amount),
    reference: text(record.reference),
    payment_method: text(record.payment_method),
    description: text(record.description),
    notes: text(record.notes),
    counted: record.counted ?? true,
    expected: record.expected ?? false,
    no_goods_statement: details.no_goods_statement ?? false,
    details: Object.fromEntries(DETAIL_KEYS.map((key) => [key, text(details[key])])) as Record<DetailKey, string>,
    has_loan: Boolean(loan),
    loan_principal: text(loan?.principal),
    loan_rate: text(loan?.annual_rate),
    loan_term: text(loan?.term_months ?? 360),
    loan_first: text(loan?.first_payment_date),
    loan_closing: text(loan?.closing_date),
    loan_prepaid: text(loan?.prepaid_interest),
  }
}

/**
 * The year a record most likely belongs to. A statement that arrives early
 * in the year is about the year before; everything else is its own date.
 */
function likelyTaxYear(date: string, type: RecordType): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''
  const year = yearOfDateOnly(date)
  return String(type === 'statement' && monthOfDateOnly(date) <= 3 ? year - 1 : year)
}

/** What the draft currently is, and which optional parts of the form apply. */
function shape(draft: Draft) {
  const kind: RecordKind = recordKind(draft.category, draft.record_type, draft.form || null) ?? recordKinds(draft.category)[0]
  return {
    kind,
    charity: personalCategory(draft.category)?.group === 'charity',
    loan: draft.category === 'mortgage' && draft.record_type === 'document',
  }
}

/** The JSON body the API expects. Only figures that apply to the kind are sent. */
function bodyFrom(draft: Draft): Record<string, unknown> {
  const { kind, charity, loan } = shape(draft)
  const details: Record<string, unknown> = {}
  for (const key of kind.fields ?? []) details[key] = draft.details[key]
  if (charity && draft.no_goods_statement) details.no_goods_statement = true
  if (loan && draft.has_loan) {
    details.loan = {
      principal: draft.loan_principal,
      annual_rate: draft.loan_rate,
      term_months: draft.loan_term,
      first_payment_date: draft.loan_first,
      closing_date: draft.loan_closing,
      prepaid_interest: draft.loan_prepaid,
    }
  }
  return {
    category: draft.category,
    record_type: draft.record_type,
    form: draft.form || null,
    payee: draft.payee,
    payee_tax_id: draft.payee_tax_id,
    record_date: draft.record_date,
    tax_year: draft.tax_year,
    amount: draft.amount,
    reference: draft.reference,
    payment_method: draft.payment_method,
    description: draft.description,
    notes: draft.notes,
    counted: draft.counted,
    expected: draft.expected,
    details,
  }
}

/**
 * Add or edit one personal tax record. What it asks for follows the kind of
 * record chosen, as listed in lib/personalKinds.ts. Saves the fields, then
 * the document if one was chosen, and reports back once both are done.
 */
export default function RecordForm({ record, seed, payees, onSaved, onCancel }: {
  /** The record being edited; omit to add a new one. */
  record?: PersonalRecord
  /** Starting values for a new record, e.g. the same charity as last time. */
  seed?: Partial<PersonalRecord>
  /** Payees already on file, offered as suggestions. */
  payees: string[]
  onSaved: () => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<Draft>(() => {
    const initial = draftFrom(record ?? seed ?? {})
    return record ? initial : { ...initial, tax_year: initial.tax_year || likelyTaxYear(initial.record_date, initial.record_type) }
  })
  // Until the year is typed by hand it follows the date and the kind of record.
  const [yearTouched, setYearTouched] = useState(Boolean(record))
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const patch = (change: Partial<Draft>) =>
    setDraft((current) => {
      const next = { ...current, ...change }
      if (!yearTouched && ('record_date' in change || 'record_type' in change)) {
        next.tax_year = likelyTaxYear(next.record_date, next.record_type)
      }
      return next
    })
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => patch({ [key]: value } as Partial<Draft>)

  const kinds = recordKinds(draft.category)
  const { kind, charity, loan } = shape(draft)
  const chooseKind = (next: RecordKind) => patch({ record_type: next.type, form: next.form ?? '' })

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(record ? `/api/personal/${record.id}` : '/api/personal', {
        method: record ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyFrom(draft)),
      })
      const saved = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(saved.error || 'Failed to save')

      if (file) {
        const form = new FormData()
        form.append('file', file)
        const upload = await fetch(`/api/personal/${saved.id}/file`, { method: 'POST', body: form })
        if (!upload.ok) {
          const body = await upload.json().catch(() => ({}))
          throw new Error(`The record was saved, but the document was not: ${body.error || 'upload failed'}`)
        }
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="bg-white dark:bg-gray-800 rounded-lg shadow p-5 border border-blue-200 dark:border-blue-900">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {record ? 'Edit record' : 'Add a record'}
        </h2>
        <button type="button" onClick={onCancel} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <X className="h-5 w-5" />
        </button>
      </div>

      {error && <p className="mb-4 p-3 rounded-lg text-sm bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Field label="Category">
          <select
            value={draft.category}
            onChange={(e) => {
              // A different category takes different kinds; start on its first.
              const first = recordKinds(e.target.value)[0]
              // A new record starts on the last charity given to. That head
              // start is wrong for any other category, so it goes with it.
              const seeded = !record && seed?.payee !== undefined && draft.payee === seed.payee
              patch({
                category: e.target.value, record_type: first.type, form: first.form ?? '',
                ...(seeded ? { payee: '', payee_tax_id: '', payment_method: '' } : {}),
              })
            }}
            className={INPUT}
          >
            {PERSONAL_CATEGORIES.map((category) => (
              <option key={category.key} value={category.key}>{category.label}</option>
            ))}
          </select>
        </Field>
        <Field label="What is it">
          <select value={kinds.indexOf(kind)} onChange={(e) => chooseKind(kinds[Number(e.target.value)])} className={INPUT}>
            {kinds.map((option, index) => (
              <option key={`${option.type}-${option.form ?? ''}`} value={index}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label={charity ? 'Organization' : 'From or paid to'} wide>
          <input required list="personal-payees" value={draft.payee} onChange={(e) => set('payee', e.target.value)} className={INPUT} />
          <datalist id="personal-payees">
            {payees.map((payee) => <option key={payee} value={payee} />)}
          </datalist>
        </Field>

        <Field label={draft.record_type === 'payment' ? 'Date paid' : 'Date on the document'}>
          <input required type="date" value={draft.record_date} onChange={(e) => set('record_date', e.target.value)} className={INPUT} />
        </Field>
        <Field label="Tax year">
          <input
            required inputMode="numeric" value={draft.tax_year}
            onChange={(e) => { setYearTouched(true); set('tax_year', e.target.value) }}
            className={INPUT}
          />
        </Field>
        <Money label={kind.amount} value={draft.amount} onChange={(v) => set('amount', v)} />
        <Field label={charity ? 'Receipt number' : 'Reference'}>
          <input value={draft.reference} onChange={(e) => set('reference', e.target.value)} className={INPUT} />
        </Field>

        {(kind.fields ?? []).map((key) => (
          <Money
            key={key}
            label={DETAIL_FIELDS[key]}
            value={draft.details[key]}
            onChange={(v) => set('details', { ...draft.details, [key]: v })}
          />
        ))}

        <Field label="Tax ID (EIN), if known">
          <input value={draft.payee_tax_id} onChange={(e) => set('payee_tax_id', e.target.value)} placeholder="12-3456789" className={INPUT} />
        </Field>
        {draft.record_type === 'payment' && (
          <Field label="Paid by">
            <input value={draft.payment_method} onChange={(e) => set('payment_method', e.target.value)} placeholder="Card, check, PayPal…" className={INPUT} />
          </Field>
        )}

        <Field label="Description" wide>
          <input value={draft.description} onChange={(e) => set('description', e.target.value)} className={INPUT} />
        </Field>
        <Field label="Notes" wide>
          <input value={draft.notes} onChange={(e) => set('notes', e.target.value)} className={INPUT} />
        </Field>
      </div>

      {loan && (
        <fieldset className="mt-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
          <Check checked={draft.has_loan} onChange={(v) => set('has_loan', v)}>
            This document sets the loan terms. They are used to estimate each year&apos;s interest until the Form 1098 is added.
          </Check>
          {draft.has_loan && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Money label="Loan amount" value={draft.loan_principal} onChange={(v) => set('loan_principal', v)} />
              <Field label="Interest rate, % a year">
                <input inputMode="decimal" value={draft.loan_rate} onChange={(e) => set('loan_rate', e.target.value)} className={INPUT} />
              </Field>
              <Field label="Term, months">
                <input inputMode="numeric" value={draft.loan_term} onChange={(e) => set('loan_term', e.target.value)} className={INPUT} />
              </Field>
              <Field label="First payment due">
                <input type="date" value={draft.loan_first} onChange={(e) => set('loan_first', e.target.value)} className={INPUT} />
              </Field>
              <Field label="Closing date">
                <input type="date" value={draft.loan_closing} onChange={(e) => set('loan_closing', e.target.value)} className={INPUT} />
              </Field>
              <Money label="Interest prepaid at closing" value={draft.loan_prepaid} onChange={(v) => set('loan_prepaid', v)} />
            </div>
          )}
        </fieldset>
      )}

      <div className="mt-4 space-y-2">
        {charity && (
          <Check checked={draft.no_goods_statement} onChange={(v) => set('no_goods_statement', v)}>
            The document states that no goods or services were received in return. Needed for any single gift of $250 or more.
          </Check>
        )}
        <Check checked={draft.expected} onChange={(v) => set('expected', v)}>
          Not on file yet. The document exists but you do not have it. It is listed as still to get and left out of the totals until you add it.
        </Check>
        <Check checked={draft.counted} onChange={(v) => set('counted', v)}>
          Count this in the totals. Untick to keep a voided or superseded document without counting it.
        </Check>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <label className="block text-sm">
          <span className="block font-medium text-gray-700 dark:text-gray-300 mb-1">
            {record?.filename ? `Replace the document (now ${record.filename})` : 'Document'}
          </span>
          <input
            type="file" accept="application/pdf,image/*,.txt,.eml,.csv"
            onChange={(e) => {
              const chosen = e.target.files?.[0] ?? null
              setFile(chosen)
              // Attaching the document is what makes it no longer "still to get".
              if (chosen) set('expected', false)
            }}
            className="block text-sm text-gray-700 dark:text-gray-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-gray-100 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-200"
          />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </button>
        </div>
      </div>
    </form>
  )
}

const INPUT = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500'

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block text-sm ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="block font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</span>
      {children}
    </label>
  )
}

function Money({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0.00" className={INPUT} />
    </Field>
  )
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
      <span>{children}</span>
    </label>
  )
}
