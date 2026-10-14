'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Navigation from '@/components/Navigation'
import { Download, ExternalLink, FolderArchive, Loader2, AlertTriangle, Plus, Check } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/calculations'
import { todayDateOnly } from '@/lib/utils/dates'
import { receiptYears, receiptsForYear } from '@/lib/receiptExport'
import { TAX_CATEGORIES, suggestCategory } from '@/lib/taxCategories'
import {
  downloadReceipt,
  downloadReceiptsZip,
  type ReceiptWithUrl,
  type ZipProgress,
} from '@/lib/receiptFiles'

/** The fields a row can edit in place. */
type Editable = 'amount' | 'expenseDate' | 'category' | 'vendor' | 'reimbursed'

/**
 * The expense ledger. Every receipt, plus expenses recorded without one,
 * filed by year with the amount, date, vendor and category typed straight
 * into the row. These are what the Tax page totals up.
 */
export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptWithUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [zipProgress, setZipProgress] = useState<ZipProgress | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [savedId, setSavedId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/receipts')
    if (!res.ok) throw new Error('Failed to load receipts')
    const data: ReceiptWithUrl[] = await res.json()
    setReceipts(data)
    return data
  }, [])

  useEffect(() => {
    load()
      .then((data) => setYear((current) => current ?? receiptYears(data)[0] ?? null))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load receipts'))
      .finally(() => setLoading(false))
  }, [load])

  const years = useMemo(() => receiptYears(receipts), [receipts])
  const visible = useMemo(() => (year === null ? [] : receiptsForYear(receipts, year)), [receipts, year])
  const missingFiles = visible.filter((r) => r.storagePath && !r.url).length
  const yearTotal = useMemo(
    () => visible.reduce((sum, r) => sum + (r.amount ?? 0), 0),
    [visible]
  )
  const needAmount = visible.filter((r) => r.amount === null || r.amount === undefined).length

  /** Edit a field locally first, so typing feels instant; the save follows on blur. */
  const edit = (id: number, field: Editable, value: string | boolean | number | null) => {
    setReceipts((current) => current.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }

  const save = async (receipt: ReceiptWithUrl, field: Editable) => {
    setBusyId(receipt.id)
    setSavedId(null)
    try {
      const body: Record<string, unknown> = {}
      if (field === 'amount') body.amount = receipt.amount ?? null
      if (field === 'expenseDate') body.expense_date = receipt.expenseDate ?? null
      if (field === 'category') body.category = receipt.category ?? null
      if (field === 'vendor') body.vendor = receipt.vendor ?? ''
      if (field === 'reimbursed') body.reimbursed = Boolean(receipt.reimbursed)
      const res = await fetch(`/api/receipts/${receipt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Save failed')
      }
      setSavedId(receipt.id)
      setTimeout(() => setSavedId((id) => (id === receipt.id ? null : id)), 1500)
      // The year a row sits under follows its date, so refresh the list.
      if (field === 'expenseDate') await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusyId(null)
    }
  }

  const addExpense = async () => {
    setAdding(true)
    setNotice(null)
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expense_date: year && year !== new Date().getFullYear() ? `${year}-12-31` : todayDateOnly() }),
      })
      if (!res.ok) throw new Error('Could not add an expense')
      const data = await load()
      setYear(receiptYears(data)[0] ?? year)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not add an expense')
    } finally {
      setAdding(false)
    }
  }

  const handleZip = async () => {
    if (year === null) return
    const withFiles = visible.filter((r) => r.storagePath)
    if (withFiles.length === 0) return
    setNotice(null)
    setZipProgress({ done: 0, total: withFiles.length, current: '' })
    try {
      const { failed } = await downloadReceiptsZip(withFiles, `ClearBill-receipts-${year}.zip`, setZipProgress)
      setNotice(
        failed.length === 0
          ? `Saved ${withFiles.length} receipt${withFiles.length === 1 ? '' : 's'} for ${year}.`
          : `Saved the ZIP, but ${failed.length} file${failed.length === 1 ? '' : 's'} could not be fetched; see MISSING.txt inside it.`
      )
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'ZIP export failed')
    } finally {
      setZipProgress(null)
    }
  }

  const handleDownload = async (receipt: ReceiptWithUrl) => {
    if (!receipt.url) return
    setBusyId(receipt.id)
    try {
      await downloadReceipt(receipt.url, receipt.filename)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setBusyId(null)
    }
  }

  const cell = 'w-full min-w-0 bg-transparent px-1.5 py-1 text-sm text-gray-900 dark:text-white border border-transparent rounded focus:border-blue-500 focus:bg-white dark:focus:bg-gray-900 focus:outline-none'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      <main className="md:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Receipts &amp; expenses</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Type the amount, date, vendor and category into each row. Rows save as you move on.
                The <Link href="/tax" className="text-blue-600 dark:text-blue-400 hover:underline">Tax</Link> page totals them by Schedule C line.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addExpense}
                disabled={adding}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium text-gray-900 dark:text-white disabled:opacity-60"
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add expense without a receipt
              </button>
              {year !== null && visible.some((r) => r.storagePath) && (
                <button
                  type="button"
                  onClick={handleZip}
                  disabled={zipProgress !== null}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium"
                >
                  {zipProgress ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {zipProgress.done}/{zipProgress.total}</>
                  ) : (
                    <><FolderArchive className="h-4 w-4" /> Download all {year} as ZIP</>
                  )}
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-400">{error}</div>
          )}
          {notice && (
            <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-700 dark:text-blue-300 flex items-center justify-between gap-3">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice(null)} className="hover:underline">Dismiss</button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : receipts.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center text-gray-500 dark:text-gray-400">
              Nothing yet. Upload a receipt from an invoice page, or add an expense above.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-4" role="tablist" aria-label="Year">
                {years.map((candidate) => {
                  const active = candidate === year
                  return (
                    <button
                      key={candidate}
                      role="tab"
                      aria-selected={active}
                      type="button"
                      onClick={() => setYear(candidate)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                        active
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {candidate}
                      <span className={`ml-1.5 text-xs ${active ? 'text-blue-100' : 'text-gray-400'}`}>
                        {receiptsForYear(receipts, candidate).length}
                      </span>
                    </button>
                  )
                })}
                <span className="ml-auto text-sm text-gray-600 dark:text-gray-300">
                  {year}: <strong className="tabular-nums">{formatCurrency(yearTotal)}</strong> recorded
                  {needAmount > 0 && <span className="text-amber-600 dark:text-amber-400"> · {needAmount} without an amount</span>}
                </span>
              </div>

              {missingFiles > 0 && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {missingFiles} receipt{missingFiles === 1 ? ' is' : 's are'} listed but the file is missing from storage.
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
                <table className="w-full text-sm" style={{ minWidth: 1040 }}>
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      <th className="px-3 py-2 w-36">Date</th>
                      <th className="px-3 py-2">Vendor</th>
                      <th className="px-3 py-2 w-56">Category</th>
                      <th className="px-3 py-2 w-28 text-right">Amount</th>
                      <th className="px-3 py-2 w-20 text-center" title="Billed on to the client">Billed</th>
                      <th className="px-3 py-2">Invoice</th>
                      <th className="px-3 py-2">File</th>
                      <th className="px-3 py-2 w-24"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((r) => {
                      const noAmount = r.amount === null || r.amount === undefined
                      const suggestion = !r.category ? suggestCategory(`${r.vendor ?? ''} ${r.filename} ${r.merchant ?? ''}`) : null
                      return (
                        <tr
                          key={r.id}
                          className={`border-t border-gray-100 dark:border-gray-700/60 ${noAmount ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}
                        >
                          <td className="px-1.5 py-1">
                            <input
                              type="date"
                              value={r.expenseDate ?? ''}
                              onChange={(e) => edit(r.id, 'expenseDate', e.target.value || null)}
                              onBlur={() => void save(r, 'expenseDate')}
                              className={cell}
                              aria-label="Expense date"
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <input
                              type="text"
                              value={r.vendor ?? ''}
                              placeholder={r.merchant ?? 'Vendor'}
                              onChange={(e) => edit(r.id, 'vendor', e.target.value)}
                              onBlur={() => void save(r, 'vendor')}
                              className={cell}
                              aria-label="Vendor"
                            />
                          </td>
                          <td className="px-1.5 py-1">
                            <select
                              value={r.category ?? ''}
                              onChange={(e) => { edit(r.id, 'category', e.target.value || null); void save({ ...r, category: e.target.value || null }, 'category') }}
                              className={`${cell} ${!r.category ? 'text-gray-400' : ''}`}
                              aria-label="Category"
                            >
                              <option value="">{suggestion ? `Choose… (suggest: ${TAX_CATEGORIES.find((c) => c.key === suggestion)?.label})` : 'Choose…'}</option>
                              {TAX_CATEGORIES.map((c) => (
                                <option key={c.key} value={c.key}>{c.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-1.5 py-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={r.amount ?? ''}
                              placeholder={r.total !== null && noAmount ? r.total.toFixed(2) : '0.00'}
                              onChange={(e) => edit(r.id, 'amount', e.target.value === '' ? null : Number(e.target.value))}
                              onBlur={() => void save(r, 'amount')}
                              className={`${cell} text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`}
                              aria-label="Amount"
                            />
                          </td>
                          <td className="px-1.5 py-1 text-center">
                            <input
                              type="checkbox"
                              checked={Boolean(r.reimbursed)}
                              onChange={(e) => { edit(r.id, 'reimbursed', e.target.checked); void save({ ...r, reimbursed: e.target.checked }, 'reimbursed') }}
                              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                              aria-label="Billed on to the client"
                            />
                          </td>
                          <td className="px-3 py-1 whitespace-nowrap">
                            {r.invoiceId ? (
                              <Link href={`/invoices/${r.invoiceId}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                                #{r.invoiceId} {r.invoiceName}
                              </Link>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-1 text-gray-600 dark:text-gray-300 break-all">
                            {r.storagePath ? r.filename : <span className="text-gray-400">no file</span>}
                          </td>
                          <td className="px-2 py-1">
                            <div className="flex items-center justify-end gap-1">
                              {busyId === r.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                              ) : savedId === r.id ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : null}
                              {r.url && (
                                <>
                                  <a href={r.url} target="_blank" rel="noopener noreferrer" title="Open" className="p-1.5 rounded text-gray-500 hover:text-blue-600 dark:hover:text-blue-400">
                                    <ExternalLink className="h-4 w-4" /><span className="sr-only">Open</span>
                                  </a>
                                  <button type="button" onClick={() => void handleDownload(r)} title="Download" className="p-1.5 rounded text-gray-500 hover:text-blue-600 dark:hover:text-blue-400">
                                    <Download className="h-4 w-4" /><span className="sr-only">Download</span>
                                  </button>
                                </>
                              )}
                              {r.storagePath && !r.url && <span className="text-xs text-amber-600 dark:text-amber-400">file missing</span>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Amount is what you paid, from the receipt. Tick Billed when the cost was passed on to the client;
                it then shows in income as well as expenses. The ZIP includes an index.csv of these rows.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
