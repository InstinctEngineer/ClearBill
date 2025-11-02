import { Invoice, LineItem, InvoiceWithDetails } from '../types/database.types'
import { addDays, differenceInDays, format } from 'date-fns'

/**
 * Calculate discounted rate for a line item
 */
export function calculateDiscountedRate(unitRate: number, discountPercentage: number): number {
  return unitRate * (1 - discountPercentage / 100)
}

/**
 * Calculate line item total
 */
export function calculateLineItemTotal(item: LineItem): number {
  const discountedRate = calculateDiscountedRate(item.unit_rate, item.discount_percentage || 0)
  return item.quantity * discountedRate
}

/**
 * Calculate invoice subtotal from line items
 */
export function calculateSubtotal(lineItems: LineItem[]): number {
  return lineItems.reduce((sum, item) => {
    return sum + calculateLineItemTotal(item)
  }, 0)
}

/**
 * Calculate tax amount to set aside
 */
export function calculateTaxSetAside(subtotal: number, taxRate: number): number {
  return Math.round((subtotal * (taxRate / 100)) * 100) / 100 // Round to 2 decimals
}

/**
 * Calculate total (currently same as subtotal, tax shown separately)
 */
export function calculateTotal(subtotal: number): number {
  return subtotal
}

/**
 * Calculate due date (invoice date + 30 days)
 */
export function calculateDueDate(invoiceDate: string): string {
  const date = new Date(invoiceDate)
  const dueDate = addDays(date, 30)
  return dueDate.toISOString().split('T')[0] // Return YYYY-MM-DD
}

/**
 * Calculate days overdue
 */
export function calculateDaysOverdue(invoiceDate: string, paid: boolean): number {
  if (paid) return 0

  const dueDate = new Date(calculateDueDate(invoiceDate))
  const today = new Date()
  const days = differenceInDays(today, dueDate)

  return Math.max(0, days) // Never negative
}

/**
 * Get overdue status
 */
export function getOverdueStatus(invoiceDate: string, paid: boolean): string {
  if (paid) return 'Paid'

  const daysOverdue = calculateDaysOverdue(invoiceDate, paid)

  if (daysOverdue === 0) return 'Current'
  if (daysOverdue <= 30) return 'Overdue'
  if (daysOverdue <= 60) return 'Critical'
  return 'Severely Overdue'
}

/**
 * Get status badge color
 */
export function getStatusColor(status: string): string {
  switch (status) {
    case 'Paid':
      return 'green'
    case 'Current':
      return 'blue'
    case 'Overdue':
      return 'yellow'
    case 'Critical':
      return 'orange'
    case 'Severely Overdue':
      return 'red'
    default:
      return 'gray'
  }
}

/**
 * Enhance invoice with calculated fields
 */
export function enhanceInvoice(
  invoice: Invoice,
  lineItems: LineItem[]
): InvoiceWithDetails {
  const subtotal = calculateSubtotal(lineItems)
  const tax_set_aside = calculateTaxSetAside(subtotal, invoice.tax_rate)
  const total = calculateTotal(subtotal)
  const due_date = calculateDueDate(invoice.date)
  const days_overdue = calculateDaysOverdue(invoice.date, invoice.paid)
  const overdue_status = getOverdueStatus(invoice.date, invoice.paid)

  return {
    ...invoice,
    line_items: lineItems,
    receipts: [],
    subtotal,
    tax_set_aside,
    total,
    due_date,
    days_overdue,
    overdue_status,
  }
}

/**
 * Calculate expense total (items where client doesn't pay)
 * LABOR is never an expense (always income)
 * HARDWARE/OTHER can be expenses if client_pays is false
 */
export function calculateExpenses(lineItems: LineItem[]): number {
  return lineItems
    .filter(item => {
      // LABOR is never an expense
      if (item.item_type === 'LABOR') return false
      // HARDWARE/OTHER are expenses only if client doesn't pay
      return !item.client_pays
    })
    .reduce((sum, item) => sum + calculateLineItemTotal(item), 0)
}

/**
 * Calculate income total (items billed to client)
 * LABOR is always income
 * HARDWARE/OTHER are income only if client_pays is true
 */
export function calculateIncome(lineItems: LineItem[]): number {
  return lineItems
    .filter(item => {
      // LABOR is always income
      if (item.item_type === 'LABOR') return true
      // HARDWARE/OTHER are income only if client pays
      return item.client_pays
    })
    .reduce((sum, item) => sum + calculateLineItemTotal(item), 0)
}

/**
 * Format currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return format(date, 'MMM d, yyyy')
}

/**
 * Calculate total debt discount from line items
 */
export function calculateDebtDiscount(lineItems: LineItem[]): number {
  return lineItems
    .filter(item => item.applies_to_debt && (item.discount_percentage || 0) > 0)
    .reduce((sum, item) => {
      const originalTotal = item.quantity * item.unit_rate
      const discountedTotal = calculateLineItemTotal(item)
      const discountAmount = originalTotal - discountedTotal
      return sum + discountAmount
    }, 0)
}
