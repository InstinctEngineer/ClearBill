import type { LineItemInsert } from '@/lib/types/database.types'
import { parseDateOnly, toDateOnly } from '@/lib/utils/dates'

export const ITEM_TYPES = ['LABOR', 'HARDWARE', 'OTHER'] as const
export type ItemType = (typeof ITEM_TYPES)[number]

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * Coerce and validate one line item payload.
 *
 * Shared by the single-item POST, the bulk POST used by the grid's paste
 * handler, and the PATCH route, so every entry path applies the same rules.
 */
export function parseLineItem(
  body: Record<string, unknown>,
  invoiceId: number
): ParseResult<LineItemInsert> {
  const description = String(body.description ?? '').trim()
  if (!description) return { ok: false, error: 'description is required' }

  const quantity = Number.parseFloat(String(body.quantity ?? ''))
  if (!Number.isFinite(quantity)) return { ok: false, error: 'quantity must be a number' }

  const unitRate = Number.parseFloat(String(body.unit_rate ?? ''))
  if (!Number.isFinite(unitRate)) return { ok: false, error: 'unit_rate must be a number' }

  const itemType = String(body.item_type ?? '').trim().toUpperCase()
  if (!ITEM_TYPES.includes(itemType as ItemType)) {
    return { ok: false, error: `item_type must be one of ${ITEM_TYPES.join(', ')}` }
  }

  const date = normalizeDate(body.date)
  if (!date) return { ok: false, error: 'date must be a valid calendar date' }

  const discount = Number.parseFloat(String(body.discount_percentage ?? '0'))
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
    return { ok: false, error: 'discount_percentage must be between 0 and 100' }
  }

  const reason = body.discount_reason
  return {
    ok: true,
    value: {
      invoice_id: invoiceId,
      description,
      quantity,
      unit_rate: unitRate,
      item_type: itemType as ItemType,
      date,
      discount_percentage: discount,
      discount_reason: reason ? String(reason).trim() || null : null,
      applies_to_debt: Boolean(body.applies_to_debt),
      client_pays: body.client_pays === undefined ? true : Boolean(body.client_pays),
    },
  }
}

/** Accept 'YYYY-MM-DD' or anything Date can parse, always emit 'YYYY-MM-DD'. */
function normalizeDate(value: unknown): string | null {
  if (!value) return null
  const parsed = parseDateOnly(String(value).trim())
  return Number.isNaN(parsed.getTime()) ? null : toDateOnly(parsed)
}
