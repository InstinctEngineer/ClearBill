/**
 * Tests for the receipt listing and ZIP index logic.
 * Run with: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildIndexCsv,
  csvCell,
  receiptYear,
  receiptYears,
  receiptsForYear,
  safeFileName,
  zipEntryNames,
  type ReceiptListItem,
} from '../lib/receiptExport'

const receipt = (overrides: Partial<ReceiptListItem> & { id: number }): ReceiptListItem => ({
  invoiceId: 1,
  invoiceName: 'Invoice',
  client: 'ES&D Services',
  invoiceDate: '2025-06-01',
  filename: 'receipt.pdf',
  storagePath: 'invoices/1/2025/06/receipt.pdf',
  uploadedAt: '2025-06-02T12:00:00Z',
  merchant: null,
  receiptDate: null,
  total: null,
  ...overrides,
})

test('a receipt is filed under its invoice year, not its upload year', () => {
  // Uploaded in January but belongs to a December invoice: it is a 2025 receipt.
  const late = receipt({ id: 1, invoiceDate: '2025-12-01', uploadedAt: '2026-01-15T00:00:00Z' })
  assert.equal(receiptYear(late), 2025)
})

test('years are listed newest first, without repeats', () => {
  const list = [
    receipt({ id: 1, invoiceDate: '2024-03-01' }),
    receipt({ id: 2, invoiceDate: '2025-01-01' }),
    receipt({ id: 3, invoiceDate: '2025-11-01' }),
  ]
  assert.deepEqual(receiptYears(list), [2025, 2024])
  assert.deepEqual(receiptYears([]), [])
})

test('a year filter keeps only that year, oldest invoice first', () => {
  const list = [
    receipt({ id: 1, invoiceDate: '2025-11-01' }),
    receipt({ id: 2, invoiceDate: '2024-12-31' }),
    receipt({ id: 3, invoiceDate: '2025-04-21' }),
    receipt({ id: 4, invoiceDate: '2025-04-21' }),
  ]
  assert.deepEqual(
    receiptsForYear(list, 2025).map((r) => r.id),
    [3, 4, 1],
    'same-day receipts fall back to id order'
  )
})

test('zip entries are dated, stamped with the invoice, and never collide', () => {
  // Three phone photos with the same name across two invoices.
  const list = [
    receipt({ id: 1, invoiceId: 8, invoiceDate: '2025-11-01', filename: 'IMG_0001.jpg' }),
    receipt({ id: 2, invoiceId: 8, invoiceDate: '2025-11-01', filename: 'IMG_0001.jpg' }),
    receipt({ id: 3, invoiceId: 9, invoiceDate: '2025-11-30', filename: 'IMG_0001.jpg' }),
  ]
  const names = zipEntryNames(list)

  assert.equal(names.get(1), '2025-11-01_invoice-8_IMG_0001.jpg')
  assert.equal(names.get(2), '2025-11-01_invoice-8_IMG_0001-2.jpg', 'suffix goes before the extension')
  assert.equal(names.get(3), '2025-11-30_invoice-9_IMG_0001.jpg')
  assert.equal(new Set(names.values()).size, 3)
})

test('collision check ignores case, since the ZIP may land on a case-insensitive disk', () => {
  const list = [
    receipt({ id: 1, filename: 'Receipt.pdf' }),
    receipt({ id: 2, filename: 'receipt.pdf' }),
  ]
  const names = [...zipEntryNames(list).values()]
  assert.notEqual(names[0].toLowerCase(), names[1].toLowerCase())
})

test('file names are scrubbed of characters Windows and macOS reject', () => {
  assert.equal(safeFileName('Amazon.com - Order 112/3598:334?.pdf'), 'Amazon.com - Order 112_3598_334_.pdf')
  assert.equal(safeFileName('   '), 'receipt')
  assert.equal(safeFileName('a\\b'), 'a_b')
})

test('the index CSV has a header, one row per receipt, and Excel-friendly framing', () => {
  const list = [
    receipt({
      id: 13, invoiceId: 8, invoiceName: 'October 2025', invoiceDate: '2025-11-01',
      filename: 'Receipt-2311-9197.pdf', merchant: 'Lovable Labs',
      receiptDate: 'October 11, 2025', total: 25,
    }),
    receipt({ id: 14, invoiceId: 8, invoiceName: 'October 2025', invoiceDate: '2025-11-01',
      filename: 'Receipt-2940-8065.pdf' }),
  ]
  const csv = buildIndexCsv(list, zipEntryNames(list))
  const lines = csv.split('\r\n')

  assert.ok(csv.startsWith('﻿'), 'starts with a UTF-8 byte-order mark')
  assert.equal(lines[0].replace('﻿', ''), 'File in ZIP,Invoice #,Invoice,Invoice date,Client,Original file name,Uploaded,Merchant (OCR),Receipt date (OCR),Total (OCR)')
  assert.equal(lines.length, 4, 'header + 2 rows + trailing newline')
  assert.ok(lines[1].includes('"October 11, 2025"'), 'a date with a comma is quoted')
  assert.ok(lines[1].endsWith(',25.00'), 'OCR total is money-formatted')
  assert.ok(lines[2].endsWith(',,,'), 'missing OCR fields are left blank, not written as null')
})

test('CSV cells are quoted only when they need it', () => {
  assert.equal(csvCell('plain'), 'plain')
  assert.equal(csvCell('has, comma'), '"has, comma"')
  assert.equal(csvCell('say "hi"'), '"say ""hi"""')
  assert.equal(csvCell('two\nlines'), '"two\nlines"')
})
