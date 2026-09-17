import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { buildInvoicePdf } from '@/lib/pdf/invoicePdf'

/**
 * GET /api/invoices/[id]/export/pdf
 * Generate and download PDF invoice
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id } = await params

  // Check authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const pdf = await buildInvoicePdf(supabase, id)
    if (!pdf) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(pdf.buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdf.filename}"`,
      },
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
