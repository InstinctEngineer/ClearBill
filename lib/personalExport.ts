/**
 * Turn a year of personal tax records into the files a preparer can use, and
 * decide what each stored document is called inside the ZIP. Pure, so it is
 * testable; the page fetches the documents and bundles them.
 */
import {
  DETAIL_FIELDS,
  DETAIL_KEYS,
  filingStatusLabel,
  otherFigureRows,
  personalCategory,
  recordKindLabel,
  statementName,
  type PersonalRecord,
  type PersonalYearReport,
} from '@/lib/personalDeductions'
import { csvFile, safeFileName, uniqueFileNames } from '@/lib/receiptExport'
import type { TaxPackageFile } from '@/lib/taxExport'

const money = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toFixed(2))

const INTEREST_SOURCE = {
  form_1098: 'Form 1098, Box 1',
  estimate: 'ESTIMATE from loan terms; replace with Form 1098',
  payments: 'Recorded payments only; incomplete without Form 1098',
  none: '',
} as const

export function buildPersonalPackageFiles(report: PersonalYearReport): TaxPackageFile[] {
  const y = report.year
  return [
    { name: `${y}-personal-summary.csv`, content: summaryCsv(report) },
    { name: `${y}-charitable-gifts.csv`, content: giftsCsv(report) },
    { name: `${y}-mortgage.csv`, content: mortgageCsv(report) },
    { name: `${y}-tax-forms.csv`, content: formsCsv(report) },
    { name: `${y}-READ-ME-FIRST.txt`, content: readMe(report) },
  ]
}

function summaryCsv(r: PersonalYearReport): string {
  const lines: string[][] = [
    ['Schedule A line', 'Figure', 'Amount', 'Basis'],
    ['11', 'Gifts to charity by cash or check', money(r.charity.cash), 'Annual statement where on file, else receipts'],
    ['12', 'Gifts to charity other than cash', money(r.charity.noncash), ''],
    ['8a', 'Home mortgage interest', money(r.mortgage.interest), INTEREST_SOURCE[r.mortgage.source]],
    ['8c', 'Points', money(r.mortgage.points), r.mortgage.form1098 ? 'Form 1098, Box 6' : ''],
    ['5a', 'State and local income taxes', money(r.salt.stateLocalIncome), 'Withheld on Form W-2 plus state estimates paid'],
    ['5b', 'Real estate taxes', money(r.salt.realEstate), ''],
    ['5c', 'Personal property taxes', money(r.salt.personalProperty), ''],
    ['5e', 'State and local taxes allowed', money(r.salt.deductible), `Limit ${money(r.salt.cap)}`],
    ['', 'Total recorded here', money(r.itemizedOnFile), 'Lines 5e, 8a, 8c, 11 and 12; excludes anything not tracked in ClearBill'],
  ]
  if (r.filingStatus && r.standardDeduction !== null) {
    lines.push(['', `Standard deduction (${filingStatusLabel(r.filingStatus)})`, money(r.standardDeduction), 'Itemize only if all Schedule A deductions exceed this'])
  }
  if (r.nonItemizerGiftLimit !== null) {
    lines.push(['', 'Cash gifts deductible without itemizing', money(Math.min(r.charity.cash, r.nonItemizerGiftLimit)), `Limit ${money(r.nonItemizerGiftLimit)}`])
  }
  for (const row of otherFigureRows(r.other)) {
    lines.push(['', row.label, money(row.amount), row.note])
  }
  return csvFile(lines)
}

/** Every tax form and related record for the year, with whatever figures it carries. */
function formsCsv(r: PersonalYearReport): string {
  const records = [
    ...r.forms.flatMap((entry) => entry.records.map((record) => ({ label: entry.label, record }))),
    ...r.expected.map((record) => ({ label: personalCategory(record.category)?.label ?? record.category, record })),
  ]
  // Only the detail columns some record actually uses, so the sheet stays narrow.
  const used = DETAIL_KEYS.filter((key) => records.some(({ record }) => record.details[key] !== undefined))
  const lines: string[][] = [
    ['Category', 'What', 'From', 'Date', 'Amount', ...used.map((key) => DETAIL_FIELDS[key]), 'Status', 'Note'],
  ]
  for (const { label, record } of records) {
    lines.push([
      label,
      recordKindLabel(record.category, record.record_type, record.form),
      record.payee,
      record.record_date,
      money(record.amount),
      ...used.map((key) => money(record.details[key])),
      record.expected ? 'STILL TO GET' : record.counted ? 'On file' : 'Not counted',
      record.description ?? record.notes ?? '',
    ])
  }
  return csvFile(lines)
}

function giftsCsv(r: PersonalYearReport): string {
  const lines: string[][] = [['Organization', 'EIN', 'Record', 'Date', 'Amount', 'Receipt #', 'Paid by', 'Note']]
  for (const entry of r.charity.payees) {
    for (const gift of entry.payments) {
      lines.push([entry.payee, entry.taxId ?? '', 'Gift', gift.record_date, money(gift.amount), gift.reference ?? '', gift.payment_method ?? '', gift.description ?? ''])
    }
    lines.push([entry.payee, entry.taxId ?? '', 'Receipts total', '', money(entry.paymentsTotal), '', '', `${entry.payments.length} receipts`])
    if (entry.statement) {
      lines.push([entry.payee, entry.taxId ?? '', 'Annual statement', entry.statement.record_date, money(entry.statement.amount), '', '', 'The figure to file'])
    }
  }
  return csvFile(lines)
}

function mortgageCsv(r: PersonalYearReport): string {
  const m = r.mortgage
  const lines: string[][] = [['Record', 'Date', 'Interest', 'Principal', 'Escrow', 'Total paid', 'Balance after', 'Note']]
  if (m.form1098) {
    lines.push(['Form 1098', m.form1098.record_date, money(m.form1098.amount), '', '', '', money(m.form1098.details.outstanding_principal), 'Box 1 interest'])
  }
  if (m.estimatedInterest !== null) {
    lines.push(['Estimate from loan terms', '', money(m.estimatedInterest), '', '', '', '', 'Assumes every payment made as scheduled'])
  }
  for (const payment of m.payments) {
    const d = payment.details
    lines.push(['Payment', payment.record_date, money(payment.amount), money(d.principal), money(d.escrow), money(d.total_paid), money(d.balance), payment.description ?? ''])
  }
  if (m.loan) {
    lines.push(['Loan terms', m.loan.closing_date ?? '', '', money(m.loan.principal), '', '', '', `${m.loan.annual_rate}% for ${m.loan.term_months} months, first payment ${m.loan.first_payment_date}`])
  }
  return csvFile(lines)
}

function readMe(r: PersonalYearReport): string {
  const lines: string[] = [
    `Personal tax records for ${r.year}`,
    'These are personal records. None of this is business income or expense.',
    '',
    `Charitable gifts:        $${money(r.charity.total)}`,
    `Home mortgage interest:  $${money(r.mortgage.interest)}${r.mortgage.source === 'form_1098' ? '' : `  (${INTEREST_SOURCE[r.mortgage.source] || 'nothing on file'})`}`,
    `State and local taxes:   $${money(r.salt.deductible)}`,
    `Total recorded here:     $${money(r.itemizedOnFile)}`,
    '',
  ]
  const others = otherFigureRows(r.other)
  if (others.length > 0) {
    lines.push('From other tax forms:', ...others.map((row) => `  ${row.label}: $${money(row.amount)}`), '')
  }
  for (const [severity, heading] of [['action', 'Before filing'], ['review', 'Worth checking'], ['info', 'For reference']] as const) {
    const flags = r.flags.filter((flag) => flag.severity === severity)
    if (flags.length === 0) continue
    lines.push(`${heading}:`, ...flags.map((flag) => `  - ${flag.message}`), '')
  }
  lines.push('Documents are under documents/, in a folder per category.')
  return lines.join('\r\n')
}

/**
 * Every record for a year that has a document, in the order the folders
 * should read: by category, then by date.
 */
export function recordsWithFiles<T extends PersonalRecord>(records: T[], year: number): T[] {
  return records
    .filter((record) => record.tax_year === year && record.storage_path)
    .sort((a, b) =>
      a.category.localeCompare(b.category) || a.record_date.localeCompare(b.record_date) || a.id - b.id)
}

/**
 * Where each record's document goes inside the ZIP: a folder per category,
 * the file prefixed with its date and what it is, so the folder sorts in
 * order and a statement stands out from the receipts around it.
 */
export function documentZipNames(records: PersonalRecord[]): Map<number, string> {
  const bases = records.map((record) => {
    const group = personalCategory(record.category)?.group
    const folder = group === 'charity' || group === 'home' ? group : record.category.replace(/_/g, '-')
    const kind = record.form && group === 'forms'
      ? record.form
      : record.record_type === 'statement'
        ? statementName(record.category).replace(/\s+/g, '-')
        : record.record_type === 'document' ? 'document' : 'receipt'
    const original = safeFileName(record.filename ?? `record-${record.id}`)
    return `documents/${folder}/${record.record_date}_${safeFileName(record.counted ? kind : 'not-counted')}_${original}`
  })
  const unique = uniqueFileNames(bases)
  return new Map(records.map((record, index) => [record.id, unique[index]]))
}
