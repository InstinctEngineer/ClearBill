'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Navigation from '@/components/Navigation'
import RecordForm from '@/components/personal/RecordForm'
import {
  Badge, Empty, FlagGroups, Money, Notice, Row, Section, Stat, Table, YearTabs,
} from '@/components/ReportUI'
import { Download, ExternalLink, FolderArchive, Loader2, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  FILING_STATUSES,
  buildPersonalYearReport,
  filingStatusLabel,
  otherFigureRows,
  personalYears,
  recordKindLabel,
  statementName,
  type FilingStatus,
  type PayeeYear,
  type PersonalRecord,
  type PersonalRecordWithUrl,
  type PersonalResponse,
} from '@/lib/personalDeductions'
import { buildPersonalPackageFiles, documentZipNames, recordsWithFiles } from '@/lib/personalExport'
import { downloadReceipt, downloadZip, type ZipProgress } from '@/lib/receiptFiles'
import { formatCurrency, formatDate } from '@/lib/utils/calculations'
import { todayDateOnly } from '@/lib/utils/dates'

/** What the entry form is open on: an existing record, or a new one with a head start. */
type FormTarget = { record: PersonalRecord } | { seed: Partial<PersonalRecord> }

const INTEREST_NOTE = {
  form_1098: 'From Form 1098, Box 1',
  estimate: 'Estimate from the loan terms; needs the Form 1098',
  payments: 'Recorded payments only; needs the Form 1098',
  none: 'Nothing on file',
} as const

/**
 * Personal tax records by tax year: charitable gifts, the home mortgage, and
 * the forms the rest of the return is built from (W-2, 1098-E, 1099-R, ...).
 * Deliberately a page of its own. None of this is business activity, and
 * nothing here reaches the invoices or the Summary.
 */
export default function PersonalPage() {
  const [data, setData] = useState<PersonalResponse | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [form, setForm] = useState<FormTarget | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [zipProgress, setZipProgress] = useState<ZipProgress | null>(null)
  const attachInput = useRef<HTMLInputElement>(null)
  const today = useMemo(() => todayDateOnly(), [])

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/personal')
      if (!res.ok) throw new Error('Failed to load personal records')
      const body: PersonalResponse = await res.json()
      setData(body)
      // First load: open on the newest year that has anything in it.
      setYear((current) => current ?? personalYears(body.records, todayDateOnly())[0] ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load personal records')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const records = useMemo(() => data?.records ?? [], [data])
  const years = useMemo(() => personalYears(records, today), [records, today])
  const filingStatus = year !== null ? (data?.filingStatus[year] ?? null) : null
  const report = useMemo(
    () => (year === null ? null : buildPersonalYearReport({ year, records, filingStatus, today })),
    [year, records, filingStatus, today]
  )
  const otherRows = useMemo(() => (report ? otherFigureRows(report.other) : []), [report])
  const urlById = useMemo(() => new Map(records.map((record) => [record.id, record.url])), [records])
  const payees = useMemo(() => [...new Set(records.map((record) => record.payee))].sort(), [records])
  const awaitingFile = useMemo(() => records.filter((record) => record.filename && !record.storage_path), [records])

  const saveFilingStatus = async (status: FilingStatus | null) => {
    if (year === null) return
    setError(null)
    try {
      const res = await fetch(`/api/tax/${year}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filing_status: status }),
      })
      if (!res.ok) throw new Error('Failed to save the filing status')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the filing status')
    }
  }

  const remove = async (record: PersonalRecord) => {
    const what = `${recordKindLabel(record.category, record.record_type, record.form)} from ${record.payee} dated ${formatDate(record.record_date)}`
    if (!window.confirm(`Delete the ${what}? Its document is deleted too.`)) return
    setBusy(`delete-${record.id}`)
    try {
      const res = await fetch(`/api/personal/${record.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete the record')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete the record')
    } finally {
      setBusy(null)
    }
  }

  const download = async (record: PersonalRecordWithUrl) => {
    if (!record.url) return
    setBusy(`download-${record.id}`)
    try {
      await downloadReceipt(record.url, record.filename ?? `record-${record.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setBusy(null)
    }
  }

  /**
   * Attach many documents at once. Each file is matched by name to a record
   * that is still waiting for its document, so a folder of receipts can be
   * dropped in without picking them one by one.
   */
  const attachMany = async (files: File[]) => {
    const waiting = new Map<string, PersonalRecord[]>()
    for (const record of awaitingFile) {
      const key = record.filename!.toLowerCase()
      waiting.set(key, [...(waiting.get(key) ?? []), record])
    }

    let attached = 0
    const skipped: string[] = []
    for (const [index, file] of files.entries()) {
      setBusy(`Attaching ${index + 1} of ${files.length}`)
      const matches = waiting.get(file.name.toLowerCase()) ?? []
      // No match, or more than one record claims the name: leave it for a human.
      if (matches.length !== 1) {
        skipped.push(file.name)
        continue
      }
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/personal/${matches[0].id}/file`, { method: 'POST', body: form })
      if (res.ok) attached++
      else skipped.push(file.name)
    }
    setBusy(null)
    setNotice(
      `Attached ${attached} document${attached === 1 ? '' : 's'}.` +
      (skipped.length > 0 ? ` ${skipped.length} did not match a waiting record: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''}` : '')
    )
    await load()
  }

  const downloadPackage = async () => {
    if (!report || year === null) return
    setNotice(null)
    setZipProgress({ done: 0, total: 0, current: 'Collecting documents…' })
    try {
      const withFiles = recordsWithFiles(records, year)
      const names = documentZipNames(withFiles)
      const { failed } = await downloadZip({
        files: buildPersonalPackageFiles(report),
        attachments: withFiles.map((record) => ({
          name: names.get(record.id)!,
          url: record.url,
          label: record.filename ?? `record-${record.id}`,
        })),
        zipName: `ClearBill-personal-${year}.zip`,
        missingName: 'documents/MISSING.txt',
        onProgress: setZipProgress,
      })
      setNotice(
        failed.length === 0
          ? `Saved the ${year} personal package with ${withFiles.length} document${withFiles.length === 1 ? '' : 's'}.`
          : `Saved the package, but ${failed.length} document${failed.length === 1 ? '' : 's'} could not be fetched; see documents/MISSING.txt.`
      )
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setZipProgress(null)
    }
  }

  const onSaved = async () => {
    setForm(null)
    await load()
  }

  /** The cells every record table ends with: its document, then edit and delete. */
  const tail = (record: PersonalRecord) => {
    const url = urlById.get(record.id) ?? null
    return [
      url ? (
        <span key="doc" className="inline-flex items-center gap-3 whitespace-nowrap">
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline">
            <ExternalLink className="h-3.5 w-3.5" /> Open
          </a>
          <button type="button" onClick={() => void download({ ...record, url })} disabled={busy === `download-${record.id}`} className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-60">
            <Download className="h-3.5 w-3.5" /> Download
          </button>
        </span>
      ) : (
        <span key="doc" className="text-gray-500 dark:text-gray-400" title={record.filename ?? undefined}>
          {record.filename ? 'Waiting for file' : record.expected ? 'Still to get' : 'No document'}
        </span>
      ),
      <span key="actions" className="inline-flex items-center gap-2">
        <button type="button" onClick={() => setForm({ record })} aria-label="Edit" className="text-gray-400 hover:text-blue-600">
          <Pencil className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => void remove(record)} disabled={busy === `delete-${record.id}`} aria-label="Delete" className="text-gray-400 hover:text-red-600 disabled:opacity-60">
          <Trash2 className="h-4 w-4" />
        </button>
      </span>,
    ]
  }

  const lastGift = records.filter((record) => record.category === 'charity_cash' && record.record_type === 'payment').at(-1)
  const newRecordSeed: Partial<PersonalRecord> = lastGift
    ? { category: lastGift.category, payee: lastGift.payee, payee_tax_id: lastGift.payee_tax_id, payment_method: lastGift.payment_method }
    : {}
  /** A statement for the year on screen, dated when statements usually arrive. */
  const statementSeed = (category: string, payee: string, extra: Partial<PersonalRecord> = {}): Partial<PersonalRecord> => ({
    category, payee, record_type: 'statement', tax_year: year!, record_date: `${year! + 1}-01-31`, ...extra,
  })

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      <main className="md:pl-64">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Personal tax records</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-2xl">
                Charitable gifts, the home mortgage and the forms your own return is built from.
                Not part of the business: nothing here appears in invoices or the Summary.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {awaitingFile.length > 0 && (
                <>
                  <input
                    ref={attachInput} type="file" multiple hidden
                    onChange={(e) => {
                      const files = [...(e.target.files ?? [])]
                      e.target.value = ''
                      if (files.length > 0) void attachMany(files)
                    }}
                  />
                  <button type="button" onClick={() => attachInput.current?.click()} disabled={busy !== null} className={SECONDARY}>
                    {busy?.startsWith('Attaching') ? <><Loader2 className="h-4 w-4 animate-spin" /> {busy}</> : <><Paperclip className="h-4 w-4" /> Attach {awaitingFile.length} waiting document{awaitingFile.length === 1 ? '' : 's'}</>}
                  </button>
                </>
              )}
              {report && (
                <button type="button" onClick={downloadPackage} disabled={zipProgress !== null} className={SECONDARY}>
                  {zipProgress ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {zipProgress.current || `${zipProgress.done}/${zipProgress.total}`}</>
                  ) : (
                    <><FolderArchive className="h-4 w-4" /> Download {report.year} package</>
                  )}
                </button>
              )}
              <button type="button" onClick={() => setForm({ seed: newRecordSeed })} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium">
                <Plus className="h-4 w-4" /> Add record
              </button>
            </div>
          </div>

          <YearTabs years={years} selected={year} onSelect={setYear} label="Tax year" />

          {error && <Notice tone="error" onDismiss={() => setError(null)}>{error}</Notice>}
          {notice && <Notice tone="info" onDismiss={() => setNotice(null)}>{notice}</Notice>}

          {form && (
            <div className="mb-6">
              <RecordForm
                key={'record' in form ? form.record.id : 'new'}
                record={'record' in form ? form.record : undefined}
                seed={'seed' in form ? form.seed : undefined}
                payees={payees}
                onSaved={() => void onSaved()}
                onCancel={() => setForm(null)}
              />
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !report ? (
            <Section title="Nothing recorded yet">
              <Empty>Add a gift receipt, a mortgage statement, a W-2 or any other tax form to start a year.</Empty>
            </Section>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Stat label={`Gifts to charity, ${report.year}`} value={formatCurrency(report.charity.total)}
                  note={report.charity.payees.some((entry) => entry.statement) ? 'Annual statement figure where on file' : 'From the receipts on file'} accent />
                <Stat label="Mortgage interest" value={formatCurrency(report.mortgage.interest)}
                  note={INTEREST_NOTE[report.mortgage.source]} />
                <Stat label="Recorded here in total" value={formatCurrency(report.itemizedOnFile)}
                  note="Gifts, mortgage interest, state and local taxes" />
                <Stat label="Standard deduction" value={report.standardDeduction === null ? '—' : formatCurrency(report.standardDeduction)}
                  note={report.filingStatus ? filingStatusLabel(report.filingStatus) : 'Choose a filing status below'} />
              </div>

              <Section title="Does it change the tax bill">
                <label className="block text-sm mb-4">
                  <span className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Filing status for {report.year}</span>
                  <select
                    value={report.filingStatus ?? ''}
                    onChange={(e) => void saveFilingStatus((e.target.value || null) as FilingStatus | null)}
                    className="w-64 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Not chosen</option>
                    {FILING_STATUSES.map((status) => <option key={status.key} value={status.key}>{status.label}</option>)}
                  </select>
                </label>
                <FlagGroups flags={report.flags} />
              </Section>

              {report.expected.length > 0 && (
                <Section title="Still to get">
                  <Table
                    head={['What', 'From', 'Where to get it', 'Document', '']}
                    rows={report.expected.map((record) => [
                      recordKindLabel(record.category, record.record_type, record.form),
                      record.payee,
                      <span key="n" className="text-gray-500 dark:text-gray-400">{record.notes ?? record.description ?? ''}</span>,
                      ...tail(record),
                    ])}
                  />
                </Section>
              )}

              {otherRows.length > 0 && (
                <Section title="Also on the return">
                  <dl className="space-y-2 text-sm max-w-2xl">
                    {otherRows.map((row) => (
                      <div key={row.label}>
                        <Row k={row.label} v={formatCurrency(row.amount)} />
                        {row.note && <p className="text-xs text-gray-500 dark:text-gray-400">{row.note}</p>}
                      </div>
                    ))}
                  </dl>
                </Section>
              )}

              <Section title="Charitable gifts">
                {report.charity.payees.length === 0 ? (
                  <Empty>No gifts recorded for {report.year}.</Empty>
                ) : (
                  <div className="space-y-8">
                    {report.charity.payees.map((entry) => (
                      <CharityBlock
                        key={`${entry.category}-${entry.payee}`}
                        entry={entry}
                        tail={tail}
                        onAddStatement={() => setForm({
                          seed: statementSeed(entry.category, entry.payee, { payee_tax_id: entry.taxId, details: { no_goods_statement: true } }),
                        })}
                      />
                    ))}
                  </div>
                )}
              </Section>

              <Section title="Home mortgage">
                {report.mortgage.source === 'none' && !report.mortgage.loan ? (
                  <Empty>No mortgage records for {report.year}.</Empty>
                ) : (
                  <div className="space-y-5">
                    <dl className="space-y-2 text-sm max-w-xl">
                      {report.mortgage.lender && <Row k="Lender" v={report.mortgage.lender} />}
                      {report.mortgage.loan && (
                        <Row k="Loan" v={`${formatCurrency(report.mortgage.loan.principal)} at ${report.mortgage.loan.annual_rate}% for ${report.mortgage.loan.term_months / 12} years`} muted />
                      )}
                      {report.mortgage.estimatedInterest !== null && (
                        <Row k="Interest the loan terms predict" v={formatCurrency(report.mortgage.estimatedInterest)} muted />
                      )}
                      <Row k="Form 1098, Box 1" v={report.mortgage.form1098 ? formatCurrency(report.mortgage.form1098.amount ?? 0) : 'Not on file'} tone={report.mortgage.form1098 ? undefined : 'bad'} />
                      <Row k="Interest to file" v={formatCurrency(report.mortgage.interest)} strong />
                      {report.propertyTax.total > 0 && <Row k="Property tax paid" v={formatCurrency(report.propertyTax.total)} />}
                    </dl>

                    {report.mortgage.form1098 ? (
                      <Table
                        head={['Form 1098', 'Dated', 'Box 1 interest', 'Document', '']}
                        numeric={[2]}
                        rows={[[
                          report.mortgage.form1098.payee,
                          <Day key="d" v={report.mortgage.form1098.record_date} />,
                          <Money key="a" v={report.mortgage.form1098.amount ?? 0} strong />,
                          ...tail(report.mortgage.form1098),
                        ]]}
                      />
                    ) : report.mortgage.lender && (
                      <button type="button" onClick={() => setForm({ seed: statementSeed('mortgage', report.mortgage.lender!) })} className={SECONDARY}>
                        <Plus className="h-4 w-4" /> Add the {report.year} Form 1098
                      </button>
                    )}

                    {report.mortgage.payments.length > 0 && (
                      <Table
                        head={['Paid', 'Total paid', 'Principal', 'Interest', 'Escrow', 'Balance after', 'Document', '']}
                        numeric={[1, 2, 3, 4, 5]}
                        rows={report.mortgage.payments.map((payment) => [
                          <Day key="d" v={payment.record_date} />,
                          <Figure key="t" v={payment.details.total_paid} />,
                          <Figure key="p" v={payment.details.principal} />,
                          <Figure key="i" v={payment.amount} />,
                          <Figure key="e" v={payment.details.escrow} />,
                          <Figure key="b" v={payment.details.balance} />,
                          ...tail(payment),
                        ])}
                      />
                    )}
                  </div>
                )}
              </Section>

              {report.forms.map((entry) => (
                <Section key={entry.category} title={entry.label}>
                  <Table
                    head={['Dated', 'What', 'From', 'Amount', 'Note', 'Document', '']}
                    numeric={[3]}
                    rows={entry.records.map((record) => [
                      <Day key="d" v={record.record_date} />,
                      <span key="w">
                        {recordKindLabel(record.category, record.record_type, record.form)}
                        {!record.counted && <Badge tone="muted">Not counted</Badge>}
                      </span>,
                      record.payee,
                      <Figure key="a" v={record.amount} />,
                      <span key="n" className="text-gray-500 dark:text-gray-400">{record.description ?? record.notes ?? ''}</span>,
                      ...tail(record),
                    ])}
                  />
                </Section>
              ))}

              {report.documents.length > 0 && (
                <Section title="Other paperwork">
                  <Table
                    head={['Dated', 'What', 'From', 'Note', 'Document', '']}
                    rows={report.documents.map((doc) => [
                      <Day key="d" v={doc.record_date} />,
                      <span key="w">
                        {doc.description ?? recordKindLabel(doc.category, doc.record_type, doc.form)}
                        {!doc.counted && <Badge tone="muted">Not counted</Badge>}
                      </span>,
                      doc.payee,
                      <span key="n" className="text-gray-500 dark:text-gray-400">{doc.notes ?? ''}</span>,
                      ...tail(doc),
                    ])}
                  />
                </Section>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

const SECONDARY = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 text-gray-700 dark:text-gray-200 text-sm font-medium'

/** A date cell that never breaks across lines, so narrow tables scroll instead of stacking. */
function Day({ v }: { v: string }) {
  return <span className="whitespace-nowrap">{formatDate(v)}</span>
}

/** A money cell that stays blank when the figure was never recorded. */
function Figure({ v }: { v: number | null | undefined }) {
  return v === null || v === undefined ? <span className="text-gray-400">—</span> : <Money v={v} />
}

/** One charity's year: its gifts, then how they square with its statement. */
function CharityBlock({ entry, tail, onAddStatement }: {
  entry: PayeeYear
  tail: (record: PersonalRecord) => React.ReactNode[]
  onAddStatement: () => void
}) {
  const { statement, difference } = entry
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {entry.payee}
          {entry.taxId && <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">EIN {entry.taxId}</span>}
        </h3>
        {!statement && (
          <button type="button" onClick={onAddStatement} className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline">
            <Plus className="h-3.5 w-3.5" /> Add the {statementName(entry.category)}
          </button>
        )}
      </div>
      <Table
        head={['Date', 'Receipt #', 'Paid by', 'Amount', 'Document', '']}
        numeric={[3]}
        rows={[
          ...entry.payments.map((gift) => [
            <Day key="d" v={gift.record_date} />,
            gift.reference ?? '',
            gift.payment_method ?? '',
            <Money key="a" v={gift.amount ?? 0} />,
            ...tail(gift),
          ]),
          ...(statement ? [[
            <Day key="d" v={statement.record_date} />,
            <span key="s" className="font-medium">Annual statement</span>,
            '',
            <Money key="a" v={statement.amount ?? 0} strong />,
            ...tail(statement),
          ]] : []),
        ]}
        foot={[
          <span key="l" className="font-semibold">
            To file
            {difference !== null && Math.abs(difference) >= 0.01 && (
              <Badge tone={difference > 0 ? 'warn' : 'bad'}>
                Receipts total {formatCurrency(entry.paymentsTotal)}
              </Badge>
            )}
          </span>,
          '', '',
          <Money key="t" v={entry.deductible} strong />,
          <span key="b" className="text-gray-500 dark:text-gray-400">
            {statement ? 'From the annual statement' : `${entry.payments.length} receipt${entry.payments.length === 1 ? '' : 's'}`}
          </span>,
          '',
        ]}
      />
    </div>
  )
}
