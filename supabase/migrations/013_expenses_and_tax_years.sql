-- Turn receipts into an expense ledger, and give each tax year a home.
--
-- Until now a receipt was a file pinned to an invoice: no amount, no date of
-- its own, no category. The app therefore could not say what the business
-- spent in a year; it only knew what was billed to the client. These columns
-- hold what the receipt actually represents, and receipts no longer need an
-- invoice at all, so costs that were never billed (phone, software kept for
-- yourself) can be recorded too.

ALTER TABLE receipts
    ALTER COLUMN invoice_id DROP NOT NULL,
    ALTER COLUMN filename DROP NOT NULL,
    ALTER COLUMN storage_path DROP NOT NULL,
    ADD COLUMN amount NUMERIC(12, 2),
    ADD COLUMN expense_date DATE,
    ADD COLUMN category TEXT,
    ADD COLUMN vendor TEXT,
    ADD COLUMN notes TEXT,
    ADD COLUMN reimbursed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN receipts.amount IS 'What was actually paid, from the receipt. Null until entered.';
COMMENT ON COLUMN receipts.expense_date IS 'Date on the receipt. Decides the tax year, not the upload date.';
COMMENT ON COLUMN receipts.category IS 'Expense category key; see lib/taxCategories.ts for the Schedule C mapping.';
COMMENT ON COLUMN receipts.reimbursed IS 'True when the cost was billed on to a client; it then appears in income as well.';

-- Start from whatever OCR already read. Only numeric totals are trusted;
-- free-text dates are left for the user, seeded from the invoice date.
UPDATE receipts
SET amount = (ocr_data->>'total')::numeric
WHERE amount IS NULL
  AND ocr_data->>'total' ~ '^[0-9]+(\.[0-9]+)?$'
  AND (ocr_data->>'total')::numeric > 0;

UPDATE receipts
SET vendor = NULLIF(trim(ocr_data->>'merchant'), '')
WHERE vendor IS NULL AND ocr_data IS NOT NULL;

UPDATE receipts r
SET expense_date = i.date
FROM invoices i
WHERE r.invoice_id = i.id AND r.expense_date IS NULL;

CREATE INDEX idx_receipts_expense_date ON receipts(expense_date);
CREATE INDEX idx_receipts_category ON receipts(category);

-- One row per tax year: the 1099 figure the client reported, and notes.
CREATE TABLE tax_years (
    year INTEGER PRIMARY KEY,
    form_1099_nec NUMERIC(12, 2),
    notes TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_tax_years_updated_at
    BEFORE UPDATE ON tax_years
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE tax_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users full access to tax_years"
    ON tax_years FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE tax_years IS 'Per-year tax inputs that come from outside the app, such as the 1099-NEC amount a client reported.';
