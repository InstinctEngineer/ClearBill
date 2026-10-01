-- Defaults for a new line item row, editable from the Settings page.
--
-- The grid's blank entry row used to start from hardcoded values: the invoice
-- date, LABOR, and empty quantity and rate. Those are now settings, so the
-- fields filled in the same way on every row arrive pre-filled.
--
-- Seeded to match the previous behaviour except for the date, which now
-- follows today rather than the invoice.

INSERT INTO settings (key, value) VALUES
    ('LINE_ITEM_DEFAULT_DATE_MODE',        'today'),
    ('LINE_ITEM_DEFAULT_DESCRIPTION',      ''),
    ('LINE_ITEM_DEFAULT_TYPE',             'LABOR'),
    ('LINE_ITEM_DEFAULT_QUANTITY',         '1'),
    ('LINE_ITEM_DEFAULT_RATE',             ''),
    ('LINE_ITEM_DEFAULT_DISCOUNT',         ''),
    ('LINE_ITEM_DEFAULT_DISCOUNT_REASON',  ''),
    ('LINE_ITEM_DEFAULT_CLIENT_PAYS',      'true'),
    ('LINE_ITEM_DEFAULT_APPLIES_TO_DEBT',  'false')
ON CONFLICT (key) DO NOTHING;
