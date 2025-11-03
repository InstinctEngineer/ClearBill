'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Store, Calendar, DollarSign, Receipt as ReceiptIcon, AlertCircle, Loader2, Trash2 } from 'lucide-react'
import type { Receipt, ReceiptOCRData } from '@/lib/types/database.types'
import { formatCurrency } from '@/lib/utils/calculations'
import { useReceiptOCR } from '@/lib/hooks/useReceiptOCR'
import { createClient } from '@/lib/supabase/client'

interface ReceiptDetailsProps {
  receipt: Receipt
  onRefresh?: () => Promise<void>
  onDelete?: (receiptId: number) => Promise<void>
}

export default function ReceiptDetails({ receipt, onRefresh, onDelete }: ReceiptDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { processing, progress, error: ocrError, processReceipt } = useReceiptOCR()

  const handleProcessOCR = async () => {
    try {
      // Get signed URL for the receipt image
      const supabase = createClient()
      const { data: urlData, error: urlError } = await supabase
        .storage
        .from('receipts')
        .createSignedUrl(receipt.storage_path, 3600) // 1 hour expiry

      if (urlError || !urlData?.signedUrl) {
        console.error('Failed to get receipt URL:', urlError)
        return
      }

      // Process the receipt
      await processReceipt(urlData.signedUrl, receipt.id)

      // Refresh the receipt data to show results
      if (onRefresh) {
        await onRefresh()
      }
    } catch (err) {
      console.error('Error processing receipt:', err)
    }
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent expanding/collapsing when clicking delete
    if (onDelete) {
      await onDelete(receipt.id)
    }
  }

  const ocrData: ReceiptOCRData | null = receipt.ocr_data

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          )}
          <ReceiptIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {receipt.filename}
          </span>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2">
          {processing && (
            <Loader2 className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
          )}
          {receipt.ocr_processed && !receipt.ocr_error && (
            <div className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 text-xs rounded">
              Processed
            </div>
          )}
          {receipt.ocr_error && (
            <div className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-xs rounded">
              Error
            </div>
          )}
          {!receipt.ocr_processed && (
            <div className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs rounded">
              Not Processed
            </div>
          )}
          {onDelete && (
            <button
              onClick={handleDelete}
              className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20 rounded transition-colors"
              title="Delete receipt"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="p-4 pt-0 space-y-3">
          {/* Process OCR Button */}
          {!receipt.ocr_processed && (
            <div className="space-y-2">
              <button
                onClick={handleProcessOCR}
                disabled={processing}
                className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {progress.status}
                  </>
                ) : (
                  'Extract Receipt Data'
                )}
              </button>

              {/* Progress Bar */}
              {processing && progress.progress > 0 && (
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full transition-all duration-300"
                    style={{ width: `${progress.progress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {(receipt.ocr_error || ocrError) && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-red-900 dark:text-red-300">
                  Processing Failed
                </div>
                <div className="text-xs text-red-700 dark:text-red-400 mt-1">
                  {receipt.ocr_error || ocrError}
                </div>
              </div>
            </div>
          )}

          {/* OCR Data Display */}
          {ocrData && (
            <div className="space-y-3">
              {/* Merchant & Date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ocrData.merchant && (
                  <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <Store className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Merchant</div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {ocrData.merchant}
                      </div>
                    </div>
                  </div>
                )}

                {ocrData.date && (
                  <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <Calendar className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Date</div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {ocrData.date}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Financial Summary */}
              {(ocrData.subtotal !== undefined || ocrData.tax !== undefined || ocrData.total !== undefined) && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-semibold text-blue-900 dark:text-blue-300">
                      Financial Summary
                    </span>
                  </div>

                  {ocrData.subtotal !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">Subtotal:</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {formatCurrency(ocrData.subtotal)}
                      </span>
                    </div>
                  )}

                  {ocrData.tax !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">Tax:</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {formatCurrency(ocrData.tax)}
                      </span>
                    </div>
                  )}

                  {ocrData.total !== undefined && (
                    <div className="flex justify-between text-sm pt-2 border-t border-blue-200 dark:border-blue-800">
                      <span className="font-semibold text-gray-900 dark:text-white">Total:</span>
                      <span className="font-bold text-blue-900 dark:text-blue-300">
                        {formatCurrency(ocrData.total)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Line Items */}
              {ocrData.items && ocrData.items.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Items ({ocrData.items.length})
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {ocrData.items.map((item, index) => (
                      <div
                        key={index}
                        className="flex justify-between items-start p-2 bg-gray-50 dark:bg-gray-800 rounded text-sm"
                      >
                        <span className="text-gray-700 dark:text-gray-300 flex-1 pr-2">
                          {item.name}
                        </span>
                        {item.price !== null && (
                          <span className="font-medium text-gray-900 dark:text-white whitespace-nowrap">
                            {formatCurrency(item.price)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Data Extracted */}
              {!ocrData.merchant && !ocrData.date && !ocrData.total && ocrData.items.length === 0 && (
                <div className="text-center py-3 text-sm text-gray-500 dark:text-gray-400">
                  No structured data could be extracted. The receipt may be unclear or in an unsupported format.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
