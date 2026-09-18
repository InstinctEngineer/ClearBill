/**
 * Regression tests for the "reports are a day off" bug.
 *
 * Run with: npm test
 * (node's built-in runner, type annotations stripped — no test framework needed)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  addDaysToDateOnly,
  cellToDateOnly,
  daysBetweenDateOnly,
  formatDateOnly,
  monthOfDateOnly,
  parseDateOnly,
  toDateOnly,
  yearOfDateOnly,
} from '../lib/utils/dates.ts'

// Anywhere west of UTC is where the bug showed up; assert the helpers are
// immune regardless of where the process runs.
const OFFSET_MINUTES = new Date().getTimezoneOffset()

test('a stored calendar day renders as itself', () => {
  assert.equal(toDateOnly(parseDateOnly('2026-03-15')), '2026-03-15')
  assert.equal(toDateOnly(parseDateOnly('2026-01-01')), '2026-01-01')
  assert.equal(toDateOnly(parseDateOnly('2025-12-31')), '2025-12-31')
})

test('parseDateOnly lands on local midnight, not UTC midnight', () => {
  const date = parseDateOnly('2026-03-15')
  assert.equal(date.getHours(), 0)
  assert.equal(date.getDate(), 15)
  assert.equal(date.getMonth(), 2)
  assert.equal(date.getFullYear(), 2026)
})

test('the old new Date() path is what shifted the day', () => {
  // Documents the defect so nobody reintroduces it.
  const naive = new Date('2026-01-01')
  if (OFFSET_MINUTES > 0) {
    assert.equal(naive.getFullYear(), 2025, 'west of UTC, naive parsing loses a day')
  }
  assert.equal(yearOfDateOnly('2026-01-01'), 2026)
})

test('year and month buckets follow the stored day', () => {
  assert.equal(yearOfDateOnly('2026-01-01'), 2026)
  assert.equal(monthOfDateOnly('2026-01-01'), 1)
  assert.equal(yearOfDateOnly('2025-12-31'), 2025)
  assert.equal(monthOfDateOnly('2025-12-31'), 12)
})

test('due dates add whole days across DST and year boundaries', () => {
  assert.equal(addDaysToDateOnly('2026-01-15', 30), '2026-02-14')
  assert.equal(addDaysToDateOnly('2026-03-01', 30), '2026-03-31') // spring forward
  assert.equal(addDaysToDateOnly('2026-10-20', 30), '2026-11-19') // fall back
  assert.equal(addDaysToDateOnly('2025-12-20', 30), '2026-01-19')
  assert.equal(addDaysToDateOnly('2028-02-28', 1), '2028-02-29') // leap day
})

test('day spans are exact across DST', () => {
  assert.equal(daysBetweenDateOnly('2026-03-01', '2026-03-31'), 30)
  assert.equal(daysBetweenDateOnly('2026-10-20', '2026-11-19'), 30)
  assert.equal(daysBetweenDateOnly('2026-03-15', '2026-03-15'), 0)
  assert.equal(daysBetweenDateOnly('2026-03-20', '2026-03-15'), -5)
})

test('spreadsheet cells keep the day the user typed', () => {
  // ExcelJS builds date cells with Date.UTC, so UTC components are the truth.
  assert.equal(cellToDateOnly(new Date(Date.UTC(2026, 2, 15))), '2026-03-15')
  assert.equal(cellToDateOnly('2026-03-15'), '2026-03-15')
  assert.equal(cellToDateOnly(''), null)
  assert.equal(cellToDateOnly(null), null)
  assert.equal(cellToDateOnly('not a date'), null)
})

test('display formatting shows the stored day', () => {
  assert.equal(formatDateOnly('2026-03-15'), 'Mar 15, 2026')
  assert.equal(formatDateOnly('2026-01-01'), 'Jan 1, 2026')
  assert.equal(formatDateOnly('2025-12-31'), 'Dec 31, 2025')
})
