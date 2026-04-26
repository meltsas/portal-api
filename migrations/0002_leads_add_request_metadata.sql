-- Adds client request metadata captured on POST /api/leads.
-- Both columns are nullable so existing rows remain valid.

ALTER TABLE leads ADD COLUMN remote_ip TEXT;
ALTER TABLE leads ADD COLUMN user_agent TEXT;
