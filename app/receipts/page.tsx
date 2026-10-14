'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Navigation from '@/components/Navigation'
import { Download, ExternalLink, FolderArchive, Loader2, AlertTriangle } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils/calculations'
import { receiptYears, receiptsForYear } from '@/lib/receiptExport'
import {
  downloadReceipt,
  downloadReceiptsZip,
  type ReceiptWithUrl,
  type ZipProgress,
} from '@/lib/receiptFiles'

/**
 * Every receipt in one place, by year, with a download for each and a ZIP
 * of the whole year for tax time. Before this page the only route to a
 * receipt was through the invoice it was uploaded on.
 */
export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptWithUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [zipProgress, setZipProgress] = useState<ZipProgress | null>(null)
  const [zipNotice, setZipNotice] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/receipts')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load receipts')
        return res.json()
      })
      .then((data: ReceiptWithUrl[]) => {
        setReceipts(data)
        const years = receiptYears(data)
        setYear(years[0] ?? null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load receipts'))
      .finally(() => setLoading(false))
  }, [])

  const years = useMemo(() => receiptYears(receipts), [receipts])
  const visible = useMemo(
    () => (year === null ? [] : receiptsForYear(receipts, year)),
    [receipts, year]
  )
  const missingFiles = visible.filter((receipt) => !receipt.url).length

  const handleZip = async () => {
    if (year === null || visible.length === 0) return
    setZipNotice(null)
    setZipProgress({ done: 0, total: visible.length, current: '' })
    try {
      const { failed } = await downloadReceiptsZip(visible, `ClearBill-receipts-${year}.zip`, setZipProgress)
      setZipNotice(
        failed.length === 0
          ? `Saved ${visible.length} receipt${visible.length === 1 ? '' : 's'} for ${year}.`
          : `Saved the ZIP, but ${failed.length} file${failed.length === 1 ? '' : 's'} could not be fetched; see MISSING.txt inside it.`
      )
    } catch (err) {
      setZipNotice(err instanceof Error ? err.message : 'ZIP export failed')
    } finally {
      setZipProgress(null)
    }
  }

  const handleDownload = async (receipt: ReceiptWithUrl) => {
    if (!receipt.url) return
    setDownloadingId(receipt.id)
    try {
      await downloadReceipt(receipt.url, receipt.filename)
    } catch (err) {
      setZipNotice(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      <main className="md:pl-64">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Receipts</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Every receipt uploaded to an invoice, filed under the invoice&apos;s year.
              </p>
            </div>

            {year !== null && visible.length > 0 && (
              <button
                type="button"
                onClick={handleZip}
                disabled={zipProgress !== null}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium"
              >
                {zipProgress ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {zipProgress.done}/{zipProgress.total}
                  </>
                ) : (
                  <>
                    <FolderArchive className="h-4 w-4" />
                    Download all {year} as ZIP
                  </>
                )}
              </button>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
          {zipNotice && (
            <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-sm text-blue-700 dark:text-blue-300 flex items-center justify-between gap-3">
              <span>{zipNotice}</span>
              <button type="button" onClick={() => setZipNotice(null)} className="hover:underline">
                Dismiss
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading receipts…
            </div>
          ) : receipts.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center text-gray-500 dark:text-gray-400">
              No receipts yet. Upload one from an invoice page and it will appear here.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="Year">
                {years.map((candidate) => {
                  const count = receiptsForYear(receipts, candidate).length
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
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>

              {missingFiles > 0 && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {missingFiles} receipt{missingFiles === 1 ? ' is' : 's are'} listed but the file is missing from storage.
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      <th className="px-4 py-2">Invoice date</th>
                      <th className="px-4 py-2">Invoice</th>
                      <th className="px-4 py-2">File</th>
                      <th className="px-4 py-2">Merchant</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((receipt) => (
                      <tr key={receipt.id} className="border-t border-gray-100 dark:border-gray-700/60">
                        <td className="px-4 py-2 whitespace-nowrap text-gray-900 dark:text-white">
                          {formatDate(receipt.invoiceDate)}
                        </td>
                        <td className="px-4 py-2">
                          <Link
                            href={`/invoices/${receipt.invoiceId}`}
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            #{receipt.invoiceId} {receipt.invoiceName}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-gray-900 dark:text-white break-all">{receipt.filename}</td>
                        <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                          {receipt.merchant ?? <span className="text-gray-400">—</span>}
                          {receipt.receiptDate && (
                            <span className="block text-xs text-gray-400">{receipt.receiptDate}</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-900 dark:text-white">
                          {receipt.total !== null ? formatCurrency(receipt.total) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center justify-end gap-1">
                            {receipt.url ? (
                              <>
                                <a
                                  href={receipt.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open in a new tab"
                                  className="p-1.5 rounded text-gray-500 hover:text-blue-600 dark:hover:text-blue-400"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  <span className="sr-only">Open</span>
                                </a>
                                <button
                                  type="button"
                                  onClick={() => void handleDownload(receipt)}
                                  disabled={downloadingId === receipt.id}
                                  title="Download"
                                  className="p-1.5 rounded text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50"
                                >
                                  {downloadingId === receipt.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Download className="h-4 w-4" />
                                  )}
                                  <span className="sr-only">Download</span>
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-amber-600 dark:text-amber-400">file missing</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                The ZIP names each file by invoice date and number, and includes an index.csv listing
                every receipt with whatever the OCR read from it.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
