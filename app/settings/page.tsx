'use client'

import { useEffect, useState } from 'react'
import Navigation from '@/components/Navigation'
import { Loader2, Save, Check } from 'lucide-react'
import { DEFAULT_SETTINGS, type AppSettings } from '@/lib/settings'

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [debtTotalInput, setDebtTotalInput] = useState('0')
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
                        debtTrackingEnabled: settings.debtTrackingEnabled,
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
          )}
        </div>
      </main>
    </div>
  )
}
