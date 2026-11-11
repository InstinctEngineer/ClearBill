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

/** A stored file to fetch into a ZIP. */
export interface ZipAttachment {
  /** Path inside the ZIP, folders included. */
  name: string
  /** Null when the file is missing from storage. */
  url: string | null
  /** What to call the file when reporting that it could not be fetched. */
  label: string
}

/**
 * Bundle receipts into one ZIP: each file under a dated, invoice-stamped name
 * plus an index.csv describing them. Returns the names of any files that
 * could not be fetched so the caller can say so rather than ship a ZIP that
 * silently lacks them.
 */
export function downloadReceiptsZip(
  receipts: ReceiptWithUrl[],
  zipName: string,
  onProgress?: (progress: ZipProgress) => void
): Promise<{ failed: string[] }> {
  return downloadReceiptBundle([], receipts, '', zipName, onProgress)
}

/**
 * The tax package: the report's CSVs and read-me at the top, and the year's
 * receipt files under receipts/. One ZIP to hand to a preparer.
 */
export function downloadTaxPackage(
  files: ZipTextFile[],
  receipts: ReceiptWithUrl[],
  zipName: string,
  onProgress?: (progress: ZipProgress) => void
): Promise<{ failed: string[] }> {
  return downloadReceiptBundle(files, receipts, 'receipts/', zipName, onProgress)
}

/** Receipts under `folder`, with an index of the ones that made it in. */
async function downloadReceiptBundle(
  files: ZipTextFile[],
  receipts: ReceiptWithUrl[],
  folder: string,
  zipName: string,
  onProgress?: (progress: ZipProgress) => void
): Promise<{ failed: string[] }> {
  const names = zipEntryNames(receipts)
  const attachments = receipts.map((receipt): ZipAttachment => ({
    name: folder + (names.get(receipt.id) ?? receipt.filename),
    url: receipt.url,
    label: receipt.filename,
  }))
  return downloadZip({
    files,
    attachments,
    zipName,
    missingName: `${folder}MISSING.txt`,
    onProgress,
    // The index lists only what is actually inside, so it is built last.
    afterFetch: (failed) => [{
      name: `${folder}index.csv`,
      content: buildIndexCsv(receipts.filter((receipt) => !failed.includes(receipt.filename)), names),
    }],
  })
}

export interface ZipTextFile {
  name: string
  content: string
}

/**
 * Build a ZIP from text files and stored attachments, and save it. Files that
 * cannot be fetched are listed in a MISSING.txt, never silently skipped.
 */
export async function downloadZip(options: {
  files: ZipTextFile[]
  attachments: ZipAttachment[]
  zipName: string
  missingName?: string
  onProgress?: (progress: ZipProgress) => void
  /** Extra text files that depend on which attachments could be fetched. */
  afterFetch?: (failed: string[]) => ZipTextFile[]
}): Promise<{ failed: string[] }> {
  const { files, attachments, zipName, missingName = 'MISSING.txt', onProgress, afterFetch } = options
  const zip = new JSZip()
  const failed: string[] = []

  for (const [index, attachment] of attachments.entries()) {
    onProgress?.({ done: index, total: attachments.length, current: attachment.label })
    try {
      if (!attachment.url) throw new Error('no file')
      const res = await fetch(attachment.url)
      if (!res.ok) throw new Error(String(res.status))
      zip.file(attachment.name, await res.arrayBuffer())
    } catch {
      failed.push(attachment.label)
    }
  }

  for (const file of [...files, ...(afterFetch?.(failed) ?? [])]) zip.file(file.name, file.content)
  if (failed.length > 0) zip.file(missingName, missingText(failed))

  onProgress?.({ done: attachments.length, total: attachments.length, current: 'Compressing…' })
  saveBlob(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), zipName)
  return { failed }
}

function missingText(failed: string[]): string {
  return ['These files are listed in ClearBill but could not be fetched:', '', ...failed].join('\n')
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
