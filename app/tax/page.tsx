'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Navigation from '@/components/Navigation'
import { CheckCircle2, ChevronDown, ChevronRight, FolderArchive, Loader2, Save } from 'lucide-react'
import {
  Badge, Empty, FlagGroups, Money, Notice, Row, Section, Stat, Table, YearTabs,
} from '@/components/ReportUI'
import { formatCurrency, formatDate } from '@/lib/utils/calculations'
import type { TaxFlag, TaxYearReport } from '@/lib/tax'
import { buildTaxPackageFiles } from '@/lib/taxExport'
import { receiptYear } from '@/lib/receiptExport'
import { downloadTaxPackage, type ReceiptWithUrl, type ZipProgress } from '@/lib/receiptFiles'

interface TaxResponse {
  report: TaxYearReport
  notes: string | null
  years: number[]
}

/**
 * The tax-year page: the figures a preparer asks for, the 1099 reconciled
 * against them, and a list of what still needs a human before filing.
 */
export default function TaxPage() {
  const [year, setYear] = useState<number | null>(null)
  const [data, setData] = useState<TaxResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [form1099, setForm1099] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [zipProgress, setZipProgress] = useState<ZipProgress | null>(null)
  const [zipNotice, setZipNotice] = useState<string | null>(null)
  const [showAccrual, setShowAccrual] = useState(false)

  const load = useCallback(async (target: number | null) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/tax/${target ?? new Date().getFullYear()}`)
      if (!res.ok) throw new Error('Failed to load the tax report')
      const body: TaxResponse = await res.json()
      // First load with no year chosen: jump to the latest year that has data.
      if (target === null && body.years.length > 0 && body.years[0] !== body.report.year) {
        return load(body.years[0])
      }
      setData(body)
      setYear(body.report.year)
      setForm1099(body.report.reconciliation ? body.report.reconciliation.form1099Nec.toFixed(2) : '')
      setNotes(body.notes ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the tax report')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(null)
  }, [load])

  const save1099 = async () => {
    if (year === null) return
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/tax/${year}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form_1099_nec: form1099.trim() === '' ? null : form1099, notes }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to save')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      await load(year)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const downloadPackage = async () => {
    if (!data || year === null) return
    setZipNotice(null)
    setZipProgress({ done: 0, total: 0, current: 'Collecting receipts…' })
    try {
      const res = await fetch('/api/receipts')
      if (!res.ok) throw new Error('Could not list receipts')
      const all: ReceiptWithUrl[] = await res.json()
      const receipts = all.filter((r) => receiptYear(r) === year)
      const { failed } = await downloadTaxPackage(
        buildTaxPackageFiles(data.report), receipts, `ClearBill-tax-${year}.zip`, setZipProgress
      )
      setZipNotice(
        failed.length === 0
          ? `Saved the ${year} tax package with ${receipts.length} receipt${receipts.length === 1 ? '' : 's'}.`
          : `Saved the package, but ${failed.length} receipt file${failed.length === 1 ? '' : 's'} could not be fetched; see receipts/MISSING.txt.`
      )
    } catch (err) {
      setZipNotice(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setZipProgress(null)
    }
  }

  const report = data?.report
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      <main className="md:pl-64">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tax year</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Income received, expenses by Schedule C line, and what still needs you before filing.
              </p>
            </div>
            {report && (
              <button
                type="button"
                onClick={downloadPackage}
                disabled={zipProgress !== null}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium"
              >
                {zipProgress ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> {zipProgress.current || `${zipProgress.done}/${zipProgress.total}`}</>
                ) : (
                  <><FolderArchive className="h-4 w-4" /> Download {report.year} tax package</>
                )}
              </button>
            )}
          </div>

          {data && <YearTabs years={data.years} selected={year} onSelect={(y) => void load(y)} label="Tax year" />}

          {error && <Notice tone="error">{error}</Notice>}
          {zipNotice && <Notice tone="info" onDismiss={() => setZipNotice(null)}>{zipNotice}</Notice>}

          {loading && !report ? (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Working it out…
            </div>
          ) : report ? (
            <div className={`space-y-6 ${loading ? 'opacity-60' : ''}`}>
              {/* Headline figures */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Stat label={`Received in ${report.year}`} value={formatCurrency(report.income.cash.total)}
                  note="Cash basis: payments that arrived this year" accent />
                <Stat label="Expenses in Schedule C boxes" value={formatCurrency(report.expenses.scheduleCTotal)}
                  note={report.expenses.total > report.expenses.scheduleCTotal
                    ? `${formatCurrency(report.expenses.total)} recorded in total; the rest goes on other screens`
                    : 'From receipts with an amount and a category'} />
                <Stat label="Applied to debt by discount" value={formatCurrency(report.income.cash.debtApplied)}
                  note={report.income.cash.debtApplied > 0 ? 'Not received as cash; see the debt section' : 'None this year'} />
              </div>

              {/* 1099 reconciliation */}
              <Section title="1099-NEC reconciliation">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
                  <div className="space-y-3">
                    <label className="block">
                      <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Amount on the 1099-NEC from your client
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={form1099}
                        onChange={(e) => setForm1099(e.target.value)}
                        placeholder="Not entered yet"
                        className="w-48 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes for this year</span>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        placeholder="Anything your preparer should know"
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={save1099}
                      disabled={saving}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                      {saved ? 'Saved' : 'Save'}
                    </button>
                  </div>
                  {report.reconciliation && (
                    <dl className="text-sm min-w-[16rem] bg-gray-50 dark:bg-gray-900/40 rounded-lg p-4 space-y-1.5">
                      <Row k="1099-NEC says" v={formatCurrency(report.reconciliation.form1099Nec)} />
                      <Row k="App shows received" v={formatCurrency(report.reconciliation.cashTotal)} />
                      <Row k="Difference" v={formatCurrency(report.reconciliation.difference)}
                        strong tone={Math.abs(report.reconciliation.difference) < 0.01 ? 'good' : 'bad'} />
                      <Row k="Before discounts" v={formatCurrency(report.reconciliation.grossTotal)} muted />
                      <Row k="Difference vs that" v={formatCurrency(report.reconciliation.differenceFromGross)} muted />
                    </dl>
                  )}
                </div>
              </Section>

              {/* Flags */}
              {report.flags.length > 0 && (
                <Section title="Before you file">
                  <FlagGroups flags={report.flags} action={flagLink} />
                </Section>
              )}

              {/* Payments */}
              <Section title={`Payments received in ${report.year}`}>
                {report.income.cash.payments.length === 0 ? (
                  <Empty>No payments were received in {report.year}.</Empty>
                ) : (
                  <Table
                    head={['Paid', 'Invoice', 'Billed', 'Received', 'Before discounts', 'To debt']}
                    rows={report.income.cash.payments.map((p) => [
                      <span key="d" className="whitespace-nowrap">
                        {formatDate(p.paidDate)}
                        {p.placeholderPaidDate && <Badge tone="warn">confirm</Badge>}
                      </span>,
                      <Link key="i" href={`/invoices/${p.invoiceId}`} className="text-blue-600 dark:text-blue-400 hover:underline">#{p.invoiceId} {p.projectName}</Link>,
                      formatDate(p.invoiceDate),
                      <Money key="n" v={p.net} strong />,
                      <Money key="g" v={p.gross} muted />,
                      <Money key="x" v={p.debtApplied} muted />,
                    ])}
                    foot={['', 'Total', '', <Money key="t" v={report.income.cash.total} strong />, <Money key="tg" v={report.income.cash.gross} muted />, <Money key="td" v={report.income.cash.debtApplied} muted />]}
                    numeric={[3, 4, 5]}
                  />
                )}
              </Section>

              {/* Expenses */}
              <Section title={`Expenses in ${report.year}`}>
                {report.expenses.byCategory.length === 0 && report.expenses.uncategorized === 0 ? (
                  <Empty>
                    No expenses with an amount yet. Enter amounts and categories on the{' '}
                    <Link href="/receipts" className="text-blue-600 dark:text-blue-400 hover:underline">Receipts</Link> page.
                  </Empty>
                ) : (
                  <>
                    <Table
                      head={['Schedule C line', 'Category', 'Items', 'Total', 'Where it goes']}
                      rows={[
                        ...report.expenses.byCategory.map((b) => [
                          b.category.scheduleCLine, b.category.label, String(b.count),
                          <Money key="t" v={b.total} strong />,
                          b.category.separateScreen ? <Badge key="s" tone="info">separate screen</Badge> : 'Expense box',
                        ]),
                        ...(report.expenses.uncategorized > 0
                          ? [['—', 'Uncategorized', '', <Money key="u" v={report.expenses.uncategorized} />, <Badge key="b" tone="bad">needs a category</Badge>]]
                          : []),
                      ]}
                      foot={['', 'Total in expense boxes', '', <Money key="t" v={report.expenses.scheduleCTotal} strong />, '']}
                      numeric={[2, 3]}
                    />
                    <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                      Amounts and categories are edited on the{' '}
                      <Link href="/receipts" className="text-blue-600 dark:text-blue-400 hover:underline">Receipts</Link> page.
                      {report.expenses.reimbursed > 0 && ` ${formatCurrency(report.expenses.reimbursed)} of these were billed on to clients and also sit inside income.`}
                    </p>
                  </>
                )}
              </Section>

              {/* Debt */}
              {report.debt.items.length > 0 && (
                <Section title="Debt repaid through discounts">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Work discounted to settle a debt rather than paid out. {formatCurrency(report.debt.appliedThisYear)} of it landed in {report.year};{' '}
                    {formatCurrency(report.debt.appliedAllTime)} over all years. The cash figures above exclude it.
                  </p>
                  <Table
                    head={['Date', 'Invoice', 'Work', 'Value', 'Discounted', 'Received', 'Year']}
                    rows={report.debt.items.map((d) => [
                      formatDate(d.date),
                      <Link key="i" href={`/invoices/${d.invoiceId}`} className="text-blue-600 dark:text-blue-400 hover:underline">#{d.invoiceId}</Link>,
                      d.description,
                      <Money key="g" v={d.gross} muted />, <Money key="d" v={d.discount} strong />, <Money key="n" v={d.net} muted />,
                      <span key="y" className={d.taxYear === report.year ? 'font-medium' : 'text-gray-400'}>{d.taxYear}</span>,
                    ])}
                    numeric={[3, 4, 5]}
                  />
                </Section>
              )}

              {/* Accrual view, folded */}
              <Section
                title={
                  <button type="button" onClick={() => setShowAccrual((v) => !v)} className="flex items-center gap-2">
                    {showAccrual ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    Billed in {report.year} (accrual view): {formatCurrency(report.income.accrual.total)}
                  </button>
                }
              >
                {showAccrual && (
                  <Table
                    head={['Invoice date', 'Invoice', 'Amount', 'Status']}
                    rows={[
                      ...report.income.accrual.invoices.map((i) => [
                        formatDate(i.invoiceDate),
                        <Link key="i" href={`/invoices/${i.invoiceId}`} className="text-blue-600 dark:text-blue-400 hover:underline">#{i.invoiceId} {i.projectName}</Link>,
                        <Money key="a" v={i.net} />,
                        i.paid ? (i.paidInLaterYear ? <Badge key="s" tone="info">paid {formatDate(i.paidDate!)}</Badge> : `Paid ${formatDate(i.paidDate!)}`) : <Badge key="s" tone="warn">unpaid</Badge>,
                      ]),
                      ...report.income.waived.invoices.map((i) => [
                        formatDate(i.invoiceDate),
                        <Link key="i" href={`/invoices/${i.invoiceId}`} className="text-blue-600 dark:text-blue-400 hover:underline">#{i.invoiceId} {i.projectName}</Link>,
                        <Money key="a" v={i.net} muted />,
                        <Badge key="s" tone="muted">waived, not income</Badge>,
                      ]),
                    ]}
                    numeric={[2]}
                  />
                )}
              </Section>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                These figures come from what was entered in ClearBill. They are a starting point for a tax preparer, not tax advice.
              </p>
            </div>
          ) : (
            <Empty>No invoices or expenses yet.</Empty>
          )}
        </div>
      </main>
    </div>
  )
}

/** Where a flag can be fixed: the invoice or the receipts ledger it names. */
function flagLink(flag: TaxFlag) {
  const href = flag.invoiceId !== undefined
    ? `/invoices/${flag.invoiceId}`
    : flag.expenseId !== undefined ? '/receipts' : null
  if (!href) return null
  return (
    <Link href={href} className="text-blue-600 dark:text-blue-400 hover:underline">
      {flag.invoiceId !== undefined ? 'Open invoice' : 'Open receipts'}
    </Link>
  )
}
