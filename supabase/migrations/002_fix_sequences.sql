-- Fix sequences after data migration
-- This resets all auto-increment sequences to start after the highest existing ID

-- Fix invoices sequence
SELECT setval('invoices_id_seq', COALESCE((SELECT MAX(id) FROM invoices), 0) + 1, false);

-- Fix line_items sequence
SELECT setval('line_items_id_seq', COALESCE((SELECT MAX(id) FROM line_items), 0) + 1, false);

-- Fix receipts sequence
SELECT setval('receipts_id_seq', COALESCE((SELECT MAX(id) FROM receipts), 0) + 1, false);

-- Fix settings sequence
SELECT setval('settings_id_seq', COALESCE((SELECT MAX(id) FROM settings), 0) + 1, false);
