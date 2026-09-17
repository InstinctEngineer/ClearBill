/**
 * Send email as a Microsoft 365 mailbox via Microsoft Graph (app-only / client credentials).
 *
 * Required env vars (Vercel → Settings → Environment Variables):
 *   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET  – Entra app registration
 *   MAIL_FROM                                     – mailbox to send as, e.g. nwarder@esd2.com
 */

export interface MailAttachment {
  name: string
  contentType: string
  content: Buffer
}

export interface OutgoingMail {
  to: string[]
  subject: string
  html: string
  attachments?: MailAttachment[]
}

const REQUIRED_ENV = ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MAIL_FROM'] as const

export function missingMailConfig(): string[] {
  return REQUIRED_ENV.filter((key) => !process.env[key])
}

export function mailFrom(): string {
  return process.env.MAIL_FROM || ''
}

async function getGraphToken(): Promise<string> {
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MS_CLIENT_ID!,
        client_secret: process.env.MS_CLIENT_SECRET!,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    }
  )
  const data = await res.json()
  if (!res.ok) {
    throw new Error(`Microsoft sign-in failed: ${data.error_description || data.error || res.status}`)
  }
  return data.access_token
}

export async function sendMail(mail: OutgoingMail): Promise<void> {
  const missing = missingMailConfig()
  if (missing.length) {
    throw new Error(`Email is not configured. Missing: ${missing.join(', ')}`)
  }

  const token = await getGraphToken()
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailFrom())}/sendMail`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: mail.subject,
          body: { contentType: 'HTML', content: mail.html },
          toRecipients: mail.to.map((address) => ({ emailAddress: { address } })),
          attachments: (mail.attachments || []).map((a) => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: a.name,
            contentType: a.contentType,
            contentBytes: a.content.toString('base64'),
          })),
        },
        saveToSentItems: true,
      }),
    }
  )

  // Graph returns 202 Accepted with an empty body on success
  if (!res.ok) {
    const text = await res.text()
    let message = text
    try {
      message = JSON.parse(text).error?.message || text
    } catch {}
    throw new Error(`Microsoft Graph sendMail failed (${res.status}): ${message}`)
  }
}
