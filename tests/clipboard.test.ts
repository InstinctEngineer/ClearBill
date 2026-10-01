/**
 * Tests for pasting a block of spreadsheet rows into the line item grid.
 * Run with: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  GRID_COLUMNS,
  emptyDraft,
  isBlank,
  parseClipboard,
  validateDraft,
  draftToPayload,
  draftTotal,
} from '../lib/lineItemGrid'
import { DEFAULT_LINE_ITEM_DEFAULTS } from '../lib/settings'

const columns = GRID_COLUMNS
// A row seeded the way the grid seeds one, pinned to a fixed date.
const FIXED_DATE_SEED = {
  defaults: { ...DEFAULT_LINE_ITEM_DEFAULTS, dateMode: 'invoice' as const, quantity: '' },
  invoiceDate: '2026-03-01',
}
const base = emptyDraft(FIXED_DATE_SEED.defaults, FIXED_DATE_SEED.invoiceDate)
const columnIndex = (key: string) => columns.findIndex((column) => column.key === key)

test('a full block from Excel maps onto every column', () => {
  const clipboard = [
    '2026-03-15\tOnsite labor\tLABOR\t6.5\t95\t0\t\ttrue\tfalse',
    '2026-03-16\tRack and patch panel\tHARDWARE\t1\t420.00\t10\tVolume\ttrue\tfalse',
  ].join('\n')

  const rows = parseClipboard(clipboard, columns, 0, base)

  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], {
    date: '2026-03-15',
    description: 'Onsite labor',
    item_type: 'LABOR',
    quantity: '6.5',
    unit_rate: '95',
    discount_percentage: '0',
    discount_reason: '',
    client_pays: true,
    applies_to_debt: false,
  })
  assert.equal(rows[1].item_type, 'HARDWARE')
  assert.equal(rows[1].discount_reason, 'Volume')
  assert.equal(rows[1].client_pays, true)
})

test('pasting into a middle column only fills from there', () => {
  const rows = parseClipboard('3\t150', columns, columnIndex('quantity'), base)

  assert.equal(rows.length, 1)
  assert.equal(rows[0].quantity, '3')
  assert.equal(rows[0].unit_rate, '150')
  // Untouched columns keep the landing row's values
  assert.equal(rows[0].date, '2026-03-01')
  assert.equal(rows[0].description, '')
})

test('currency formatting from a sheet is stripped', () => {
  const rows = parseClipboard('$1,250.50', columns, columnIndex('unit_rate'), base)
  assert.equal(rows[0].unit_rate, '1250.50')
  assert.equal(Number.parseFloat(rows[0].unit_rate), 1250.5)
})

test('item type accepts the shorthand people actually type', () => {
  const at = columnIndex('item_type')
  assert.equal(parseClipboard('labor', columns, at, base)[0].item_type, 'LABOR')
  assert.equal(parseClipboard('Hardware', columns, at, base)[0].item_type, 'HARDWARE')
  assert.equal(parseClipboard('HW', columns, at, base)[0].item_type, 'HARDWARE')
  assert.equal(parseClipboard('O', columns, at, base)[0].item_type, 'OTHER')
  // Unrecognised text leaves the existing value alone rather than guessing
  assert.equal(parseClipboard('???', columns, at, base)[0].item_type, base.item_type)
})

test('checkbox columns accept the usual spreadsheet truthiness', () => {
  const at = columnIndex('client_pays')
  for (const yes of ['true', 'TRUE', 'yes', 'y', '1', 'x']) {
    assert.equal(parseClipboard(yes, columns, at, base)[0].client_pays, true, yes)
  }
  for (const no of ['false', 'no', '0', '']) {
    assert.equal(parseClipboard(no, columns, at, base)[0].client_pays, false, no)
  }
})

test('dates keep the day that was pasted', () => {
  const at = columnIndex('date')
  assert.equal(parseClipboard('2026-01-01', columns, at, base)[0].date, '2026-01-01')
  // Junk in a date cell leaves the previous date rather than shifting it
  assert.equal(parseClipboard('n/a', columns, at, base)[0].date, '2026-03-01')
})

test('trailing newlines do not create a phantom row', () => {
  const rows = parseClipboard('First\nSecond\n', columns, columnIndex('description'), base)
  assert.equal(rows.length, 2)
  assert.equal(rows[1].description, 'Second')
})

test('windows line endings are handled', () => {
  const rows = parseClipboard('First\r\nSecond', columns, columnIndex('description'), base)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].description, 'First')
})

test('extra pasted columns past the last one are ignored, not crashed on', () => {
  const rows = parseClipboard('a\tb\tc\td', columns, columns.length - 2, base)
  assert.equal(rows.length, 1)
})

test('validation mirrors the server rules', () => {
  assert.equal(validateDraft({ ...base, description: '', quantity: '1', unit_rate: '1' }),
    'Description is required')
  assert.equal(validateDraft({ ...base, description: 'x', quantity: '', unit_rate: '1' }),
    'Quantity must be a number')
  assert.equal(validateDraft({ ...base, description: 'x', quantity: '1', unit_rate: '' }),
    'Rate must be a number')
  assert.equal(
    validateDraft({ ...base, description: 'x', quantity: '1', unit_rate: '1', discount_percentage: '150' }),
    'Discount must be between 0 and 100'
  )
  assert.equal(validateDraft({ ...base, description: 'x', quantity: '1', unit_rate: '1' }), null)
  // Zero quantity and zero rate are legitimate, not missing
  assert.equal(validateDraft({ ...base, description: 'x', quantity: '0', unit_rate: '0' }), null)
})

test('a row with no description holds nothing worth saving', () => {
  // Quantity and rate can be pre-filled from the Settings defaults, so only
  // the description tells us whether the user has actually entered anything.
  assert.equal(isBlank(emptyDraft()), true)
  assert.equal(isBlank({ ...base, description: 'x' }), false)
  assert.equal(isBlank({ ...base, quantity: '1', unit_rate: '75' }), true)
  assert.equal(isBlank({ ...base, client_pays: false }), true)
  assert.equal(isBlank({ ...base, description: '   ' }), true)
})

test('row totals apply the discount', () => {
  assert.equal(draftTotal({ ...base, quantity: '6.5', unit_rate: '100', discount_percentage: '' }), 650)
  assert.equal(draftTotal({ ...base, quantity: '2', unit_rate: '100', discount_percentage: '10' }), 180)
  assert.equal(draftTotal({ ...base, quantity: '', unit_rate: '' }), 0)
})

test('the payload sends numbers, not the strings the cells hold', () => {
  const payload = draftToPayload({
    ...base,
    description: '  Onsite labor  ',
    quantity: '6.5',
    unit_rate: '95',
    discount_percentage: '',
    discount_reason: '   ',
  })
  assert.equal(payload.description, 'Onsite labor')
  assert.equal(payload.quantity, 6.5)
  assert.equal(payload.unit_rate, 95)
  assert.equal(payload.discount_percentage, 0)
  assert.equal(payload.discount_reason, null)
})

// --- layout ---------------------------------------------------------------
// The grid first shipped inside a two-thirds column (~800px) with columns that
// needed ~1264px, so every cell clipped instead of scrolling. It now sits full
// width and declares a min-width the container scrolls to honour.

import { GRID_COLUMNS as COLS, tableMinWidthPx } from '../lib/lineItemGrid'

/** max-w-7xl (1280px) less the page's lg:px-8 gutters. */
const FULL_WIDTH_AVAILABLE = 1216

test('the grid fits its container at full width, debt column off', () => {
  const visible = COLS.filter((column) => column.feature !== 'debt')
  assert.ok(
    tableMinWidthPx(visible) <= FULL_WIDTH_AVAILABLE,
    `needs ${tableMinWidthPx(visible)}px but only ${FULL_WIDTH_AVAILABLE}px is available`
  )
})

test('the grid still fits with the debt column shown', () => {
  assert.ok(
    tableMinWidthPx(COLS) <= FULL_WIDTH_AVAILABLE,
    `needs ${tableMinWidthPx(COLS)}px but only ${FULL_WIDTH_AVAILABLE}px is available`
  )
})

test('every column reserves enough width for its own heading', () => {
  // ~7.5px per uppercase character at text-xs, plus the cell's horizontal padding.
  for (const column of COLS) {
    const headingPx = column.label.length * 7.5 + 16
    assert.ok(
      column.minPx >= headingPx,
      `"${column.label}" reserves ${column.minPx}px but its heading needs ~${Math.ceil(headingPx)}px`
    )
  }
})

test('a date column fits a native date input and its picker icon', () => {
  const date = COLS.find((column) => column.kind === 'date')
  assert.ok(date && date.minPx >= 130, 'date inputs clip below ~130px')
})

// --- the entry row ---------------------------------------------------------
// Line items list newest first, so the blank row you type the next entry into
// sits at the TOP of the grid, not past the bottom of the list.

import { buildRows, withEntryRow } from '../lib/lineItemGrid'
import type { LineItem } from '../lib/types/database.types'

const lineItem = (id: number, date: string): LineItem =>
  ({
    id,
    invoice_id: 1,
    description: `item ${id}`,
    quantity: 1,
    unit_rate: 75,
    item_type: 'LABOR',
    date,
    discount_percentage: 0,
    discount_reason: null,
    applies_to_debt: false,
    client_pays: true,
    created_at: '2026-09-01T00:00:00Z',
  }) as LineItem

test('the blank entry row is first, above the saved items', () => {
  const rows = buildRows([lineItem(1, '2026-09-29'), lineItem(2, '2026-09-16')])

  assert.equal(rows.length, 3)
  assert.equal(rows[0].id, null, 'the first row is the blank entry row')
  assert.ok(isBlank(rows[0].draft))
  assert.deepEqual(
    rows.slice(1).map((row) => row.id),
    [1, 2],
    'saved items keep their order below it'
  )
})

test('an empty invoice still offers an entry row', () => {
  const rows = buildRows([])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, null)
})

test('withEntryRow does not stack duplicate blanks', () => {
  const once = withEntryRow(buildRows([lineItem(1, '2026-09-29')]))
  const twice = withEntryRow(once)
  assert.equal(twice.length, once.length)
  assert.equal(twice, once, 'an untouched entry row is returned as-is')
})

test('withEntryRow restores the entry row once the old one is used', () => {
  const rows = buildRows([lineItem(1, '2026-09-29')])
  // The user typed into the entry row, so it is no longer blank.
  const used = [
    { ...rows[0], draft: { ...rows[0].draft, description: 'New work' }, status: 'dirty' as const },
    ...rows.slice(1),
  ]

  const restored = withEntryRow(used)
  assert.equal(restored.length, 3)
  assert.equal(restored[0].id, null)
  assert.ok(isBlank(restored[0].draft), 'a fresh blank goes back on top')
  assert.equal(restored[1].draft.description, 'New work', 'the filled row stays put below it')
})

test('the entry row follows the invoice date when set to', () => {
  const rows = buildRows([], FIXED_DATE_SEED)
  assert.equal(rows[0].draft.date, '2026-03-01')
})

// --- settings-driven defaults ---------------------------------------------

import { settingsFromRows, settingsToRows, SETTING_KEYS } from '../lib/settings'
import { todayDateOnly } from '../lib/utils/dates'

test('a new row dates itself today by default', () => {
  const rows = buildRows([], { defaults: DEFAULT_LINE_ITEM_DEFAULTS })
  assert.equal(rows[0].draft.date, todayDateOnly())
})

test("today's date wins even when an invoice date is supplied", () => {
  const rows = buildRows([], {
    defaults: DEFAULT_LINE_ITEM_DEFAULTS, // dateMode: 'today'
    invoiceDate: '2020-01-01',
  })
  assert.equal(rows[0].draft.date, todayDateOnly())
})

test('a new row is pre-filled from the configured defaults', () => {
  const draft = emptyDraft({
    ...DEFAULT_LINE_ITEM_DEFAULTS,
    description: 'Onsite labor',
    itemType: 'HARDWARE',
    quantity: '2',
    unitRate: '75',
    discountPercentage: '10',
    discountReason: 'Volume',
    clientPays: false,
    appliesToDebt: true,
  })

  assert.equal(draft.description, 'Onsite labor')
  assert.equal(draft.item_type, 'HARDWARE')
  assert.equal(draft.quantity, '2')
  assert.equal(draft.unit_rate, '75')
  assert.equal(draft.discount_percentage, '10')
  assert.equal(draft.discount_reason, 'Volume')
  assert.equal(draft.client_pays, false)
  assert.equal(draft.applies_to_debt, true)
})

test('a seeded description does not make entry rows stack up', () => {
  // The entry row is recognised by its status, not by being empty, so a
  // default description cannot trick withEntryRow into prepending forever.
  const seed = { defaults: { ...DEFAULT_LINE_ITEM_DEFAULTS, description: 'Labor' } }
  let rows = buildRows([], seed)
  for (let i = 0; i < 5; i++) rows = withEntryRow(rows, seed)
  assert.equal(rows.length, 1)
})

test('defaults survive a round trip through the settings table', () => {
  const original = {
    debtTrackingEnabled: false,
    debtTotal: 0,
    lineItemDefaults: {
      ...DEFAULT_LINE_ITEM_DEFAULTS,
      dateMode: 'invoice' as const,
      itemType: 'OTHER' as const,
      quantity: '3',
      unitRate: '75',
      discountReason: 'Retainer',
      clientPays: false,
    },
  }

  const restored = settingsFromRows(settingsToRows(original))
  assert.deepEqual(restored.lineItemDefaults, original.lineItemDefaults)
})

test('a junk stored default falls back instead of breaking the grid', () => {
  const restored = settingsFromRows([
    { key: SETTING_KEYS.quantity, value: 'not a number' },
    { key: SETTING_KEYS.itemType, value: 'NONSENSE' },
    { key: SETTING_KEYS.dateMode, value: 'whenever' },
  ])

  assert.equal(restored.lineItemDefaults.quantity, DEFAULT_LINE_ITEM_DEFAULTS.quantity)
  assert.equal(restored.lineItemDefaults.itemType, 'LABOR')
  assert.equal(restored.lineItemDefaults.dateMode, 'today')
})

test('an empty stored default is kept, not treated as missing', () => {
  const restored = settingsFromRows([{ key: SETTING_KEYS.quantity, value: '' }])
  assert.equal(restored.lineItemDefaults.quantity, '', 'a cleared field stays cleared')
})

test('a lowercase stored item type is accepted', () => {
  const restored = settingsFromRows([{ key: SETTING_KEYS.itemType, value: 'hardware' }])
  assert.equal(restored.lineItemDefaults.itemType, 'HARDWARE')
})
