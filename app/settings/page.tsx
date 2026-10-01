'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import { Loader2, Save, Check } from 'lucide-react'
import {
  DEFAULT_LINE_ITEM_DEFAULTS,
  DEFAULT_SETTINGS,
  type AppSettings,
  type LineItemDefaults,
} from '@/lib/settings'
import { ITEM_TYPES, type ItemType } from '@/lib/lineItems'

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500'

function Field({
  label,
  htmlFor,
  wide,
  children,
}: {
  label: string
  htmlFor: string
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
      >
        {label}
      </label>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [debtTotalInput, setDebtTotalInput] = useState('0')
  const [defaults, setDefaults] = useState<LineItemDefaults>(DEFAULT_LINE_ITEM_DEFAULTS)

  const patchDefaults = (patch: Partial<LineItemDefaults>) =>
    setDefaults((current) => ({ ...current, ...patch }))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load settings')
        return res.json()
      })
      .then((data: AppSettings) => {
        setSettings(data)
        setDebtTotalInput(data.debtTotal.toFixed(2))
        setDefaults(data.lineItemDefaults)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const save = async (next: AppSettings) => {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Failed to save settings')
      }
      const data: AppSettings = await res.json()
      setSettings(data)
      setDebtTotalInput(data.debtTotal.toFixed(2))
      setDefaults(data.lineItemDefaults)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      <main className="md:pl-64">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Settings
          </h1>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
            </div>
          ) : (
            <>
            <section className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Debt repayment tracking
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                When on, line items can route their discount toward a running
                debt balance, and the repayment progress appears on the summary
                page and on invoice PDF and Excel exports. Turning it off hides
                all of that without deleting any history.
              </p>

              <label className="mt-5 flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.debtTrackingEnabled}
                  disabled={saving}
                  onChange={(e) =>
                    save({
                      ...settings,
                      debtTotal: Number.parseFloat(debtTotalInput) || 0,
                      debtTrackingEnabled: e.target.checked,
                    })
                  }
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Enable debt repayment tracking
                </span>
              </label>

              <div className="mt-5">
                <label
                  htmlFor="debtTotal"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Total debt
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="debtTotal"
                    type="number"
                    min="0"
                    step="0.01"
                    value={debtTotalInput}
                    disabled={saving}
                    onChange={(e) => setDebtTotalInput(e.target.value)}
                    className="w-40 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      save({
                        ...settings,
                        debtTotal: Number.parseFloat(debtTotalInput) || 0,
                      })
                    }
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : saved ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {saved ? 'Saved' : 'Save'}
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Set to 0 to switch the feature off entirely, whatever the
                  checkbox says.
                </p>
              </div>
            </section>

            <section className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow p-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                New line item defaults
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                What the blank row at the top of a line item grid starts with.
                Leave a field empty to start it empty. These apply to every
                invoice; you can still change any value as you type.
              </p>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Date" htmlFor="dateMode">
                  <select
                    id="dateMode"
                    value={defaults.dateMode}
                    disabled={saving}
                    onChange={(e) => patchDefaults({ dateMode: e.target.value as 'today' | 'invoice' })}
                    className={inputClass}
                  >
                    <option value="today">Today&apos;s date</option>
                    <option value="invoice">The invoice&apos;s date</option>
                  </select>
                </Field>

                <Field label="Type" htmlFor="itemType">
                  <select
                    id="itemType"
                    value={defaults.itemType}
                    disabled={saving}
                    onChange={(e) => patchDefaults({ itemType: e.target.value as ItemType })}
                    className={inputClass}
                  >
                    {ITEM_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type.charAt(0) + type.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Quantity" htmlFor="quantity">
                  <input
                    id="quantity"
                    type="number"
                    step="0.01"
                    min="0"
                    value={defaults.quantity}
                    disabled={saving}
                    onChange={(e) => patchDefaults({ quantity: e.target.value })}
                    className={inputClass}
                    placeholder="empty"
                  />
                </Field>

                <Field label="Rate" htmlFor="unitRate">
                  <input
                    id="unitRate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={defaults.unitRate}
                    disabled={saving}
                    onChange={(e) => patchDefaults({ unitRate: e.target.value })}
                    className={inputClass}
                    placeholder="empty"
                  />
                </Field>

                <Field label="Discount %" htmlFor="discountPercentage">
                  <input
                    id="discountPercentage"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={defaults.discountPercentage}
                    disabled={saving}
                    onChange={(e) => patchDefaults({ discountPercentage: e.target.value })}
                    className={inputClass}
                    placeholder="empty"
                  />
                </Field>

                <Field label="Discount reason" htmlFor="discountReason">
                  <input
                    id="discountReason"
                    type="text"
                    value={defaults.discountReason}
                    disabled={saving}
                    onChange={(e) => patchDefaults({ discountReason: e.target.value })}
                    className={inputClass}
                    placeholder="empty"
                  />
                </Field>

                <Field label="Description" htmlFor="description" wide>
                  <input
                    id="description"
                    type="text"
                    value={defaults.description}
                    disabled={saving}
                    onChange={(e) => patchDefaults({ description: e.target.value })}
                    className={inputClass}
                    placeholder="empty"
                  />
                </Field>
              </div>

              <div className="mt-5 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={defaults.clientPays}
                    disabled={saving}
                    onChange={(e) => patchDefaults({ clientPays: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-900 dark:text-white">
                    Billed to the client by default
                  </span>
                </label>

                {settings.debtTrackingEnabled && (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={defaults.appliesToDebt}
                      disabled={saving}
                      onChange={(e) => patchDefaults({ appliesToDebt: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-900 dark:text-white">
                      Counts toward debt repayment by default
                    </span>
                  </label>
                )}
              </div>

              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save({ ...settings, lineItemDefaults: defaults })}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : saved ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {saved ? 'Saved' : 'Save defaults'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setDefaults(DEFAULT_LINE_ITEM_DEFAULTS)}
                  className="text-sm text-gray-500 dark:text-gray-400 hover:underline"
                >
                  Reset to built-in defaults
                </button>
              </div>
            </section>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
