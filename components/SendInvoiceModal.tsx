'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Eye, Mail, Send, X } from 'lucide-react'
import { calculateLineItemTotal, formatCurrency, formatDate } from '@/lib/utils/calculations'
import type { InvoiceWithDetails } from '@/lib/types/database.types'

interface SendDefaults {
  from: string
  to: string
  subject: string
  message: string
  missingConfig: string[]
  sent_at: string | null
  sent_to: string | null
}

interface Props {
  invoice: InvoiceWithDetails
  onClose: () => void
  onSent: () => void
  onPreview: () => void
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500'

export default function SendInvoiceModal({ invoice, onClose, onSent, onPreview }: Props) {
  const [defaults, setDefaults] = useState<SendDefaults | null>(null)
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/invoices/${invoice.id}/send`)
      .then((res) => res.json())
      .then((data: SendDefaults) => {
        setDefaults(data)
        setTo(data.to)
        setSubject(data.subject)
        setMessage(data.message)
      })
      .catch(() => setError('Could not load email settings'))
  }, [invoice.id])

  const items = invoice.line_items
  const hours = items.filter((i) => i.item_type === 'LABOR').reduce((sum, i) => sum + Number(i.quantity), 0)
  const fees = items.filter((i) => i.item_type !== 'LABOR').reduce((sum, i) => sum + calculateLineItemTotal(i), 0)
  const dates = items.map((i) => i.date).sort()
  const notConfigured = !!defaults?.missingConfig.length

  const handleSend = async () => {
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, message }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      onSent()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={sending ? undefined : onClose} />

        <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-lg shadow-xl">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
              <Mail className="h-5 w-5 mr-2" />
              Send Invoice
            </h3>
            <button
              onClick={onClose}
              disabled={sending}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {!defaults ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">{error || 'Loading...'}</div>
          ) : (
            <div className="p-4 sm:p-6 space-y-4">
              {/* Review summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg bg-gray-50 dark:bg-gray-900 p-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Line items</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{items.length}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Labor hours</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{hours}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Fees / other</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(fees)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Amount due</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(invoice.total)}</p>
                </div>
                {dates.length > 0 && (
                  <p className="col-span-2 sm:col-span-4 text-xs text-gray-500 dark:text-gray-400">
                    Work dated {formatDate(dates[0])} – {formatDate(dates[dates.length - 1])}
                  </p>
                )}
              </div>

              {defaults.sent_at && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 p-3 text-sm text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  Already sent {new Date(defaults.sent_at).toLocaleString()} to {defaults.sent_to}. Sending again will email it a second time.
                </div>
              )}

              {notConfigured && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/30 p-3 text-sm text-red-800 dark:text-red-200">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  Email isn&apos;t set up yet. Add these Vercel environment variables: {defaults.missingConfig.join(', ')}
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">From</label>
                <p className="text-gray-900 dark:text-white">{defaults.from || '—'}</p>
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">To (comma-separated)</label>
                <input className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Subject</label>
                <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Message</label>
                <textarea className={inputClass} rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2">
                <button
                  onClick={onPreview}
                  className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Preview PDF
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending || notConfigured || !items.length}
                  className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sending ? 'Sending...' : `Send ${formatCurrency(invoice.total)} invoice`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
