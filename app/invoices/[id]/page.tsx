'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navigation from '@/components/Navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Upload,
  CheckCircle,
  Edit2,
  Save,
  X,
  Download,
  Eye,
  Send,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils/calculations'
import type { InvoiceWithDetails, Receipt } from '@/lib/types/database.types'
import { DEFAULT_SETTINGS, type AppSettings } from '@/lib/settings'
import LineItemGrid from '@/components/LineItemGrid'
import ReceiptDetails from '@/components/ReceiptDetails'
import SendInvoiceModal from '@/components/SendInvoiceModal'

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [invoice, setInvoice] = useState<InvoiceWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')

  // Feature settings (controls whether the debt column is offered)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  // Receipt upload state
  const [uploadingReceipt, setUploadingReceipt] = useState(false)

  // Preview modal state
  const [showPreview, setShowPreview] = useState(false)
  const [previewType, setPreviewType] = useState<'pdf' | 'excel' | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>('')

  // Send invoice modal state
  const [showSendModal, setShowSendModal] = useState(false)

  useEffect(() => {
    fetchInvoice()
  }, [resolvedParams.id])

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : DEFAULT_SETTINGS))
      .then(setSettings)
      .catch(() => setSettings(DEFAULT_SETTINGS))
  }, [])

  const fetchInvoice = async () => {
    try {
      const res = await fetch(`/api/invoices/${resolvedParams.id}`)
      if (res.ok) {
        const data = await res.json()
        setInvoice(data)
        setEditedTitle(data.project_name)
      } else if (res.status === 404) {
        router.push('/')
      }
    } catch (error) {
      console.error('Error fetching invoice:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTogglePaid = async () => {
    if (!invoice) return

    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid: !invoice.paid }),
      })
      if (res.ok) {
        fetchInvoice()
      }
    } catch (error) {
      console.error('Error updating invoice:', error)
    }
  }

  const handleToggleWaived = async () => {
    if (!invoice) return

    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waived: !invoice.waived }),
      })
      if (res.ok) {
        fetchInvoice()
      }
    } catch (error) {
      console.error('Error updating invoice:', error)
    }
  }

  const handleSaveTitle = async () => {
    if (!invoice || editedTitle === invoice.project_name) {
      setEditingTitle(false)
      return
    }

    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_name: editedTitle }),
      })
      if (res.ok) {
        fetchInvoice()
        setEditingTitle(false)
      }
    } catch (error) {
      console.error('Error updating title:', error)
    }
  }

  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingReceipt(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`/api/invoices/${resolvedParams.id}/receipts`, {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        fetchInvoice()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to upload receipt')
      }
    } catch (error) {
      console.error('Error uploading receipt:', error)
      alert('Failed to upload receipt')
    } finally {
      setUploadingReceipt(false)
      e.target.value = ''
    }
  }

  const handleDeleteReceipt = async (receiptId: number) => {
    if (!confirm('Are you sure you want to delete this receipt?')) return

    try {
      const res = await fetch(`/api/receipts/${receiptId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        fetchInvoice()
      }
    } catch (error) {
      console.error('Error deleting receipt:', error)
    }
  }

  const handlePreview = (type: 'pdf' | 'excel') => {
    const url = `/api/invoices/${resolvedParams.id}/export/${type}`
    setPreviewUrl(url)
    setPreviewType(type)
    setShowPreview(true)
  }

  const handleClosePreview = () => {
    setShowPreview(false)
    setPreviewUrl('')
    setPreviewType(null)
  }


  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      'Paid': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      'Current': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      'Overdue': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      'Critical': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      'Severely Overdue': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  const getItemTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'LABOR': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      'HARDWARE': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      'OTHER': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    }
    return colors[type] || 'bg-gray-100 text-gray-800'
  }

  if (loading) {
    return (
      <div className="flex h-full">
        <Navigation />
        <div className="flex-1 md:pl-64 flex items-center justify-center">
          <div className="text-gray-500 dark:text-gray-400">Loading invoice...</div>
        </div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex h-full">
        <Navigation />
        <div className="flex-1 md:pl-64 flex items-center justify-center">
          <div className="text-gray-500 dark:text-gray-400">Invoice not found</div>
        </div>
      </div>
    )
  }

  // Organize receipts by year/month
  const receiptTree: Record<number, Record<number, Receipt[]>> = {}
  invoice.receipts.forEach((receipt) => {
    const uploadDate = new Date(receipt.uploaded_at)
    const year = uploadDate.getFullYear()
    const month = uploadDate.getMonth() + 1

    if (!receiptTree[year]) receiptTree[year] = {}
    if (!receiptTree[year][month]) receiptTree[year][month] = []
    receiptTree[year][month].push(receipt)
  })

  return (
    <div className="flex h-full">
      <Navigation />

      <div className="flex-1 md:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <Link
              href="/"
              className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Invoices
            </Link>

            {/* Title Section */}
            <div className="mb-4">
              <div className="flex items-center gap-2 sm:gap-4">
                {editingTitle ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-blue-600 focus:outline-none flex-1 min-w-0"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveTitle}
                      className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg touch-manipulation"
                    >
                      <Save className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => {
                        setEditedTitle(invoice.project_name)
                        setEditingTitle(false)
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg touch-manipulation"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex-1 min-w-0 break-words">
                      {invoice.project_name}
                    </h1>
                    <button
                      onClick={() => setEditingTitle(true)}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg touch-manipulation flex-shrink-0"
                    >
                      <Edit2 className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons - Responsive Grid */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3">
              {/* Send Invoice */}
              <button
                onClick={() => setShowSendModal(true)}
                className="col-span-2 sm:col-span-1 inline-flex items-center justify-center px-4 sm:px-6 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors touch-manipulation"
              >
                <Send className="h-5 w-5 mr-2" />
                {invoice.sent_at ? 'Resend Invoice' : 'Send Invoice'}
              </button>

              {/* PDF Preview & Export */}
              <div className="flex gap-1">
                <button
                  onClick={() => handlePreview('pdf')}
                  className="inline-flex items-center justify-center px-2 sm:px-3 py-2.5 sm:py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-l-lg transition-colors touch-manipulation"
                  title="Preview PDF"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <a
                  href={`/api/invoices/${invoice.id}/export/pdf`}
                  download
                  className="inline-flex items-center justify-center px-2 sm:px-3 py-2.5 sm:py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-r-lg transition-colors touch-manipulation"
                  title="Download PDF"
                >
                  <Download className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">PDF</span>
                </a>
              </div>

              {/* Excel Preview & Export */}
              <div className="flex gap-1">
                <button
                  onClick={() => handlePreview('excel')}
                  className="inline-flex items-center justify-center px-2 sm:px-3 py-2.5 sm:py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-l-lg transition-colors touch-manipulation"
                  title="Preview Excel"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <a
                  href={`/api/invoices/${invoice.id}/export/excel`}
                  download
                  className="inline-flex items-center justify-center px-2 sm:px-3 py-2.5 sm:py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-r-lg transition-colors touch-manipulation"
                  title="Download Excel"
                >
                  <Download className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Excel</span>
                </a>
              </div>

              {/* Mark as Paid Button */}
              <button
                onClick={handleTogglePaid}
                className={`col-span-2 sm:col-span-1 inline-flex items-center justify-center px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg text-sm font-medium transition-colors touch-manipulation ${
                  invoice.paid
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-orange-600 hover:bg-orange-700 text-white'
                }`}
              >
                <CheckCircle className="h-5 w-5 mr-2" />
                {invoice.paid ? 'Paid' : 'Mark as Paid'}
              </button>

              {/* Waive Invoice Button */}
              <button
                onClick={handleToggleWaived}
                className={`col-span-2 sm:col-span-1 inline-flex items-center justify-center px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg text-sm font-medium transition-colors touch-manipulation ${
                  invoice.waived
                    ? 'bg-gray-600 hover:bg-gray-700 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200'
                }`}
              >
                <X className="h-5 w-5 mr-2" />
                {invoice.waived ? 'Waived' : 'Waive Invoice'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Invoice Info */}
            <div className="lg:col-span-2 space-y-6">
              {/* Invoice Details Card */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Invoice Details
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Client</p>
                    <p className="text-lg font-medium text-gray-900 dark:text-white">
                      {invoice.client}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Status</p>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(invoice.overdue_status)}`}>
                      {invoice.overdue_status}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Invoice Date</p>
                    <p className="text-lg font-medium text-gray-900 dark:text-white">
                      {formatDate(invoice.date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Due Date</p>
                    <p className="text-lg font-medium text-gray-900 dark:text-white">
                      {formatDate(invoice.due_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Tax Rate</p>
                    <p className="text-lg font-medium text-gray-900 dark:text-white">
                      {invoice.tax_rate}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Sent</p>
                    <p className="text-lg font-medium text-gray-900 dark:text-white">
                      {invoice.sent_at ? formatDate(invoice.sent_at) : 'Not sent'}
                    </p>
                    {invoice.sent_to && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 break-all">{invoice.sent_to}</p>
                    )}
                  </div>
                  {invoice.paid && invoice.paid_date && (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Paid Date</p>
                      <p className="text-lg font-medium text-gray-900 dark:text-white">
                        {formatDate(invoice.paid_date)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Totals Card */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Summary
                </h2>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
                    <span className="text-lg font-medium text-gray-900 dark:text-white">
                      {formatCurrency(invoice.subtotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Tax Set Aside ({invoice.tax_rate}%)</span>
                    <span className="text-lg font-medium text-orange-600 dark:text-orange-400">
                      {formatCurrency(invoice.tax_set_aside)}
                    </span>
                  </div>
                  <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold text-gray-900 dark:text-white">Total</span>
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">
                        {formatCurrency(invoice.total)}
                      </span>
                    </div>
                  </div>

                  {/* Income Tracking Note */}
                  {(invoice.waived || !invoice.paid) && (
                    <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {invoice.waived
                          ? 'This invoice is waived and will not count toward income or tax calculations.'
                          : 'This invoice will only count toward income and tax when marked as paid.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Receipts Card */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
                    Receipts ({invoice.receipts.length})
                  </h2>
                  <label className="inline-flex items-center px-3 py-2 sm:py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer transition-colors touch-manipulation flex-shrink-0">
                    {uploadingReceipt ? (
                      <span className="px-1">Uploading...</span>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Upload</span>
                      </>
                    )}
                    <input
                      type="file"
                      onChange={handleUploadReceipt}
                      disabled={uploadingReceipt}
                      className="hidden"
                      accept=".pdf,.png,.jpg,.jpeg,.gif,.webp"
                    />
                  </label>
                </div>

                {invoice.receipts.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No receipts uploaded yet
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.keys(receiptTree)
                      .sort((a, b) => parseInt(b) - parseInt(a))
                      .map((year) => (
                        <div key={year}>
                          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            {year}
                          </h3>
                          {Object.keys(receiptTree[parseInt(year)])
                            .sort((a, b) => parseInt(b) - parseInt(a))
                            .map((month) => (
                              <div key={month} className="ml-4 mb-3">
                                <h4 className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                                  {new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long' })}
                                </h4>
                                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                  {receiptTree[parseInt(year)][parseInt(month)].map((receipt) => (
                                    <ReceiptDetails
                                      key={receipt.id}
                                      receipt={receipt}
                                      onRefresh={fetchInvoice}
                                      onDelete={handleDeleteReceipt}
                                    />
                                  ))}
                                </div>
                              </div>
                            ))}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Line Items — full width; the grid needs every pixel it can get */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-8">
            <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
                Line Items
              </h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Type directly into the grid. Rows save themselves as you move on.
              </p>
            </div>

            <LineItemGrid
              invoiceId={invoice.id}
              lineItems={invoice.line_items}
              defaultDate={invoice.date}
              showDebtColumn={settings.debtTrackingEnabled}
              onChanged={fetchInvoice}
            />
          </div>
        </div>
      </div>

      {/* Send Invoice Modal */}
      {showSendModal && (
        <SendInvoiceModal
          invoice={invoice}
          onClose={() => setShowSendModal(false)}
          onSent={() => {
            setShowSendModal(false)
            fetchInvoice()
          }}
          onPreview={() => handlePreview('pdf')}
        />
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
              onClick={handleClosePreview}
            />

            {/* Modal */}
            <div className="relative w-full max-w-7xl bg-white dark:bg-gray-800 rounded-lg shadow-xl">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {previewType === 'pdf' ? 'PDF Preview' : 'Excel Preview'}
                </h3>
                <div className="flex items-center gap-2">
                  <a
                    href={previewUrl}
                    download
                    className="inline-flex items-center px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </a>
                  <button
                    onClick={handleClosePreview}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-4" style={{ height: 'calc(100vh - 12rem)' }}>
                {previewType === 'pdf' ? (
                  <iframe
                    src={previewUrl}
                    className="w-full h-full rounded border border-gray-200 dark:border-gray-700"
                    title="PDF Preview"
                  />
                ) : (
                  <iframe
                    src={previewUrl}
                    className="w-full h-full rounded border border-gray-200 dark:border-gray-700"
                    title="Excel Preview"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
