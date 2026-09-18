import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Application settings, read from the `settings` key/value table.
 *
 * Anything that used to be a magic number in a component belongs here, so it
 * can be changed from the Settings page instead of a redeploy.
 */
export interface AppSettings {
  /** Master switch for the debt repayment feature. */
  debtTrackingEnabled: boolean
  /** Total debt being worked off via line item discounts. */
  debtTotal: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  debtTrackingEnabled: false,
  debtTotal: 0,
}

/** Keys in the `settings` table that map onto AppSettings. */
export const SETTING_KEYS = {
  debtTrackingEnabled: 'DEBT_TRACKING_ENABLED',
  debtTotal: 'DEBT_TOTAL',
} as const

/** Build AppSettings from raw `settings` rows, falling back to the defaults. */
export function settingsFromRows(
  rows: { key: string; value: string }[] | null
): AppSettings {
  const byKey = new Map((rows ?? []).map((row) => [row.key, row.value]))

  const rawTotal = Number.parseFloat(byKey.get(SETTING_KEYS.debtTotal) ?? '')
  const debtTotal = Number.isFinite(rawTotal) && rawTotal > 0 ? rawTotal : DEFAULT_SETTINGS.debtTotal

  return {
    debtTrackingEnabled:
      byKey.get(SETTING_KEYS.debtTrackingEnabled) === 'true' && debtTotal > 0,
    debtTotal,
  }
}

/** Serialize AppSettings back into `settings` rows. */
export function settingsToRows(settings: AppSettings): { key: string; value: string }[] {
  return [
    { key: SETTING_KEYS.debtTrackingEnabled, value: String(settings.debtTrackingEnabled) },
    { key: SETTING_KEYS.debtTotal, value: settings.debtTotal.toFixed(2) },
  ]
}

/**
 * Load settings server-side. Used by the summary API and the PDF/Excel
 * builders so they all agree on whether the debt block should render.
 */
export async function getAppSettings(supabase: SupabaseClient): Promise<AppSettings> {
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', Object.values(SETTING_KEYS))

  return settingsFromRows(data)
}
