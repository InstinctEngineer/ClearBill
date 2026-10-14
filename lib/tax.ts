/**
 * The tax-year report: everything the business needs at filing time, worked
 * out from the invoices, line items and expenses the app already holds.
 *
 * Pure: no React, no Supabase. The API route gathers the rows; this module
 * turns them into figures and, just as importantly, into flags for the
 * things a human still has to decide or fix. It never guesses at tax
 * treatment: where the right answer depends on the preparer (the debt
 * arrangement, assets, vehicle costs) it surfaces the amounts and says so.
 */
import { calculateLineItemTotal as lineItemTotal } from '@/lib/utils/calculations'

/** calculateLineItemTotal reads quantity, unit_rate and discount_percentage only. */
const calculateLineItemTotal = (item: TaxLineItem) => lineItemTotal(item as LineItem)
import { yearOfDateOnly } from '@/lib/utils/dates'
import { TAX_CATEGORIES, taxCategory, type TaxCategory } from '@/lib/taxCategories'
import type { Invoice, LineItem } from '@/lib/types/database.types'

// ---------------------------------------------------------------- inputs

/** The invoice fields the report reads; a database row satisfies this as-is. */
export type TaxInvoice = Pick<
  Invoice,
  'id' | 'project_name' | 'client' | 'date' | 'paid' | 'paid_date' | 'waived'
>

/** The line item fields the report reads; a database row satisfies this as-is. */
export type TaxLineItem = Pick<
  LineItem,
  | 'id' | 'invoice_id' | 'date' | 'description' | 'item_type' | 'quantity'
  | 'unit_rate' | 'discount_percentage' | 'applies_to_debt' | 'client_pays'
>

/** An expense (a receipts row) as the report reads it. */
export interface TaxExpense {
  id: number
  invoice_id: number | null
  filename: string | null
  expense_date: string | null
  amount: number | null
  category: string | null
  vendor: string | null
  /** The cost was billed on to a client, so it also sits inside income. */
  reimbursed: boolean
  notes: string | null
}

export interface TaxYearInputs {
  year: number
  invoices: TaxInvoice[]
  lineItems: TaxLineItem[]
  expenses: TaxExpense[]
  /**
   * The day the data was imported from the old app. Paid dates equal to it
   * were stamped by the import, not recorded when the money arrived.
   */
  migrationDate: string | null
  /** What the client reported on the 1099-NEC for this year, if entered. */
  form1099Nec: number | null
}

// --------------------------------------------------------------- outputs

export interface PaymentRow {
  invoiceId: number
  projectName: string
  client: string
  invoiceDate: string
  paidDate: string
  /** What was billed after discounts: the amount actually received. */
  net: number
  /** Before any discount. */
  gross: number
  /** Discount on this invoice that went toward the debt. */
  debtApplied: number
  /** Paid date equals the import day, so it is a placeholder. */
  placeholderPaidDate: boolean
}

export interface BilledRow {
  invoiceId: number
  projectName: string
  invoiceDate: string
  net: number
  paid: boolean
  paidDate: string | null
  /** Paid, but in a later calendar year than it was billed. */
  paidInLaterYear: boolean
}

export interface DebtRow {
  invoiceId: number
  itemId: number
  date: string
  description: string
  gross: number
  discount: number
  net: number
  /** Year the money (less the discount) was received, or billed if unpaid. */
  taxYear: number
}

export interface CategoryTotal {
  category: TaxCategory
  total: number
  count: number
}

export interface ExpenseRow extends TaxExpense {
  categoryLabel: string | null
  scheduleCLine: string | null
}

export type FlagSeverity = 'action' | 'review' | 'info'

export interface TaxFlag {
  severity: FlagSeverity
  code:
    | 'placeholder_paid_date'
    | 'form_1099_mismatch'
    | 'form_1099_missing'
    | 'debt_applied'
    | 'paid_next_year'
    | 'expense_missing_amount'
    | 'expense_missing_date'
    | 'expense_missing_category'
    | 'purchases_without_cost'
    | 'vehicle_separate'
    | 'assets_separate'
    | 'cost_of_goods_separate'
  message: string
  amount?: number
  invoiceId?: number
  expenseId?: number
}

export interface TaxYearReport {
  year: number
  income: {
    /** Money received during the year: the cash basis most sole proprietors file on. */
    cash: { total: number; gross: number; debtApplied: number; payments: PaymentRow[] }
    /** Work billed during the year, whenever it was paid: the accrual view. */
    accrual: { total: number; unpaid: number; paidInLaterYear: number; invoices: BilledRow[] }
    waived: { total: number; invoices: BilledRow[] }
  }
  debt: {
    appliedThisYear: number
    appliedAllTime: number
    items: DebtRow[]
  }
  expenses: {
    /** Every category with spend, in Schedule C line order. */
    byCategory: CategoryTotal[]
    /** Sum of the categories that go in the ordinary expense boxes. */
    scheduleCTotal: number
    /** Amounts filed elsewhere, so they are not in scheduleCTotal. */
    vehicle: number
    assets: number
    costOfGoods: number
    uncategorized: number
    reimbursed: number
    total: number
    items: ExpenseRow[]
    /** Expenses with no date cannot be placed in a year; they are listed, not summed. */
    undated: ExpenseRow[]
  }
  purchases: {
    /** Non-labour items billed to clients on invoices paid this year. */
    billed: number
    count: number
    /** Of those invoices, the ones with no expense amount recorded against them. */
    invoicesWithoutCost: number[]
  }
  reconciliation: {
    form1099Nec: number
    cashTotal: number
    difference: number
    grossTotal: number
    differenceFromGross: number
  } | null
  flags: TaxFlag[]
}

// ------------------------------------------------------------ the report

export function buildTaxYearReport(inputs: TaxYearInputs): TaxYearReport {
  const { year, invoices, lineItems, expenses, migrationDate, form1099Nec } = inputs
  const itemsByInvoice = groupBy(lineItems, (item) => item.invoice_id)
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]))
  const flags: TaxFlag[] = []

  // ---- income, cash basis
  const payments: PaymentRow[] = invoices
    .filter((inv) => inv.paid && !inv.waived && inv.paid_date && yearOfDateOnly(inv.paid_date) === year)
    .sort((a, b) => a.paid_date!.localeCompare(b.paid_date!) || a.id - b.id)
    .map((inv) => {
      const items = itemsByInvoice.get(inv.id) ?? []
      const placeholder = migrationDate !== null && inv.paid_date === migrationDate
      return {
        invoiceId: inv.id,
        projectName: inv.project_name,
        client: inv.client,
        invoiceDate: inv.date,
        paidDate: inv.paid_date!,
        net: round2(sum(items, calculateLineItemTotal)),
        gross: round2(sum(items, grossOf)),
        debtApplied: round2(sum(items.filter((i) => i.applies_to_debt), discountOf)),
        placeholderPaidDate: placeholder,
      }
    })
  const cashTotal = round2(sum(payments, (p) => p.net))
  const cashGross = round2(sum(payments, (p) => p.gross))
  const cashDebt = round2(sum(payments, (p) => p.debtApplied))

  for (const payment of payments.filter((p) => p.placeholderPaidDate)) {
    flags.push({
      severity: 'review',
      code: 'placeholder_paid_date',
      invoiceId: payment.invoiceId,
      amount: payment.net,
      message: `Invoice #${payment.invoiceId} shows a paid date of ${payment.paidDate}, the day the data was imported. Confirm when it was really paid; if that was a different year, the income moves with it.`,
    })
  }

  // ---- income, accrual view
  const toBilledRow = (inv: TaxInvoice): BilledRow => ({
    invoiceId: inv.id,
    projectName: inv.project_name,
    invoiceDate: inv.date,
    net: round2(sum(itemsByInvoice.get(inv.id) ?? [], calculateLineItemTotal)),
    paid: inv.paid,
    paidDate: inv.paid_date,
    paidInLaterYear: inv.paid && !!inv.paid_date && yearOfDateOnly(inv.paid_date) > year,
  })
  const billedThisYear = invoices.filter((inv) => yearOfDateOnly(inv.date) === year)
  const accrualRows = billedThisYear.filter((inv) => !inv.waived).map(toBilledRow)
  const waivedRows = billedThisYear.filter((inv) => inv.waived).map(toBilledRow)
  const accrualTotal = round2(sum(accrualRows, (r) => r.net))
  const accrualUnpaid = round2(sum(accrualRows.filter((r) => !r.paid), (r) => r.net))
  const paidLater = round2(sum(accrualRows.filter((r) => r.paidInLaterYear), (r) => r.net))

  if (paidLater > 0) {
    const which = accrualRows.filter((r) => r.paidInLaterYear).map((r) => `#${r.invoiceId}`).join(', ')
    flags.push({
      severity: 'info',
      code: 'paid_next_year',
      amount: paidLater,
      message: `${which} billed in ${year} but paid in ${year + 1}: ${money(paidLater)} is ${year + 1} income on a cash basis.`,
    })
  }

  // ---- debt repaid through discounts
  const debtItems: DebtRow[] = lineItems
    .filter((item) => item.applies_to_debt && item.discount_percentage > 0)
    .map((item) => {
      const inv = invoiceById.get(item.invoice_id)
      const taxYear =
        inv?.paid && inv.paid_date ? yearOfDateOnly(inv.paid_date) : yearOfDateOnly(inv?.date ?? item.date)
      return {
        invoiceId: item.invoice_id,
        itemId: item.id,
        date: item.date,
        description: item.description,
        gross: round2(grossOf(item)),
        discount: round2(discountOf(item)),
        net: round2(calculateLineItemTotal(item)),
        taxYear,
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.itemId - b.itemId)
  const debtThisYear = round2(sum(debtItems.filter((d) => d.taxYear === year), (d) => d.discount))
  const debtAllTime = round2(sum(debtItems, (d) => d.discount))

  if (debtThisYear > 0) {
    flags.push({
      severity: 'review',
      code: 'debt_applied',
      amount: debtThisYear,
      message: `${money(debtThisYear)} of ${year} work was applied to a debt by discounting it instead of being paid out. Cash received excludes it; ask your preparer whether it should be reported as income anyway, since it settled a debt for you.`,
    })
  }

  // ---- expenses
  const toExpenseRow = (e: TaxExpense): ExpenseRow => {
    const category = taxCategory(e.category)
    return { ...e, categoryLabel: category?.label ?? null, scheduleCLine: category?.scheduleCLine ?? null }
  }
  const undated = expenses.filter((e) => !e.expense_date).map(toExpenseRow)
  const inYear = expenses
    .filter((e) => e.expense_date && yearOfDateOnly(e.expense_date) === year)
    .sort((a, b) => a.expense_date!.localeCompare(b.expense_date!) || a.id - b.id)
    .map(toExpenseRow)

  const byKey = new Map<string, CategoryTotal>()
  let uncategorized = 0
  for (const e of inYear) {
    if (e.amount === null) continue
    const category = taxCategory(e.category)
    if (!category) {
      uncategorized = round2(uncategorized + e.amount)
      continue
    }
    const bucket = byKey.get(category.key) ?? { category, total: 0, count: 0 }
    bucket.total = round2(bucket.total + e.amount)
    bucket.count += 1
    byKey.set(category.key, bucket)
  }
  // Schedule C line order is the order TAX_CATEGORIES is declared in.
  const byCategory = TAX_CATEGORIES.filter((c) => byKey.has(c.key)).map((c) => byKey.get(c.key)!)
  const totalFor = (screen: TaxCategory['separateScreen']) =>
    round2(sum(byCategory.filter((b) => b.category.separateScreen === screen), (b) => b.total))
  const scheduleCTotal = round2(sum(byCategory.filter((b) => !b.category.separateScreen), (b) => b.total))
  const vehicle = totalFor('vehicle')
  const assets = totalFor('assets')
  const costOfGoods = totalFor('cost_of_goods')
  const reimbursed = round2(sum(inYear.filter((e) => e.reimbursed && e.amount !== null), (e) => e.amount!))
  const expenseTotal = round2(scheduleCTotal + vehicle + assets + costOfGoods + uncategorized)

  for (const e of inYear.filter((e) => e.amount === null)) {
    flags.push({
      severity: 'action',
      code: 'expense_missing_amount',
      expenseId: e.id,
      message: `${e.filename ?? e.vendor ?? `Expense ${e.id}`} has no amount. Open the receipt and enter what you paid, or it counts for nothing.`,
    })
  }
  for (const e of undated) {
    flags.push({
      severity: 'action',
      code: 'expense_missing_date',
      expenseId: e.id,
      message: `${e.filename ?? e.vendor ?? `Expense ${e.id}`} has no date, so it cannot be placed in a tax year.`,
    })
  }
  for (const e of inYear.filter((e) => e.amount !== null && !taxCategory(e.category))) {
    flags.push({
      severity: 'action',
      code: 'expense_missing_category',
      expenseId: e.id,
      amount: e.amount!,
      message: `${e.filename ?? e.vendor ?? `Expense ${e.id}`} (${money(e.amount!)}) has no category, so it is not on any Schedule C line yet.`,
    })
  }
  if (vehicle > 0) {
    flags.push({ severity: 'info', code: 'vehicle_separate', amount: vehicle,
      message: `${money(vehicle)} of vehicle costs is kept out of the expense boxes; it goes on the vehicle screen. Fuel receipts and the standard mileage rate cannot both be claimed for the same vehicle.` })
  }
  if (assets > 0) {
    flags.push({ severity: 'info', code: 'assets_separate', amount: assets,
      message: `${money(assets)} of equipment is kept out of the expense boxes; it goes on the business assets screen. Items under $2,500 can usually be expensed outright under the de minimis safe harbor.` })
  }
  if (costOfGoods > 0) {
    flags.push({ severity: 'info', code: 'cost_of_goods_separate', amount: costOfGoods,
      message: `${money(costOfGoods)} was bought for clients and billed on. It belongs under cost of goods sold, and the billed amount is already inside income.` })
  }

  // ---- purchases billed to clients, and whether their cost was recorded
  const purchaseItems = payments.flatMap((p) =>
    (itemsByInvoice.get(p.invoiceId) ?? []).filter((i) => i.item_type !== 'LABOR' && i.client_pays)
  )
  const purchaseInvoices = [...new Set(purchaseItems.map((i) => i.invoice_id))]
  const expenseAmountByInvoice = new Map<number, number>()
  for (const e of expenses) {
    if (e.invoice_id !== null && e.amount !== null) {
      expenseAmountByInvoice.set(e.invoice_id, (expenseAmountByInvoice.get(e.invoice_id) ?? 0) + e.amount)
    }
  }
  const invoicesWithoutCost = purchaseInvoices.filter((id) => !expenseAmountByInvoice.has(id))
  for (const id of invoicesWithoutCost) {
    const billed = round2(sum(purchaseItems.filter((i) => i.invoice_id === id), calculateLineItemTotal))
    flags.push({
      severity: 'action',
      code: 'purchases_without_cost',
      invoiceId: id,
      amount: billed,
      message: `Invoice #${id} billed ${money(billed)} of purchases to the client, but no receipt amount is recorded against it. The billed figure is in your income; without the cost you cannot deduct it.`,
    })
  }

  // ---- 1099 reconciliation
  let reconciliation: TaxYearReport['reconciliation'] = null
  if (form1099Nec !== null) {
    const difference = round2(form1099Nec - cashTotal)
    reconciliation = {
      form1099Nec,
      cashTotal,
      difference,
      grossTotal: cashGross,
      differenceFromGross: round2(form1099Nec - cashGross),
    }
    if (Math.abs(difference) >= 0.01) {
      flags.push({
        severity: 'action',
        code: 'form_1099_mismatch',
        amount: difference,
        message: `The 1099-NEC says ${money(form1099Nec)}; the app shows ${money(cashTotal)} received in ${year}, a difference of ${money(difference)}. The IRS matches your return to the 1099, so find the gap before filing: compare the client's payment list against the Payments table below.`,
      })
    }
  } else {
    flags.push({
      severity: 'review',
      code: 'form_1099_missing',
      message: `No 1099-NEC amount recorded for ${year}. Enter it when the client sends it, and the app will reconcile it against payments received.`,
    })
  }

  return {
    year,
    income: {
      cash: { total: cashTotal, gross: cashGross, debtApplied: cashDebt, payments },
      accrual: { total: accrualTotal, unpaid: accrualUnpaid, paidInLaterYear: paidLater, invoices: accrualRows },
      waived: { total: round2(sum(waivedRows, (r) => r.net)), invoices: waivedRows },
    },
    debt: { appliedThisYear: debtThisYear, appliedAllTime: debtAllTime, items: debtItems },
    expenses: {
      byCategory, scheduleCTotal, vehicle, assets, costOfGoods, uncategorized, reimbursed,
      total: expenseTotal, items: inYear, undated,
    },
    purchases: {
      billed: round2(sum(purchaseItems, calculateLineItemTotal)),
      count: purchaseItems.length,
      invoicesWithoutCost,
    },
    reconciliation,
    flags: sortFlags(flags),
  }
}

/** Years with any activity: billed, paid, or spent. Newest first. */
export function availableTaxYears(invoices: TaxInvoice[], expenses: TaxExpense[]): number[] {
  const years = new Set<number>()
  for (const inv of invoices) {
    years.add(yearOfDateOnly(inv.date))
    if (inv.paid_date) years.add(yearOfDateOnly(inv.paid_date))
  }
  for (const e of expenses) if (e.expense_date) years.add(yearOfDateOnly(e.expense_date))
  return [...years].sort((a, b) => b - a)
}

// ---------------------------------------------------------------- helpers

const grossOf = (item: TaxLineItem) => item.quantity * item.unit_rate
const discountOf = (item: TaxLineItem) => grossOf(item) - calculateLineItemTotal(item)

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((acc, row) => acc + pick(row), 0)
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const row of rows) {
    const k = key(row)
    const list = map.get(k)
    if (list) list.push(row)
    else map.set(k, [row])
  }
  return map
}

const SEVERITY_ORDER: Record<FlagSeverity, number> = { action: 0, review: 1, info: 2 }
function sortFlags(flags: TaxFlag[]): TaxFlag[] {
  return [...flags].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}
