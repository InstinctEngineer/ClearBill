-- Setup storage bucket for receipt uploads
-- This creates the receipts bucket and configures RLS policies

-- Create storage bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Add storage policies for authenticated users

-- Policy 1: Allow authenticated users to upload receipts
CREATE POLICY IF NOT EXISTS "Allow authenticated users to upload receipts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'receipts');

-- Policy 2: Allow authenticated users to view receipts
CREATE POLICY IF NOT EXISTS "Allow authenticated users to view receipts"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'receipts');

-- Policy 3: Allow authenticated users to delete receipts
CREATE POLICY IF NOT EXISTS "Allow authenticated users to delete receipts"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'receipts');

-- Add comment
COMMENT ON POLICY "Allow authenticated users to upload receipts" ON storage.objects
IS 'Allows authenticated users to upload receipt files to the receipts bucket';

COMMENT ON POLICY "Allow authenticated users to view receipts" ON storage.objects
IS 'Allows authenticated users to view receipt files from the receipts bucket';

COMMENT ON POLICY "Allow authenticated users to delete receipts" ON storage.objects
IS 'Allows authenticated users to delete receipt files from the receipts bucket';
