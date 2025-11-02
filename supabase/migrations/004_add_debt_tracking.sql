-- Add debt tracking field to line_items
ALTER TABLE line_items
ADD COLUMN applies_to_debt BOOLEAN DEFAULT false;

-- Create settings for debt tracking
INSERT INTO settings (key, value)
VALUES ('DEBT_TOTAL', '1000.00')
ON CONFLICT (key) DO UPDATE SET value = '1000.00';

-- Create a view to calculate total debt repaid
CREATE OR REPLACE VIEW debt_repayment_summary AS
SELECT
  SUM(
    (li.quantity * li.unit_rate) -
    (li.quantity * li.unit_rate * (1 - li.discount_percentage / 100))
  ) as total_repaid,
  COUNT(*) as discount_count
FROM line_items li
WHERE li.applies_to_debt = true
  AND li.discount_percentage > 0;
