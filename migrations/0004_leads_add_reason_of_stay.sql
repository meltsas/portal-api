-- Adds optional reason_of_stay text captured on POST /api/leads
-- and POST /api/admin/leads. Nullable so existing rows remain valid.

ALTER TABLE leads ADD COLUMN reason_of_stay TEXT;
