/**
 * Tests for the personal tax ledger, run against the real records (gifts to
 * University of the Nations 2021-2026, the home mortgage, the 2025 tax forms)
 * so the figures below are the ones that will be filed.
 * Run with: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  amortizationSchedule,
  buildPersonalYearReport,
  estimatedInterestForYear,
  monthlyPayment,
  nonItemizerGiftLimit,
  otherFigureRows,
  parsePersonalRecord,
  personalYears,
  recordKindLabel,
  saltCap,
  standardDeduction,
  type LoanTerms,
  type PersonalDetails,
  type PersonalRecord,
} from '../lib/personalDeductions'
import { buildPersonalPackageFiles, documentZipNames, recordsWithFiles } from '../lib/personalExport'

const UOFN = 'University of the Nations, Kona'
const LENDER = 'R-G Federal Credit Union'
const TODAY = '2026-11-11'

let nextId = 1
function record(partial: Partial<PersonalRecord> & Pick<PersonalRecord, 'category' | 'record_date'>): PersonalRecord {
  const id = nextId++
  return {
    id,
    record_type: 'payment',
    form: null,
    payee: partial.category === 'mortgage' ? LENDER : UOFN,
    payee_tax_id: null,
    tax_year: Number(partial.record_date.slice(0, 4)),
    amount: null,
    reference: null,
    payment_method: null,
    description: null,
    details: {},
    counted: true,
    expected: false,
    notes: null,
    filename: `file-${id}.pdf`,
    storage_path: `personal/file-${id}.pdf`,
    source: null,
    ...partial,
  }
}

// date, amount, receipt number: every emailed "UofN Receipt"
const GIFTS: [string, number, string][] = [
  ['2021-01-06', 400, '764281'], ['2021-02-19', 150, '768817'], ['2021-03-09', 140, '772566'],
  ['2021-03-21', 300, '773781'], ['2021-04-08', 300, '778126'], ['2021-06-23', 150, '787389'],
  ['2021-08-25', 175, '796703'], ['2021-09-03', 150, '800726'], ['2021-09-17', 150, '801730'],
  ['2021-10-22', 150, '807921'], ['2021-11-29', 150, '814969'], ['2021-12-24', 150, '817868'],
  ['2022-01-16', 150, '821223'], ['2022-04-17', 150, '836561'], ['2022-05-23', 150, '841467'],
  ['2022-07-19', 150, '852393'], ['2022-08-04', 150, '854912'], ['2022-09-28', 153.55, '864305'],
  ['2022-11-30', 153.55, '874329'], ['2022-12-30', 153.55, '879696'],
  ['2023-01-15', 306.59, '881214'], ['2023-01-30', 153.55, '885108'], ['2023-02-28', 153.55, '890328'],
  ['2023-03-30', 153.55, '896198'], ['2023-04-27', 306.59, '901084'], ['2023-05-27', 306.59, '906386'],
  ['2023-06-27', 306.59, '911597'], ['2023-07-27', 306.59, '916620'], ['2023-08-27', 306.59, '920434'],
  ['2023-09-27', 306.59, '926929'], ['2023-10-27', 306.59, '931909'], ['2023-11-27', 306.59, '936963'],
  ['2023-12-27', 306.59, '942079'],
  ...['947373', '952140', '959791', '964857', '970064', '974802', '979664', '984545', '989039', '994141', '998486', '1003677']
    .map((ref, i): [string, number, string] => [`2024-${String(i + 1).padStart(2, '0')}-27`, 306.59, ref]),
  ...['1008642', '1013059', '1017551', '1021921', '1026402', '1030750', '1035300', '1039481', '1043812', '1046116', '1052279', '1057101']
    .map((ref, i): [string, number, string] => [`2025-${String(i + 1).padStart(2, '0')}-27`, 306.59, ref]),
  ...['1061661', '1065482', '1069654', '1073579', '1077216', '1081057', '1084618', '1087942', '1091058', '1094263']
    .map((ref, i): [string, number, string] => [`2026-${String(i + 1).padStart(2, '0')}-27`, 306.59, ref]),
]

// tax year, date on the letter, total
const STATEMENTS: [number, string, number][] = [
  [2021, '2022-01-22', 2665.0], [2022, '2023-01-18', 1360.65], [2023, '2024-01-21', 3526.55],
  [2024, '2025-01-21', 3679.08], [2025, '2026-01-28', 3679.08],
]

const LOAN: LoanTerms = {
  principal: 146500,
  annual_rate: 3.25,
  term_months: 360,
  first_payment_date: '2021-11-01',
  closing_date: '2021-09-10',
  prepaid_interest: 185.16,
}

const payment = (date: string, interest: number, details: PersonalDetails) =>
  record({ category: 'mortgage', record_date: date, amount: interest, details })

const records: PersonalRecord[] = [
  ...GIFTS.map(([date, amount, reference]) =>
    record({ category: 'charity_cash', record_date: date, amount, reference })),
  ...STATEMENTS.map(([tax_year, date, amount]) =>
    record({
      category: 'charity_cash', record_type: 'statement', record_date: date, tax_year, amount,
      details: { no_goods_statement: true },
    })),
  // A receipt UofN issued in error and replaced four hours later.
  record({ category: 'charity_cash', record_date: '2025-02-05', amount: 102.53, reference: '1009850', counted: false }),
  record({ category: 'mortgage', record_type: 'document', record_date: '2021-09-07', details: { loan: LOAN } }),
  payment('2023-03-06', 386.12, { principal: 251.46, escrow: 326.49, total_paid: 964.07, balance: 142316.25 }),
  payment('2025-03-05', 369.25, { principal: 268.33, escrow: 350.43, total_paid: 988.01, balance: 136072.48 }),
]

const reportFor = (year: number, filingStatus: 'married_joint' | 'single' | null = 'married_joint', rows = records) =>
  buildPersonalYearReport({ year, records: rows, filingStatus, today: TODAY })

const codes = (report: ReturnType<typeof reportFor>, severity?: string) =>
  report.flags.filter((flag) => !severity || flag.severity === severity).map((flag) => flag.code)

// ------------------------------------------------------------ charity

test('a year with a matching statement files the statement figure with nothing to chase', () => {
  for (const [year, total, count] of [[2023, 3526.55, 13], [2024, 3679.08, 12]] as const) {
    const report = reportFor(year)
    assert.equal(report.charity.total, total)
    assert.equal(report.charity.payees.length, 1)
    assert.equal(report.charity.payees[0].payments.length, count)
    assert.equal(report.charity.payees[0].difference, 0)
    // The only thing standing between this year and filing is the mortgage's 1098.
    assert.deepEqual(codes(report, 'action'), ['form_1098_missing'])
    assert.ok(!codes(report).includes('statement_mismatch'))
    assert.ok(!codes(report).includes('acknowledgment_needed'))
  }
})

test('the statement wins when a gift has no receipt of its own', () => {
  const y2021 = reportFor(2021)
  assert.equal(y2021.charity.total, 2665)
  assert.equal(y2021.charity.payees[0].paymentsTotal, 2365)
  assert.equal(y2021.charity.payees[0].difference, 300)

  const y2022 = reportFor(2022)
  assert.equal(y2022.charity.total, 1360.65)
  assert.equal(y2022.charity.payees[0].difference, 150)

  const mismatch = y2021.flags.find((flag) => flag.code === 'statement_mismatch')
  assert.equal(mismatch?.severity, 'review')
  assert.match(mismatch!.message, /\$300\.00 of gifts have no receipt/)
})

test('a voided receipt is kept but never counted', () => {
  const report = reportFor(2025)
  assert.equal(report.charity.total, 3679.08)
  assert.equal(report.charity.payees[0].payments.length, 12)
  assert.equal(report.charity.payees[0].difference, 0)
  assert.equal(report.documents.filter((doc) => !doc.counted).length, 1)
  assert.ok(codes(report).includes('not_counted'))
})

test('counting the voided receipt would overshoot the statement, and says so', () => {
  const withVoidCounted = records.map((row) => (row.reference === '1009850' ? { ...row, counted: true } : row))
  const report = reportFor(2025, 'married_joint', withVoidCounted)
  // The statement still decides the figure; the flag points at the extra receipt.
  assert.equal(report.charity.total, 3679.08)
  const mismatch = report.flags.find((flag) => flag.code === 'statement_mismatch')
  assert.equal(mismatch?.severity, 'action')
  assert.match(mismatch!.message, /\$102\.53 more/)
})

test('the year in progress totals its receipts and waits for the January statement', () => {
  const report = reportFor(2026)
  assert.equal(report.charity.total, 3065.9)
  assert.equal(report.charity.payees[0].statement, null)
  const pending = report.flags.find((flag) => flag.code === 'acknowledgment_needed')
  assert.equal(pending?.severity, 'info')
  assert.match(pending!.message, /10 gifts of \$250\.00 or more/)
})

test('gifts of $250 or more with no acknowledgment block filing once the year is over', () => {
  const noStatement = records.filter((row) => !(row.record_type === 'statement' && row.tax_year === 2024))
  const report = reportFor(2024, 'married_joint', noStatement)
  assert.equal(report.charity.total, 3679.08) // falls back to the receipts
  const needed = report.flags.find((flag) => flag.code === 'acknowledgment_needed')
  assert.equal(needed?.severity, 'action')
  assert.match(needed!.message, /12 gifts/)
})

test('small gifts need no acknowledgment, only a note that no statement is on file', () => {
  const small = [
    record({ category: 'charity_cash', payee: 'Food Bank', record_date: '2024-05-01', amount: 100 }),
    record({ category: 'charity_cash', payee: 'food bank ', record_date: '2024-11-01', amount: 249.99 }),
  ]
  const report = reportFor(2024, 'single', small)
  assert.equal(report.charity.payees.length, 1) // same charity despite the stray case and space
  assert.equal(report.charity.total, 349.99)
  assert.deepEqual(codes(report, 'action'), [])
  assert.ok(codes(report).includes('statement_missing'))
})

test('each charity is reconciled against its own statement', () => {
  const two = [
    ...records,
    record({ category: 'charity_cash', payee: 'Food Bank', record_date: '2024-06-01', amount: 200 }),
  ]
  const report = reportFor(2024, 'married_joint', two)
  assert.equal(report.charity.payees.length, 2)
  assert.equal(report.charity.total, 3879.08)
  assert.equal(report.charity.payees[0].payee, UOFN) // largest first
})

// ------------------------------------------------------------ mortgage

test('the schedule reproduces the lender\'s own payment and tracks its receipts', () => {
  assert.equal(monthlyPayment(LOAN), 637.58)
  const schedule = amortizationSchedule(LOAN)
  assert.equal(schedule[0].date, '2021-11-01')
  assert.equal(schedule.at(-1)!.balance, 0)

  // The two payments R-G FCU sent receipts for: March 2023 and March 2025.
  const march2023 = schedule.find((row) => row.date === '2023-03-01')!
  assert.equal(march2023.interest, 386.12)
  assert.equal(march2023.principal, 251.46)
  assert.ok(Math.abs(march2023.balance - 142316.25) < 0.5)

  const march2025 = schedule.find((row) => row.date === '2025-03-01')!
  assert.ok(Math.abs(march2025.interest - 369.25) < 0.05)
  assert.ok(Math.abs(march2025.balance - 136072.48) < 0.5)
})

test('interest by year: prepaid interest lands in the closing year', () => {
  assert.equal(estimatedInterestForYear(LOAN, 2020), 0)
  assert.equal(estimatedInterestForYear(LOAN, 2021), 978.05) // two payments + $185.16 at closing
  assert.equal(estimatedInterestForYear(LOAN, 2022), 4701.9)
  assert.equal(estimatedInterestForYear(LOAN, 2025), 4400.32)
})

test('without a Form 1098 the interest is an estimate and filing is blocked on getting one', () => {
  const report = reportFor(2025)
  assert.equal(report.mortgage.source, 'estimate')
  assert.equal(report.mortgage.interest, 4400.32)
  assert.equal(report.mortgage.paymentsInterest, 369.25) // the one receipt on file
  assert.equal(report.mortgage.lender, LENDER)
  const missing = report.flags.find((flag) => flag.code === 'form_1098_missing')
  assert.equal(missing?.severity, 'action')

  // Mid-year the same gap is only worth knowing about.
  assert.equal(reportFor(2026).flags.find((flag) => flag.code === 'form_1098_missing')?.severity, 'info')
})

test('a Form 1098 replaces the estimate and brings its points and property tax', () => {
  const with1098 = [
    ...records,
    record({
      category: 'mortgage', record_type: 'statement', record_date: '2026-01-31', tax_year: 2025,
      amount: 4401.02, details: { points: 0, property_tax: 1912.4, outstanding_principal: 137141.2 },
    }),
  ]
  const report = reportFor(2025, 'married_joint', with1098)
  assert.equal(report.mortgage.source, 'form_1098')
  assert.equal(report.mortgage.interest, 4401.02)
  assert.equal(report.propertyTax.total, 1912.4)
  assert.ok(!codes(report).includes('form_1098_missing'))
  assert.ok(!codes(report).includes('form_1098_differs')) // within a few dollars of the estimate
  assert.equal(report.itemizedOnFile, 9992.5)
})

test('a 1098 far from the estimate is flagged for a second look', () => {
  const off = [
    ...records,
    record({ category: 'mortgage', record_type: 'statement', record_date: '2026-01-31', tax_year: 2025, amount: 3900 }),
  ]
  assert.ok(codes(reportFor(2025, 'married_joint', off), 'review').includes('form_1098_differs'))
})

test('no mortgage figures before the loan existed', () => {
  const report = reportFor(2020)
  assert.equal(report.mortgage.source, 'none')
  assert.equal(report.mortgage.interest, 0)
})

// ------------------------------------------------------------ does it matter

test('the standard deduction comparison uses the year and filing status', () => {
  assert.equal(standardDeduction(2025, 'married_joint'), 31500)
  assert.equal(standardDeduction(2025, 'single'), 15750)
  assert.equal(standardDeduction(2026, 'head_of_household'), 24150)
  assert.equal(standardDeduction(2031, 'single'), null)

  const report = reportFor(2025)
  assert.equal(report.itemizedOnFile, 8079.4) // 3,679.08 gifts + 4,400.32 interest
  assert.equal(report.standardDeduction, 31500)
  const note = report.flags.find((flag) => flag.code === 'standard_deduction')
  assert.match(note!.message, /\$23,420\.60 more would be needed/)
})

test('from 2026 cash gifts count without itemizing, up to the limit', () => {
  assert.equal(nonItemizerGiftLimit(2025, 'married_joint'), null)
  assert.equal(nonItemizerGiftLimit(2026, 'married_joint'), 2000)
  assert.equal(nonItemizerGiftLimit(2026, 'single'), 1000)

  assert.ok(!codes(reportFor(2025)).includes('non_itemizer_gifts'))
  const note = reportFor(2026).flags.find((flag) => flag.code === 'non_itemizer_gifts')
  assert.match(note!.message, /\$2,000\.00 of this year's \$3,065\.90/)
})

test('a missing filing status is asked for instead of assumed', () => {
  const report = reportFor(2025, null)
  assert.equal(report.standardDeduction, null)
  assert.ok(codes(report, 'review').includes('filing_status_missing'))
  assert.ok(!codes(report).includes('standard_deduction'))
})

test('records without a document are counted and called out', () => {
  const bare = records.map((row) => (row.tax_year === 2024 ? { ...row, storage_path: null } : row))
  const flag = reportFor(2024, 'married_joint', bare).flags.find((f) => f.code === 'missing_file')
  assert.match(flag!.message, /13 records for 2024 have no document/)
})

// ------------------------------------------------------------ years, input, export

test('every year of the mortgage gets a tab, newest first', () => {
  assert.deepEqual(personalYears(records, TODAY), [2026, 2025, 2024, 2023, 2022, 2021])
  assert.deepEqual(personalYears([], TODAY), [])
})

test('record input: the year follows the date unless a statement says otherwise', () => {
  const gift = parsePersonalRecord({ category: 'charity_cash', payee: ' UofN ', record_date: '2026-10-27', amount: '$306.59' })
  assert.ok(gift.ok)
  assert.equal(gift.value.tax_year, 2026)
  assert.equal(gift.value.amount, 306.59)
  assert.equal(gift.value.payee, 'UofN')
  assert.equal(gift.value.counted, true)

  const statement = parsePersonalRecord({
    category: 'charity_cash', record_type: 'statement', payee: 'UofN', record_date: '2026-01-28',
    tax_year: 2025, amount: '3,679.08', details: { no_goods_statement: true },
  })
  assert.ok(statement.ok)
  assert.equal(statement.value.tax_year, 2025)
  assert.equal(statement.value.details.no_goods_statement, true)
})

test('record input: bad values are refused with a reason', () => {
  const bad = (body: Record<string, unknown>) => {
    const result = parsePersonalRecord({ category: 'charity_cash', payee: 'UofN', record_date: '2026-01-01', ...body })
    assert.equal(result.ok, false)
    return result.ok ? '' : result.error
  }
  assert.match(bad({ category: 'groceries' }), /category/)
  assert.match(bad({ payee: '  ' }), /payee/)
  assert.match(bad({ record_date: 'soon' }), /record_date/)
  assert.match(bad({ amount: '-5' }), /amount/)
  assert.match(bad({ record_type: 'statement' }), /statement needs its total/)
  assert.match(bad({ details: { loan: { principal: 0, annual_rate: 3, term_months: 360, first_payment_date: '2021-11-01' } } }), /loan amount/)
  assert.match(bad({ details: { escrow: 'lots' } }), /escrow/)
})

test('record input: loan terms survive the round trip', () => {
  const result = parsePersonalRecord({
    category: 'mortgage', record_type: 'document', payee: LENDER, record_date: '2021-09-07',
    details: { loan: { ...LOAN, principal: '146500' } },
  })
  assert.ok(result.ok)
  assert.deepEqual(result.value.details.loan, LOAN)
  assert.equal(result.value.amount, null)
})

test('the package names every document distinctly and separates the two ledgers', () => {
  const year = recordsWithFiles(records, 2025)
  const names = documentZipNames(year)
  assert.equal(new Set(names.values()).size, year.length)
  const all = [...names.values()]
  assert.ok(all.some((name) => /^documents\/charity\/2026-01-28_annual-giving-statement_/.test(name)))
  assert.ok(all.some((name) => /^documents\/charity\/2025-02-05_not-counted_/.test(name)))
  assert.ok(all.some((name) => /^documents\/home\/2025-03-05_receipt_/.test(name)))
})

test('the package summary carries the figures and says when interest is an estimate', () => {
  const files = buildPersonalPackageFiles(reportFor(2025))
  assert.deepEqual(files.map((file) => file.name), [
    '2025-personal-summary.csv', '2025-charitable-gifts.csv', '2025-mortgage.csv', '2025-tax-forms.csv', '2025-READ-ME-FIRST.txt',
  ])
  const summary = files[0].content
  assert.match(summary, /11,Gifts to charity by cash or check,3679\.08/)
  assert.match(summary, /8a,Home mortgage interest,4400\.32,ESTIMATE/)
  assert.match(summary, /Standard deduction \(Married filing jointly\),31500\.00/)
  assert.match(files[1].content, /Annual statement,2026-01-28,3679\.08/)
  assert.match(files[4].content, /Before filing:\r\n {2}- No Form 1098 for 2025/)
})

// ------------------------------------------------------------ tax forms

// The 2025 forms found in the mailbox, with the figures printed on them.
const EMPLOYER = 'Magnum Management'
const forms2025: PersonalRecord[] = [
  record({
    category: 'wages', record_type: 'statement', form: 'W-2', payee: EMPLOYER, record_date: '2026-01-31', tax_year: 2025,
    amount: 65145.38, details: { federal_withheld: 6026.44, state_withheld: 2172, local_withheld: 651.41, retirement_deferrals: 5744.62 },
  }),
  record({
    category: 'other_income', record_type: 'statement', form: '1099-NEC', payee: 'E S and D Services', record_date: '2026-01-31', tax_year: 2025,
    amount: 3597.5,
  }),
  record({
    category: 'education', record_type: 'statement', form: '1099-Q', payee: 'Iowa Educational Savings Plan Trust', record_date: '2026-01-31', tax_year: 2025,
    amount: 6723.56, details: { earnings: 1917.1, basis: 4806.46 },
  }),
  record({ category: 'personal_property_tax', payee: 'Jackson County, MO', record_date: '2025-12-29', amount: 250 }),
]
const with2025Forms = [...records, ...forms2025]

test('a W-2, a 1099-NEC and a 1099-Q each land on their own line', () => {
  const { other, forms } = reportFor(2025, 'married_joint', with2025Forms)
  assert.equal(other.wages, 65145.38)
  assert.equal(other.otherIncome, 3597.5)
  assert.equal(other.federalWithheld, 6026.44)
  assert.equal(other.stateWithheld, 2172)
  assert.equal(other.localWithheld, 651.41)
  assert.equal(other.retirementDeferrals, 5744.62)
  assert.equal(other.educationDistributions, 6723.56)
  assert.equal(other.educationEarnings, 1917.1)
  assert.deepEqual(forms.map((entry) => entry.category), ['personal_property_tax', 'wages', 'other_income', 'education'])
  // Zero figures stay off the page.
  const labels = otherFigureRows(other).map((row) => row.label)
  assert.ok(labels.includes('Wages') && labels.includes('529 plan distributions'))
  assert.ok(!labels.includes('Retirement distributions'))
})

test('state and local taxes join the itemizing comparison, up to the cap', () => {
  const report = reportFor(2025, 'married_joint', with2025Forms)
  assert.deepEqual(report.salt, {
    stateLocalIncome: 2823.41, realEstate: 0, personalProperty: 250, total: 3073.41, cap: 40000, deductible: 3073.41,
  })
  // gifts 3,679.08 + estimated interest 4,400.32 + taxes 3,073.41
  assert.equal(report.itemizedOnFile, 11152.81)
  assert.ok(report.itemizedOnFile < report.standardDeduction!)

  assert.equal(saltCap(2024, 'married_joint'), 10000)
  assert.equal(saltCap(2025, 'married_separate'), 20000)
  assert.equal(saltCap(2026, null), 40400)
  const big = [...with2025Forms, record({ category: 'property_tax', payee: 'Jackson County, MO', record_date: '2024-12-20', amount: 12500 })]
  const capped = reportFor(2024, 'married_joint', big)
  assert.equal(capped.salt.deductible, 10000)
  assert.ok(codes(capped).includes('salt_capped'))
})

test('a paid receipt for the year replaces the payments it covers instead of doubling them', () => {
  const rows = [
    record({ category: 'property_tax', payee: 'Jackson County', record_date: '2025-06-30', amount: 900 }),
    record({ category: 'property_tax', payee: 'Jackson County', record_date: '2025-12-30', amount: 900 }),
    record({ category: 'property_tax', record_type: 'statement', form: 'tax-bill', payee: 'Jackson County', record_date: '2025-12-31', amount: 1800 }),
  ]
  assert.equal(reportFor(2025, 'married_joint', rows).propertyTax.total, 1800)
})

test('a 529 distribution is flagged for matching against education costs', () => {
  const flag = reportFor(2025, 'married_joint', with2025Forms).flags.find((entry) => entry.code === 'education_distribution')
  assert.equal(flag?.severity, 'review')
  assert.match(flag!.message, /\$6,723\.56 taken from a 529 plan in 2025, \$1,917\.10 of it earnings/)
})

test('student loan interest is deductible up to the limit', () => {
  const loan = (amount: number) => [record({
    category: 'student_loan', record_type: 'statement', form: '1098-E', payee: 'Aidvantage', record_date: '2026-01-15', tax_year: 2025, amount,
  })]
  const small = reportFor(2025, 'married_joint', loan(412.6))
  assert.equal(small.other.studentLoanDeduction, 412.6)
  assert.match(small.flags.find((flag) => flag.code === 'student_loan_interest')!.message, /within the limit/)
  const large = reportFor(2025, 'married_joint', loan(3100))
  assert.equal(large.other.studentLoanInterest, 3100)
  assert.equal(large.other.studentLoanDeduction, 2500)
})

test('a retirement distribution and a care provider with no tax ID are both raised', () => {
  const rows = [
    record({
      category: 'retirement', record_type: 'statement', form: '1099-R', payee: 'Fidelity', record_date: '2027-01-31', tax_year: 2026,
      amount: 6900, details: { taxable_amount: 0, federal_withheld: 0 },
    }),
    record({ category: 'dependent_care', payee: 'Little Sprouts', record_date: '2026-03-01', amount: 800 }),
    record({
      category: 'investments', record_type: 'statement', form: '1099-DA', payee: 'Coinbase', record_date: '2027-02-15', tax_year: 2026,
      amount: 1200,
    }),
  ]
  const report = reportFor(2026, 'married_joint', rows)
  assert.equal(report.other.retirementDistributions, 6900)
  assert.equal(report.other.dependentCarePaid, 800)
  assert.equal(report.other.investmentProceeds, 1200)
  // Proceeds are not income until the basis comes off.
  assert.equal(report.other.otherIncome, 0)
  for (const code of ['retirement_distribution', 'care_provider_id', 'investment_sales'] as const) assert.ok(codes(report, 'review').includes(code), code)
})

test('a document still to get is listed, never counted, and blocks filing once the year is over', () => {
  const expected = record({
    category: 'student_loan', record_type: 'statement', form: '1098-E', payee: 'Aidvantage', record_date: '2026-01-15', tax_year: 2025,
    amount: 500, expected: true, filename: null, storage_path: null, notes: 'Online at Aidvantage.',
  })
  const report = reportFor(2025, 'married_joint', [...with2025Forms, expected])
  assert.deepEqual(report.expected.map((row) => row.id), [expected.id])
  assert.equal(report.other.studentLoanInterest, 0)
  assert.ok(!report.forms.some((entry) => entry.category === 'student_loan'))
  const flag = report.flags.find((entry) => entry.code === 'expected_document')
  assert.equal(flag?.severity, 'action')
  assert.match(flag!.message, /1 document for 2025 is still to get: Form 1098-E from Aidvantage/)
  // It has no file by definition, so it is not also nagged about as a missing file.
  assert.ok(!codes(report).includes('missing_file'))
  // The same gap in the year still running is only a note.
  const running = reportFor(2026, 'married_joint', [{ ...expected, tax_year: 2026 }])
  assert.equal(running.flags.find((entry) => entry.code === 'expected_document')?.severity, 'info')
})

test('record input: a form must be one its category takes, and a statement still to get needs no amount', () => {
  const base = { payee: 'Aidvantage', record_date: '2026-01-15', tax_year: 2025 }
  const wrong = parsePersonalRecord({ ...base, category: 'student_loan', record_type: 'statement', form: 'W-2', amount: 10 })
  assert.equal(wrong.ok, false)
  assert.match(wrong.ok ? '' : wrong.error, /form W-2 is not one that student_loan takes/)

  const pending = parsePersonalRecord({ ...base, category: 'student_loan', record_type: 'statement', form: '1098-E', expected: true })
  assert.ok(pending.ok)
  assert.equal(pending.value.amount, null)
  assert.equal(pending.value.expected, true)

  const w2 = parsePersonalRecord({
    ...base, category: 'wages', record_type: 'statement', form: 'W-2', amount: '65,145.38',
    details: { federal_withheld: '6026.44', local_withheld: 651.41 },
  })
  assert.ok(w2.ok)
  assert.deepEqual(w2.value.details, { federal_withheld: 6026.44, local_withheld: 651.41 })
  assert.equal(recordKindLabel('wages', 'statement', 'W-2'), 'Form W-2')
  assert.equal(recordKindLabel('education', 'statement', '1099-Q'), 'Form 1099-Q, 529 plan distribution')
})

test('the package lists the tax forms, what is still to get, and files each under its category', () => {
  const expected = record({
    category: 'retirement', record_type: 'statement', form: '5498', payee: 'Vanguard', record_date: '2026-05-08', tax_year: 2025,
    expected: true, filename: null, storage_path: null,
  })
  const all = [...with2025Forms, expected]
  const files = buildPersonalPackageFiles(reportFor(2025, 'married_joint', all))
  const formsCsv = files[3].content
  assert.match(formsCsv, /Wages,Form W-2,Magnum Management,2026-01-31,65145\.38/)
  assert.match(formsCsv, /Retirement accounts,"Form 5498, IRA contributions",Vanguard,2026-05-08,,.*STILL TO GET/)
  // Only the figures some form carries get a column.
  assert.match(formsCsv.split('\r\n')[0], /Federal income tax withheld/)
  assert.doesNotMatch(formsCsv.split('\r\n')[0], /Escrow/)
  assert.match(files[0].content, /5a,State and local income taxes,2823\.41/)
  assert.match(files[0].content, /5c,Personal property taxes,250\.00/)
  assert.match(files[0].content, /,Wages,65145\.38,"Form W-2, Box 1"/)
  assert.match(files[4].content, /From other tax forms:\r\n {2}Wages: \$65145\.38/)

  const names = [...documentZipNames(recordsWithFiles(all, 2025)).values()]
  assert.ok(names.some((name) => /^documents\/wages\/2026-01-31_W-2_/.test(name)))
  assert.ok(names.some((name) => /^documents\/education\/2026-01-31_1099-Q_/.test(name)))
  assert.ok(names.some((name) => /^documents\/personal-property-tax\/2025-12-29_receipt_/.test(name)))
})
