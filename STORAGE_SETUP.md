# Supabase Storage Setup for Receipt Uploads

The receipt upload feature requires a Supabase Storage bucket to be configured. Follow these steps to set it up:

## Steps to Create Storage Bucket

1. **Go to your Supabase Dashboard**
   - Navigate to https://supabase.com/dashboard
   - Select your Invoice Tracker project

2. **Open Storage Section**
   - Click on "Storage" in the left sidebar
   - Click on "Create a new bucket"

3. **Create the Receipts Bucket**
   - **Bucket Name:** `receipts`
   - **Public bucket:** Leave **UNCHECKED** (private bucket for security)
   - Click "Create bucket"

4. **Configure Storage Policies**

   After creating the bucket, you need to add Row Level Security (RLS) policies to allow authenticated users to upload, view, and delete receipts.

   Go to the "Policies" tab for the receipts bucket and add these policies:

   ### Policy 1: Allow authenticated users to upload receipts
   ```sql
   CREATE POLICY "Allow authenticated users to upload receipts"
   ON storage.objects
   FOR INSERT
   TO authenticated
   WITH CHECK (bucket_id = 'receipts');
   ```

   ### Policy 2: Allow authenticated users to view receipts
   ```sql
   CREATE POLICY "Allow authenticated users to view receipts"
   ON storage.objects
   FOR SELECT
   TO authenticated
   USING (bucket_id = 'receipts');
   ```

   ### Policy 3: Allow authenticated users to delete receipts
   ```sql
   CREATE POLICY "Allow authenticated users to delete receipts"
   ON storage.objects
   FOR DELETE
   TO authenticated
   USING (bucket_id = 'receipts');
   ```

## Alternatively: Use SQL Editor

You can also create the bucket and policies using SQL by running this in the Supabase SQL Editor:

```sql
-- Create storage bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Add storage policies
CREATE POLICY IF NOT EXISTS "Allow authenticated users to upload receipts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'receipts');

CREATE POLICY IF NOT EXISTS "Allow authenticated users to view receipts"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'receipts');

CREATE POLICY IF NOT EXISTS "Allow authenticated users to delete receipts"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'receipts');
```

## Verify Setup

After setting up the storage bucket:

1. Go to an invoice detail page in your app
2. Try uploading a receipt file
3. If it works, you'll see the receipt appear in the receipts list
4. You should be able to view and delete receipts

## File Organization

Receipts are automatically organized in storage by:
- Invoice ID
- Year
- Month

Example path: `invoices/123/2025/01/1735843200000_receipt.pdf`

## File Size Limit

- Maximum file size: **16 MB**
- This can be adjusted in `/app/api/invoices/[id]/receipts/route.ts` if needed

## Troubleshooting

### Error: "Failed to upload file"
- Check that the `receipts` bucket exists in Storage
- Verify storage policies are configured correctly
- Check browser console for specific error messages

### Error: "Unauthorized"
- Make sure you're logged in
- Check that your session hasn't expired

### Error: "File too large"
- Reduce file size to under 16 MB
- Consider compressing images before upload
