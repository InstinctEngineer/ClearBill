/**
 * Expense categories, keyed to the Schedule C line each one lands on.
 *
 * The keys are what the database stores. The Schedule C lines are the
 * reason the categories exist: at tax time the question is "what goes in
 * each box", so the app groups spending the way the form does.
 */
export interface TaxCategory {
  key: string
  label: string
  /** Schedule C line, as printed on the form. */
  scheduleCLine: string
  /** Shown beside the category where a choice needs a word of guidance. */
  hint?: string
  /**
   * Not a Schedule C expense line: handled on a different screen, so the
   * tax report lists it separately instead of summing it with the rest.
   */
  separateScreen?: 'vehicle' | 'assets' | 'cost_of_goods'
}

export const TAX_CATEGORIES: readonly TaxCategory[] = [
  { key: 'software', label: 'Software & subscriptions', scheduleCLine: '18 Office expense',
    hint: 'Tools you pay for to do the work: remote access, hosting, AI services.' },
  { key: 'office', label: 'Office expense', scheduleCLine: '18 Office expense' },
  { key: 'supplies', label: 'Supplies', scheduleCLine: '22 Supplies',
    hint: 'Consumables and small parts, not resold to a client.' },
  { key: 'equipment', label: 'Equipment', scheduleCLine: 'Business assets',
    hint: 'Computers, cameras, tools kept for the business. Asked about on a later screen.',
    separateScreen: 'assets' },
  { key: 'resold', label: 'Bought for a client', scheduleCLine: 'Cost of goods sold',
    hint: 'Hardware or licences purchased and billed on to the client.',
    separateScreen: 'cost_of_goods' },
  { key: 'vehicle', label: 'Vehicle: fuel, parking, tolls', scheduleCLine: '9 Car and truck',
    hint: 'Entered on the vehicle screen. Actual fuel costs and the mileage rate cannot both be claimed.',
    separateScreen: 'vehicle' },
  { key: 'travel', label: 'Travel', scheduleCLine: '24a Travel' },
  { key: 'meals', label: 'Business meals', scheduleCLine: '24b Meals' },
  { key: 'advertising', label: 'Advertising', scheduleCLine: '8 Advertising' },
  { key: 'contract_labor', label: 'Contract labor', scheduleCLine: '11 Contract labor' },
  { key: 'legal_professional', label: 'Legal & professional', scheduleCLine: '17 Legal and professional' },
  { key: 'insurance', label: 'Insurance (not health)', scheduleCLine: '15 Insurance' },
  { key: 'taxes_licenses', label: 'Taxes & business licences', scheduleCLine: '23 Taxes and licenses',
    hint: 'Business licences and permits. Software licences belong under Software.' },
  { key: 'utilities', label: 'Utilities, phone, internet', scheduleCLine: '25 Utilities' },
  { key: 'other', label: 'Other', scheduleCLine: '27a Other expenses' },
] as const

export type TaxCategoryKey = (typeof TAX_CATEGORIES)[number]['key']

const BY_KEY = new Map(TAX_CATEGORIES.map((category) => [category.key, category]))

export function taxCategory(key: string | null | undefined): TaxCategory | null {
  return key ? (BY_KEY.get(key) ?? null) : null
}

export function isTaxCategoryKey(value: unknown): value is TaxCategoryKey {
  return typeof value === 'string' && BY_KEY.has(value)
}

/**
 * Suggest a category from what OCR or the user wrote. Deliberately modest:
 * it only fires on words that are hard to misread, and the user confirms.
 */
export function suggestCategory(text: string): TaxCategoryKey | null {
  const t = text.toLowerCase()
  if (/\b(gas|fuel|casey'?s|shell|bp|exxon|parking|toll)\b/.test(t)) return 'vehicle'
  if (/\b(anydesk|lovable|github|vercel|supabase|microsoft 365|office 365|adobe|zoom|subscription|licen[cs]e|hosting|domain)\b/.test(t)) return 'software'
  if (/\b(amazon|newegg|best buy|micro ?center)\b/.test(t)) return 'equipment'
  if (/\b(verizon|at&t|t-mobile|comcast|spectrum|internet|phone)\b/.test(t)) return 'utilities'
  if (/\b(restaurant|cafe|coffee|lunch|dinner|meal)\b/.test(t)) return 'meals'
  return null
}
