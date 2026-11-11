-- Personal deductions: charitable gifts and the home mortgage.
--
-- These are NOT business records. They belong on Schedule A of the personal
-- return (or, for cash gifts from 2026, on the non-itemizer line), never on
-- Schedule C. They get a table of their own so nothing here can leak into
-- invoices, the Summary page, or the business tax report.
--
-- One ledger holds three kinds of row, because a tax year is answered by all
-- three together:
--   payment   - money that moved on a date: one gift, one mortgage payment
--   statement - the payee's own total for a year: a charity's annual giving
--               statement, the lender's Form 1098. When one exists it is the
--               figure to file, and the payments are checked against it.
--   document  - paperwork worth keeping that carries no amount to total:
--               a closing disclosure, an escrow letter.

CREATE TABLE personal_deductions (
    id BIGSERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    record_type TEXT NOT NULL DEFAULT 'payment'
        CHECK (record_type IN ('payment', 'statement', 'document')),
    payee TEXT NOT NULL,
    payee_tax_id TEXT,
    record_date DATE NOT NULL,
    tax_year INTEGER NOT NULL CHECK (tax_year BETWEEN 2000 AND 2100),
    amount NUMERIC(12, 2),
    reference TEXT,
    payment_method TEXT,
    description TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    counted BOOLEAN NOT NULL DEFAULT TRUE,
    notes TEXT,
    filename TEXT,
    storage_path TEXT,
    source TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE personal_deductions IS 'Personal (non-business) tax records: charitable gifts and home mortgage paperwork. Never part of Schedule C.';
COMMENT ON COLUMN personal_deductions.category IS 'Key from lib/personalDeductions.ts: charity_cash, charity_noncash, mortgage, property_tax.';
COMMENT ON COLUMN personal_deductions.record_date IS 'Date of the gift or payment, or the date printed on a statement or document.';
COMMENT ON COLUMN personal_deductions.tax_year IS 'Year the amount belongs to. A statement dated January 2026 covers tax year 2025, so this is stored rather than derived.';
COMMENT ON COLUMN personal_deductions.amount IS 'The deductible figure: the gift, the interest part of a mortgage payment, or the statement total. Null when the row is paperwork only.';
COMMENT ON COLUMN personal_deductions.details IS 'Extra figures by kind. Mortgage payment: principal, escrow, total_paid, balance. Form 1098: points, property_tax, outstanding_principal. Loan paperwork: loan {principal, annual_rate, term_months, first_payment_date, closing_date, prepaid_interest}. Charity: no_goods_statement.';
COMMENT ON COLUMN personal_deductions.counted IS 'False keeps the file but leaves the row out of every total: a voided receipt, a superseded draft.';
COMMENT ON COLUMN personal_deductions.source IS 'Where an imported row came from, e.g. gmail:<message id>. Unique, so an import can be re-run safely.';

CREATE INDEX idx_personal_deductions_year ON personal_deductions(tax_year);
CREATE INDEX idx_personal_deductions_category ON personal_deductions(category);

CREATE TRIGGER update_personal_deductions_updated_at
    BEFORE UPDATE ON personal_deductions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE personal_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users full access to personal_deductions"
    ON personal_deductions FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Whether these deductions help at all depends on filing status, and that can
-- change from one year to the next, so it lives with the tax year.
ALTER TABLE tax_years ADD COLUMN filing_status TEXT;

COMMENT ON COLUMN tax_years.filing_status IS 'Personal filing status for the year: single, married_joint, married_separate or head_of_household. Sets the standard deduction that itemized deductions are compared against.';
