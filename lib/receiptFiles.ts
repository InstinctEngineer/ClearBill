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
  const names = zipEntryNames(receipts)
  const failed: string[] = []

  for (const [index, receipt] of receipts.entries()) {
    const entryName = names.get(receipt.id) ?? receipt.filename
    onProgress?.({ done: index, total: receipts.length, current: receipt.filename })

    if (!receipt.url) {
      failed.push(receipt.filename)
      continue
    }
    try {
      const res = await fetch(receipt.url)
      if (!res.ok) throw new Error(String(res.status))
      zip.file(entryName, await res.arrayBuffer())
    } catch {
      failed.push(receipt.filename)
    }
  }

  const included = receipts.filter((receipt) => !failed.includes(receipt.filename))
  zip.file('index.csv', buildIndexCsv(included, names))
  if (failed.length > 0) {
    zip.file(
      'MISSING.txt',
      ['These receipts are listed in ClearBill but could not be fetched:', '', ...failed].join('\n')
    )
  }

  onProgress?.({ done: receipts.length, total: receipts.length, current: 'Compressing…' })
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  saveBlob(blob, zipName)
  return { failed }
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
