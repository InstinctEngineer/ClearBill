/**
 * Pure receipt-listing logic: which year a receipt belongs to, the index CSV
 * that rides along in a ZIP export, and collision-free file names inside it.
 *
 * Kept free of React, Supabase and the DOM so it can be unit tested directly;
 * the browser-only file handling lives in lib/receiptFiles.ts.
 */
import { yearOfDateOnly } from '@/lib/utils/dates'

/** One receipt as the Receipts page and the export work with it. */
export interface ReceiptListItem {
  id: number
  invoiceId: number
  invoiceName: string
  client: string
  /** The invoice's date, 'YYYY-MM-DD'. Decides the receipt's year. */
  invoiceDate: string
  filename: string
  storagePath: string
  uploadedAt: string
  /** From OCR, when it has been run. */
  merchant: string | null
  receiptDate: string | null
  total: number | null
}

/**
 * The year a receipt is filed under: its invoice's year.
 *
 * Receipts have no date of their own, only an upload time and, sometimes, a
 * date read by OCR. The invoice date is the one value every receipt has, it is
 * how the summary report and the storage folders already bucket them, and it
 * is what a year's invoices were billed under.
 */
export function receiptYear(receipt: Pick<ReceiptListItem, 'invoiceDate'>): number {
  return yearOfDateOnly(receipt.invoiceDate)
}

/** Years that have at least one receipt, newest first. */
export function receiptYears(receipts: Pick<ReceiptListItem, 'invoiceDate'>[]): number[] {
  return [...new Set(receipts.map(receiptYear))].sort((a, b) => b - a)
}

/**
 * Receipts for one year, oldest invoice first, so the list reads like a ledger.
 * Generic so a caller's richer type (e.g. one carrying a signed URL) survives.
 */
export function receiptsForYear<T extends ReceiptListItem>(receipts: T[], year: number): T[] {
  return receipts
    .filter((receipt) => receiptYear(receipt) === year)
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.id - b.id)
}

/**
 * A file name for each receipt inside the ZIP.
 *
 * Prefixed with the invoice date and number so the files sort chronologically
 * and say where they came from, and made unique: two receipts can share an
 * upload name (every phone photo is IMG_xxxx.jpg), and a ZIP silently keeps
 * only one entry per name.
 */
export function zipEntryNames(receipts: ReceiptListItem[]): Map<number, string> {
  const names = new Map<number, string>()
  const taken = new Set<string>()

  for (const receipt of receipts) {
    const base = `${receipt.invoiceDate}_invoice-${receipt.invoiceId}_${safeFileName(receipt.filename)}`
    let name = base
    for (let n = 2; taken.has(name.toLowerCase()); n++) {
      name = withSuffix(base, `-${n}`)
    }
    taken.add(name.toLowerCase())
    names.set(receipt.id, name)
  }
  return names
}

/** Strip characters that are illegal or awkward in file names on Windows and macOS. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim()
  return cleaned || 'receipt'
}

function withSuffix(name: string, suffix: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? `${name.slice(0, dot)}${suffix}${name.slice(dot)}` : `${name}${suffix}`
}

const INDEX_COLUMNS = [
  'File in ZIP',
  'Invoice #',
  'Invoice',
  'Invoice date',
  'Client',
  'Original file name',
  'Uploaded',
  'Merchant (OCR)',
  'Receipt date (OCR)',
  'Total (OCR)',
] as const

/**
 * index.csv for the top of the ZIP: one row per receipt, so whoever opens the
 * archive — you, or a tax preparer — can see what each file is without opening
 * them all. OCR columns are blank where OCR was never run.
 */
export function buildIndexCsv(receipts: ReceiptListItem[], entryNames: Map<number, string>): string {
  const rows = receipts.map((receipt) => [
    entryNames.get(receipt.id) ?? receipt.filename,
    String(receipt.invoiceId),
    receipt.invoiceName,
    receipt.invoiceDate,
    receipt.client,
    receipt.filename,
    receipt.uploadedAt.slice(0, 10),
    receipt.merchant ?? '',
    receipt.receiptDate ?? '',
    receipt.total === null ? '' : receipt.total.toFixed(2),
  ])
  // CRLF and a leading byte-order mark so Excel opens it as UTF-8 with columns intact.
  return '﻿' + [INDEX_COLUMNS as readonly string[], ...rows].map(csvRow).join('\r\n') + '\r\n'
}

function csvRow(cells: readonly string[]): string {
  return cells.map(csvCell).join(',')
}

/** Quote a cell when it holds a comma, quote or line break; double any quotes inside. */
export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}
