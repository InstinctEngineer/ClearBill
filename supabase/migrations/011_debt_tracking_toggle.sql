-- Make debt repayment tracking an opt-in feature instead of an always-on one.
--
-- 004 seeded DEBT_TOTAL = 1000.00, and every renderer gated the debt block on
-- `DEBT_TOTAL > 0`. That made the block unconditional: it printed on every
-- invoice, PDF and Excel export with no way to turn it off once the debt was
-- settled. The switch now lives in its own setting, defaulted to off.

INSERT INTO settings (key, value)
VALUES ('DEBT_TRACKING_ENABLED', 'false')
ON CONFLICT (key) DO NOTHING;

-- Existing installs keep their DEBT_TOTAL figure and their applies_to_debt
-- history; the feature is simply hidden until it is switched back on.

COMMENT ON COLUMN line_items.applies_to_debt IS
  'Counts this line item''s discount toward debt repayment. Only surfaced when the DEBT_TRACKING_ENABLED setting is true.';
