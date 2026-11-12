/**
 * The vocabulary of personal tax records: which categories exist, what kinds
 * of record each one takes, what the amount on each kind means, and which
 * extra figures it carries.
 *
 * This is data, not logic. Adding a tax form the app should accept means
 * adding a line here: the entry form, the validation and the year page all
 * read from this table.
 */

export const RECORD_TYPES = ['payment', 'statement', 'document'] as const
export type RecordType = (typeof RECORD_TYPES)[number]

/**
 * Extra figures a record can carry, with the label the entry form shows.
 * Stored in the record's `details` JSON under the same key.
 */
export const DETAIL_FIELDS = {
  principal: 'Principal part',
  escrow: 'Escrow part',
  total_paid: 'Total paid',
  balance: 'Balance after',
  points: 'Points paid (Box 6)',
  property_tax: 'Property tax paid from escrow',
  outstanding_principal: 'Outstanding principal (Box 2)',
  federal_withheld: 'Federal income tax withheld',
  state_withheld: 'State income tax withheld',
  local_withheld: 'Local income tax withheld',
  retirement_deferrals: 'Retirement plan deferrals (Box 12)',
  taxable_amount: 'Taxable amount (Box 2a)',
  roth_contributions: 'Roth IRA contributions (Box 10)',
  rollover_contributions: 'Rollover contributions (Box 2)',
  employer_contributions: 'Employer contributions',
  account_value: 'Account value at year end',
  advance_credit: 'Advance premium tax credit',
  scholarships: 'Scholarships or grants (Box 5)',
  earnings: 'Earnings (Box 2)',
  basis: 'Cost or other basis',
} as const

export type DetailKey = keyof typeof DETAIL_FIELDS
export const DETAIL_KEYS = Object.keys(DETAIL_FIELDS) as DetailKey[]

/** One thing that can be recorded under a category. */
export interface RecordKind {
  type: RecordType
  /** Stored in the record's `form` column; absent for a plain receipt. */
  form?: string
  /** What the entry form and the tables call it. */
  label: string
  /** What the record's amount means. */
  amount: string
  fields?: readonly DetailKey[]
}

const OTHER_DOCUMENT: RecordKind = { type: 'document', label: 'Other document', amount: 'Amount, if any' }

/**
 * Categories, in the order the year page shows them. `group` decides how a
 * category is laid out: 'charity' is reconciled organization by organization,
 * 'home' is the mortgage, and 'forms' are listed a table per category.
 */
export const PERSONAL_CATEGORIES = [
  {
    key: 'charity_cash', label: 'Charitable gift, money', group: 'charity',
    kinds: [
      { type: 'payment', label: 'Gift', amount: 'Gift amount' },
      { type: 'statement', form: 'giving-statement', label: 'Annual giving statement', amount: 'Total on the statement' },
      OTHER_DOCUMENT,
    ],
  },
  {
    key: 'charity_noncash', label: 'Charitable gift, goods', group: 'charity',
    kinds: [
      { type: 'payment', label: 'Gift', amount: 'Fair market value' },
      { type: 'statement', form: 'giving-statement', label: 'Annual giving statement', amount: 'Total on the statement' },
      OTHER_DOCUMENT,
    ],
  },
  {
    key: 'mortgage', label: 'Home mortgage', group: 'home',
    kinds: [
      { type: 'payment', label: 'Payment', amount: 'Interest part of the payment', fields: ['principal', 'escrow', 'total_paid', 'balance'] },
      { type: 'statement', form: '1098', label: 'Form 1098', amount: 'Interest received (Box 1)', fields: ['points', 'property_tax', 'outstanding_principal'] },
      { type: 'document', label: 'Loan paperwork', amount: 'Amount, if any' },
    ],
  },
  {
    key: 'property_tax', label: 'Real estate tax', group: 'forms',
    kinds: [
      { type: 'payment', label: 'Payment', amount: 'Tax paid, without card fees' },
      { type: 'statement', form: 'tax-bill', label: 'Paid receipt for the year', amount: 'Total paid for the year' },
      OTHER_DOCUMENT,
    ],
  },
  {
    key: 'personal_property_tax', label: 'Personal property tax', group: 'forms',
    kinds: [
      { type: 'payment', label: 'Payment', amount: 'Tax paid, without card fees' },
      { type: 'statement', form: 'tax-bill', label: 'Paid receipt for the year', amount: 'Total paid for the year' },
      OTHER_DOCUMENT,
    ],
  },
  {
    key: 'student_loan', label: 'Student loans', group: 'forms',
    kinds: [
      { type: 'statement', form: '1098-E', label: 'Form 1098-E', amount: 'Student loan interest (Box 1)' },
      { type: 'payment', label: 'Payment', amount: 'Interest part of the payment', fields: ['principal', 'total_paid', 'balance'] },
      OTHER_DOCUMENT,
    ],
  },
  {
    key: 'retirement', label: 'Retirement accounts', group: 'forms',
    kinds: [
      { type: 'statement', form: '5498', label: 'Form 5498, IRA contributions', amount: 'Traditional IRA contributions (Box 1)', fields: ['roth_contributions', 'rollover_contributions', 'account_value'] },
      { type: 'statement', form: '1099-R', label: 'Form 1099-R, distribution', amount: 'Gross distribution (Box 1)', fields: ['taxable_amount', 'federal_withheld', 'state_withheld'] },
      { type: 'statement', form: 'plan-statement', label: '401(k) or plan statement', amount: 'Your contributions for the year', fields: ['employer_contributions', 'account_value'] },
      { type: 'document', label: 'Plan notice or other document', amount: 'Amount, if any' },
    ],
  },
  {
    key: 'wages', label: 'Wages', group: 'forms',
    kinds: [
      { type: 'statement', form: 'W-2', label: 'Form W-2', amount: 'Wages (Box 1)', fields: ['federal_withheld', 'state_withheld', 'local_withheld', 'retirement_deferrals'] },
      { type: 'document', label: 'Pay stub or other document', amount: 'Amount, if any' },
    ],
  },
  {
    key: 'other_income', label: 'Other income', group: 'forms',
    kinds: [
      { type: 'statement', form: '1099-NEC', label: 'Form 1099-NEC, business income', amount: 'Nonemployee compensation (Box 1)', fields: ['federal_withheld'] },
      { type: 'statement', form: '1099-INT', label: 'Form 1099-INT, interest', amount: 'Interest income (Box 1)', fields: ['federal_withheld'] },
      { type: 'statement', form: '1099-DIV', label: 'Form 1099-DIV, dividends', amount: 'Ordinary dividends (Box 1a)', fields: ['federal_withheld'] },
      { type: 'statement', form: '1099-G', label: 'Form 1099-G, unemployment or state refund', amount: 'Amount reported', fields: ['federal_withheld'] },
      { type: 'statement', form: '1099-K', label: 'Form 1099-K, payment apps', amount: 'Gross payments (Box 1a)', fields: ['federal_withheld'] },
      { type: 'statement', form: '1099-MISC', label: 'Form 1099-MISC or other 1099', amount: 'Amount reported', fields: ['federal_withheld'] },
      OTHER_DOCUMENT,
    ],
  },
  {
    key: 'investments', label: 'Investment and crypto sales', group: 'forms',
    kinds: [
      { type: 'statement', form: '1099-B', label: 'Form 1099-B, sales', amount: 'Proceeds', fields: ['basis', 'federal_withheld'] },
      { type: 'statement', form: '1099-DA', label: 'Form 1099-DA, digital assets', amount: 'Proceeds', fields: ['basis', 'federal_withheld'] },
      OTHER_DOCUMENT,
    ],
  },
  {
    key: 'health', label: 'Health coverage', group: 'forms',
    kinds: [
      { type: 'statement', form: '1095-A', label: 'Form 1095-A, Marketplace', amount: 'Premiums for the year', fields: ['advance_credit'] },
      { type: 'document', form: '1095-B/C', label: 'Form 1095-B or 1095-C', amount: 'Amount, if any' },
      { type: 'statement', form: '5498-SA', label: 'Form 5498-SA, HSA contributions', amount: 'Contributions (Box 2)' },
      { type: 'statement', form: '1099-SA', label: 'Form 1099-SA, HSA distributions', amount: 'Gross distribution (Box 1)' },
      OTHER_DOCUMENT,
    ],
  },
  {
    key: 'education', label: 'Education', group: 'forms',
    kinds: [
      { type: 'statement', form: '1098-T', label: 'Form 1098-T, tuition', amount: 'Payments received (Box 1)', fields: ['scholarships'] },
      { type: 'statement', form: '1099-Q', label: 'Form 1099-Q, 529 plan distribution', amount: 'Gross distribution (Box 1)', fields: ['earnings', 'basis'] },
      { type: 'payment', label: 'Payment', amount: 'Amount paid' },
      OTHER_DOCUMENT,
    ],
  },
  {
    key: 'dependent_care', label: 'Child and dependent care', group: 'forms',
    kinds: [
      { type: 'payment', label: 'Payment to a care provider', amount: 'Amount paid' },
      { type: 'statement', form: 'care-statement', label: 'Provider year-end statement', amount: 'Total paid for the year' },
      OTHER_DOCUMENT,
    ],
  },
  {
    key: 'tax_payments', label: 'Tax payments', group: 'forms',
    kinds: [
      { type: 'payment', form: '1040-ES', label: 'Federal estimated tax payment', amount: 'Amount paid' },
      { type: 'payment', form: 'state-estimate', label: 'State estimated tax payment', amount: 'Amount paid' },
      { type: 'payment', form: 'balance-due', label: 'Balance paid with a return or notice', amount: 'Amount paid' },
      OTHER_DOCUMENT,
    ],
  },
  {
    key: 'tax_return', label: 'Returns and letters', group: 'forms',
    kinds: [
      { type: 'document', form: 'return', label: 'Filed tax return', amount: 'Refund or balance due, if you want it noted' },
      { type: 'document', form: 'letter', label: 'IRS or state letter', amount: 'Amount, if any' },
      OTHER_DOCUMENT,
    ],
  },
  {
    key: 'other', label: 'Other', group: 'forms',
    kinds: [
      { type: 'payment', label: 'Payment', amount: 'Amount paid' },
      { type: 'statement', form: 'statement', label: 'Annual statement', amount: 'Total on the statement' },
      OTHER_DOCUMENT,
    ],
  },
] as const satisfies readonly {
  key: string
  label: string
  group: 'charity' | 'home' | 'forms'
  kinds: readonly RecordKind[]
}[]

export type PersonalCategoryKey = (typeof PERSONAL_CATEGORIES)[number]['key']
export type PersonalGroup = (typeof PERSONAL_CATEGORIES)[number]['group']

export function personalCategory(key: string) {
  return PERSONAL_CATEGORIES.find((category) => category.key === key) ?? null
}

/** Categories totalled as tax forms rather than as Schedule A items. */
export const FORM_CATEGORIES = PERSONAL_CATEGORIES.filter((category) => category.group === 'forms')

/** The kinds of record a category takes; empty for an unknown category. */
export function recordKinds(category: string): readonly RecordKind[] {
  return personalCategory(category)?.kinds ?? []
}

/**
 * The kind a stored record is: matched on its form when it has one, else the
 * category's first kind of that type. Null when the category has no such kind.
 */
export function recordKind(category: string, type: RecordType, form?: string | null): RecordKind | null {
  const kinds = recordKinds(category).filter((kind) => kind.type === type)
  return kinds.find((kind) => (kind.form ?? null) === (form ?? null)) ?? kinds[0] ?? null
}

/** What a record is called, e.g. "Form 1098-E" or "Gift". */
export function recordKindLabel(category: string, type: RecordType, form?: string | null): string {
  return recordKind(category, type, form)?.label ?? (type === 'payment' ? 'Payment' : type === 'statement' ? 'Annual statement' : 'Other document')
}

/**
 * What a category's yearly statement is called in a sentence: "Form 1098",
 * "annual giving statement". The page and the flags share the wording.
 */
export function statementName(category: string): string {
  const label = recordKinds(category).find((kind) => kind.type === 'statement')?.label ?? 'annual statement'
  const name = label.split(',')[0]
  return name.startsWith('Form ') ? name : name.charAt(0).toLowerCase() + name.slice(1)
}
