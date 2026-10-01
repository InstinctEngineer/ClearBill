import type { SupabaseClient } from '@supabase/supabase-js'
import { ITEM_TYPES, type ItemType } from '@/lib/lineItems'

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
  /** What a fresh line item row is pre-filled with. */
  lineItemDefaults: LineItemDefaults
}

/**
 * Values a new line item row starts with, so the fields you type the same way
 * every time are already filled in.
 *
 * Numbers are held as strings because that is what the grid's inputs bind to,
 * and because "unset" has to survive a round trip without becoming zero.
 */
export interface LineItemDefaults {
  /** 'today' uses the current date; 'invoice' uses the invoice's own date. */
  dateMode: 'today' | 'invoice'
  description: string
  itemType: ItemType
  quantity: string
  unitRate: string
  discountPercentage: string
  discountReason: string
  clientPays: boolean
  appliesToDebt: boolean
}

export const DEFAULT_LINE_ITEM_DEFAULTS: LineItemDefaults = {
  dateMode: 'today',
  description: '',
  itemType: 'LABOR',
  quantity: '1',
  unitRate: '',
  discountPercentage: '',
  discountReason: '',
  clientPays: true,
  appliesToDebt: false,
}

export const DEFAULT_SETTINGS: AppSettings = {
  debtTrackingEnabled: false,
  debtTotal: 0,
  lineItemDefaults: DEFAULT_LINE_ITEM_DEFAULTS,
}

/** Keys in the `settings` table that map onto AppSettings. */
export const SETTING_KEYS = {
  debtTrackingEnabled: 'DEBT_TRACKING_ENABLED',
  debtTotal: 'DEBT_TOTAL',
  dateMode: 'LINE_ITEM_DEFAULT_DATE_MODE',
  description: 'LINE_ITEM_DEFAULT_DESCRIPTION',
  itemType: 'LINE_ITEM_DEFAULT_TYPE',
  quantity: 'LINE_ITEM_DEFAULT_QUANTITY',
  unitRate: 'LINE_ITEM_DEFAULT_RATE',
  discountPercentage: 'LINE_ITEM_DEFAULT_DISCOUNT',
  discountReason: 'LINE_ITEM_DEFAULT_DISCOUNT_REASON',
  clientPays: 'LINE_ITEM_DEFAULT_CLIENT_PAYS',
  appliesToDebt: 'LINE_ITEM_DEFAULT_APPLIES_TO_DEBT',
} as const

/** Build AppSettings from raw `settings` rows, falling back to the defaults. */
export function settingsFromRows(
  rows: { key: string; value: string }[] | null
): AppSettings {
  const byKey = new Map((rows ?? []).map((row) => [row.key, row.value]))

  const rawTotal = Number.parseFloat(byKey.get(SETTING_KEYS.debtTotal) ?? '')
  const debtTotal = Number.isFinite(rawTotal) && rawTotal > 0 ? rawTotal : DEFAULT_SETTINGS.debtTotal

  const fallback = DEFAULT_LINE_ITEM_DEFAULTS
  const storedType = (byKey.get(SETTING_KEYS.itemType) ?? '').toUpperCase()
  const storedDateMode = byKey.get(SETTING_KEYS.dateMode)

  return {
    debtTrackingEnabled:
      byKey.get(SETTING_KEYS.debtTrackingEnabled) === 'true' && debtTotal > 0,
    debtTotal,
    lineItemDefaults: {
      dateMode: storedDateMode === 'invoice' ? 'invoice' : 'today',
      description: byKey.get(SETTING_KEYS.description) ?? fallback.description,
      itemType: ITEM_TYPES.includes(storedType as ItemType)
        ? (storedType as ItemType)
        : fallback.itemType,
      quantity: numericDefault(byKey.get(SETTING_KEYS.quantity), fallback.quantity),
      unitRate: numericDefault(byKey.get(SETTING_KEYS.unitRate), fallback.unitRate),
      discountPercentage: numericDefault(
        byKey.get(SETTING_KEYS.discountPercentage),
        fallback.discountPercentage
      ),
      discountReason: byKey.get(SETTING_KEYS.discountReason) ?? fallback.discountReason,
      clientPays: boolDefault(byKey.get(SETTING_KEYS.clientPays), fallback.clientPays),
      appliesToDebt: boolDefault(byKey.get(SETTING_KEYS.appliesToDebt), fallback.appliesToDebt),
    },
  }
}

/** Keep a stored numeric default, or fall back when it is missing or junk. */
function numericDefault(stored: string | undefined, fallback: string): string {
  if (stored === undefined) return fallback
  if (stored.trim() === '') return '' // deliberately cleared
  return Number.isFinite(Number.parseFloat(stored)) ? stored.trim() : fallback
}

function boolDefault(stored: string | undefined, fallback: boolean): boolean {
  if (stored === 'true') return true
  if (stored === 'false') return false
  return fallback
}

/** Serialize AppSettings back into `settings` rows. */
export function settingsToRows(settings: AppSettings): { key: string; value: string }[] {
  const defaults = settings.lineItemDefaults
  return [
    { key: SETTING_KEYS.debtTrackingEnabled, value: String(settings.debtTrackingEnabled) },
    { key: SETTING_KEYS.debtTotal, value: settings.debtTotal.toFixed(2) },
    { key: SETTING_KEYS.dateMode, value: defaults.dateMode },
    { key: SETTING_KEYS.description, value: defaults.description },
    { key: SETTING_KEYS.itemType, value: defaults.itemType },
    { key: SETTING_KEYS.quantity, value: defaults.quantity },
    { key: SETTING_KEYS.unitRate, value: defaults.unitRate },
    { key: SETTING_KEYS.discountPercentage, value: defaults.discountPercentage },
    { key: SETTING_KEYS.discountReason, value: defaults.discountReason },
    { key: SETTING_KEYS.clientPays, value: String(defaults.clientPays) },
    { key: SETTING_KEYS.appliesToDebt, value: String(defaults.appliesToDebt) },
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
