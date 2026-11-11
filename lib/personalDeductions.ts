/**
 * Personal deductions: charitable gifts and the home mortgage.
 *
 * Nothing here is business income or expense. These figures belong on
 * Schedule A of the personal return, so they are kept apart from lib/tax.ts,
 * which answers Schedule C.
 *
 * The ledger holds three kinds of record (see migration 014): payments,
 * statements and documents. The rule for a year's figure is the same in
 * every category: the payee's own statement wins when there is one, and the
 * individual payments are reconciled against it. That mirrors how the
 * business side treats a 1099.
 *
 * Pure: no React, no Supabase, no clock. The caller passes today's date.
 */
import type { ParseResult } from '@/lib/lineItems'
import { groupBy, money, round2, sortFlags, sum, type FlagSeverity } from '@/lib/tax'
import { cellToDateOnly, monthOfDateOnly, yearOfDateOnly } from '@/lib/utils/dates'

// ------------------------------------------------------------ vocabulary

export const PERSONAL_CATEGORIES = [
  { key: 'charity_cash', label: 'Charitable gift, money', group: 'charity', scheduleALine: '11' },
  { key: 'charity_noncash', label: 'Charitable gift, goods', group: 'charity', scheduleALine: '12' },
  { key: 'mortgage', label: 'Home mortgage', group: 'home', scheduleALine: '8a' },
  { key: 'property_tax', label: 'Property tax', group: 'home', scheduleALine: '5b' },
] as const

export type PersonalCategoryKey = (typeof PERSONAL_CATEGORIES)[number]['key']
export type PersonalGroup = (typeof PERSONAL_CATEGORIES)[number]['group']

export const RECORD_TYPES = ['payment', 'statement', 'document'] as const
export type RecordType = (typeof RECORD_TYPES)[number]

export const FILING_STATUSES = [
  { key: 'single', label: 'Single' },
  { key: 'married_joint', label: 'Married filing jointly' },
  { key: 'married_separate', label: 'Married filing separately' },
  { key: 'head_of_household', label: 'Head of household' },
] as const

export type FilingStatus = (typeof FILING_STATUSES)[number]['key']

export function personalCategory(key: string) {
  return PERSONAL_CATEGORIES.find((category) => category.key === key) ?? null
}

export function isFilingStatus(value: unknown): value is FilingStatus {
  return FILING_STATUSES.some((status) => status.key === value)
}

export function filingStatusLabel(status: FilingStatus): string {
  return FILING_STATUSES.find((entry) => entry.key === status)!.label
}

/** What a statement is called, so the page and the flags use the same words. */
export function statementName(category: string): string {
  return category === 'mortgage' ? 'Form 1098' : 'annual giving statement'
}

/** What each kind of record is called for a category, e.g. in the entry form. */
export function recordKindLabel(category: string, type: RecordType): string {
  const home = personalCategory(category)?.group === 'home'
  if (type === 'statement') return category === 'mortgage' ? 'Form 1098' : home ? 'Annual statement' : 'Annual giving statement'
  if (type === 'document') return category === 'mortgage' ? 'Loan paperwork' : 'Other document'
  return home ? 'Payment' : 'Gift'
}

// ------------------------------------------------------------ records

/** Terms of the loan, as printed on the closing disclosure. */
export interface LoanTerms {
  principal: number
  /** Percent per year, e.g. 3.25. */
  annual_rate: number
  term_months: number
  /** Due date of the first regular payment, 'YYYY-MM-DD'. */
  first_payment_date: string
  closing_date?: string
  /** Interest paid at closing for the days before the first full month. */
  prepaid_interest?: number
}

/** Figures that only some kinds of record carry. Stored as JSON. */
export interface PersonalDetails {
  // one mortgage payment
  principal?: number
  escrow?: number
  total_paid?: number
  balance?: number
  // a Form 1098
  points?: number
  property_tax?: number
  outstanding_principal?: number
  // loan paperwork
  loan?: LoanTerms
  // a charity document that states no goods or services were given in return
  no_goods_statement?: boolean
}

/** One row of the personal_deductions table. */
export interface PersonalRecord {
  id: number
  category: string
  record_type: RecordType
  payee: string
  payee_tax_id: string | null
  record_date: string
  tax_year: number
  amount: number | null
  reference: string | null
  payment_method: string | null
  description: string | null
  details: PersonalDetails
  counted: boolean
  notes: string | null
  filename: string | null
  storage_path: string | null
  source: string | null
}

export type PersonalRecordInput = Omit<PersonalRecord, 'id' | 'filename' | 'storage_path' | 'source'>

/** A record as the API returns it, with a short-lived link to its document. */
export interface PersonalRecordWithUrl extends PersonalRecord {
  /** Null when there is no document, or it is missing from storage. */
  url: string | null
}

/** What GET /api/personal returns. */
export interface PersonalResponse {
  records: PersonalRecordWithUrl[]
  /** Filing status by tax year, for the years where one has been chosen. */
  filingStatus: Record<number, FilingStatus>
}

/** Columns the API reads, in one place so every route selects the same row. */
export const PERSONAL_RECORD_COLUMNS =
  'id, category, record_type, payee, payee_tax_id, record_date, tax_year, amount, reference, payment_method, description, details, counted, notes, filename, storage_path, source'

/** A database row as a record: NUMERIC can arrive as a string, JSON as null. */
export function toPersonalRecord(row: Record<string, unknown>): PersonalRecord {
  return {
    ...(row as unknown as PersonalRecord),
    amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
    details: (row.details ?? {}) as PersonalDetails,
  }
}

/** Where a record's document lives in the private `receipts` bucket. */
export function personalStoragePath(record: Pick<PersonalRecord, 'category' | 'tax_year'>, fileName: string, stamp: number): string {
  const safe = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  return `personal/${record.category}/${record.tax_year}/${stamp}_${safe}`
}

/**
 * Coerce and validate a record payload. Shared by create and update: an
 * update merges the change over the stored row and runs the result through
 * here, so both paths apply the same rules.
 */
export function parsePersonalRecord(body: Record<string, unknown>): ParseResult<PersonalRecordInput> {
  const category = String(body.category ?? '').trim()
  if (!personalCategory(category)) {
    return { ok: false, error: `category must be one of ${PERSONAL_CATEGORIES.map((c) => c.key).join(', ')}` }
  }

  const recordType = String(body.record_type ?? 'payment').trim() as RecordType
  if (!RECORD_TYPES.includes(recordType)) {
    return { ok: false, error: `record_type must be one of ${RECORD_TYPES.join(', ')}` }
  }

  const payee = String(body.payee ?? '').trim()
  if (!payee) return { ok: false, error: 'payee is required' }

  const recordDate = cellToDateOnly(body.record_date)
  if (!recordDate) return { ok: false, error: 'record_date must be a valid calendar date' }

  // A statement dated January covers the year before, so the year can be
  // given outright; otherwise it follows the date.
  const givenYear = body.tax_year === undefined || body.tax_year === null || body.tax_year === ''
    ? yearOfDateOnly(recordDate)
    : Number(body.tax_year)
  if (!Number.isInteger(givenYear) || givenYear < 2000 || givenYear > 2100) {
    return { ok: false, error: 'tax_year must be a four-digit year' }
  }

  const amount = optionalMoney(body.amount)
  if (amount === undefined) return { ok: false, error: 'amount must be a number of 0 or more' }
  if (amount === null && recordType === 'statement') {
    return { ok: false, error: 'a statement needs its total as the amount' }
  }

  const details = parseDetails(body.details)
  if (!details.ok) return details

  return {
    ok: true,
    value: {
      category,
      record_type: recordType,
      payee,
      payee_tax_id: optionalText(body.payee_tax_id),
      record_date: recordDate,
      tax_year: givenYear,
      amount,
      reference: optionalText(body.reference),
      payment_method: optionalText(body.payment_method),
      description: optionalText(body.description),
      details: details.value,
      counted: body.counted === undefined ? true : Boolean(body.counted),
      notes: optionalText(body.notes),
    },
  }
}

const DETAIL_MONEY_KEYS = [
  'principal', 'escrow', 'total_paid', 'balance', 'points', 'property_tax', 'outstanding_principal',
] as const

function parseDetails(raw: unknown): ParseResult<PersonalDetails> {
  if (raw === undefined || raw === null) return { ok: true, value: {} }
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'details must be an object' }
  const source = raw as Record<string, unknown>
  const details: PersonalDetails = {}

  for (const key of DETAIL_MONEY_KEYS) {
    const value = optionalMoney(source[key])
    if (value === undefined) return { ok: false, error: `${key} must be a number of 0 or more` }
    if (value !== null) details[key] = value
  }
  if (source.no_goods_statement !== undefined) details.no_goods_statement = Boolean(source.no_goods_statement)

  if (source.loan !== undefined && source.loan !== null) {
    const loan = parseLoan(source.loan)
    if (!loan.ok) return loan
    details.loan = loan.value
  }
  return { ok: true, value: details }
}

function parseLoan(raw: unknown): ParseResult<LoanTerms> {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'loan must be an object' }
  const source = raw as Record<string, unknown>
  const principal = Number(source.principal)
  const rate = Number(source.annual_rate)
  const term = Number(source.term_months)
  const first = cellToDateOnly(source.first_payment_date)
  if (!(principal > 0)) return { ok: false, error: 'loan amount must be more than 0' }
  if (!(rate >= 0 && rate < 100)) return { ok: false, error: 'interest rate must be a percentage' }
  if (!Number.isInteger(term) || term <= 0) return { ok: false, error: 'loan term must be a whole number of months' }
  if (!first) return { ok: false, error: 'first payment date must be a valid calendar date' }

  const loan: LoanTerms = { principal: round2(principal), annual_rate: rate, term_months: term, first_payment_date: first }
  const closing = cellToDateOnly(source.closing_date)
  if (closing) loan.closing_date = closing
  const prepaid = optionalMoney(source.prepaid_interest)
  if (prepaid === undefined) return { ok: false, error: 'prepaid interest must be a number of 0 or more' }
  if (prepaid !== null) loan.prepaid_interest = prepaid
  return { ok: true, value: loan }
}

/** null when left blank, undefined when it is not a usable amount. */
function optionalMoney(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return null
  const amount = Number.parseFloat(String(value).replace(/[$,\s]/g, ''))
  return Number.isFinite(amount) && amount >= 0 ? round2(amount) : undefined
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null
  return String(value).trim() || null
}

// ------------------------------------------------------------ tax constants

/**
 * Standard deduction by tax year. Itemized deductions only change the tax
 * bill when, added together, they come to more than this.
 * Sources: IRS Rev. Proc. for each year; 2025 as raised by the One Big
 * Beautiful Bill Act; 2026 from Rev. Proc. 2025-32.
 */
const STANDARD_DEDUCTION: Record<number, Record<FilingStatus, number>> = {
  2021: { single: 12550, married_joint: 25100, married_separate: 12550, head_of_household: 18800 },
  2022: { single: 12950, married_joint: 25900, married_separate: 12950, head_of_household: 19400 },
  2023: { single: 13850, married_joint: 27700, married_separate: 13850, head_of_household: 20800 },
  2024: { single: 14600, married_joint: 29200, married_separate: 14600, head_of_household: 21900 },
  2025: { single: 15750, married_joint: 31500, married_separate: 15750, head_of_household: 23625 },
  2026: { single: 16100, married_joint: 32200, married_separate: 16100, head_of_household: 24150 },
}

/** Null for a year the table does not cover yet. */
export function standardDeduction(year: number, status: FilingStatus): number | null {
  return STANDARD_DEDUCTION[year]?.[status] ?? null
}

/** First year a non-itemizer may deduct cash gifts (IRC 170(p)). */
const NON_ITEMIZER_GIFTS_FROM = 2026

/**
 * Most a filer who takes the standard deduction can deduct for cash gifts to
 * charity. Null before 2026, when there was no such deduction.
 */
export function nonItemizerGiftLimit(year: number, status: FilingStatus): number | null {
  if (year < NON_ITEMIZER_GIFTS_FROM) return null
  return status === 'married_joint' ? 2000 : 1000
}

/** A single gift this large needs a written acknowledgment from the charity. */
export const ACKNOWLEDGMENT_THRESHOLD = 250

/** A 1098 this far from the loan-terms estimate is worth a second look. */
const ESTIMATE_TOLERANCE = 25

// ------------------------------------------------------------ amortization

export interface ScheduledPayment {
  /** Due date, 'YYYY-MM-DD'. */
  date: string
  interest: number
  principal: number
  balance: number
}

/** The level monthly payment of principal and interest for a loan. */
export function monthlyPayment(loan: LoanTerms): number {
  const rate = loan.annual_rate / 100 / 12
  if (rate === 0) return round2(loan.principal / loan.term_months)
  return round2((loan.principal * rate) / (1 - (1 + rate) ** -loan.term_months))
}

/**
 * The loan's payment schedule, assuming every payment is made as scheduled
 * with nothing extra toward principal. Good to within cents of a lender's
 * own figures; it is an estimate, never a substitute for the Form 1098.
 */
export function amortizationSchedule(loan: LoanTerms): ScheduledPayment[] {
  const rate = loan.annual_rate / 100 / 12
  const payment = monthlyPayment(loan)
  const schedule: ScheduledPayment[] = []
  let balance = loan.principal

  for (let n = 0; n < loan.term_months && balance > 0; n++) {
    const interest = round2(balance * rate)
    const principal = Math.min(balance, round2(payment - interest))
    balance = round2(balance - principal)
    schedule.push({ date: addMonths(loan.first_payment_date, n), interest, principal, balance })
  }
  return schedule
}

/**
 * Interest that falls in one calendar year under the schedule: the payments
 * due that year, plus the interest prepaid at closing in the closing year.
 */
export function estimatedInterestForYear(loan: LoanTerms, year: number): number {
  const due = amortizationSchedule(loan).filter((payment) => yearOfDateOnly(payment.date) === year)
  const scheduled = sum(due, (payment) => payment.interest)
  const closingYear = loan.closing_date ? yearOfDateOnly(loan.closing_date) : null
  return round2(scheduled + (closingYear === year ? (loan.prepaid_interest ?? 0) : 0))
}

/** Move a 'YYYY-MM-DD' date forward by whole months, keeping the day. */
function addMonths(date: string, months: number): string {
  const index = yearOfDateOnly(date) * 12 + (monthOfDateOnly(date) - 1) + months
  const year = Math.floor(index / 12)
  const month = String((index % 12) + 1).padStart(2, '0')
  return `${year}-${month}-${date.slice(8, 10)}`
}

// ------------------------------------------------------------ the report

export interface PersonalFlag {
  severity: FlagSeverity
  code:
    | 'statement_mismatch'
    | 'statement_missing'
    | 'acknowledgment_needed'
    | 'missing_file'
    | 'not_counted'
    | 'form_1098_missing'
    | 'form_1098_differs'
    | 'filing_status_missing'
    | 'standard_deduction'
    | 'non_itemizer_gifts'
  message: string
}

/** One charity's gifts in a year, reconciled against its own statement. */
export interface PayeeYear {
  payee: string
  taxId: string | null
  category: string
  gifts: PersonalRecord[]
  giftsTotal: number
  statement: PersonalRecord | null
  /** The figure to file: the statement when there is one, else the gifts. */
  deductible: number
  /** Statement minus gifts; null without a statement. */
  difference: number | null
}

export type InterestSource = 'form_1098' | 'estimate' | 'payments' | 'none'

export interface PersonalYearReport {
  year: number
  filingStatus: FilingStatus | null
  charity: {
    payees: PayeeYear[]
    cash: number
    noncash: number
    total: number
  }
  mortgage: {
    lender: string | null
    loan: LoanTerms | null
    form1098: PersonalRecord | null
    payments: PersonalRecord[]
    paymentsInterest: number
    estimatedInterest: number | null
    /** The figure to file, and where it came from. */
    interest: number
    source: InterestSource
    points: number
  }
  propertyTax: {
    records: PersonalRecord[]
    total: number
  }
  /** Paperwork for the year that adds nothing to a total. */
  documents: PersonalRecord[]
  /** Charity + mortgage interest + points + property tax, as recorded here. */
  itemizedOnFile: number
  standardDeduction: number | null
  nonItemizerGiftLimit: number | null
  flags: PersonalFlag[]
}

export interface PersonalYearInputs {
  year: number
  records: PersonalRecord[]
  filingStatus: FilingStatus | null
  /** 'YYYY-MM-DD'. Decides whether the year is over yet. */
  today: string
}

export function buildPersonalYearReport(inputs: PersonalYearInputs): PersonalYearReport {
  const { year, records, filingStatus, today } = inputs
  const yearEnded = year < yearOfDateOnly(today)
  const inYear = records.filter((record) => record.tax_year === year).sort(byDate)
  const counted = inYear.filter((record) => record.counted)
  const flags: PersonalFlag[] = []

  // ---- charity: each organization against its own statement
  const charityRecords = counted.filter((record) => personalCategory(record.category)?.group === 'charity')
  const payees = [...groupBy(charityRecords, (record) => `${record.category}|${payeeKey(record.payee)}`).values()]
    .map((rows): PayeeYear => {
      const gifts = rows.filter((row) => row.record_type === 'payment')
      const statement = rows.filter((row) => row.record_type === 'statement').at(-1) ?? null
      const giftsTotal = total(gifts)
      return {
        payee: (statement ?? rows[0]).payee,
        taxId: rows.find((row) => row.payee_tax_id)?.payee_tax_id ?? null,
        category: rows[0].category,
        gifts,
        giftsTotal,
        statement,
        deductible: statement?.amount ?? giftsTotal,
        difference: statement ? round2((statement.amount ?? 0) - giftsTotal) : null,
      }
    })
    .filter((entry) => entry.gifts.length > 0 || entry.statement)
    .sort((a, b) => b.deductible - a.deductible || a.payee.localeCompare(b.payee))

  for (const entry of payees) flags.push(...charityFlags(entry, year, yearEnded))

  const deductibleIn = (category: string) =>
    round2(sum(payees.filter((entry) => entry.category === category), (entry) => entry.deductible))
  const cash = deductibleIn('charity_cash')
  const noncash = deductibleIn('charity_noncash')

  // ---- mortgage: the 1098 when there is one, else an estimate from the loan
  const mortgageRecords = counted.filter((record) => record.category === 'mortgage')
  const form1098 = mortgageRecords.filter((record) => record.record_type === 'statement').at(-1) ?? null
  const payments = mortgageRecords.filter((record) => record.record_type === 'payment')
  const paymentsInterest = total(payments)

  // Loan terms are a standing fact, not a yearly one: take the newest on file.
  const loanRecord = records
    .filter((record) => record.category === 'mortgage' && record.counted && record.details.loan)
    .sort(byDate)
    .at(-1) ?? null
  const loan = loanRecord?.details.loan ?? null
  const loanStarted = loan ? year >= yearOfDateOnly(loan.closing_date ?? loan.first_payment_date) : false
  const estimatedInterest = loan && loanStarted ? estimatedInterestForYear(loan, year) : null

  const source: InterestSource = form1098
    ? 'form_1098'
    : estimatedInterest !== null && estimatedInterest > 0
      ? 'estimate'
      : payments.length > 0 ? 'payments' : 'none'
  const interest = source === 'form_1098'
    ? (form1098!.amount ?? 0)
    : source === 'estimate' ? estimatedInterest! : paymentsInterest
  const points = form1098?.details.points ?? 0
  const lender = (form1098 ?? loanRecord ?? payments[0] ?? null)?.payee ?? null

  if (source === 'estimate' || source === 'payments') {
    flags.push({
      severity: yearEnded ? 'action' : 'info',
      code: 'form_1098_missing',
      message: source === 'estimate'
        ? `No Form 1098 for ${year} is on file. The mortgage interest shown, ${money(interest)}, is an estimate worked out from the loan terms${yearEnded ? '' : ' for the full year'}. ${yearEnded ? `Get the 1098 from ${lender ?? 'the lender'} and add it; file with its Box 1 figure.` : `${lender ?? 'The lender'} issues the 1098 in January.`}`
        : `No Form 1098 for ${year} is on file, and there are no loan terms to estimate from. Only the ${payments.length} recorded payment${plural(payments.length)} are counted.`,
    })
  }
  if (form1098 && estimatedInterest !== null && Math.abs((form1098.amount ?? 0) - estimatedInterest) > ESTIMATE_TOLERANCE) {
    flags.push({
      severity: 'review',
      code: 'form_1098_differs',
      message: `The ${year} Form 1098 shows ${money(form1098.amount ?? 0)} of interest; the loan terms predict ${money(estimatedInterest)}. Extra principal payments or a late payment would explain a gap. Use the 1098.`,
    })
  }

  // ---- property tax: rows entered here, else what the 1098 reports
  const propertyTaxRecords = counted.filter((record) => record.category === 'property_tax' && record.record_type !== 'document')
  const propertyTaxTotal = propertyTaxRecords.length > 0
    ? total(propertyTaxRecords)
    : (form1098?.details.property_tax ?? 0)

  // ---- paperwork and housekeeping
  const documents = inYear.filter((record) => record.record_type === 'document' || !record.counted)
  const notCounted = inYear.filter((record) => !record.counted)
  if (notCounted.length > 0) {
    flags.push({
      severity: 'info',
      code: 'not_counted',
      message: `${notCounted.length} record${plural(notCounted.length)} for ${year} ${notCounted.length === 1 ? 'is' : 'are'} kept for reference and left out of the totals.`,
    })
  }
  const missingFile = counted.filter((record) => !record.storage_path)
  if (missingFile.length > 0) {
    flags.push({
      severity: 'review',
      code: 'missing_file',
      message: `${missingFile.length} record${plural(missingFile.length)} for ${year} ${missingFile.length === 1 ? 'has' : 'have'} no document attached. Add the file from the record's edit form, or attach several at once with the button at the top of the page.`,
    })
  }

  // ---- does any of it change the tax bill?
  const charityTotal = round2(cash + noncash)
  const itemizedOnFile = round2(charityTotal + interest + points + propertyTaxTotal)
  const standard = filingStatus ? standardDeduction(year, filingStatus) : null
  const giftLimit = filingStatus ? nonItemizerGiftLimit(year, filingStatus) : null

  if (!filingStatus) {
    flags.push({
      severity: 'review',
      code: 'filing_status_missing',
      message: `Choose a filing status for ${year}. It sets the standard deduction these figures are compared against.`,
    })
  } else if (standard !== null && itemizedOnFile > 0) {
    const label = filingStatusLabel(filingStatus).toLowerCase()
    flags.push({
      severity: 'info',
      code: 'standard_deduction',
      message: itemizedOnFile > standard
        ? `The items recorded here total ${money(itemizedOnFile)}, more than the ${year} standard deduction of ${money(standard)} (${label}). Itemizing on Schedule A is likely worth it.`
        : `The items recorded here total ${money(itemizedOnFile)}. The ${year} standard deduction is ${money(standard)} (${label}). Itemizing only pays when all Schedule A deductions together, including state and local taxes, come to more than that; ${money(round2(standard - itemizedOnFile))} more would be needed.`,
    })
  }
  if (giftLimit !== null && cash > 0) {
    flags.push({
      severity: 'info',
      code: 'non_itemizer_gifts',
      message: `From ${NON_ITEMIZER_GIFTS_FROM}, cash gifts to charity are deductible even with the standard deduction, up to ${money(giftLimit)}. ${money(Math.min(cash, giftLimit))} of this year's ${money(cash)} qualifies on that basis.`,
    })
  }

  return {
    year,
    filingStatus,
    charity: { payees, cash, noncash, total: charityTotal },
    mortgage: { lender, loan, form1098, payments, paymentsInterest, estimatedInterest, interest: round2(interest), source, points },
    propertyTax: { records: propertyTaxRecords, total: round2(propertyTaxTotal) },
    documents,
    itemizedOnFile,
    standardDeduction: standard,
    nonItemizerGiftLimit: giftLimit,
    flags: sortFlags(flags),
  }
}

function charityFlags(entry: PayeeYear, year: number, yearEnded: boolean): PersonalFlag[] {
  const flags: PersonalFlag[] = []
  const { payee, statement, difference } = entry

  if (statement && difference !== null && Math.abs(difference) >= 0.01) {
    flags.push(difference > 0
      ? {
          severity: 'review',
          code: 'statement_mismatch',
          message: `${payee}'s ${year} statement shows ${money(statement.amount ?? 0)}; the receipts on file add up to ${money(entry.giftsTotal)}. ${money(difference)} of gifts have no receipt of their own here. The statement covers them and is the figure to file.`,
        }
      : {
          severity: 'action',
          code: 'statement_mismatch',
          message: `${payee}'s ${year} statement shows ${money(statement.amount ?? 0)}, but the receipts on file add up to ${money(entry.giftsTotal)}, ${money(-difference)} more. Check for a duplicate or voided receipt, or ask the charity to correct the statement.`,
        })
  }

  // The IRS wants, for any single gift of $250 or more, a written
  // acknowledgment saying whether anything was given in return.
  const large = entry.gifts.filter((gift) => (gift.amount ?? 0) >= ACKNOWLEDGMENT_THRESHOLD)
  const covered = statement?.details.no_goods_statement === true
  const uncovered = covered ? [] : large.filter((gift) => gift.details.no_goods_statement !== true)

  if (uncovered.length > 0) {
    const what = `${uncovered.length} gift${plural(uncovered.length)} of ${money(ACKNOWLEDGMENT_THRESHOLD)} or more to ${payee}`
    flags.push(yearEnded
      ? {
          severity: 'action',
          code: 'acknowledgment_needed',
          message: `${what} in ${year} ${uncovered.length === 1 ? 'needs' : 'need'} a written acknowledgment stating that no goods or services were received. The receipts on file do not say it. Add the ${statementName(entry.category)}, or ask the charity for a letter, before filing.`,
        }
      : {
          severity: 'info',
          code: 'acknowledgment_needed',
          message: `${what} so far in ${year} will need a written acknowledgment stating that no goods or services were received. The ${statementName(entry.category)} that arrives in January normally provides it; add it here when it comes.`,
        })
  } else if (!statement && yearEnded && entry.gifts.length > 0) {
    flags.push({
      severity: 'review',
      code: 'statement_missing',
      message: `No ${year} ${statementName(entry.category)} from ${payee} is on file. The total, ${money(entry.giftsTotal)}, comes from ${entry.gifts.length} individual receipt${plural(entry.gifts.length)}.`,
    })
  }
  return flags
}

/**
 * Years worth a tab: any year with a record, plus every year the mortgage has
 * been running, since interest accrues whether or not a document was saved.
 * Newest first.
 */
export function personalYears(records: PersonalRecord[], today: string): number[] {
  const years = new Set(records.map((record) => record.tax_year))
  const thisYear = yearOfDateOnly(today)
  for (const record of records) {
    const loan = record.counted ? record.details.loan : undefined
    if (!loan) continue
    for (let y = yearOfDateOnly(loan.closing_date ?? loan.first_payment_date); y <= thisYear; y++) years.add(y)
  }
  return [...years].sort((a, b) => b - a)
}

// ------------------------------------------------------------ helpers

const byDate = (a: PersonalRecord, b: PersonalRecord) =>
  a.record_date.localeCompare(b.record_date) || a.id - b.id

const payeeKey = (payee: string) => payee.trim().toLowerCase()

const plural = (count: number) => (count === 1 ? '' : 's')

const total = (records: PersonalRecord[]) => round2(sum(records, (record) => record.amount ?? 0))
