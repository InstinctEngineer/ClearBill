/**
 * Pure grid logic: row drafts, clipboard parsing, validation and totals.
 *
 * Deliberately free of React so it can be unit tested directly and reused by
 * anything else that needs to turn spreadsheet text into line items.
 */
import type { LineItem } from '@/lib/types/database.types'
import { ITEM_TYPES, type ItemType } from '@/lib/lineItems'
import { DEFAULT_LINE_ITEM_DEFAULTS, type LineItemDefaults } from '@/lib/settings'
import { calculateDiscountedRate } from '@/lib/utils/calculations'
import { todayDateOnly, toDateOnly, parseDateOnly } from '@/lib/utils/dates'

/** A row's values while it is being edited: every cell is a string or boolean. */
export interface RowDraft {
  date: string
  description: string
  item_type: ItemType
  quantity: string
  unit_rate: string
  discount_percentage: string
  discount_reason: string
  client_pays: boolean
  applies_to_debt: boolean
}

/** Every editable cell corresponds to one field of a row draft. */
export type ColumnKey = keyof RowDraft

export type ColumnKind = 'date' | 'text' | 'select' | 'number' | 'check'

export interface GridColumn {
  key: ColumnKey
  label: string
  kind: ColumnKind
  /**
   * Tailwind width class. Every column is sized to its widest real content —
   * a native date input with its picker icon, the word "Hardware" in the type
   * select — because a column narrower than that clips instead of scrolling.
   */
  width: string
  /** Minimum pixels this column needs; summed to set the table's min-width. */
  minPx: number
  /** Column only renders when this feature is switched on. */
  feature?: 'debt'
}

/** The editable columns, left to right. Drives header, paste order and nav. */
export const GRID_COLUMNS: readonly GridColumn[] = [
  { key: 'date', label: 'Date', kind: 'date', width: 'w-[8.5rem]', minPx: 136 },
  { key: 'description', label: 'Description', kind: 'text', width: 'min-w-[15rem]', minPx: 240 },
  { key: 'item_type', label: 'Type', kind: 'select', width: 'w-[7.5rem]', minPx: 120 },
  { key: 'quantity', label: 'Qty', kind: 'number', width: 'w-16', minPx: 64 },
  { key: 'unit_rate', label: 'Rate', kind: 'number', width: 'w-24', minPx: 96 },
  { key: 'discount_percentage', label: 'Disc %', kind: 'number', width: 'w-20', minPx: 80 },
  { key: 'discount_reason', label: 'Reason', kind: 'text', width: 'min-w-[9rem]', minPx: 144 },
  { key: 'client_pays', label: 'Billed', kind: 'check', width: 'w-16', minPx: 64 },
  { key: 'applies_to_debt', label: 'Debt', kind: 'check', width: 'w-16', minPx: 64, feature: 'debt' },
]

/** Width the Total and row-action columns occupy, pinned to the right edge. */
export const TRAILING_COLUMNS_PX = 112 + 56

/**
 * Narrowest the table can be drawn without clipping a cell. Below this the
 * container scrolls horizontally rather than squeezing columns.
 */
export function tableMinWidthPx(columns: readonly GridColumn[]): number {
  return columns.reduce((sum, column) => sum + column.minPx, 0) + TRAILING_COLUMNS_PX
}

export type RowStatus = 'clean' | 'dirty' | 'saving' | 'error'

export interface GridRow {
  /** Stable key for React; survives the row gaining a database id. */
  key: string
  /** Database id, or null while the row is still a blank/unsaved draft. */
  id: number | null
  draft: RowDraft
  status: RowStatus
  error?: string
}

let keyCounter = 0

/** Stable React key for a row, independent of its database id. */
export const nextKey = () => `row-${++keyCounter}`

/**
 * What a fresh row starts as.
 *
 * `defaults` comes from the Settings page, so the fields filled in the same
 * way every time arrive pre-filled. `invoiceDate` is only consulted when the
 * date default is set to follow the invoice rather than today.
 */
export function emptyDraft(
  defaults: LineItemDefaults = DEFAULT_LINE_ITEM_DEFAULTS,
  invoiceDate?: string
): RowDraft {
  return {
    date: defaults.dateMode === 'invoice' && invoiceDate ? invoiceDate : todayDateOnly(),
    description: defaults.description,
    item_type: defaults.itemType,
    quantity: defaults.quantity,
    unit_rate: defaults.unitRate,
    discount_percentage: defaults.discountPercentage,
    discount_reason: defaults.discountReason,
    client_pays: defaults.clientPays,
    applies_to_debt: defaults.appliesToDebt,
  }
}

export function draftFromLineItem(item: LineItem): RowDraft {
  return {
    date: item.date,
    description: item.description,
    item_type: item.item_type,
    quantity: String(item.quantity),
    unit_rate: String(item.unit_rate),
    discount_percentage: item.discount_percentage ? String(item.discount_percentage) : '',
    discount_reason: item.discount_reason ?? '',
    client_pays: item.client_pays !== false,
    applies_to_debt: Boolean(item.applies_to_debt),
  }
}

/**
 * True when a row holds nothing worth saving.
 *
 * Quantity and rate can arrive pre-filled from the Settings defaults, so they
 * say nothing about whether the user has entered anything. Description is the
 * one field they must supply and the one validation always demands, which
 * makes it the only reliable signal.
 */
export function isBlank(draft: RowDraft): boolean {
  return draft.description.trim() === ''
}

/** Running total for a draft, so the grid can show it before it is saved. */
export function draftTotal(draft: RowDraft): number {
  const quantity = Number.parseFloat(draft.quantity) || 0
  const rate = calculateDiscountedRate(
    Number.parseFloat(draft.unit_rate) || 0,
    Number.parseFloat(draft.discount_percentage) || 0
  )
  return quantity * rate
}

/** Client-side mirror of the server's rules, for inline feedback. */
export function validateDraft(draft: RowDraft): string | null {
  if (!draft.description.trim()) return 'Description is required'
  if (!Number.isFinite(Number.parseFloat(draft.quantity))) return 'Quantity must be a number'
  if (!Number.isFinite(Number.parseFloat(draft.unit_rate))) return 'Rate must be a number'
  if (!draft.date || Number.isNaN(parseDateOnly(draft.date).getTime())) return 'Date is not valid'
  const discount = Number.parseFloat(draft.discount_percentage || '0')
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    return 'Discount must be between 0 and 100'
  }
  return null
}

/** Shape a draft into the JSON body the line item endpoints expect. */
export function draftToPayload(draft: RowDraft) {
  return {
    date: draft.date,
    description: draft.description.trim(),
    item_type: draft.item_type,
    quantity: Number.parseFloat(draft.quantity),
    unit_rate: Number.parseFloat(draft.unit_rate),
    discount_percentage: Number.parseFloat(draft.discount_percentage || '0'),
    discount_reason: draft.discount_reason.trim() || null,
    client_pays: draft.client_pays,
    applies_to_debt: draft.applies_to_debt,
  }
}

/**
 * Turn clipboard text into row drafts.
 *
 * Accepts what Excel, Google Sheets and Numbers put on the clipboard:
 * tab-separated cells, newline-separated rows. Columns map positionally onto
 * `columns` starting at `startColumn`, so pasting two columns into the Qty
 * cell fills Qty and Rate and leaves the rest alone.
 */
export function parseClipboard(
  text: string,
  columns: readonly GridColumn[],
  startColumn: number,
  base: RowDraft
): RowDraft[] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')

  return lines.map((line) => {
    const cells = line.split('\t')
    const draft: RowDraft = { ...base }

    cells.forEach((raw, offset) => {
      const column = columns[startColumn + offset]
      if (!column) return
      applyCell(draft, column.key, column.kind, raw.trim())
    })

    return draft
  })
}

function applyCell(draft: RowDraft, key: ColumnKey, kind: ColumnKind, raw: string) {
  const cells = draft as Record<ColumnKey, string | boolean>

  if (kind === 'check') {
    const truthy = ['true', 'yes', 'y', '1', 'x', '✓']
    cells[key] = truthy.includes(raw.toLowerCase())
    return
  }
  if (key === 'item_type') {
    const upper = raw.toUpperCase()
    const match =
      ITEM_TYPES.find((type) => type === upper) ??
      ITEM_TYPES.find((type) => type.startsWith(upper)) ??
      (upper.startsWith('HW') ? 'HARDWARE' : undefined)
    draft.item_type = match ?? draft.item_type
    return
  }
  if (key === 'date') {
    const parsed = parseDateOnly(raw)
    draft.date = Number.isNaN(parsed.getTime()) ? draft.date : toDateOnly(parsed)
    return
  }
  if (kind === 'number') {
    // Tolerate currency and thousands separators pasted straight from a sheet
    cells[key] = raw.replace(/[$,\s]/g, '')
    return
  }
  cells[key] = raw
}


/** How a fresh entry row should be pre-filled. */
export interface EntryRowSeed {
  defaults: LineItemDefaults
  /** Used only when the date default follows the invoice. */
  invoiceDate?: string
}

export const DEFAULT_SEED: EntryRowSeed = { defaults: DEFAULT_LINE_ITEM_DEFAULTS }

/** Build the initial row list from the server's line items. */
export function buildRows(lineItems: LineItem[], seed: EntryRowSeed = DEFAULT_SEED): GridRow[] {
  const rows: GridRow[] = lineItems.map((item) => ({
    key: nextKey(),
    id: item.id,
    draft: draftFromLineItem(item),
    status: 'clean',
  }))
  return withEntryRow(rows, seed)
}

/**
 * Keep exactly one blank entry row at the TOP of the grid.
 *
 * Line items are listed newest first, so the row you are about to add belongs
 * at the top next to the most recent work, not past the bottom of the list.
 *
 * Callers add the replacement row once the current one is saved, never while
 * it is being typed into: inserting above a row in progress shunts it down a
 * line mid-keystroke.
 */
export function withEntryRow(rows: GridRow[], seed: EntryRowSeed = DEFAULT_SEED): GridRow[] {
  // An untouched row is identified by its status, not by being empty: with
  // defaults in play a fresh row can arrive already carrying a description,
  // and an emptiness test would then stack a new entry row on every call.
  const first = rows[0]
  if (first && first.id === null && first.status === 'clean') return rows
  return [
    {
      key: nextKey(),
      id: null,
      draft: emptyDraft(seed.defaults, seed.invoiceDate),
      status: 'clean',
    },
    ...rows,
  ]
}
