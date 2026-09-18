import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getAppSettings, settingsToRows, type AppSettings } from '@/lib/settings'

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

    const next: AppSettings = {
      debtTrackingEnabled:
        body.debtTrackingEnabled !== undefined
          ? Boolean(body.debtTrackingEnabled)
          : current.debtTrackingEnabled,
      debtTotal:
        body.debtTotal !== undefined
          ? Number.parseFloat(String(body.debtTotal))
          : current.debtTotal,
    }

    if (!Number.isFinite(next.debtTotal) || next.debtTotal < 0) {
      return NextResponse.json(
        { error: 'debtTotal must be a number of 0 or more' },
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
