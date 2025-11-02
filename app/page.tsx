'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Navigation from '@/components/Navigation'
import { Plus, FileText, Download, Trash2, DollarSign, AlertCircle, CheckCircle } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils/calculations'
import type { InvoiceWithDetails } from '@/lib/types/database.types'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>('all')
  const [sortBy, setSortBy] = useState<'date' | 'due_date'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetchInvoices()
  }, [filter, sortBy, sortOrder])

  const fetchInvoices = async () => {
    try {
      const params = new URLSearchParams({
        filter,
        sort: sortBy,
        order: sortOrder,
      })
      const res = await fetch(`/api/invoices?${params}`)
      if (res.ok) {
        const data = await res.json()
        setInvoices(data)
      }
    } catch (error) {
      console.error('Error fetching invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this invoice? This action cannot be undone.')) {
      return
    }

    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        fetchInvoices()
      }
    } catch (error) {
      console.error('Error deleting invoice:', error)
    }
  }

  const handleTogglePaid = async (invoice: InvoiceWithDetails) => {
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid: !invoice.paid }),
      })
      if (res.ok) {
        fetchInvoices()
      }
    } catch (error) {
      console.error('Error updating invoice:', error)
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

  const unpaidInvoices = invoices.filter(inv => !inv.paid)
  const overdueInvoices = unpaidInvoices.filter(inv => inv.days_overdue > 0)

  return (
    <div className="flex h-full">
      <Navigation />

      <div className="flex-1 md:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Invoices
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Manage your invoices and track payments
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Invoices</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {invoices.length}
                  </p>
                </div>
                <FileText className="h-10 w-10 text-blue-600 dark:text-blue-400" />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Unpaid</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">
                    {unpaidInvoices.length}
                  </p>
                </div>
                <AlertCircle className="h-10 w-10 text-orange-600 dark:text-orange-400" />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Overdue</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                    {overdueInvoices.length}
                  </p>
                </div>
                <DollarSign className="h-10 w-10 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </div>

          {/* Filters and Actions */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-4">
            <div className="flex flex-col sm:flex-row justify-between gap-4">
              {/* Filters */}
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as any)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Invoices</option>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="date">Sort by Date</option>
                  <option value="due_date">Sort by Due Date</option>
                </select>

                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as any)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="desc">Newest First</option>
                  <option value="asc">Oldest First</option>
                </select>
              </div>

              {/* New Invoice Button */}
              <Link
                href="/invoices/new"
                className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                <Plus className="h-5 w-5 mr-2" />
                New Invoice
              </Link>
            </div>
          </div>

          {/* Invoices Table */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                Loading invoices...
              </div>
            ) : invoices.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-600 mb-4" />
                <p className="text-gray-500 dark:text-gray-400 mb-4">No invoices found</p>
                <Link
                  href="/invoices/new"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Create Your First Invoice
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Project / Client
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Due Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {invoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Link href={`/invoices/${invoice.id}`} className="hover:text-blue-600 dark:hover:text-blue-400">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {invoice.project_name}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {invoice.client}
                            </div>
                          </Link>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">
                          {formatDate(invoice.date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">
                          {formatDate(invoice.due_date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(invoice.total)}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            Tax: {formatCurrency(invoice.tax_set_aside)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(invoice.overdue_status)}`}>
                            {invoice.overdue_status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleTogglePaid(invoice)}
                              className={`p-2 rounded-lg transition-colors ${
                                invoice.paid
                                  ? 'bg-green-100 text-green-600 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400'
                              }`}
                              title={invoice.paid ? 'Mark as unpaid' : 'Mark as paid'}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                            <Link
                              href={`/invoices/${invoice.id}`}
                              className="p-2 bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg transition-colors"
                              title="View invoice"
                            >
                              <FileText className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => handleDelete(invoice.id)}
                              className="p-2 bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 rounded-lg transition-colors"
                              title="Delete invoice"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
