'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import { ChevronDown, ChevronRight, FileText, DollarSign, TrendingUp, Calendar, CheckCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/calculations'

interface MonthSummary {
  month: number
  monthName: string
  totalIncome: number
  totalExpenses: number
  totalTax: number
  invoiceCount: number
}

interface YearSummary {
  year: number
  totalIncome: number
  totalExpenses: number
  totalTax: number
  paidIncome: number
  unpaidIncome: number
  months: MonthSummary[]
}

interface SummaryData {
  years: YearSummary[]
  receipts: Record<number, Record<number, any[]>>
  totals: {
    allTimeIncome: number
    allTimeExpenses: number
    allTimeTax: number
  }
  debtTracking?: {
    totalDebt: number
    totalRepaid: number
    remainingDebt: number
    percentageRepaid: number
  }
}

export default function SummaryPage() {
  const [data, setData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetchSummary()
  }, [])

  const fetchSummary = async () => {
    try {
      const res = await fetch('/api/summary')
      if (res.ok) {
        const summaryData = await res.json()
        setData(summaryData)
        // Expand the most recent year by default
        if (summaryData.years.length > 0) {
          setExpandedYears(new Set([summaryData.years[0].year]))
        }
      }
    } catch (error) {
      console.error('Error fetching summary:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleYear = (year: number) => {
    const newExpanded = new Set(expandedYears)
    if (newExpanded.has(year)) {
      newExpanded.delete(year)
    } else {
      newExpanded.add(year)
    }
    setExpandedYears(newExpanded)
  }

  if (loading) {
    return (
      <div className="flex h-full">
        <Navigation />
        <div className="flex-1 md:pl-64 flex items-center justify-center">
          <div className="text-gray-500 dark:text-gray-400">Loading summary...</div>
        </div>
      </div>
    )
  }

  if (!data || data.years.length === 0) {
    return (
      <div className="flex h-full">
        <Navigation />
        <div className="flex-1 md:pl-64">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Financial Summary
            </h1>
            <div className="mt-8 text-center text-gray-500 dark:text-gray-400">
              No financial data available. Create some invoices to see your summary.
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Get current year data
  const currentYearData = data.years.find(y => y.year === new Date().getFullYear()) || data.years[0]

  return (
    <div className="flex h-full">
      <Navigation />

      <div className="flex-1 md:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              Financial Summary
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Income, expenses, and tax breakdown by year and month
            </p>
          </div>

          {/* Current Year Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-4 text-white">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-green-100">{currentYearData.year} Income</p>
                <DollarSign className="h-6 w-6 text-green-200" />
              </div>
              <p className="text-2xl font-bold">
                {formatCurrency(currentYearData.totalIncome)}
              </p>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-4 text-white">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-purple-100">{currentYearData.year} Expenses</p>
                <TrendingUp className="h-6 w-6 text-purple-200" />
              </div>
              <p className="text-2xl font-bold">
                {formatCurrency(currentYearData.totalExpenses)}
              </p>
            </div>

            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg shadow-lg p-4 text-white">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-orange-100">{currentYearData.year} Tax</p>
                <FileText className="h-6 w-6 text-orange-200" />
              </div>
              <p className="text-2xl font-bold">
                {formatCurrency(currentYearData.totalTax)}
              </p>
            </div>
          </div>

          {/* Payment Status */}
          {data.years.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                Payment Status
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div>
                    <p className="text-xs text-green-700 dark:text-green-400 mb-1">Paid Income</p>
                    <p className="text-xl font-bold text-green-900 dark:text-green-300">
                      {formatCurrency(data.years.reduce((sum, y) => sum + y.paidIncome, 0))}
                    </p>
                  </div>
                  <div className="h-10 w-10 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                    <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <div>
                    <p className="text-xs text-orange-700 dark:text-orange-400 mb-1">Unpaid Income</p>
                    <p className="text-xl font-bold text-orange-900 dark:text-orange-300">
                      {formatCurrency(data.years.reduce((sum, y) => sum + y.unpaidIncome, 0))}
                    </p>
                  </div>
                  <div className="h-10 w-10 bg-orange-100 dark:bg-orange-900 rounded-full flex items-center justify-center">
                    <Calendar className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Debt Tracking */}
          {data.debtTracking && data.debtTracking.totalDebt > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6 p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Debt Repayment Tracking
                </h2>
                {data.debtTracking.percentageRepaid >= 100 && (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-xs font-semibold">Fully Repaid!</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-xs text-blue-700 dark:text-blue-400 mb-1">Total Debt</p>
                  <p className="text-xl font-bold text-blue-900 dark:text-blue-300">
                    {formatCurrency(data.debtTracking.totalDebt)}
                  </p>
                </div>

                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-xs text-green-700 dark:text-green-400 mb-1">Repaid via Discounts</p>
                  <p className="text-xl font-bold text-green-900 dark:text-green-300">
                    {formatCurrency(data.debtTracking.totalRepaid)}
                  </p>
                </div>

                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <p className="text-xs text-orange-700 dark:text-orange-400 mb-1">Remaining Balance</p>
                  <p className="text-xl font-bold text-orange-900 dark:text-orange-300">
                    {formatCurrency(Math.max(0, data.debtTracking.remainingDebt))}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Repayment Progress
                  </span>
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {Math.min(100, data.debtTracking.percentageRepaid).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.min(100, data.debtTracking.percentageRepaid)}%` }}
                  />
                </div>
              </div>

              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                Debt is being repaid through discounted services. Check individual invoices to see which line items apply to debt repayment.
              </p>
            </div>
          )}

          {/* Yearly Breakdown */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Yearly Breakdown
            </h2>

            {data.years.map((yearData) => (
              <div key={yearData.year} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                {/* Year Header */}
                <button
                  onClick={() => toggleYear(yearData.year)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {expandedYears.has(yearData.year) ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                    <span className="text-lg font-bold text-gray-900 dark:text-white">
                      {yearData.year}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 sm:gap-6">
                    <div className="text-right">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Income</p>
                      <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                        {formatCurrency(yearData.totalIncome)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Expenses</p>
                      <p className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                        {formatCurrency(yearData.totalExpenses)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Tax</p>
                      <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                        {formatCurrency(yearData.totalTax)}
                      </p>
                    </div>
                  </div>
                </button>

                {/* Monthly Breakdown */}
                {expandedYears.has(yearData.year) && (
                  <div className="border-t border-gray-200 dark:border-gray-700">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Month
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Invoices
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Income
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Expenses
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Tax
                            </th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                              Net
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {yearData.months.map((month) => (
                            <tr key={month.month} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                              <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                {month.monthName}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                                {month.invoiceCount}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-semibold text-green-600 dark:text-green-400">
                                {formatCurrency(month.totalIncome)}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-semibold text-purple-600 dark:text-purple-400">
                                {formatCurrency(month.totalExpenses)}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-semibold text-orange-600 dark:text-orange-400">
                                {formatCurrency(month.totalTax)}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-bold text-gray-900 dark:text-white">
                                {formatCurrency(month.totalIncome - month.totalExpenses)}
                              </td>
                            </tr>
                          ))}
                          {/* Year Total Row */}
                          <tr className="bg-gray-100 dark:bg-gray-900 font-bold">
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {yearData.year} Total
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                              {yearData.months.reduce((sum, m) => sum + m.invoiceCount, 0)}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-green-600 dark:text-green-400">
                              {formatCurrency(yearData.totalIncome)}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-purple-600 dark:text-purple-400">
                              {formatCurrency(yearData.totalExpenses)}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-orange-600 dark:text-orange-400">
                              {formatCurrency(yearData.totalTax)}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-900 dark:text-white">
                              {formatCurrency(yearData.totalIncome - yearData.totalExpenses)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Grand Total */}
          <div className="mt-6 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg shadow-lg p-4 text-white">
            <h2 className="text-lg font-semibold mb-3">Grand Total (All Years)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-blue-100 text-xs mb-1">Total Income</p>
                <p className="text-xl font-bold">
                  {formatCurrency(data.totals.allTimeIncome)}
                </p>
              </div>
              <div>
                <p className="text-blue-100 text-xs mb-1">Total Expenses</p>
                <p className="text-xl font-bold">
                  {formatCurrency(data.totals.allTimeExpenses)}
                </p>
              </div>
              <div>
                <p className="text-blue-100 text-xs mb-1">Total Tax</p>
                <p className="text-xl font-bold">
                  {formatCurrency(data.totals.allTimeTax)}
                </p>
              </div>
              <div>
                <p className="text-blue-100 text-xs mb-1">Net Profit</p>
                <p className="text-xl font-bold">
                  {formatCurrency(data.totals.allTimeIncome - data.totals.allTimeExpenses)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
