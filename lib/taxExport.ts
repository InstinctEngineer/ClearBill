/**
 * Turn a tax-year report into the files a preparer can use: CSVs for the
 * figures and a text summary of the flags. Pure, so it is testable; the
 * page bundles these with the year's receipts into one ZIP.
 */
import { csvCell } from '@/lib/receiptExport'
import type { TaxYearReport } from '@/lib/tax'

export interface TaxPackageFile {
  name: string
  content: string
}

const money = (n: number) => n.toFixed(2)
const rows = (lines: string[][]) =>
  '﻿' + lines.map((cells) => cells.map(csvCell).join(',')).join('\r\n') + '\r\n'

export function buildTaxPackageFiles(report: TaxYearReport): TaxPackageFile[] {
  const y = report.year
  return [
    { name: `${y}-summary.csv`, content: summaryCsv(report) },
    { name: `${y}-payments-received.csv`, content: paymentsCsv(report) },
    { name: `${y}-expenses-by-category.csv`, content: categoriesCsv(report) },
    { name: `${y}-expenses.csv`, content: expensesCsv(report) },
    { name: `${y}-debt-repayment.csv`, content: debtCsv(report) },
    { name: `${y}-invoices-billed.csv`, content: billedCsv(report) },
    { name: `${y}-READ-ME-FIRST.txt`, content: flagsText(report) },
  ]
}

function summaryCsv(r: TaxYearReport): string {
  const lines: string[][] = [
    ['Figure', 'Amount', 'Note'],
    ['Income received (cash basis)', money(r.income.cash.total), 'Payments that arrived during the year, after discounts'],
    ['  of which, before discounts', money(r.income.cash.gross), ''],
    ['  of which, applied to debt by discount', money(r.income.cash.debtApplied), 'Not received as cash; ask preparer about treatment'],
    ['Income billed (accrual view)', money(r.income.accrual.total), 'Work invoiced during the year, whenever paid'],
    ['  of which, paid in a later year', money(r.income.accrual.paidInLaterYear), ''],
    ['  of which, still unpaid', money(r.income.accrual.unpaid), ''],
    ['Waived (never paid, not income)', money(r.income.waived.total), ''],
    ['Expenses: Schedule C expense lines', money(r.expenses.scheduleCTotal), 'Sum of the ordinary expense boxes'],
    ['Expenses: vehicle (separate screen)', money(r.expenses.vehicle), ''],
    ['Expenses: equipment / assets (separate screen)', money(r.expenses.assets), ''],
    ['Expenses: bought for clients (cost of goods)', money(r.expenses.costOfGoods), ''],
    ['Expenses: uncategorized', money(r.expenses.uncategorized), 'Needs a category before it lands on a line'],
    ['Expenses: total recorded', money(r.expenses.total), ''],
    ['  of which, billed on to clients', money(r.expenses.reimbursed), 'Also inside income'],
    ['Purchases billed to clients', money(r.purchases.billed), `${r.purchases.count} items`],
  ]
  if (r.reconciliation) {
    lines.push(
      ['1099-NEC reported by client', money(r.reconciliation.form1099Nec), ''],
      ['  difference vs cash received', money(r.reconciliation.difference), 'Positive: 1099 is higher than the app'],
      ['  difference vs gross before discounts', money(r.reconciliation.differenceFromGross), '']
    )
  }
  return rows(lines)
}

function paymentsCsv(r: TaxYearReport): string {
  return rows([
    ['Paid date', 'Invoice #', 'Invoice', 'Client', 'Invoice date', 'Received', 'Before discounts', 'Applied to debt', 'Paid date is a placeholder'],
    ...r.income.cash.payments.map((p) => [
      p.paidDate, String(p.invoiceId), p.projectName, p.client, p.invoiceDate,
      money(p.net), money(p.gross), money(p.debtApplied), p.placeholderPaidDate ? 'YES - confirm' : '',
    ]),
    ['', '', '', '', 'Total', money(r.income.cash.total), money(r.income.cash.gross), money(r.income.cash.debtApplied), ''],
  ])
}

function categoriesCsv(r: TaxYearReport): string {
  const lines = [
    ['Schedule C line', 'Category', 'Total', 'Items', 'Where it goes'],
    ...r.expenses.byCategory.map((b) => [
      b.category.scheduleCLine, b.category.label, money(b.total), String(b.count),
      b.category.separateScreen ? 'Separate screen, not an expense box' : 'Expense box',
    ]),
  ]
  if (r.expenses.uncategorized > 0) lines.push(['', 'Uncategorized', money(r.expenses.uncategorized), '', 'Assign a category'])
  lines.push(['', 'Total in expense boxes', money(r.expenses.scheduleCTotal), '', ''])
  return rows(lines)
}

function expensesCsv(r: TaxYearReport): string {
  const line = (e: TaxYearReport['expenses']['items'][number]) => [
    e.expense_date ?? '', e.vendor ?? '', e.amount === null ? '' : money(e.amount),
    e.categoryLabel ?? '', e.scheduleCLine ?? '', e.reimbursed ? 'yes' : '',
    e.invoice_id === null ? '' : String(e.invoice_id), e.filename ?? '', e.notes ?? '',
  ]
  return rows([
    ['Date', 'Vendor', 'Amount', 'Category', 'Schedule C line', 'Billed to client', 'Invoice #', 'Receipt file', 'Notes'],
    ...r.expenses.items.map(line),
    ...r.expenses.undated.map(line),
  ])
}

function debtCsv(r: TaxYearReport): string {
  return rows([
    ['Work date', 'Invoice #', 'Description', 'Value of work', 'Discounted (applied to debt)', 'Received', 'Tax year'],
    ...r.debt.items.map((d) => [
      d.date, String(d.invoiceId), d.description, money(d.gross), money(d.discount), money(d.net), String(d.taxYear),
    ]),
    ['', '', `Applied in ${r.year}`, '', money(r.debt.appliedThisYear), '', ''],
    ['', '', 'Applied all time', '', money(r.debt.appliedAllTime), '', ''],
  ])
}

function billedCsv(r: TaxYearReport): string {
  const line = (i: TaxYearReport['income']['accrual']['invoices'][number], status: string) => [
    i.invoiceDate, String(i.invoiceId), i.projectName, money(i.net), status, i.paidDate ?? '',
  ]
  return rows([
    ['Invoice date', 'Invoice #', 'Invoice', 'Amount', 'Status', 'Paid date'],
    ...r.income.accrual.invoices.map((i) =>
      line(i, i.paid ? (i.paidInLaterYear ? `Paid in ${r.year + 1}` : 'Paid') : 'Unpaid')
    ),
    ...r.income.waived.invoices.map((i) => line(i, 'Waived')),
  ])
}

function flagsText(r: TaxYearReport): string {
  const section = (title: string, items: string[]) =>
    items.length ? [title, ''.padEnd(title.length, '-'), ...items.map((t) => `- ${t}`), ''] : []
  const by = (sev: string) => r.flags.filter((f) => f.severity === sev).map((f) => f.message)
  return [
    `ClearBill tax package for ${r.year}`,
    `Generated ${new Date().toISOString().slice(0, 10)}`,
    '',
    `Income received (cash basis): $${money(r.income.cash.total)}`,
    `Expenses in Schedule C boxes: $${money(r.expenses.scheduleCTotal)}`,
    '',
    ...section('Fix before filing', by('action')),
    ...section('Check with your preparer', by('review')),
    ...section('Good to know', by('info')),
    'Files in this package:',
    '  summary.csv              headline figures',
    '  payments-received.csv    every payment counted as income, cash basis',
    '  expenses-by-category.csv totals per Schedule C line',
    '  expenses.csv             every expense, with its receipt file name',
    '  debt-repayment.csv       work discounted to repay the debt',
    '  invoices-billed.csv      the accrual view, including waived invoices',
    '  receipts/                the receipt files themselves',
    '',
    'These figures come from what was entered in ClearBill. They are a starting point for a',
    'tax preparer, not tax advice.',
  ].join('\n')
}
