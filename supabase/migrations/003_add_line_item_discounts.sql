-- Add discount fields to line_items table
ALTER TABLE line_items
ADD COLUMN discount_percentage DECIMAL(5,2) DEFAULT 0,
ADD COLUMN discount_reason TEXT;

-- Add check constraint to ensure discount is between 0 and 100
ALTER TABLE line_items
ADD CONSTRAINT check_discount_percentage
CHECK (discount_percentage >= 0 AND discount_percentage <= 100);
