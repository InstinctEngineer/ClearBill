/**
 * Tests for the tax-year report, run against the business's real 2025 data
 * (as of 2026-10-14) so the figures below are the ones that matter.
 * Run with: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  availableTaxYears,
  buildTaxYearReport,
  round2,
  type TaxExpense,
  type TaxInvoice,
  type TaxLineItem,
} from '../lib/tax'

const INV = (id: number, project_name: string, date: string, paid_date: string | null, waived = false): TaxInvoice =>
  ({ id, project_name, client: 'ES&D Services', date, paid: paid_date !== null, paid_date, waived })

// id, invoice, date, description, type, qty, rate, discount%, debt, clientPays
type Row = [number, number, string, string, 'LABOR' | 'HARDWARE' | 'OTHER', number, number, number, boolean, boolean]
const LI = (r: Row): TaxLineItem => ({
  id: r[0], invoice_id: r[1], date: r[2], description: r[3], item_type: r[4],
  quantity: r[5], unit_rate: r[6], discount_percentage: r[7], applies_to_debt: r[8], client_pays: r[9],
})

const MIGRATION_DATE = '2025-11-02'

const invoices: TaxInvoice[] = [
  INV(2, 'WiFi AP / Hardware Install', '2025-01-01', null, true),
  INV(3, 'Security Maintenance', '2025-02-07', null, true),
  INV(4, 'VOIP Phone Maintenance', '2025-02-27', null, true),
  INV(1, 'ES&D Shop Bay PC Install', '2025-04-21', '2025-11-02'),
  INV(5, 'Local User Account Creation', '2025-05-14', null, true),
  INV(6, 'July 2025', '2025-07-01', '2025-11-02'),
  INV(7, 'August 2025', '2025-08-01', '2025-11-02'),
  INV(8, 'October 2025', '2025-11-01', '2025-11-23'),
  INV(9, 'November 2025', '2025-11-30', '2025-12-15'),
  INV(10, 'December 2025', '2025-12-01', '2026-01-17'),
]

const items: TaxLineItem[] = ([
  [2, 1, '2025-04-20', 'User Account Setup', 'LABOR', 1, 75, 0, false, true],
  [1, 1, '2025-04-21', 'New ESD Shop PC', 'LABOR', 4, 75, 0, false, true],
  [4, 1, '2025-04-21', 'HP ProDesk G5 i5', 'HARDWARE', 1, 500, 0, false, true],
  [5, 1, '2025-04-21', 'Monitor Wall Mount', 'HARDWARE', 1, 15, 0, false, true],
  [3, 1, '2025-04-22', 'Azure Account Maintenance', 'LABOR', 1, 75, 0, false, true],
  [7, 2, '2025-01-01', 'Bibi account deactivation', 'LABOR', 1, 75, 0, false, true],
  [8, 3, '2025-02-07', 'Malware scanning', 'LABOR', 1, 75, 0, false, true],
  [9, 4, '2025-02-27', 'Voip research', 'LABOR', 3, 75, 0, false, true],
  [10, 4, '2025-02-27', 'Install KPax Agent', 'LABOR', 1, 75, 0, false, true],
  [11, 5, '2025-05-14', 'Local user account', 'LABOR', 1, 75, 0, false, true],
  [12, 5, '2025-05-14', 'Azure Upgrade Process', 'LABOR', 2, 75, 0, false, true],
  [13, 5, '2025-05-14', 'User Access Confirmation', 'LABOR', 1, 75, 0, false, true],
  [15, 6, '2025-07-11', 'Remote Software Annual Renewal', 'OTHER', 1, 500, 0, false, true],
  [14, 6, '2025-07-14', 'Password Reset', 'LABOR', 1, 75, 0, false, true],
  [16, 7, '2025-08-07', 'Net Security Review', 'LABOR', 1, 75, 0, false, true],
  [20, 8, '2025-10-10', 'Software and Licences', 'OTHER', 1, 50, 0, false, true],
  [17, 8, '2025-10-14', 'Remote Support', 'LABOR', 1, 75, 35, true, true],
  [18, 8, '2025-10-23', 'Remote support / User Admin', 'LABOR', 2, 75, 35, true, true],
  [22, 8, '2025-10-31', 'Software & Licenses', 'OTHER', 1, 70, 100, false, false],
  [19, 8, '2025-10-31', 'App Development', 'LABOR', 13, 75, 35, true, true],
  [21, 8, '2025-10-31', 'Spam Filter Admin Review', 'LABOR', 2, 75, 35, true, true],
  [23, 9, '2025-11-02', 'App Development', 'LABOR', 3, 75, 35, true, true],
  [34, 9, '2025-11-03', 'Software & Licenses', 'OTHER', 1, 50, 0, false, true],
  [24, 9, '2025-11-06', 'App Development', 'LABOR', 3, 75, 35, true, true],
  [25, 9, '2025-11-20', 'Printer troubleshooting', 'LABOR', 4, 75, 35, true, true],
  [26, 9, '2025-11-29', 'Website Consultation', 'LABOR', 2, 75, 35, true, true],
  [27, 9, '2025-11-30', 'Website Development', 'LABOR', 4, 75, 35, true, true],
  [30, 10, '2025-12-01', 'Email Forwarding Disable', 'LABOR', 1, 75, 0, false, true],
  [31, 10, '2025-12-02', 'Email Spam Issue', 'LABOR', 5, 75, 29, true, true], // 29%, not 35%: the last discount was trimmed to land on the $1,000
  [33, 10, '2025-12-03', 'Email CNAME / DKIM', 'LABOR', 2, 75, 0, false, true],
  [32, 10, '2025-12-03', 'Software & Licenses', 'OTHER', 1, 50, 0, false, true],
  [36, 10, '2025-12-05', 'VOIP System Setup', 'LABOR', 1, 75, 0, false, true],
  [35, 10, '2025-12-05', 'CSSConsulting Meeting', 'LABOR', 1, 75, 0, false, true],
  [38, 10, '2025-12-14', 'Gas - Expense', 'OTHER', 1, 19.09, 0, false, true],
  [37, 10, '2025-12-14', 'Car Delivery', 'OTHER', 1, 90, 0, false, true],
  [39, 10, '2025-12-15', 'App Development', 'LABOR', 1, 75, 0, false, true],
  [40, 10, '2025-12-16', 'App Development', 'LABOR', 3, 75, 0, false, true],
  [41, 10, '2025-12-17', 'ES&D Meeting + Conference Room PC', 'LABOR', 1.5, 75, 0, false, true],
  [43, 10, '2025-12-18', 'App Development', 'LABOR', 2, 75, 0, false, true],
  [44, 10, '2025-12-19', 'Framework Adjustment', 'LABOR', 2, 75, 0, false, true],
  [45, 10, '2025-12-20', 'DB Layout', 'LABOR', 1, 75, 0, false, true],
  [46, 10, '2025-12-22', 'App Development', 'LABOR', 5, 75, 0, false, true],
  [47, 10, '2025-12-23', 'App Meeting', 'LABOR', 2, 75, 0, false, true],
  [48, 10, '2025-12-29', 'Zoom Setup', 'LABOR', 4, 75, 0, false, true],
] as Row[]).map(LI)

const expense = (over: Partial<TaxExpense> & { id: number }): TaxExpense => ({
  invoice_id: null, filename: null, expense_date: null, amount: null,
  category: null, vendor: null, reimbursed: false, notes: null, ...over,
})

const expenses: TaxExpense[] = [
  expense({ id: 13, invoice_id: 8, filename: 'Receipt-2311-9197.pdf', expense_date: '2025-10-11',
    amount: 25, category: 'software', vendor: 'Lovable Labs', reimbursed: true }),
  expense({ id: 19, invoice_id: 10, filename: '20251214_190830.jpg', expense_date: '2025-12-14',
    amount: 19.09, category: 'vehicle', vendor: "Casey's" }),
]

const report2025 = (over: Partial<Parameters<typeof buildTaxYearReport>[0]> = {}) =>
  buildTaxYearReport({ year: 2025, invoices, lineItems: items, expenses, migrationDate: MIGRATION_DATE, form1099Nec: 3598, ...over })

test('cash-basis income is what was received during the year', () => {
  const r = report2025()
  assert.equal(r.income.cash.total, 3372.5)
  assert.equal(r.income.cash.gross, 4335)
  assert.equal(r.income.cash.debtApplied, 892.5)
  assert.deepEqual(r.income.cash.payments.map((p) => p.invoiceId), [1, 6, 7, 8, 9])
})

test('the accrual view counts work billed in the year, and separates what was paid later', () => {
  const r = report2025()
  assert.equal(r.income.accrual.total, 5785.34)
  assert.equal(r.income.accrual.unpaid, 0)
  assert.equal(r.income.accrual.paidInLaterYear, 2412.84, 'invoice #10 was paid in January')
  assert.ok(r.flags.some((f) => f.code === 'paid_next_year' && f.amount === 2412.84))
})

test('waived invoices are reported, but never as income', () => {
  const r = report2025()
  assert.equal(r.income.waived.total, 750)
  assert.deepEqual(r.income.waived.invoices.map((i) => i.invoiceId), [2, 3, 4, 5])
  assert.ok(!r.income.accrual.invoices.some((i) => [2, 3, 4, 5].includes(i.invoiceId)))
})

test('debt repaid by discount is tracked by the year the reduced payment arrived', () => {
  const r = report2025()
  assert.equal(r.debt.appliedThisYear, 892.5, '#8 and #9, paid in 2025')
  assert.equal(r.debt.appliedAllTime, 1001.25, 'the whole $1,000 debt, plus a little over')
  const r2026 = report2025({ year: 2026, form1099Nec: null })
  assert.equal(r2026.debt.appliedThisYear, 108.75, "#10's discount, paid in January 2026")
  assert.ok(r.flags.some((f) => f.code === 'debt_applied' && f.amount === 892.5))
})

test('placeholder paid dates from the import are flagged, not trusted', () => {
  const r = report2025()
  const flagged = r.flags.filter((f) => f.code === 'placeholder_paid_date').map((f) => f.invoiceId)
  assert.deepEqual(flagged, [1, 6, 7])
  assert.ok(r.income.cash.payments.find((p) => p.invoiceId === 8)!.placeholderPaidDate === false)
  const noMigration = report2025({ migrationDate: null })
  assert.equal(noMigration.flags.filter((f) => f.code === 'placeholder_paid_date').length, 0)
})

test('the 1099 is reconciled against cash received, and the gap is called out', () => {
  const r = report2025()
  assert.deepEqual(r.reconciliation, {
    form1099Nec: 3598, cashTotal: 3372.5, difference: 225.5,
    grossTotal: 4335, differenceFromGross: -737,
  })
  const flag = r.flags.find((f) => f.code === 'form_1099_mismatch')
  assert.ok(flag && flag.severity === 'action' && flag.amount === 225.5)
  assert.ok(r.flags[0].severity === 'action', 'action items come first')
})

test('without a 1099 on file the report asks for one and reconciles nothing', () => {
  const r = report2025({ form1099Nec: null })
  assert.equal(r.reconciliation, null)
  assert.ok(r.flags.some((f) => f.code === 'form_1099_missing'))
  assert.ok(!r.flags.some((f) => f.code === 'form_1099_mismatch'))
})

test('expenses are grouped by Schedule C line, with separate-screen items kept apart', () => {
  const r = report2025()
  assert.deepEqual(r.expenses.byCategory.map((b) => [b.category.key, b.total]), [['software', 25], ['vehicle', 19.09]])
  assert.equal(r.expenses.scheduleCTotal, 25, 'vehicle is not in the expense boxes')
  assert.equal(r.expenses.vehicle, 19.09)
  assert.equal(r.expenses.total, 44.09)
  assert.equal(r.expenses.reimbursed, 25)
  assert.ok(r.flags.some((f) => f.code === 'vehicle_separate'))
})

test('expenses missing an amount, date or category are action items, not silently zero', () => {
  const r = report2025({
    expenses: [
      ...expenses,
      expense({ id: 1, invoice_id: 1, filename: 'Amazon.pdf', expense_date: '2025-04-21' }),
      expense({ id: 2, filename: 'undated.pdf', amount: 10, category: 'office' }),
      expense({ id: 3, filename: 'mystery.pdf', expense_date: '2025-06-01', amount: 40 }),
    ],
  })
  assert.ok(r.flags.some((f) => f.code === 'expense_missing_amount' && f.expenseId === 1))
  assert.ok(r.flags.some((f) => f.code === 'expense_missing_date' && f.expenseId === 2))
  assert.ok(r.flags.some((f) => f.code === 'expense_missing_category' && f.expenseId === 3))
  assert.equal(r.expenses.uncategorized, 40)
  assert.equal(r.expenses.scheduleCTotal, 25, 'uncategorized money is not on a Schedule C line')
  assert.equal(r.expenses.total, 84.09, 'but it is in the grand total so it is not lost')
  assert.equal(r.expenses.undated.length, 1)
})

test('purchases billed to the client with no cost recorded are flagged per invoice', () => {
  const r = report2025()
  assert.equal(r.purchases.billed, 1115, 'PC 500 + mount 15 + AnyDesk 500 + two 50 licences')
  assert.equal(r.purchases.count, 5)
  // #8 has the $25 Lovable receipt recorded, so only 1, 6 and 9 lack a cost
  assert.deepEqual(r.purchases.invoicesWithoutCost, [1, 6, 9])
  assert.equal(r.flags.filter((f) => f.code === 'purchases_without_cost').length, 3)
})

test('the $70 item discounted to nothing is neither income nor a billed purchase', () => {
  const r = report2025()
  const inv8 = r.income.cash.payments.find((p) => p.invoiceId === 8)!
  assert.equal(inv8.net, 927.5)
  assert.equal(inv8.gross, 1470)
  assert.equal(inv8.debtApplied, 472.5, 'the $70 write-off was not a debt discount')
})

test('available years include the year a December invoice was finally paid', () => {
  assert.deepEqual(availableTaxYears(invoices, expenses), [2026, 2025])
})

test('round2 does not drift on the usual float traps', () => {
  assert.equal(round2(0.1 + 0.2), 0.3)
  assert.equal(round2(1.005), 1.01)
  assert.equal(round2(48.75 + 97.5 + 633.75 + 97.5 + 50), 927.5)
})
