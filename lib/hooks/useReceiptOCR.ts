'use client'

import { useState, useCallback } from 'react'
import { createWorker } from 'tesseract.js'
import * as pdfjsLib from 'pdfjs-dist'
import type { ReceiptOCRData, ReceiptOCRItem } from '@/lib/types/database.types'

// Set PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
}

interface OCRProgress {
  status: string
  progress: number
}

/**
 * Convert PDF first page to image blob
 */
async function pdfToImage(pdfBlob: Blob): Promise<Blob> {
  const arrayBuffer = await pdfBlob.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const page = await pdf.getPage(1) // Get first page

  const viewport = page.getViewport({ scale: 2.0 }) // Higher scale for better OCR
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Failed to get canvas context')
  }

  canvas.width = viewport.width
  canvas.height = viewport.height

  await page.render({
    canvasContext: context,
    viewport: viewport,
    canvas: canvas
  }).promise

  // Convert canvas to blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error('Failed to convert canvas to blob'))
      }
    }, 'image/png')
  })
}

export function useReceiptOCR() {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState<OCRProgress>({ status: 'idle', progress: 0 })
  const [error, setError] = useState<string | null>(null)

  const processReceipt = useCallback(async (imageUrl: string, receiptId: number): Promise<ReceiptOCRData | null> => {
    setProcessing(true)
    setError(null)
    setProgress({ status: 'Downloading receipt...', progress: 0 })

    try {
      // Fetch file and convert to Blob to avoid CORS issues
      setProgress({ status: 'Downloading receipt...', progress: 5 })
      const fileResponse = await fetch(imageUrl)

      if (!fileResponse.ok) {
        throw new Error(`Failed to fetch file: ${fileResponse.statusText}`)
      }

      const fileBlob = await fileResponse.blob()

      // Determine file type and convert to image if needed
      let imageBlob: Blob

      if (fileBlob.type === 'application/pdf') {
        // Handle PDF files
        setProgress({ status: 'Converting PDF to image...', progress: 8 })
        imageBlob = await pdfToImage(fileBlob)
      } else if (fileBlob.type.startsWith('image/')) {
        // Handle image files directly
        imageBlob = fileBlob
      } else {
        // Unsupported file type
        throw new Error(`Unsupported file type: ${fileBlob.type}. Please upload an image or PDF file.`)
      }

      setProgress({ status: 'Initializing OCR...', progress: 10 })

      // Create Tesseract worker
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress({
              status: 'Reading receipt...',
              progress: 20 + Math.round(m.progress * 70) // 20-90%
            })
          } else if (m.status === 'loading tesseract core') {
            setProgress({
              status: 'Loading OCR engine...',
              progress: 10 + Math.round(m.progress * 10) // 10-20%
            })
          } else if (m.status === 'initializing tesseract') {
            setProgress({
              status: 'Starting OCR...',
              progress: 15 + Math.round(m.progress * 5) // 15-20%
            })
          }
        }
      })

      // Recognize text from image blob (fixes CORS issue)
      const { data: { text } } = await worker.recognize(imageBlob)
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
