-- Personal tax forms, and documents known to exist that are not on file yet.
--
-- 014 gave charitable gifts and the mortgage a ledger. A personal return
-- draws on more paperwork than that: a W-2, a 1098-E for student loan
-- interest, retirement account forms, estimated tax payments. They are the
-- same shape of record (who it came from, the year, one figure that matters,
-- a few supporting figures, a file), so they go in the same table. The table
-- keeps its name; it now holds every personal tax record, not only the
-- deductions.

ALTER TABLE personal_deductions
    ADD COLUMN form TEXT,
    ADD COLUMN expected BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON TABLE personal_deductions IS 'Personal (non-business) tax records: charitable gifts, home mortgage paperwork, and tax forms such as W-2, 1098-E, 5498 and 1099-R. Never part of Schedule C.';
COMMENT ON COLUMN personal_deductions.category IS 'Key from lib/personalKinds.ts, e.g. charity_cash, mortgage, student_loan, retirement, wages.';
COMMENT ON COLUMN personal_deductions.form IS 'Which tax form the row is, e.g. 1098-E, W-2, 1099-R. One of the kinds lib/personalKinds.ts lists for the category; null for a plain receipt.';
COMMENT ON COLUMN personal_deductions.expected IS 'True when the document is known to exist (an email said it is ready, an employer implies it) but is not on file yet. Never counted; listed as still to get.';
COMMENT ON COLUMN personal_deductions.details IS 'Extra figures by kind, keyed as in DETAIL_FIELDS in lib/personalKinds.ts (principal, escrow, federal_withheld, taxable_amount, ...). Also: loan {principal, annual_rate, term_months, first_payment_date, closing_date, prepaid_interest} on loan paperwork, and no_goods_statement on charity documents.';

-- Statements recorded before forms had names.
UPDATE personal_deductions
SET form = 'giving-statement'
WHERE form IS NULL AND record_type = 'statement' AND category IN ('charity_cash', 'charity_noncash');

UPDATE personal_deductions
SET form = '1098'
WHERE form IS NULL AND record_type = 'statement' AND category = 'mortgage';

CREATE INDEX idx_personal_deductions_form ON personal_deductions(form);
