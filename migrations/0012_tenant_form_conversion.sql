-- =========================================================
-- TENANT FORM CONVERSION (roadmap phase 9)
-- An approved submission can be converted into a customer and
-- optionally a booking.
-- =========================================================


-- =========================================================
-- CUSTOMERS: identity fields needed for the rental contract and
-- the Spanish guest registration (RD 933/2021). sex and
-- document_type hold the tenant form option keys, '' when unknown.
-- =========================================================

ALTER TABLE customers ADD COLUMN nationality TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN sex TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN document_type TEXT NOT NULL DEFAULT '';


-- =========================================================
-- FORM SUBMISSIONS: records created from the submission.
-- Set once by the conversion; a submission is converted at most once.
-- Only here, not on form_invitations: invitation and submission are 1:1.
-- =========================================================

ALTER TABLE form_submissions ADD COLUMN customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE form_submissions ADD COLUMN booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL;
