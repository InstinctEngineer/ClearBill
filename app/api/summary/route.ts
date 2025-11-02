import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { calculateExpenses, calculateIncome } from '@/lib/utils/calculations'
import type { Invoice, LineItem } from '@/lib/types/database.types'

interface YearSummary {
  year: number
  totalIncome: number
  totalExpenses: number
  totalTax: number
  paidIncome: number
  unpaidIncome: number
  months: MonthSummary[]
}

interface MonthSummary {
  month: number
  monthName: string
  totalIncome: number
  totalExpenses: number
  totalTax: number
  invoiceCount: number
}

/**
 * GET /api/summary
 * Get financial summary grouped by year and month
 */
export async function GET(request: Request) {
  const supabase = await createClient()

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch all invoices
    const { data: invoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('*')
      .order('date', { ascending: false })

    if (invoicesError) {
      console.error('Error fetching invoices:', invoicesError)
      return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
    }

    // Fetch all line items
    const { data: lineItems, error: lineItemsError } = await supabase
      .from('line_items')
      .select('*')

    if (lineItemsError) {
      console.error('Error fetching line items:', lineItemsError)
      return NextResponse.json({ error: 'Failed to fetch line items' }, { status: 500 })
    }

    // Fetch all receipts with year/month info
    const { data: receipts, error: receiptsError } = await supabase
      .from('receipts')
      .select('*')
      .order('uploaded_at', { ascending: false })

    if (receiptsError) {
      console.error('Error fetching receipts:', receiptsError)
      return NextResponse.json({ error: 'Failed to fetch receipts' }, { status: 500 })
    }

    // Group line items by invoice
    const lineItemsByInvoice: Record<number, LineItem[]> = {}
    lineItems.forEach(item => {
      if (!lineItemsByInvoice[item.invoice_id]) {
        lineItemsByInvoice[item.invoice_id] = []
      }
      lineItemsByInvoice[item.invoice_id].push(item)
    })

    // Group invoices by year
    const yearGroups: Record<number, Invoice[]> = {}
    invoices.forEach(invoice => {
      const year = new Date(invoice.date).getFullYear()
      if (!yearGroups[year]) {
        yearGroups[year] = []
      }
      yearGroups[year].push(invoice as Invoice)
    })

    // Calculate summaries for each year
    const yearSummaries: YearSummary[] = Object.keys(yearGroups)
      .map(year => parseInt(year))
      .sort((a, b) => b - a) // Descending order
      .map(year => {
        const yearInvoices = yearGroups[year]

        // Group by month
        const monthGroups: Record<number, Invoice[]> = {}
        yearInvoices.forEach(invoice => {
          const month = new Date(invoice.date).getMonth() + 1 // 1-12
          if (!monthGroups[month]) {
            monthGroups[month] = []
          }
          monthGroups[month].push(invoice)
        })

        // Calculate monthly summaries
        const months: MonthSummary[] = Object.keys(monthGroups)
          .map(month => parseInt(month))
          .sort((a, b) => b - a) // Descending order
          .map(month => {
            const monthInvoices = monthGroups[month]

            let totalIncome = 0
            let totalExpenses = 0
            let totalTax = 0

            monthInvoices.forEach(invoice => {
              const items = lineItemsByInvoice[invoice.id] || []
              const income = calculateIncome(items)
              const expenses = calculateExpenses(items)
              const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_rate), 0)
              const tax = Math.round((subtotal * (invoice.tax_rate / 100)) * 100) / 100

              totalIncome += income
              totalExpenses += expenses
              totalTax += tax
            })

            const monthNames = [
              'January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'
            ]

            return {
              month,
              monthName: monthNames[month - 1],
              totalIncome: Math.round(totalIncome * 100) / 100,
              totalExpenses: Math.round(totalExpenses * 100) / 100,
              totalTax: Math.round(totalTax * 100) / 100,
              invoiceCount: monthInvoices.length,
            }
          })

        // Calculate year totals
        let yearIncome = 0
        let yearExpenses = 0
        let yearTax = 0
        let paidIncome = 0
        let unpaidIncome = 0

        yearInvoices.forEach(invoice => {
          const items = lineItemsByInvoice[invoice.id] || []
          const income = calculateIncome(items)
          const expenses = calculateExpenses(items)
          const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_rate), 0)
          const tax = Math.round((subtotal * (invoice.tax_rate / 100)) * 100) / 100

          yearIncome += income
          yearExpenses += expenses
          yearTax += tax

          if (invoice.paid) {
            paidIncome += subtotal
          } else {
            unpaidIncome += subtotal
          }
        })

        return {
          year,
          totalIncome: Math.round(yearIncome * 100) / 100,
          totalExpenses: Math.round(yearExpenses * 100) / 100,
          totalTax: Math.round(yearTax * 100) / 100,
          paidIncome: Math.round(paidIncome * 100) / 100,
          unpaidIncome: Math.round(unpaidIncome * 100) / 100,
          months,
        }
      })

    // Organize receipts by year/month
    const receiptTree: Record<number, Record<number, typeof receipts>> = {}
    receipts.forEach(receipt => {
      // Extract year/month from storage path (e.g., "invoices/1/2025/04/file.pdf")
      const pathParts = receipt.storage_path.split('/')
      if (pathParts.length >= 4) {
        const year = parseInt(pathParts[2])
        const month = parseInt(pathParts[3])

        if (!receiptTree[year]) {
          receiptTree[year] = {}
        }
        if (!receiptTree[year][month]) {
          receiptTree[year][month] = []
        }
        receiptTree[year][month].push(receipt)
      }
    })

    return NextResponse.json({
      years: yearSummaries,
      receipts: receiptTree,
      totals: {
        allTimeIncome: yearSummaries.reduce((sum, y) => sum + y.totalIncome, 0),
        allTimeExpenses: yearSummaries.reduce((sum, y) => sum + y.totalExpenses, 0),
        allTimeTax: yearSummaries.reduce((sum, y) => sum + y.totalTax, 0),
      },
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
