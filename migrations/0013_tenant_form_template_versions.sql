-- =========================================================
-- TENANT FORM TEMPLATE VERSIONS (roadmap phase 12)
-- The admin changes the form structure in a draft copy of a
-- version and publishes it. These columns show where a version
-- came from, who created and published it, and guard against two
-- admins saving the same draft at once.
-- =========================================================

ALTER TABLE form_templates ADD COLUMN based_on_template_id TEXT REFERENCES form_templates(id);
ALTER TABLE form_templates ADD COLUMN created_by_email TEXT;
ALTER TABLE form_templates ADD COLUMN activated_at TEXT;
ALTER TABLE form_templates ADD COLUMN activated_by_email TEXT;

-- Increased by every structure save and by activation; a save or activation names the revision it was based on.
ALTER TABLE form_templates ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
