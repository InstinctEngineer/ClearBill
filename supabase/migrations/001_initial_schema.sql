-- Invoice Tracker Database Schema
-- Run this SQL in your Supabase SQL Editor

-- Create enum for item types
CREATE TYPE item_type AS ENUM ('LABOR', 'HARDWARE', 'OTHER');

-- Create invoices table
CREATE TABLE invoices (
    id BIGSERIAL PRIMARY KEY,
    project_name VARCHAR(100) NOT NULL,
    client VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    tax_rate DECIMAL(5,2) NOT NULL,
    paid BOOLEAN NOT NULL DEFAULT false,
    paid_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create line_items table
CREATE TABLE line_items (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description VARCHAR(200) NOT NULL,
    quantity DECIMAL(10,2) NOT NULL,
    unit_rate DECIMAL(10,2) NOT NULL,
    item_type item_type NOT NULL,
    date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create receipts table
CREATE TABLE receipts (
    id BIGSERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    storage_path TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create settings table
CREATE TABLE settings (
    id BIGSERIAL PRIMARY KEY,
    key VARCHAR(255) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_invoices_date ON invoices(date DESC);
CREATE INDEX idx_invoices_paid ON invoices(paid);
CREATE INDEX idx_invoices_client ON invoices(client);
CREATE INDEX idx_line_items_invoice_id ON line_items(invoice_id);
CREATE INDEX idx_line_items_date ON line_items(date);
CREATE INDEX idx_receipts_invoice_id ON receipts(invoice_id);
CREATE INDEX idx_settings_key ON settings(key);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (authenticated users can do everything)
-- Since this is a single-user app, we'll keep policies simple
CREATE POLICY "Allow authenticated users full access to invoices"
    ON invoices FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to line_items"
    ON line_items FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to receipts"
    ON receipts FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to settings"
    ON settings FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
    ('DARK_MODE', 'false'),
    ('APP_VERSION', '2.0.0'),
    ('MIGRATION_DATE', NOW()::TEXT)
ON CONFLICT (key) DO NOTHING;

-- Create a view for invoice summaries with calculated fields
CREATE OR REPLACE VIEW invoice_summaries AS
SELECT
    i.id,
    i.project_name,
    i.client,
    i.date,
    i.tax_rate,
    i.paid,
    i.paid_date,
    i.created_at,
    i.updated_at,
    COALESCE(SUM(li.quantity * li.unit_rate), 0) AS subtotal,
    ROUND(COALESCE(SUM(li.quantity * li.unit_rate), 0) * (i.tax_rate / 100), 2) AS tax_set_aside,
    COALESCE(SUM(li.quantity * li.unit_rate), 0) AS total,
    i.date + INTERVAL '30 days' AS due_date,
    CASE
        WHEN i.paid THEN 0
        ELSE GREATEST(0, CURRENT_DATE - (i.date + INTERVAL '30 days')::DATE)
    END AS days_overdue,
    CASE
        WHEN i.paid THEN 'Paid'
        WHEN CURRENT_DATE <= i.date + INTERVAL '30 days' THEN 'Current'
        WHEN CURRENT_DATE <= i.date + INTERVAL '60 days' THEN 'Overdue'
        WHEN CURRENT_DATE <= i.date + INTERVAL '90 days' THEN 'Critical'
        ELSE 'Severely Overdue'
    END AS overdue_status,
    COUNT(DISTINCT li.id) AS line_item_count,
    COUNT(DISTINCT r.id) AS receipt_count
FROM invoices i
LEFT JOIN line_items li ON i.id = li.invoice_id
LEFT JOIN receipts r ON i.id = r.invoice_id
GROUP BY i.id, i.project_name, i.client, i.date, i.tax_rate, i.paid, i.paid_date, i.created_at, i.updated_at;

-- Grant access to the view
GRANT SELECT ON invoice_summaries TO authenticated;

COMMENT ON TABLE invoices IS 'Main invoices table storing invoice header information';
COMMENT ON TABLE line_items IS 'Individual line items for each invoice (labor, hardware, other costs)';
COMMENT ON TABLE receipts IS 'Receipt file references stored in Supabase Storage';
COMMENT ON TABLE settings IS 'Application settings stored as key-value pairs';
COMMENT ON VIEW invoice_summaries IS 'Computed view with invoice totals and status calculations';
