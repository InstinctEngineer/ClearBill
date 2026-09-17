import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { buildInvoicePdf } from '@/lib/pdf/invoicePdf'
import { sendMail, missingMailConfig, mailFrom } from '@/lib/email/graph'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const senderName = () => process.env.INVOICE_SENDER_NAME || 'Nathen'

function defaultMessage(projectName: string) {
  return `Hello,\n\nAttached is my invoice for ${projectName}. Let me know if there are any issues.\n\nThanks,\n${senderName()}`
}

function textToHtml(text: string) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function parseRecipients(to: unknown): string[] {
  if (typeof to !== 'string') return []
  return to.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
}

async function requireUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { supabase, user: error ? null : user }
}

/**
 * GET /api/invoices/[id]/send
 * Defaults + config status for the Send Invoice review dialog.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data: invoice } = await supabase
    .from('invoices')
    .select('project_name, sent_at, sent_to')
    .eq('id', id)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  return NextResponse.json({
    from: mailFrom(),
    to: invoice.sent_to || process.env.INVOICE_TO || '',
    subject: `${senderName()} Invoice ${invoice.project_name}`,
    message: defaultMessage(invoice.project_name),
    missingConfig: missingMailConfig(),
    sent_at: invoice.sent_at,
    sent_to: invoice.sent_to,
  })
}

/**
 * POST /api/invoices/[id]/send
 * Body: { to, subject, message } – generates the PDF and emails it from MAIL_FROM.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const to = parseRecipients(body.to)
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const message = typeof body.message === 'string' ? body.message : ''

  if (!to.length || to.some((addr) => !EMAIL_RE.test(addr))) {
    return NextResponse.json({ error: 'Enter at least one valid recipient email' }, { status: 400 })
  }
  if (!subject) {
    return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
  }

  try {
    const pdf = await buildInvoicePdf(supabase, id)
    if (!pdf) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    if (!pdf.lineItems.length) {
      return NextResponse.json({ error: 'Invoice has no line items' }, { status: 400 })
    }

    await sendMail({
      to,
      subject,
      html: textToHtml(message),
      attachments: [{ name: pdf.filename, contentType: 'application/pdf', content: pdf.buffer }],
    })

    const sentAt = new Date().toISOString()
    const sentTo = to.join(', ')
    const { error: updateError } = await supabase
      .from('invoices')
      .update({ sent_at: sentAt, sent_to: sentTo })
      .eq('id', id)

    if (updateError) {
      // Email already went out; surface the tracking failure without implying the send failed
      console.error('Sent but failed to record sent_at:', updateError)
    }

    return NextResponse.json({ ok: true, sent_at: sentAt, sent_to: sentTo })
  } catch (error) {
    console.error('Send invoice failed:', error)
    const msg = error instanceof Error ? error.message : 'Failed to send invoice'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
