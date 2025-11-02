-- Add 'waived' column to invoices table
-- This allows marking invoices as waived (work done but not counted toward income)

ALTER TABLE invoices
ADD COLUMN waived BOOLEAN NOT NULL DEFAULT FALSE;

-- Add comment explaining the column
COMMENT ON COLUMN invoices.waived IS 'Indicates if invoice is waived (work done but not paid/counted toward income)';

-- Create index for filtering waived invoices
CREATE INDEX idx_invoices_waived ON invoices(waived);
