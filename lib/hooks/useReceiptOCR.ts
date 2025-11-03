'use client'

import { useState, useCallback } from 'react'
import { createWorker } from 'tesseract.js'
import type { ReceiptOCRData, ReceiptOCRItem } from '@/lib/types/database.types'

interface OCRProgress {
  status: string
  progress: number
}

export function useReceiptOCR() {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<OCRProgress>({ status: 'idle', progress: 0 })
  const [error, setError] = useState<string | null>(null)

  const processReceipt = useCallback(async (imageUrl: string, receiptId: number): Promise<ReceiptOCRData | null> => {
    setProcessing(true)
    setError(null)
    setProgress({ status: 'Initializing OCR...', progress: 0 })

    try {
      // Create Tesseract worker
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress({
              status: 'Reading receipt...',
              progress: Math.round(m.progress * 100)
            })
          } else if (m.status === 'loading tesseract core') {
            setProgress({
              status: 'Loading OCR engine...',
              progress: Math.round(m.progress * 50)
            })
          } else if (m.status === 'initializing tesseract') {
            setProgress({
              status: 'Starting OCR...',
              progress: 50 + Math.round(m.progress * 20)
            })
          }
        }
      })

      // Recognize text from image
      const { data: { text } } = await worker.recognize(imageUrl)
      await worker.terminate()

      setProgress({ status: 'Parsing receipt data...', progress: 95 })

      // Parse the OCR text
      const ocrData = parseReceiptText(text)

      setProgress({ status: 'Saving results...', progress: 98 })

      // Save OCR data to database
      const response = await fetch(`/api/receipts/${receiptId}/ocr-data`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocrData })
      })

      if (!response.ok) {
        throw new Error('Failed to save OCR data')
      }

      setProgress({ status: 'Complete!', progress: 100 })
      setProcessing(false)

      return ocrData

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'OCR processing failed'
      setError(errorMessage)
      setProcessing(false)
      setProgress({ status: 'idle', progress: 0 })

      // Save error to database
      await fetch(`/api/receipts/${receiptId}/ocr-data`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: errorMessage })
      }).catch(() => {
        // Ignore save error
      })

      return null
    }
  }, [])

  return {
    processing,
    progress,
    error,
    processReceipt
  }
}

/**
 * Parse OCR text to extract structured receipt data
 * Same parsing logic as server-side version
 */
function parseReceiptText(text: string): ReceiptOCRData {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line)

  const ocrData: ReceiptOCRData = {
    items: [],
    raw_text: text
  }

  // Extract merchant (usually first few lines, look for common patterns)
  const merchantLine = lines.find(line =>
    line.length > 3 && line.length < 50 && !line.match(/^\d/) && line.match(/[A-Z]/)
  )
  if (merchantLine) {
    ocrData.merchant = merchantLine
  }

  // Extract date (look for common date patterns)
  const datePatterns = [
    /(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/,
    /(\d{2,4}[-\/]\d{1,2}[-\/]\d{1,2})/,
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}[,\s]+\d{2,4}/i
  ]

  for (const line of lines) {
    for (const pattern of datePatterns) {
      const match = line.match(pattern)
      if (match) {
        ocrData.date = match[0]
        break
      }
    }
    if (ocrData.date) break
  }

  // Extract total (look for "TOTAL", "AMOUNT", etc.)
  const totalPatterns = [
    /total[:\s]*\$?[\s]*([\d,]+\.?\d{0,2})/i,
    /amount[:\s]*\$?[\s]*([\d,]+\.?\d{0,2})/i,
    /balance[:\s]*\$?[\s]*([\d,]+\.?\d{0,2})/i
  ]

  for (const line of lines) {
    for (const pattern of totalPatterns) {
      const match = line.match(pattern)
      if (match) {
        const value = parseFloat(match[1].replace(/,/g, ''))
        if (!isNaN(value)) {
          ocrData.total = value
          break
        }
      }
    }
    if (ocrData.total) break
  }

  // Extract tax
  const taxPatterns = [
    /tax[:\s]*\$?[\s]*([\d,]+\.?\d{0,2})/i,
    /gst[:\s]*\$?[\s]*([\d,]+\.?\d{0,2})/i,
    /vat[:\s]*\$?[\s]*([\d,]+\.?\d{0,2})/i
  ]

  for (const line of lines) {
    for (const pattern of taxPatterns) {
      const match = line.match(pattern)
      if (match) {
        const value = parseFloat(match[1].replace(/,/g, ''))
        if (!isNaN(value)) {
          ocrData.tax = value
          break
        }
      }
    }
    if (ocrData.tax) break
  }

  // Extract subtotal
  const subtotalPatterns = [
    /sub[\s-]?total[:\s]*\$?[\s]*([\d,]+\.?\d{0,2})/i,
    /subtotal[:\s]*\$?[\s]*([\d,]+\.?\d{0,2})/i
  ]

  for (const line of lines) {
    for (const pattern of subtotalPatterns) {
      const match = line.match(pattern)
      if (match) {
        const value = parseFloat(match[1].replace(/,/g, ''))
        if (!isNaN(value)) {
          ocrData.subtotal = value
          break
        }
      }
    }
    if (ocrData.subtotal) break
  }

  // Extract line items (look for patterns like "Item Name $12.99" or "Item Name 12.99")
  const itemPattern = /^(.+?)\s+\$?([\d,]+\.?\d{2})$/

  for (const line of lines) {
    const match = line.match(itemPattern)
    if (match) {
      const name = match[1].trim()
      const priceStr = match[2].replace(/,/g, '')
      const price = parseFloat(priceStr)

      // Filter out lines that are likely total/subtotal/tax
      if (!isNaN(price) && price > 0 && price < 10000) {
        const lowerName = name.toLowerCase()
        if (!lowerName.includes('total') &&
            !lowerName.includes('tax') &&
            !lowerName.includes('subtotal') &&
            !lowerName.includes('amount') &&
            !lowerName.includes('balance')) {
          ocrData.items.push({
            name,
            price
          })
        }
      }
    }
  }

  return ocrData
}
