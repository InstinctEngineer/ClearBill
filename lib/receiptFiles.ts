'use client'

/**
 * Browser-side receipt file handling: downloading one file, and bundling a
 * year's worth into a ZIP with an index.
 *
 * Pure listing logic lives in lib/receiptExport.ts; this module is the part
 * that needs fetch, Blob and a DOM anchor.
 */
import JSZip from 'jszip'
import {
  buildIndexCsv,
  zipEntryNames,
  type ReceiptListItem,
} from '@/lib/receiptExport'

/** A receipt the API returned with a short-lived signed URL attached. */
export interface ReceiptWithUrl extends ReceiptListItem {
  /** Null when the file is missing from storage. */
  url: string | null
}

/**
 * Save a file to disk under its own name.
 *
 * The `download` attribute is ignored on cross-origin links, and signed
 * storage URLs are cross-origin, so the bytes are fetched first and served
 * back from a same-origin object URL.
 */
export async function downloadReceipt(url: string, filename: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  saveBlob(await res.blob(), filename)
}

export interface ZipProgress {
  done: number
  total: number
  current: string
}

/**
 * Bundle receipts into one ZIP: each file under a dated, invoice-stamped name
 * plus an index.csv describing them. Returns the names of any files that
 * could not be fetched so the caller can say so rather than ship a ZIP that
 * silently lacks them.
 */
export async function downloadReceiptsZip(
  receipts: ReceiptWithUrl[],
  zipName: string,
  onProgress?: (progress: ZipProgress) => void
): Promise<{ failed: string[] }> {
  const zip = new JSZip()
  const { failed, included } = await addReceiptsToZip(zip, receipts, '', onProgress)
  zip.file('index.csv', buildIndexCsv(included, zipEntryNames(receipts)))
  if (failed.length > 0) zip.file('MISSING.txt', missingText(failed))

  onProgress?.({ done: receipts.length, total: receipts.length, current: 'Compressing…' })
  saveBlob(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), zipName)
  return { failed }
}

/**
 * The tax package: the report's CSVs and read-me at the top, and the year's
 * receipt files under receipts/. One ZIP to hand to a preparer.
 */
export async function downloadTaxPackage(
  files: { name: string; content: string }[],
  receipts: ReceiptWithUrl[],
  zipName: string,
  onProgress?: (progress: ZipProgress) => void
): Promise<{ failed: string[] }> {
  const zip = new JSZip()
  for (const file of files) zip.file(file.name, file.content)
  const { failed, included } = await addReceiptsToZip(zip, receipts, 'receipts/', onProgress)
  zip.file('receipts/index.csv', buildIndexCsv(included, zipEntryNames(receipts)))
  if (failed.length > 0) zip.file('receipts/MISSING.txt', missingText(failed))

  onProgress?.({ done: receipts.length, total: receipts.length, current: 'Compressing…' })
  saveBlob(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), zipName)
  return { failed }
}

/**
 * Fetch each receipt and add it under a dated, invoice-stamped name. Files
 * that cannot be fetched are reported, never silently skipped.
 */
async function addReceiptsToZip(
  zip: JSZip,
  receipts: ReceiptWithUrl[],
  folder: string,
  onProgress?: (progress: ZipProgress) => void
): Promise<{ failed: string[]; included: ReceiptWithUrl[] }> {
  const names = zipEntryNames(receipts)
  const failed: string[] = []

  for (const [index, receipt] of receipts.entries()) {
    onProgress?.({ done: index, total: receipts.length, current: receipt.filename })
    if (!receipt.url) {
      failed.push(receipt.filename)
      continue
    }
    try {
      const res = await fetch(receipt.url)
      if (!res.ok) throw new Error(String(res.status))
      zip.file(folder + (names.get(receipt.id) ?? receipt.filename), await res.arrayBuffer())
    } catch {
      failed.push(receipt.filename)
    }
  }
  return { failed, included: receipts.filter((r) => !failed.includes(r.filename)) }
}

function missingText(failed: string[]): string {
  return ['These receipts are listed in ClearBill but could not be fetched:', '', ...failed].join('\n')
}

function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Give the browser a moment to start the download before the URL is revoked.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
}
