-- Add OCR extracted data columns to receipts table
-- Stores parsed receipt information from AI vision analysis

ALTER TABLE receipts
ADD COLUMN ocr_processed BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN ocr_data JSONB,
ADD COLUMN ocr_error TEXT;

-- Add index for querying processed receipts
CREATE INDEX idx_receipts_ocr_processed ON receipts(ocr_processed);

-- Add comment explaining the columns
COMMENT ON COLUMN receipts.ocr_processed IS 'Indicates if receipt has been processed by OCR';
COMMENT ON COLUMN receipts.ocr_data IS 'Extracted receipt data in JSON format: {merchant, total, tax, items: [{name, price}]}';
COMMENT ON COLUMN receipts.ocr_error IS 'Error message if OCR processing failed';
