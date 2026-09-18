/**
 * Date-only helpers.
 *
 * Postgres DATE columns (invoices.date, invoices.paid_date, line_items.date)
 * come back as plain 'YYYY-MM-DD' calendar days with no timezone. Passing one
 * to `new Date()` parses it as UTC midnight, so anything that then reads it in
 * local time (toLocaleDateString, getFullYear, date-fns format) renders the
 * previous day west of UTC. Every date-only value must go through here.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/

/** Parse 'YYYY-MM-DD' into a Date at LOCAL midnight (never UTC midnight). */
export function parseDateOnly(value: string): Date {
  const match = DATE_ONLY.exec(value)
  if (!match) return new Date(value) // timestamptz or other full ISO string
  const [, year, month, day] = match
  return new Date(Number(year), Number(month) - 1, Number(day))
}

/** Serialize a Date to 'YYYY-MM-DD' using its LOCAL calendar day. */
export function toDateOnly(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Human-readable form of a calendar day, e.g. 'Mar 15, 2026'. */
const DISPLAY_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export function formatDateOnly(value: string): string {
  return DISPLAY_FORMAT.format(parseDateOnly(value))
}

/** Today as 'YYYY-MM-DD' in the local calendar. */
export function todayDateOnly(): string {
  return toDateOnly(new Date())
}

/** Add whole days to a 'YYYY-MM-DD' value, returning 'YYYY-MM-DD'. */
export function addDaysToDateOnly(value: string, days: number): string {
  const date = parseDateOnly(value)
  date.setDate(date.getDate() + days)
  return toDateOnly(date)
}

/** Whole days between two 'YYYY-MM-DD' values (b - a), DST-safe. */
export function daysBetweenDateOnly(from: string, to: string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  const a = Date.UTC(...dateParts(from))
  const b = Date.UTC(...dateParts(to))
  return Math.round((b - a) / MS_PER_DAY)
}

/** Calendar year of a 'YYYY-MM-DD' value, read from the string itself. */
export function yearOfDateOnly(value: string): number {
  return dateParts(value)[0]
}

/** Calendar month (1-12) of a 'YYYY-MM-DD' value, read from the string itself. */
export function monthOfDateOnly(value: string): number {
  return dateParts(value)[1] + 1
}

function dateParts(value: string): [number, number, number] {
  const match = DATE_ONLY.exec(value)
  if (match) return [Number(match[1]), Number(match[2]) - 1, Number(match[3])]
  const date = new Date(value)
  return [date.getFullYear(), date.getMonth(), date.getDate()]
}

/**
 * Normalize a spreadsheet cell into 'YYYY-MM-DD'.
 *
 * ExcelJS turns a date cell into a Date built from Date.UTC(), so its UTC
 * components are the calendar day the user typed — reading local components
 * there would shift it. Plain strings go through parseDateOnly instead.
 * Returns null when the cell holds nothing date-like.
 */
export function cellToDateOnly(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const year = value.getUTCFullYear()
    const month = String(value.getUTCMonth() + 1).padStart(2, '0')
    const day = String(value.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  if (value === null || value === undefined || value === '') return null
  const parsed = parseDateOnly(String(value).trim())
  return Number.isNaN(parsed.getTime()) ? null : toDateOnly(parsed)
}
