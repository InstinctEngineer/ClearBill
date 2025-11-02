'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Navigation from '@/components/Navigation'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'

export default function NewInvoicePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    project_name: '',
    client: '',
    date: new Date().toISOString().split('T')[0],
    tax_rate: '30',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        const invoice = await res.json()
        router.push(`/invoices/${invoice.id}`)
      } else {
        console.error('Response status:', res.status)
        console.error('Response headers:', res.headers)
        const text = await res.text()
        console.error('Response text:', text)
        try {
          const errorData = JSON.parse(text)
          console.error('API Error:', errorData)
          alert(`Failed to create invoice: ${errorData.error || 'Unknown error'}\n${errorData.details || ''}`)
        } catch {
          alert(`Failed to create invoice. Status: ${res.status}. Response: ${text}`)
        }
      }
    } catch (error) {
      console.error('Error creating invoice:', error)
      alert('An error occurred: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full">
      <Navigation />

      <div className="flex-1 md:pl-64">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/"
              className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Invoices
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Create New Invoice
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Enter invoice details to get started
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-6">
            <div>
              <label htmlFor="project_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Project Name *
              </label>
              <input
                id="project_name"
                type="text"
                required
                value={formData.project_name}
                onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Website redesign, App development, etc."
              />
            </div>

            <div>
              <label htmlFor="client" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Client Name *
              </label>
              <input
                id="client"
                type="text"
                required
                value={formData.client}
                onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Acme Corp, John Doe, etc."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Invoice Date *
                </label>
                <input
                  id="date"
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="tax_rate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tax Rate (%) *
                </label>
                <input
                  id="tax_rate"
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.tax_rate}
                  onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="30"
                />
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Percentage of income to set aside for taxes
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-200 dark:border-gray-700">
              <Link
                href="/"
                className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors"
              >
                <Save className="h-5 w-5 mr-2" />
                {loading ? 'Creating...' : 'Create Invoice'}
              </button>
            </div>
          </form>

          <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-2">
              Next Steps
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-400">
              After creating the invoice, you'll be able to add line items (labor, hardware, other costs) and upload receipt files.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
