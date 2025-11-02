'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Navigation from '@/components/Navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  FileText,
  Calendar,
  DollarSign,
  CheckCircle,
  Edit2,
  Save,
  X,
  Download,
} from 'lucide-react'
import { formatCurrency, formatDate, calculateDiscountedRate, calculateLineItemTotal } from '@/lib/utils/calculations'
import type { InvoiceWithDetails, LineItem, Receipt } from '@/lib/types/database.types'

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const [invoice, setInvoice] = useState<InvoiceWithDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingTitle, setEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')

  // Line item form state
  const [showLineItemForm, setShowLineItemForm] = useState(false)
  const [lineItemForm, setLineItemForm] = useState({
    description: '',
    quantity: '1',
    unit_rate: '',
    item_type: 'LABOR',
    date: new Date().toISOString().split('T')[0],
    discount_percentage: '0',
    discount_reason: '',
  })

  // Line item editing state
  const [editingLineItem, setEditingLineItem] = useState<number | null>(null)
  const [editLineItemForm, setEditLineItemForm] = useState<LineItem | null>(null)

  // Receipt upload state
  const [uploadingReceipt, setUploadingReceipt] = useState(false)

  useEffect(() => {
    fetchInvoice()
  }, [resolvedParams.id])

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

  const handleAddLineItem = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const res = await fetch(`/api/invoices/${resolvedParams.id}/line-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lineItemForm),
      })

      if (res.ok) {
        setLineItemForm({
          description: '',
          quantity: '1',
          unit_rate: '',
          item_type: 'LABOR',
          date: new Date().toISOString().split('T')[0],
          discount_percentage: '0',
          discount_reason: '',
        })
        setShowLineItemForm(false)
        fetchInvoice()
      } else {
        alert('Failed to add line item')
      }
    } catch (error) {
      console.error('Error adding line item:', error)
    }
  }

  const handleEditLineItem = (item: LineItem) => {
    setEditingLineItem(item.id)
    setEditLineItemForm(item)
  }

  const handleSaveLineItem = async () => {
    if (!editLineItemForm) return

    try {
      const res = await fetch(`/api/line-items/${editLineItemForm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editLineItemForm),
      })

      if (res.ok) {
        setEditingLineItem(null)
        setEditLineItemForm(null)
        fetchInvoice()
      } else {
        alert('Failed to update line item')
      }
    } catch (error) {
      console.error('Error updating line item:', error)
    }
  }

  const handleDeleteLineItem = async (itemId: number) => {
    if (!confirm('Are you sure you want to delete this line item?')) return

    try {
      const res = await fetch(`/api/line-items/${itemId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        fetchInvoice()
      }
    } catch (error) {
      console.error('Error deleting line item:', error)
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
          <div className="mb-8">
            <Link
              href="/"
              className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Invoices
            </Link>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {editingTitle ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="text-3xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-blue-600 focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveTitle}
                      className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg"
                    >
                      <Save className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => {
                        setEditedTitle(invoice.project_name)
                        setEditingTitle(false)
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                      {invoice.project_name}
                    </h1>
                    <button
                      onClick={() => setEditingTitle(true)}
                      className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                      <Edit2 className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3">
                {/* Export Buttons */}
                <a
                  href={`/api/invoices/${invoice.id}/export/pdf`}
                  download
                  className="inline-flex items-center px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
                  title="Export as PDF"
                >
                  <Download className="h-5 w-5 mr-2" />
                  PDF
                </a>
                <a
                  href={`/api/invoices/${invoice.id}/export/excel`}
                  download
                  className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
                  title="Export as Excel"
                >
                  <Download className="h-5 w-5 mr-2" />
                  Excel
                </a>

                {/* Mark as Paid Button */}
                <button
                  onClick={handleTogglePaid}
                  className={`inline-flex items-center px-6 py-3 rounded-lg font-medium transition-colors ${
                    invoice.paid
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-orange-600 hover:bg-orange-700 text-white'
                  }`}
                >
                  <CheckCircle className="h-5 w-5 mr-2" />
                  {invoice.paid ? 'Paid' : 'Mark as Paid'}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Invoice Info */}
            <div className="lg:col-span-2 space-y-6">
              {/* Invoice Details Card */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Invoice Details
                </h2>
                <div className="grid grid-cols-2 gap-4">
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

              {/* Line Items */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Line Items
                    </h2>
                    <button
                      onClick={() => setShowLineItemForm(!showLineItemForm)}
                      className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Line Item
                    </button>
                  </div>
                </div>

                {showLineItemForm && (
                  <form onSubmit={handleAddLineItem} className="p-6 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Description *
                        </label>
                        <input
                          type="text"
                          required
                          value={lineItemForm.description}
                          onChange={(e) => setLineItemForm({ ...lineItemForm, description: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                          placeholder="e.g., Web development hours"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Quantity *
                        </label>
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          value={lineItemForm.quantity}
                          onChange={(e) => setLineItemForm({ ...lineItemForm, quantity: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Unit Rate *
                        </label>
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          value={lineItemForm.unit_rate}
                          onChange={(e) => setLineItemForm({ ...lineItemForm, unit_rate: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Type *
                        </label>
                        <select
                          value={lineItemForm.item_type}
                          onChange={(e) => setLineItemForm({ ...lineItemForm, item_type: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="LABOR">Labor</option>
                          <option value="HARDWARE">Hardware</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Date *
                        </label>
                        <input
                          type="date"
                          required
                          value={lineItemForm.date}
                          onChange={(e) => setLineItemForm({ ...lineItemForm, date: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Discount (%)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={lineItemForm.discount_percentage}
                          onChange={(e) => setLineItemForm({ ...lineItemForm, discount_percentage: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Discount Reason
                        </label>
                        <input
                          type="text"
                          value={lineItemForm.discount_reason}
                          onChange={(e) => setLineItemForm({ ...lineItemForm, discount_reason: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                          placeholder="e.g., Volume discount, promotional rate"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-3 mt-4">
                      <button
                        type="button"
                        onClick={() => setShowLineItemForm(false)}
                        className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                      >
                        Add Item
                      </button>
                    </div>
                  </form>
                )}

                <div className="overflow-x-auto">
                  {invoice.line_items.length === 0 ? (
                    <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                      No line items yet. Add one to get started.
                    </div>
                  ) : (
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            Description
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            Type
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            Date
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            Qty
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            Rate
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            Disc%
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            Total
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {invoice.line_items.map((item) => {
                          const isEditing = editingLineItem === item.id
                          const discountedRate = calculateDiscountedRate(item.unit_rate, item.discount_percentage || 0)

                          return (
                            <tr key={item.id} className={isEditing ? 'bg-blue-50 dark:bg-blue-900/10' : ''}>
                              <td className="px-6 py-4">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editLineItemForm?.description || ''}
                                    onChange={(e) => setEditLineItemForm({ ...editLineItemForm!, description: e.target.value })}
                                    className="w-full px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                  />
                                ) : (
                                  <div>
                                    <div className="text-sm text-gray-900 dark:text-white">{item.description}</div>
                                    {item.discount_reason && item.discount_percentage > 0 && (
                                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Discount: {item.discount_reason}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                {isEditing ? (
                                  <select
                                    value={editLineItemForm?.item_type || 'LABOR'}
                                    onChange={(e) => setEditLineItemForm({ ...editLineItemForm!, item_type: e.target.value as 'LABOR' | 'HARDWARE' | 'OTHER' })}
                                    className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                  >
                                    <option value="LABOR">Labor</option>
                                    <option value="HARDWARE">Hardware</option>
                                    <option value="OTHER">Other</option>
                                  </select>
                                ) : (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getItemTypeColor(item.item_type)}`}>
                                    {item.item_type}
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-sm">
                                {isEditing ? (
                                  <input
                                    type="date"
                                    value={editLineItemForm?.date || ''}
                                    onChange={(e) => setEditLineItemForm({ ...editLineItemForm!, date: e.target.value })}
                                    className="px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                  />
                                ) : (
                                  <span className="text-gray-900 dark:text-white">{formatDate(item.date)}</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-sm text-right">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editLineItemForm?.quantity || 0}
                                    onChange={(e) => setEditLineItemForm({ ...editLineItemForm!, quantity: parseFloat(e.target.value) })}
                                    className="w-20 px-2 py-1 text-sm text-right rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                  />
                                ) : (
                                  <span className="text-gray-900 dark:text-white">{item.quantity}</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-sm text-right">
                                {isEditing ? (
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editLineItemForm?.unit_rate || 0}
                                    onChange={(e) => setEditLineItemForm({ ...editLineItemForm!, unit_rate: parseFloat(e.target.value) })}
                                    className="w-24 px-2 py-1 text-sm text-right rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                  />
                                ) : (
                                  <div>
                                    <div className="text-gray-900 dark:text-white">{formatCurrency(item.unit_rate)}</div>
                                    {item.discount_percentage > 0 && (
                                      <div className="text-xs text-green-600 dark:text-green-400">
                                        {formatCurrency(discountedRate)}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4 text-sm text-right">
                                {isEditing ? (
                                  <div className="space-y-1">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      value={editLineItemForm?.discount_percentage || 0}
                                      onChange={(e) => setEditLineItemForm({ ...editLineItemForm!, discount_percentage: parseFloat(e.target.value) })}
                                      className="w-20 px-2 py-1 text-sm text-right rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    />
                                    <input
                                      type="text"
                                      placeholder="Reason"
                                      value={editLineItemForm?.discount_reason || ''}
                                      onChange={(e) => setEditLineItemForm({ ...editLineItemForm!, discount_reason: e.target.value })}
                                      className="w-32 px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    />
                                  </div>
                                ) : (
                                  <span className={item.discount_percentage > 0 ? 'text-green-600 dark:text-green-400 font-medium' : 'text-gray-500 dark:text-gray-400'}>
                                    {item.discount_percentage > 0 ? `${item.discount_percentage}%` : '-'}
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-sm text-right font-medium text-gray-900 dark:text-white">
                                {formatCurrency(calculateLineItemTotal(item))}
                              </td>
                              <td className="px-6 py-4 text-right">
                                {isEditing ? (
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={handleSaveLineItem}
                                      className="p-1 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                                      title="Save"
                                    >
                                      <Save className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingLineItem(null)
                                        setEditLineItemForm(null)
                                      }}
                                      className="p-1 text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                                      title="Cancel"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => handleEditLineItem(item)}
                                      className="p-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                                      title="Edit"
                                    >
                                      <Edit2 className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteLineItem(item.id)}
                                      className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                      title="Delete"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Totals Card */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
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
                </div>
              </div>

              {/* Receipts Card */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Receipts ({invoice.receipts.length})
                  </h2>
                  <label className="inline-flex items-center px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer transition-colors">
                    {uploadingReceipt ? (
                      <>Uploading...</>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload
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
                  <div className="space-y-2 max-h-96 overflow-y-auto">
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
                                <div className="space-y-1">
                                  {receiptTree[parseInt(year)][parseInt(month)].map((receipt) => (
                                    <div
                                      key={receipt.id}
                                      className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
                                    >
                                      <div className="flex items-center flex-1 min-w-0">
                                        <FileText className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                                        <span className="text-sm text-gray-900 dark:text-white truncate">
                                          {receipt.filename}
                                        </span>
                                      </div>
                                      <button
                                        onClick={() => handleDeleteReceipt(receipt.id)}
                                        className="ml-2 p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
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
        </div>
      </div>
    </div>
  )
}
