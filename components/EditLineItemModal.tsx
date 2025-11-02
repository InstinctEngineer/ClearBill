'use client'

import { useState } from 'react'
import { X, Save } from 'lucide-react'
import { LineItem } from '@/lib/types/database.types'
import { calculateDiscountedRate, formatCurrency } from '@/lib/utils/calculations'

interface EditLineItemModalProps {
  item: LineItem
  isOpen: boolean
  onClose: () => void
  onSave: (item: LineItem) => Promise<void>
}

export default function EditLineItemModal({ item, isOpen, onClose, onSave }: EditLineItemModalProps) {
  const [formData, setFormData] = useState<LineItem>(item)
  const [saving, setSaving] = useState(false)

  if (!isOpen) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(formData)
      onClose()
    } catch (error) {
      console.error('Error saving line item:', error)
    } finally {
      setSaving(false)
    }
  }

  // Live calculations
  const originalTotal = formData.quantity * formData.unit_rate
  const discountedRate = calculateDiscountedRate(formData.unit_rate, formData.discount_percentage || 0)
  const discountedTotal = formData.quantity * discountedRate
  const discountAmount = originalTotal - discountedTotal

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Edit Line Item
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Type and Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Type
              </label>
              <select
                value={formData.item_type}
                onChange={(e) => setFormData({ ...formData, item_type: e.target.value as 'LABOR' | 'HARDWARE' | 'OTHER' })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="LABOR">Labor</option>
                <option value="HARDWARE">Hardware</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Date
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Quantity and Unit Rate */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Quantity
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Unit Rate ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.unit_rate}
                onChange={(e) => setFormData({ ...formData, unit_rate: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Discount Percentage and Reason */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Discount (%)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={formData.discount_percentage || 0}
                onChange={(e) => setFormData({ ...formData, discount_percentage: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Discount Reason
              </label>
              <input
                type="text"
                value={formData.discount_reason || ''}
                onChange={(e) => setFormData({ ...formData, discount_reason: e.target.value })}
                placeholder="Optional"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Live Calculation Preview */}
          {formData.quantity > 0 && formData.unit_rate > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-3">Price Breakdown</h4>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Original Total:</span>
                <span className="text-gray-900 dark:text-white font-medium">{formatCurrency(originalTotal)}</span>
              </div>

              {(formData.discount_percentage || 0) > 0 && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      Discount ({formData.discount_percentage}%):
                    </span>
                    <span className="text-red-600 dark:text-red-400 font-medium">
                      -{formatCurrency(discountAmount)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm pt-2 border-t border-blue-200 dark:border-blue-800">
                    <span className="text-gray-900 dark:text-white font-semibold">Final Total:</span>
                    <span className="text-green-600 dark:text-green-400 font-bold text-lg">
                      {formatCurrency(discountedTotal)}
                    </span>
                  </div>

                  {formData.applies_to_debt && (
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-blue-200 dark:border-blue-800">
                      <span className="text-blue-600 dark:text-blue-400">Applied to debt:</span>
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">
                        {formatCurrency(discountAmount)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Debt Tracking Checkbox */}
          {(formData.discount_percentage || 0) > 0 && (
            <div className="mt-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.applies_to_debt || false}
                  onChange={(e) => setFormData({ ...formData, applies_to_debt: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    Apply discount to debt repayment
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Track this discount towards client debt repayment ($1,000 total)
                  </div>
                </div>
              </label>
            </div>
          )}

          {/* Client Pays Checkbox - only for HARDWARE and OTHER */}
          {(formData.item_type === 'HARDWARE' || formData.item_type === 'OTHER') && (
            <div className="mt-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.client_pays !== undefined ? formData.client_pays : true}
                  onChange={(e) => setFormData({ ...formData, client_pays: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-green-600 focus:ring-2 focus:ring-green-500"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    Client pays for this item
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {formData.client_pays !== false
                      ? 'Counted as income (client is billed)'
                      : 'Counted as expense (you cover the cost)'}
                  </div>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
