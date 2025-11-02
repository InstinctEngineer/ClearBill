# Supabase Setup Guide

This guide will walk you through setting up your Supabase project for the Invoice Tracker application.

## Prerequisites

- A Supabase account (sign up at [supabase.com](https://supabase.com))
- Your Supabase project created
- Your Supabase URL, Anon Key, and Service Role Key ready

## Step 1: Configure Environment Variables

1. Copy your Supabase credentials
2. Open `.env.local` in the root of this project
3. Replace the placeholder values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Step 2: Create Database Schema

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor** (in the left sidebar)
3. Click **New Query**
4. Copy the entire contents of `supabase/migrations/001_initial_schema.sql`
5. Paste it into the SQL Editor
6. Click **Run** (or press Ctrl+Enter)

This will create:
- ✅ 4 tables: `invoices`, `line_items`, `receipts`, `settings`
- ✅ Indexes for performance
- ✅ Row Level Security (RLS) policies
- ✅ Automatic timestamp updates
- ✅ A computed view for invoice summaries

## Step 3: Set Up Storage Bucket for Receipts

1. In your Supabase Dashboard, navigate to **Storage** (in the left sidebar)
2. Click **New Bucket**
3. Configure the bucket:
   - **Name**: `receipts`
   - **Public bucket**: Toggle **OFF** (receipts should be private)
   - **File size limit**: 16 MB (or your preference)
   - **Allowed MIME types**: Leave empty (allow all) or restrict to `application/pdf,image/*`
4. Click **Create Bucket**

### Configure Storage Policies

After creating the bucket, you need to set up access policies:

1. Click on the `receipts` bucket
2. Go to **Policies** tab
3. Click **New Policy**
4. Create a policy for **SELECT** (read access):
   ```
   Policy name: Allow authenticated users to read receipts
   Target roles: authenticated
   Policy definition:

   WITH CHECK (true)
   USING (true)
   ```
5. Click **Save**
6. Repeat for **INSERT**, **UPDATE**, and **DELETE** operations

Or use this SQL in the SQL Editor to create all policies at once:

```sql
-- Storage policies for receipts bucket
CREATE POLICY "Allow authenticated users to upload receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Allow authenticated users to read receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'receipts');

CREATE POLICY "Allow authenticated users to update receipts"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'receipts')
WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "Allow authenticated users to delete receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'receipts');
```

## Step 4: Set Up Authentication

### Create Your User Account

1. In Supabase Dashboard, go to **Authentication** → **Users**
2. Click **Add User** → **Create new user**
3. Enter your email and password
4. Click **Create user**
5. Check your email and confirm your account (if email confirmation is enabled)

### Configure Auth Settings (Optional)

1. Go to **Authentication** → **Policies**
2. For a single-user app, you can disable public sign-ups:
   - Go to **Authentication** → **Settings**
   - Under **Auth Providers**, disable **Enable Email Signup**
   - This prevents others from creating accounts

## Step 5: Verify Setup

Run these queries in the SQL Editor to verify everything is set up correctly:

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('invoices', 'line_items', 'receipts', 'settings');

-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('invoices', 'line_items', 'receipts', 'settings');

-- Check settings were inserted
SELECT * FROM settings;

-- Check storage bucket exists
SELECT * FROM storage.buckets WHERE name = 'receipts';
```

Expected results:
- ✅ All 4 tables should be listed
- ✅ All tables should have `rowsecurity = true`
- ✅ Settings table should have 3 default rows
- ✅ Storage bucket `receipts` should exist

## Step 6: Test the Connection

1. Save your `.env.local` file with the correct credentials
2. Run the development server:
   ```bash
   npm run dev
   ```
3. Open [http://localhost:3000](http://localhost:3000)
4. You should be redirected to the login page
5. Log in with the email/password you created in Step 4

## Troubleshooting

### "Invalid API key" error
- Double-check your `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`
- Make sure there are no extra spaces or quotes

### "relation does not exist" error
- Make sure you ran the SQL migration script successfully
- Check the SQL Editor for any error messages

### Can't upload files
- Verify the storage bucket named `receipts` exists
- Check that storage policies are created correctly
- Make sure the bucket is NOT public

### Can't log in
- Verify you created a user in Authentication → Users
- Check that the email is confirmed
- Try resetting your password

### RLS policy errors
- Make sure Row Level Security is enabled on all tables
- Verify policies exist with: `SELECT * FROM pg_policies WHERE schemaname = 'public';`

## Database Schema Overview

```
invoices
├── id (bigserial, primary key)
├── project_name (varchar 100)
├── client (varchar 100)
├── date (date)
├── tax_rate (decimal)
├── paid (boolean)
├── paid_date (date, nullable)
├── created_at (timestamptz)
└── updated_at (timestamptz)

line_items
├── id (bigserial, primary key)
├── invoice_id (bigint, foreign key → invoices.id)
├── description (varchar 200)
├── quantity (decimal)
├── unit_rate (decimal)
├── item_type (enum: LABOR, HARDWARE, OTHER)
├── date (date)
└── created_at (timestamptz)

receipts
├── id (bigserial, primary key)
├── invoice_id (bigint, foreign key → invoices.id)
├── filename (varchar 255)
├── storage_path (text)
└── uploaded_at (timestamptz)

settings
├── id (bigserial, primary key)
├── key (varchar 255, unique)
├── value (text)
├── created_at (timestamptz)
└── updated_at (timestamptz)
```

## Next Steps

Once Supabase is configured:
1. Run the data migration script to import your existing data
2. Test all features in the new application
3. Deploy to Vercel

---

**Need Help?** Check the [Supabase Documentation](https://supabase.com/docs) or the project README.
