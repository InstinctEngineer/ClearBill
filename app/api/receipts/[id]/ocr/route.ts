import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Tesseract from 'tesseract.js'
import type { ReceiptOCRData, ReceiptOCRItem } from '@/lib/types/database.types'

/**
 * POST /api/receipts/[id]/ocr
 * Process receipt OCR using Tesseract.js
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: receiptId } = await params

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch receipt
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .select('*')
      .eq('id', receiptId)
      .single()

    if (receiptError || !receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    // Get signed URL for the receipt image
    const { data: signedUrl } = await supabase.storage
      .from('receipts')
      .createSignedUrl(receipt.storage_path, 600) // 10 minutes

    if (!signedUrl) {
      return NextResponse.json({ error: 'Failed to access receipt file' }, { status: 500 })
    }

    // Download the image
    const imageResponse = await fetch(signedUrl.signedUrl)
    if (!imageResponse.ok) {
      return NextResponse.json({ error: 'Failed to download receipt' }, { status: 500 })
    }

    const imageBuffer = await imageResponse.arrayBuffer()

    // Run OCR with Tesseract.js (using recognize method which works in serverless)
    const { data: { text } } = await Tesseract.recognize(
      Buffer.from(imageBuffer),
      'eng',
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`)
          }
        }
      }
    )

    // Parse the OCR text to extract structured data
    const ocrData = parseReceiptText(text)

    // Update receipt with OCR data
    const { error: updateError } = await supabase
      .from('receipts')
      .update({
        ocr_processed: true,
        ocr_data: ocrData,
        ocr_error: null,
      })
      .eq('id', receiptId)

    if (updateError) {
      console.error('Error updating receipt with OCR data:', updateError)
      return NextResponse.json({ error: 'Failed to save OCR data' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: ocrData
    })

  } catch (error) {
    console.error('OCR processing error:', error)

    // Save error to database
    await supabase
      .from('receipts')
      .update({
        ocr_processed: true,
        ocr_error: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', receiptId)

    return NextResponse.json({
      error: 'OCR processing failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * Parse OCR text to extract structured receipt data
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
