/**
 * Data Migration Script: SQLite → Supabase
 *
 * This script migrates data from the old Flask/SQLite Invoice Tracker
 * to the new Supabase database.
 *
 * Usage:
 *   1. Make sure your .env.local file has the correct Supabase credentials
 *   2. Run: npm run migrate
 */

import { createClient } from '@supabase/supabase-js'
import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as path from 'path'
import { config } from 'dotenv'

// Load environment variables
config({ path: '.env.local' })

// Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role for admin operations
)

// Path to the old SQLite database
const SQLITE_DB_PATH = path.join(
  __dirname,
  '../../Invoice_Tracker - WORKING COPY DO NOT TOUCH/invoices.db'
)

// Path to receipts folder
const RECEIPTS_PATH = path.join(
  __dirname,
  '../../Invoice_Tracker - WORKING COPY DO NOT TOUCH/receipts'
)

interface OldInvoice {
  id: number
  project_name: string
  client: string
  date: string
  tax_rate: number
  paid: number // SQLite uses 0/1 for boolean
  paid_date: string | null
}

interface OldLineItem {
  id: number
  invoice_id: number
  description: string
  quantity: number
  unit_rate: number
  item_type: string
  date: string
}

interface OldReceipt {
  id: number
  invoice_id: number
  filename: string
  uploaded_at: string
}

interface OldSetting {
  id: number
  key: string
  value: string
}

async function main() {
  console.log('🚀 Starting data migration from SQLite to Supabase...\n')

  // Check if SQLite database exists
  if (!fs.existsSync(SQLITE_DB_PATH)) {
    console.error(`❌ SQLite database not found at: ${SQLITE_DB_PATH}`)
    console.log('Please update the SQLITE_DB_PATH in the script to point to your invoices.db file')
    process.exit(1)
  }

  // Open SQLite database
  const db = new Database(SQLITE_DB_PATH, { readonly: true })
  console.log('✅ Connected to SQLite database')

  try {
    // Test Supabase connection
    const { error: testError } = await supabase.from('invoices').select('count').limit(1)
    if (testError) {
      console.error('❌ Failed to connect to Supabase:', testError.message)
      process.exit(1)
    }
    console.log('✅ Connected to Supabase\n')

    // Migrate invoices
    await migrateInvoices(db)

    // Migrate line items
    await migrateLineItems(db)

    // Migrate receipts (metadata and files)
    await migrateReceipts(db)

    // Migrate settings
    await migrateSettings(db)

    console.log('\n✅ Migration completed successfully!')
    console.log('\nNext steps:')
    console.log('1. Verify your data in Supabase Dashboard')
    console.log('2. Test the new application')
    console.log('3. Keep the old database as a backup')

  } catch (error) {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  } finally {
    db.close()
  }
}

async function migrateInvoices(db: Database.Database) {
  console.log('📋 Migrating invoices...')

  const invoices = db.prepare('SELECT * FROM invoice').all() as OldInvoice[]

  if (invoices.length === 0) {
    console.log('   ℹ️  No invoices to migrate')
    return
  }

  for (const invoice of invoices) {
    const { error } = await supabase.from('invoices').insert({
      id: invoice.id,
      project_name: invoice.project_name,
      client: invoice.client,
      date: invoice.date,
      tax_rate: invoice.tax_rate,
      paid: invoice.paid === 1,
      paid_date: invoice.paid_date,
    })

    if (error) {
      console.error(`   ❌ Failed to migrate invoice ${invoice.id}:`, error.message)
    } else {
      console.log(`   ✓ Migrated invoice ${invoice.id}: ${invoice.project_name}`)
    }
  }

  console.log(`✅ Migrated ${invoices.length} invoices\n`)
}

async function migrateLineItems(db: Database.Database) {
  console.log('📝 Migrating line items...')

  const lineItems = db.prepare('SELECT * FROM line_item').all() as OldLineItem[]

  if (lineItems.length === 0) {
    console.log('   ℹ️  No line items to migrate')
    return
  }

  for (const item of lineItems) {
    const { error } = await supabase.from('line_items').insert({
      id: item.id,
      invoice_id: item.invoice_id,
      description: item.description,
      quantity: item.quantity,
      unit_rate: item.unit_rate,
      item_type: item.item_type as 'LABOR' | 'HARDWARE' | 'OTHER',
      date: item.date,
    })

    if (error) {
      console.error(`   ❌ Failed to migrate line item ${item.id}:`, error.message)
    } else {
      console.log(`   ✓ Migrated line item ${item.id}`)
    }
  }

  console.log(`✅ Migrated ${lineItems.length} line items\n`)
}

async function migrateReceipts(db: Database.Database) {
  console.log('📎 Migrating receipts...')

  const receipts = db.prepare('SELECT * FROM receipt').all() as OldReceipt[]

  if (receipts.length === 0) {
    console.log('   ℹ️  No receipts to migrate')
    return
  }

  for (const receipt of receipts) {
    // Original filename path (e.g., "2025/04/receipt.pdf")
    const originalPath = path.join(RECEIPTS_PATH, receipt.filename)

    if (!fs.existsSync(originalPath)) {
      console.warn(`   ⚠️  Receipt file not found: ${originalPath}`)
      continue
    }

    // Read file
    const fileBuffer = fs.readFileSync(originalPath)
    const fileName = path.basename(receipt.filename)
    const fileExt = path.extname(fileName)

    // Storage path in Supabase: invoices/{invoice_id}/{year}/{month}/{filename}
    const dateParts = receipt.filename.split('/') // ['2025', '04', 'filename.ext']
    const year = dateParts[0] || new Date().getFullYear().toString()
    const month = dateParts[1] || '01'

    const storagePath = `invoices/${receipt.invoice_id}/${year}/${month}/${fileName}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(storagePath, fileBuffer, {
        contentType: getMimeType(fileExt),
        upsert: true, // Overwrite if exists (useful for re-running migration)
      })

    if (uploadError) {
      console.error(`   ❌ Failed to upload ${fileName}:`, uploadError.message)
      continue
    }

    // Insert receipt metadata into database
    const { error: dbError } = await supabase.from('receipts').insert({
      id: receipt.id,
      invoice_id: receipt.invoice_id,
      filename: fileName,
      storage_path: storagePath,
      uploaded_at: receipt.uploaded_at,
    })

    if (dbError) {
      console.error(`   ❌ Failed to save receipt metadata ${receipt.id}:`, dbError.message)
    } else {
      console.log(`   ✓ Migrated receipt ${receipt.id}: ${fileName}`)
    }
  }

  console.log(`✅ Migrated ${receipts.length} receipts\n`)
}

async function migrateSettings(db: Database.Database) {
  console.log('⚙️  Migrating settings...')

  const settings = db.prepare('SELECT * FROM settings').all() as OldSetting[]

  if (settings.length === 0) {
    console.log('   ℹ️  No settings to migrate')
    return
  }

  // Only migrate DARK_MODE setting, skip path-related settings
  const darkModeSetting = settings.find(s => s.key === 'DARK_MODE')

  if (darkModeSetting) {
    const { error } = await supabase
      .from('settings')
      .upsert({
        key: 'DARK_MODE',
        value: darkModeSetting.value,
      }, {
        onConflict: 'key'
      })

    if (error) {
      console.error('   ❌ Failed to migrate DARK_MODE setting:', error.message)
    } else {
      console.log('   ✓ Migrated DARK_MODE setting')
    }
  }

  console.log(`✅ Migrated settings\n`)
}

function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.txt': 'text/plain',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }

  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream'
}

// Run migration
main().catch(console.error)
