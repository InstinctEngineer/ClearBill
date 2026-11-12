/**
 * Personal tax records: charitable gifts, the home mortgage, and the forms
 * the rest of a personal return is built from (W-2, 1098-E, 1099-R, ...).
 *
 * Nothing here is business income or expense. These figures belong on the
 * personal return, so they are kept apart from lib/tax.ts, which answers
 * Schedule C. The one bridge is a Form 1099-NEC, which the business Tax page
 * reads as the figure to reconcile against.
 *
 * The ledger holds three kinds of record (see migrations 014 and 015):
 * payments, statements and documents. Which categories and forms exist is
 * data, in lib/personalKinds.ts. The rule for a year's figure is the same in
 * every category: the payee's own statement wins when there is one, and the
 * individual payments are reconciled against it. That mirrors how the
 * business side treats a 1099.
 *
 * Pure: no React, no Supabase, no clock. The caller passes today's date.
 */
import type { ParseResult } from '@/lib/lineItems'
import {
  DETAIL_KEYS,
  FORM_CATEGORIES,
  personalCategory,
  recordKindLabel,
  recordKinds,
  statementName,
  RECORD_TYPES,
  type DetailKey,
  type RecordType,
} from '@/lib/personalKinds'
import { groupBy, money, round2, sortFlags, sum, type FlagSeverity } from '@/lib/tax'
import { cellToDateOnly, monthOfDateOnly, yearOfDateOnly } from '@/lib/utils/dates'

// ------------------------------------------------------------ vocabulary

// Categories, kinds of record and their labels are data; see personalKinds.
export * from '@/lib/personalKinds'

export const FILING_STATUSES = [
  { key: 'single', label: 'Single' },
  { key: 'married_joint', label: 'Married filing jointly' },
  { key: 'married_separate', label: 'Married filing separately' },
  { key: 'head_of_household', label: 'Head of household' },
] as const

export type FilingStatus = (typeof FILING_STATUSES)[number]['key']

export function isFilingStatus(value: unknown): value is FilingStatus {
  return FILING_STATUSES.some((status) => status.key === value)
}

export function filingStatusLabel(status: FilingStatus): string {
  return FILING_STATUSES.find((entry) => entry.key === status)!.label
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

/**
 * Figures that only some kinds of record carry. Stored as JSON. The money
 * figures are the keys of DETAIL_FIELDS; which ones a record uses is set by
 * its kind in personalKinds.
 */
export type PersonalDetails = Partial<Record<DetailKey, number>> & {
  /** Loan paperwork: the terms interest is estimated from. */
  loan?: LoanTerms
  /** A charity document stating no goods or services were given in return. */
  no_goods_statement?: boolean
}

/** One row of the personal_deductions table. */
export interface PersonalRecord {
  id: number
  category: string
  record_type: RecordType
  /** Which tax form this is, e.g. '1098-E'. Null for a plain receipt. */
  form: string | null
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
  /** Known to exist but not on file yet. Never counted; listed as still to get. */
  expected: boolean
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
  'id, category, record_type, form, payee, payee_tax_id, record_date, tax_year, amount, reference, payment_method, description, details, counted, expected, notes, filename, storage_path, source'

/** A database row as a record: NUMERIC can arrive as a string, JSON as null. */
export function toPersonalRecord(row: Record<string, unknown>): PersonalRecord {
  return {
    ...(row as unknown as PersonalRecord),
    form: (row.form as string | null | undefined) ?? null,
    expected: Boolean(row.expected),
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
  if (!personalCategory(category)) return { ok: false, error: 'category is not one the app knows' }

  const recordType = String(body.record_type ?? 'payment').trim() as RecordType
  if (!RECORD_TYPES.includes(recordType)) {
    return { ok: false, error: `record_type must be one of ${RECORD_TYPES.join(', ')}` }
  }

  // A form is only meaningful as one of the kinds its category takes.
  const form = optionalText(body.form)
  if (form && !recordKinds(category).some((kind) => kind.type === recordType && kind.form === form)) {
    return { ok: false, error: `form ${form} is not one that ${category} takes` }
  }
  const expected = Boolean(body.expected)

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
  // A statement still to be fetched has no figure yet; one on file must.
  if (amount === null && recordType === 'statement' && !expected) {
    return { ok: false, error: 'a statement needs its total as the amount' }
  }

  const details = parseDetails(body.details)
  if (!details.ok) return details

  return {
    ok: true,
    value: {
      category,
      record_type: recordType,
      form,
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
      expected,
      notes: optionalText(body.notes),
    },
  }
}

function parseDetails(raw: unknown): ParseResult<PersonalDetails> {
  if (raw === undefined || raw === null) return { ok: true, value: {} }
  if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'details must be an object' }
  const source = raw as Record<string, unknown>
  const details: PersonalDetails = {}

  for (const key of DETAIL_KEYS) {
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
    | 'expected_document'
    | 'student_loan_interest'
    | 'retirement_distribution'
    | 'ira_contribution'
    | 'care_provider_id'
    | 'education_distribution'
    | 'investment_sales'
    | 'salt_capped'
  message: string
}

/**
 * One payee's year in a category: the individual payments, reconciled against
 * the payee's own statement. Used for charities, student loan servicers and
 * care providers alike.
 */
export interface PayeeYear {
  payee: string
  taxId: string | null
  category: string
  payments: PersonalRecord[]
  paymentsTotal: number
  statement: PersonalRecord | null
  /** The figure to file: the statement when there is one, else the payments. */
  deductible: number
  /** Statement minus payments; null without a statement. */
  difference: number | null
}

/**
 * Most state and local tax (income, real estate and personal property
 * together) that Schedule A allows. $10,000 through 2024; raised to $40,000
 * for 2025 and $40,400 for 2026 by the One Big Beautiful Bill Act. Half for
 * married filing separately. The reduction above $500,000 of income is not
 * modelled.
 */
export function saltCap(year: number, status: FilingStatus | null): number {
  const cap = year <= 2024 ? 10000 : year === 2025 ? 40000 : 40400
  return status === 'married_separate' ? cap / 2 : cap
}

/** State and local taxes for the year, as Schedule A lines 5a to 5e add them up. */
export interface SaltFigures {
  /** Withheld from wages plus state estimates paid. */
  stateLocalIncome: number
  realEstate: number
  personalProperty: number
  total: number
  cap: number
  /** The total, held to the cap. */
  deductible: number
}

/** Most student loan interest that can be deducted in a year. */
export const STUDENT_LOAN_INTEREST_LIMIT = 2500

/** Figures from tax forms that sit outside the itemized comparison. */
export interface OtherFigures {
  wages: number
  otherIncome: number
  federalWithheld: number
  stateWithheld: number
  localWithheld: number
  /** Deferrals into an employer plan, from Box 12 of the W-2s. */
  retirementDeferrals: number
  studentLoanInterest: number
  /** The part of that interest the limit allows. */
  studentLoanDeduction: number
  iraContributions: number
  rothContributions: number
  retirementDistributions: number
  taxableDistributions: number
  dependentCarePaid: number
  federalEstimatedTax: number
  stateEstimatedTax: number
  /** Form 1099-Q: money taken out of a 529 plan, and the earnings part of it. */
  educationDistributions: number
  educationEarnings: number
  /** Forms 1099-B and 1099-DA: sale proceeds, before basis. */
  investmentProceeds: number
}

/**
 * The figures worth showing, in return order, skipping whatever is zero. The
 * page and the export both list these, so the wording lives here.
 */
export function otherFigureRows(other: OtherFigures): { label: string; amount: number; note: string }[] {
  return [
    { label: 'Wages', amount: other.wages, note: 'Form W-2, Box 1' },
    { label: 'Other income on 1099 forms', amount: other.otherIncome, note: 'As reported to the IRS' },
    { label: 'Federal income tax withheld', amount: other.federalWithheld, note: 'Already paid toward the tax for the year' },
    { label: 'State income tax withheld', amount: other.stateWithheld, note: 'Schedule A, line 5a if you itemize' },
    { label: 'Local income tax withheld', amount: other.localWithheld, note: 'Schedule A, line 5a if you itemize' },
    { label: 'Workplace retirement deferrals', amount: other.retirementDeferrals, note: 'W-2 Box 12; already left out of Box 1 wages' },
    { label: 'Student loan interest paid', amount: other.studentLoanInterest, note: 'Form 1098-E, Box 1' },
    { label: 'Student loan interest deduction', amount: other.studentLoanDeduction, note: `Limit ${money(STUDENT_LOAN_INTEREST_LIMIT)}; no need to itemize` },
    { label: 'Traditional IRA contributions', amount: other.iraContributions, note: 'Form 5498; may be deductible' },
    { label: 'Roth IRA contributions', amount: other.rothContributions, note: 'Not deductible' },
    { label: 'Retirement distributions', amount: other.retirementDistributions, note: 'Form 1099-R, Box 1' },
    { label: 'Taxable part of distributions', amount: other.taxableDistributions, note: 'Form 1099-R, Box 2a' },
    { label: 'Child and dependent care paid', amount: other.dependentCarePaid, note: 'Basis for the care credit' },
    { label: 'Federal estimated tax paid', amount: other.federalEstimatedTax, note: 'Form 1040-ES payments' },
    { label: 'State estimated tax paid', amount: other.stateEstimatedTax, note: '' },
    { label: '529 plan distributions', amount: other.educationDistributions, note: 'Form 1099-Q, Box 1' },
    { label: 'Earnings in those distributions', amount: other.educationEarnings, note: 'Form 1099-Q, Box 2; taxable unless matched to education costs' },
    { label: 'Investment and crypto sale proceeds', amount: other.investmentProceeds, note: 'Forms 1099-B and 1099-DA; goes on Form 8949 with the basis' },
  ].filter((row) => row.amount > 0)
}

/** One category of tax forms for the year, as the page lists it. */
export interface FormCategoryYear {
  category: string
  label: string
  /** Everything on file for the year, counted or not, oldest first. */
  records: PersonalRecord[]
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
  /** Real estate tax: rows entered here, else what the Form 1098 reports. */
  propertyTax: {
    records: PersonalRecord[]
    total: number
  }
  salt: SaltFigures
  /** Tax forms outside Schedule A: wages, student loans, retirement and the rest. */
  forms: FormCategoryYear[]
  other: OtherFigures
  /** Documents known to exist that are not on file yet. */
  expected: PersonalRecord[]
  /** Charity and home paperwork for the year that adds nothing to a total. */
  documents: PersonalRecord[]
  /** Charity + mortgage interest + points + state and local taxes up to the cap. */
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
  const counted = inYear.filter(isCounted)
  const flags: PersonalFlag[] = []

  // ---- charity: each organization against its own statement
  const payees = reconcileByPayee(counted.filter((record) => groupOf(record) === 'charity'))

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
    .filter((record) => record.category === 'mortgage' && isCounted(record) && record.details.loan)
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

  // ---- tax forms outside Schedule A
  const formRecords = counted.filter((record) => groupOf(record) === 'forms')
  const withForm = (form: string) => formRecords.filter((record) => record.form === form)
  const detail = (rows: PersonalRecord[], key: DetailKey) => round2(sum(rows, (row) => row.details[key] ?? 0))
  const reconciled = (category: string) =>
    round2(sum(reconcileByPayee(formRecords.filter((record) => record.category === category)), (entry) => entry.deductible))

  const studentLoanInterest = reconciled('student_loan')
  const careProviders = reconcileByPayee(formRecords.filter((record) => record.category === 'dependent_care'))
  const other: OtherFigures = {
    wages: total(withForm('W-2')),
    localWithheld: detail(formRecords, 'local_withheld'),
    educationDistributions: total(withForm('1099-Q')),
    educationEarnings: detail(withForm('1099-Q'), 'earnings'),
    investmentProceeds: total(formRecords.filter((record) => record.category === 'investments' && record.record_type === 'statement')),
    otherIncome: total(formRecords.filter((record) => record.category === 'other_income' && record.record_type === 'statement')),
    federalWithheld: detail(formRecords, 'federal_withheld'),
    stateWithheld: detail(formRecords, 'state_withheld'),
    retirementDeferrals: detail(formRecords, 'retirement_deferrals'),
    studentLoanInterest,
    studentLoanDeduction: Math.min(studentLoanInterest, STUDENT_LOAN_INTEREST_LIMIT),
    iraContributions: total(withForm('5498')),
    rothContributions: detail(withForm('5498'), 'roth_contributions'),
    retirementDistributions: total(withForm('1099-R')),
    taxableDistributions: detail(withForm('1099-R'), 'taxable_amount'),
    dependentCarePaid: round2(sum(careProviders, (entry) => entry.deductible)),
    federalEstimatedTax: total(withForm('1040-ES')),
    stateEstimatedTax: total(withForm('state-estimate')),
  }
  flags.push(...formFlags(other, careProviders, year))

  // ---- state and local taxes: each payee's receipt for the year, else its payments
  const propertyTaxRecords = formRecords.filter((record) => record.category === 'property_tax' && record.record_type !== 'document')
  const propertyTaxTotal = propertyTaxRecords.length > 0
    ? reconciled('property_tax')
    : (form1098?.details.property_tax ?? 0)
  const stateLocalIncome = round2(other.stateWithheld + other.localWithheld + other.stateEstimatedTax)
  const personalProperty = reconciled('personal_property_tax')
  const saltTotal = round2(stateLocalIncome + propertyTaxTotal + personalProperty)
  const cap = saltCap(year, filingStatus)
  const salt: SaltFigures = {
    stateLocalIncome,
    realEstate: round2(propertyTaxTotal),
    personalProperty,
    total: saltTotal,
    cap,
    deductible: Math.min(saltTotal, cap),
  }
  if (saltTotal > cap) {
    flags.push({
      severity: 'info',
      code: 'salt_capped',
      message: `State and local taxes for ${year} come to ${money(saltTotal)}. Schedule A allows ${money(cap)} of that.`,
    })
  }

  // ---- documents known to exist but not on file; listed apart from the rest
  const expected = inYear.filter((record) => record.expected)
  const onFile = inYear.filter((record) => !record.expected)

  const forms = FORM_CATEGORIES
    .map((category): FormCategoryYear => ({
      category: category.key,
      label: category.label,
      records: onFile.filter((record) => record.category === category.key),
    }))
    .filter((entry) => entry.records.length > 0)

  if (expected.length > 0) {
    // One line for the lot; where to get each is in the list on the page.
    const names = expected.map((record) => `${recordKindLabel(record.category, record.record_type, record.form)} from ${record.payee}`)
    flags.push({
      severity: yearEnded ? 'action' : 'info',
      code: 'expected_document',
      message: `${expected.length} document${plural(expected.length)} for ${year} ${expected.length === 1 ? 'is' : 'are'} still to get: ${names.join('; ')}. Nothing from ${expected.length === 1 ? 'it' : 'them'} is in the totals yet.`,
    })
  }

  // ---- paperwork and housekeeping
  const documents = onFile.filter((record) =>
    groupOf(record) !== 'forms' && (record.record_type === 'document' || !record.counted))
  const notCounted = onFile.filter((record) => !record.counted)
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
  const itemizedOnFile = round2(charityTotal + interest + points + salt.deductible)
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
        : `The items recorded here total ${money(itemizedOnFile)}. The ${year} standard deduction is ${money(standard)} (${label}). Itemizing only pays when all Schedule A deductions together come to more than that; ${money(round2(standard - itemizedOnFile))} more would be needed.`,
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
    salt,
    forms,
    other,
    expected,
    documents,
    itemizedOnFile,
    standardDeduction: standard,
    nonItemizerGiftLimit: giftLimit,
    flags: sortFlags(flags),
  }
}

/**
 * Group one category group's records by payee and settle each against its
 * own statement: the statement is the figure to file, the payments are what
 * it is checked against. Largest first.
 */
function reconcileByPayee(records: PersonalRecord[]): PayeeYear[] {
  return [...groupBy(records, (record) => `${record.category}|${payeeKey(record.payee)}`).values()]
    .map((rows): PayeeYear => {
      const payments = rows.filter((row) => row.record_type === 'payment')
      const statement = rows.filter((row) => row.record_type === 'statement').at(-1) ?? null
      const paymentsTotal = total(payments)
      return {
        payee: (statement ?? rows[0]).payee,
        taxId: rows.find((row) => row.payee_tax_id)?.payee_tax_id ?? null,
        category: rows[0].category,
        payments,
        paymentsTotal,
        statement,
        deductible: statement?.amount ?? paymentsTotal,
        difference: statement ? round2((statement.amount ?? 0) - paymentsTotal) : null,
      }
    })
    .filter((entry) => entry.payments.length > 0 || entry.statement)
    .sort((a, b) => b.deductible - a.deductible || a.payee.localeCompare(b.payee))
}

/** What the tax forms on file mean for the return, said once each. */
function formFlags(other: OtherFigures, careProviders: PayeeYear[], year: number): PersonalFlag[] {
  const flags: PersonalFlag[] = []

  if (other.studentLoanInterest > 0) {
    const capped = other.studentLoanInterest > STUDENT_LOAN_INTEREST_LIMIT
    flags.push({
      severity: 'info',
      code: 'student_loan_interest',
      message: `Student loan interest of ${money(other.studentLoanInterest)} was paid in ${year}. ${capped ? `The deduction stops at ${money(STUDENT_LOAN_INTEREST_LIMIT)}.` : 'All of it is within the limit.'} It comes off income whether or not you itemize, and phases out at higher incomes.`,
    })
  }
  if (other.retirementDistributions > 0) {
    flags.push({
      severity: 'review',
      code: 'retirement_distribution',
      message: `Form 1099-R shows ${money(other.retirementDistributions)} taken out of a retirement account in ${year}, ${money(other.taxableDistributions)} of it taxable. A direct rollover is reported but not taxed; check the distribution code in Box 7 before entering it.`,
    })
  }
  if (other.iraContributions > 0) {
    flags.push({
      severity: 'info',
      code: 'ira_contribution',
      message: `${money(other.iraContributions)} went into a traditional IRA for ${year}. It may be deductible, depending on income and whether a workplace plan covers you. Roth contributions never are.`,
    })
  }
  if (other.educationDistributions > 0) {
    flags.push({
      severity: 'review',
      code: 'education_distribution',
      message: `Form 1099-Q shows ${money(other.educationDistributions)} taken from a 529 plan in ${year}, ${money(other.educationEarnings)} of it earnings. The earnings are tax-free only when matched to qualified education costs paid in ${year}; student loan payments count, up to $10,000 over a lifetime. Unmatched earnings are income, with a 10% additional tax. Loan interest paid with 529 money cannot also be deducted as student loan interest.`,
    })
  }
  if (other.investmentProceeds > 0) {
    flags.push({
      severity: 'review',
      code: 'investment_sales',
      message: `Sales of ${money(other.investmentProceeds)} were reported on Form 1099-B or 1099-DA for ${year}. Each sale goes on Form 8949 with its cost basis; a form that leaves the basis blank is taxed on the full proceeds unless you supply it.`,
    })
  }
  const withoutId = careProviders.filter((entry) => !entry.taxId)
  if (withoutId.length > 0) {
    flags.push({
      severity: 'review',
      code: 'care_provider_id',
      message: `The child and dependent care credit needs each provider's tax ID. ${withoutId.map((entry) => entry.payee).join(', ')} ${withoutId.length === 1 ? 'has' : 'have'} none recorded.`,
    })
  }
  return flags
}

function charityFlags(entry: PayeeYear, year: number, yearEnded: boolean): PersonalFlag[] {
  const flags: PersonalFlag[] = []
  const { payee, statement, difference } = entry

  if (statement && difference !== null && Math.abs(difference) >= 0.01) {
    flags.push(difference > 0
      ? {
          severity: 'review',
          code: 'statement_mismatch',
          message: `${payee}'s ${year} statement shows ${money(statement.amount ?? 0)}; the receipts on file add up to ${money(entry.paymentsTotal)}. ${money(difference)} of gifts have no receipt of their own here. The statement covers them and is the figure to file.`,
        }
      : {
          severity: 'action',
          code: 'statement_mismatch',
          message: `${payee}'s ${year} statement shows ${money(statement.amount ?? 0)}, but the receipts on file add up to ${money(entry.paymentsTotal)}, ${money(-difference)} more. Check for a duplicate or voided receipt, or ask the charity to correct the statement.`,
        })
  }

  // The IRS wants, for any single gift of $250 or more, a written
  // acknowledgment saying whether anything was given in return.
  const large = entry.payments.filter((gift) => (gift.amount ?? 0) >= ACKNOWLEDGMENT_THRESHOLD)
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
  } else if (!statement && yearEnded && entry.payments.length > 0) {
    flags.push({
      severity: 'review',
      code: 'statement_missing',
      message: `No ${year} ${statementName(entry.category)} from ${payee} is on file. The total, ${money(entry.paymentsTotal)}, comes from ${entry.payments.length} individual receipt${plural(entry.payments.length)}.`,
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

/** Counted toward totals: switched on, and actually on file. */
const isCounted = (record: PersonalRecord) => record.counted && !record.expected

const groupOf = (record: PersonalRecord) => personalCategory(record.category)?.group ?? null

const plural = (count: number) => (count === 1 ? '' : 's')

const total = (records: PersonalRecord[]) => round2(sum(records, (record) => record.amount ?? 0))
