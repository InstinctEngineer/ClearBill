-- Add 'client_pays' column to line_items table
-- This indicates whether the client is being charged for the item (income) or if you're covering it (expense)

ALTER TABLE line_items
ADD COLUMN client_pays BOOLEAN NOT NULL DEFAULT TRUE;

-- Add comment explaining the column
COMMENT ON COLUMN line_items.client_pays IS 'Indicates if client pays for this item (income) or if you cover it (expense). Always true for LABOR, optional for HARDWARE/OTHER.';

-- Create index for filtering by payment responsibility
CREATE INDEX idx_line_items_client_pays ON line_items(client_pays);
