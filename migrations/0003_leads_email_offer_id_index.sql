-- Supports POST /api/leads dedup lookup:
-- locate an existing non-archived lead for (email, offer_id) and update it
-- in place rather than insert a new row.

CREATE INDEX IF NOT EXISTS idx_leads_email_offer_id
    ON leads(email, offer_id);
