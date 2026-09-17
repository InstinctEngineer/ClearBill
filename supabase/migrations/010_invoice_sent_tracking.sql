-- Track when an invoice was emailed from the app (Send Invoice button).
ALTER TABLE invoices
ADD COLUMN sent_at TIMESTAMPTZ,
ADD COLUMN sent_to TEXT;

COMMENT ON COLUMN invoices.sent_at IS 'When the invoice was last emailed from ClearBill';
COMMENT ON COLUMN invoices.sent_to IS 'Recipients the invoice was last emailed to';
