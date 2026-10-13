-- =========================================================
-- TENANT DETAILS FORMS
-- Invitation-based tenant questionnaire replacing Google Forms.
-- Plan: non-touristic-rentals/docs/seasona-rental-details-form/roadmap.md §4
-- =========================================================


-- =========================================================
-- FORM TEMPLATES
-- A template version's structure (sections, fields, options) is immutable
-- once used; a structural change creates a new version. Texts are editable
-- in place via form_translations.
-- =========================================================

CREATE TABLE IF NOT EXISTS form_templates (
    id TEXT PRIMARY KEY,
    template_key TEXT NOT NULL,
    version INTEGER NOT NULL,
    base_language TEXT NOT NULL DEFAULT 'en',
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'archived')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (template_key, version)
);

CREATE TABLE IF NOT EXISTS form_sections (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    section_key TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    UNIQUE (template_id, section_key),
    FOREIGN KEY (template_id) REFERENCES form_templates(id) ON DELETE CASCADE
);

-- parent_field_id is set for the item fields of a guest_list field.
-- Item field keys are unique within their parent, top-level keys within the template.
CREATE TABLE IF NOT EXISTS form_fields (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    parent_field_id TEXT,
    field_key TEXT NOT NULL,
    field_type TEXT NOT NULL,
    is_required INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL,
    validation_json TEXT NOT NULL DEFAULT '{}',
    visible_if_json TEXT,
    FOREIGN KEY (template_id) REFERENCES form_templates(id) ON DELETE CASCADE,
    FOREIGN KEY (section_id) REFERENCES form_sections(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_field_id) REFERENCES form_fields(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_form_fields_top_level_key
    ON form_fields(template_id, field_key) WHERE parent_field_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_form_fields_item_key
    ON form_fields(parent_field_id, field_key) WHERE parent_field_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_form_fields_section_id
    ON form_fields(section_id);

CREATE TABLE IF NOT EXISTS form_field_options (
    id TEXT PRIMARY KEY,
    field_id TEXT NOT NULL,
    option_key TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    allows_free_text INTEGER NOT NULL DEFAULT 0,
    UNIQUE (field_id, option_key),
    FOREIGN KEY (field_id) REFERENCES form_fields(id) ON DELETE CASCADE
);

-- One row per (template, language, text key). Missing non-base texts fall back to the base language.
CREATE TABLE IF NOT EXISTS form_translations (
    template_id TEXT NOT NULL,
    language TEXT NOT NULL,
    text_key TEXT NOT NULL,
    text TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_email TEXT,
    PRIMARY KEY (template_id, language, text_key),
    FOREIGN KEY (template_id) REFERENCES form_templates(id) ON DELETE CASCADE
);


-- =========================================================
-- FORM INVITATIONS
-- Only the SHA-256 hash of the raw link token is stored.
-- 'expired' is derived from expires_at, never stored.
-- =========================================================

CREATE TABLE IF NOT EXISTS form_invitations (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    offer_id TEXT NOT NULL,
    language TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'opened', 'submitted', 'revoked')),
    expires_at TEXT NOT NULL,
    google_subject TEXT,
    google_email TEXT,
    lead_id TEXT,
    created_by_email TEXT NOT NULL,
    opened_at TEXT,
    authenticated_at TEXT,
    submitted_at TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (template_id) REFERENCES form_templates(id),
    FOREIGN KEY (offer_id) REFERENCES offers(id),
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_form_invitations_status
    ON form_invitations(status);

CREATE INDEX IF NOT EXISTS idx_form_invitations_offer_id
    ON form_invitations(offer_id);

CREATE INDEX IF NOT EXISTS idx_form_invitations_created_at
    ON form_invitations(created_at);

CREATE INDEX IF NOT EXISTS idx_form_invitations_lead_id
    ON form_invitations(lead_id);


-- =========================================================
-- FORM SUBMISSIONS
-- values_json holds field_key -> value. Name and dates are copied
-- into columns for listing.
-- =========================================================

CREATE TABLE IF NOT EXISTS form_submissions (
    id TEXT PRIMARY KEY,
    invitation_id TEXT NOT NULL UNIQUE,
    template_id TEXT NOT NULL,
    language TEXT NOT NULL,
    google_subject TEXT NOT NULL,
    google_email TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    phone TEXT NOT NULL,
    full_name TEXT NOT NULL,
    planned_arrival TEXT,
    planned_departure TEXT,
    values_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'approved', 'rejected', 'archived')),
    reviewed_by_email TEXT,
    reviewed_at TEXT,
    review_notes TEXT,
    documents_delete_after TEXT,
    documents_deleted_at TEXT,
    remote_ip TEXT,
    user_agent TEXT,
    submitted_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invitation_id) REFERENCES form_invitations(id),
    FOREIGN KEY (template_id) REFERENCES form_templates(id)
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_status
    ON form_submissions(status);

CREATE INDEX IF NOT EXISTS idx_form_submissions_submitted_at
    ON form_submissions(submitted_at);

-- File metadata only. The file itself lives in the private R2 bucket under r2_key;
-- r2_key is built from ids only, never from the original file name.
CREATE TABLE IF NOT EXISTS form_submission_files (
    id TEXT PRIMARY KEY,
    invitation_id TEXT NOT NULL,
    submission_id TEXT,
    field_key TEXT NOT NULL,
    r2_key TEXT NOT NULL UNIQUE,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'uploaded'
        CHECK (status IN ('uploaded', 'attached', 'deleted')),
    uploaded_at TEXT NOT NULL,
    deleted_at TEXT,
    FOREIGN KEY (invitation_id) REFERENCES form_invitations(id),
    FOREIGN KEY (submission_id) REFERENCES form_submissions(id)
);

CREATE INDEX IF NOT EXISTS idx_form_submission_files_invitation_id
    ON form_submission_files(invitation_id);

CREATE INDEX IF NOT EXISTS idx_form_submission_files_submission_id
    ON form_submission_files(submission_id);

CREATE INDEX IF NOT EXISTS idx_form_submission_files_status
    ON form_submission_files(status);


-- =========================================================
-- FORM EVENTS
-- Audit trail per invitation. metadata_json must never contain
-- personal data or file links.
-- =========================================================

CREATE TABLE IF NOT EXISTS form_events (
    id TEXT PRIMARY KEY,
    invitation_id TEXT,
    submission_id TEXT,
    file_id TEXT,
    event_type TEXT NOT NULL,
    actor_type TEXT NOT NULL
        CHECK (actor_type IN ('admin', 'tenant', 'system')),
    actor_ref TEXT,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invitation_id) REFERENCES form_invitations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_form_events_invitation_created
    ON form_events(invitation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_form_events_event_type
    ON form_events(event_type);
