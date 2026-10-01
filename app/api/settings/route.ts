import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getAppSettings, settingsToRows, type AppSettings } from '@/lib/settings'
import { ITEM_TYPES, type ItemType } from '@/lib/lineItems'

/** Keep a sent value when it is a usable number or an explicit clear. */
function numeric(sent: unknown, fallback: string): string {
  if (sent === undefined || sent === null) return fallback
  const raw = String(sent).trim()
  if (raw === '') return ''
  return Number.isFinite(Number.parseFloat(raw)) ? raw : fallback
}

function text(sent: unknown, fallback: string): string {
  return sent === undefined || sent === null ? fallback : String(sent).trim()
}

/**
 * GET /api/settings
 * Read the application settings.
 */
export async function GET() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json(await getAppSettings(supabase))
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/settings
 * Update application settings. Accepts a partial AppSettings body.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const current = await getAppSettings(supabase)
    const incoming = body?.lineItemDefaults ?? {}
    const base = current.lineItemDefaults

    const next: AppSettings = {
      debtTrackingEnabled:
        body.debtTrackingEnabled !== undefined
          ? Boolean(body.debtTrackingEnabled)
          : current.debtTrackingEnabled,
      debtTotal:
        body.debtTotal !== undefined
          ? Number.parseFloat(String(body.debtTotal))
          : current.debtTotal,
      // Defaults are merged field by field, so a caller can send one of them.
      lineItemDefaults: {
        dateMode: incoming.dateMode === 'invoice' || incoming.dateMode === 'today'
          ? incoming.dateMode
          : base.dateMode,
        description: text(incoming.description, base.description),
        itemType: ITEM_TYPES.includes(String(incoming.itemType).toUpperCase() as ItemType)
          ? (String(incoming.itemType).toUpperCase() as ItemType)
          : base.itemType,
        quantity: numeric(incoming.quantity, base.quantity),
        unitRate: numeric(incoming.unitRate, base.unitRate),
        discountPercentage: numeric(incoming.discountPercentage, base.discountPercentage),
        discountReason: text(incoming.discountReason, base.discountReason),
        clientPays:
          incoming.clientPays !== undefined ? Boolean(incoming.clientPays) : base.clientPays,
        appliesToDebt:
          incoming.appliesToDebt !== undefined
            ? Boolean(incoming.appliesToDebt)
            : base.appliesToDebt,
      },
    }

    if (!Number.isFinite(next.debtTotal) || next.debtTotal < 0) {
      return NextResponse.json(
        { error: 'debtTotal must be a number of 0 or more' },
        { status: 400 }
      )
    }

    const discount = Number.parseFloat(next.lineItemDefaults.discountPercentage || '0')
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      return NextResponse.json(
        { error: 'Default discount must be between 0 and 100' },
        { status: 400 }
      )
    }

    const { error: upsertError } = await supabase
      .from('settings')
      .upsert(settingsToRows(next), { onConflict: 'key' })

    if (upsertError) {
      console.error('Error saving settings:', upsertError)
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
    }

    return NextResponse.json(await getAppSettings(supabase))
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
