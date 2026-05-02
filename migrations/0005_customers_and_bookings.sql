-- =========================================================
-- CUSTOMERS
-- Admin-managed customer records. Sensitive — admin-only.
-- A customer may be derived from a lead (source_lead_id),
-- but customers and leads remain independent: deleting a lead
-- must not cascade-delete a customer.
-- =========================================================

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    source_lead_id TEXT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    primary_address TEXT NOT NULL DEFAULT '',
    date_of_birth TEXT NOT NULL DEFAULT '',
    national_id_number TEXT NOT NULL DEFAULT '',
    document_number TEXT NOT NULL DEFAULT '',
    occupation TEXT NOT NULL DEFAULT '',
    employer_or_pension_info TEXT NOT NULL DEFAULT '',
    income_notes TEXT NOT NULL DEFAULT '',
    family_members_json TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_lead_id) REFERENCES leads(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_email
    ON customers(email);

CREATE INDEX IF NOT EXISTS idx_customers_source_lead_id
    ON customers(source_lead_id);

CREATE INDEX IF NOT EXISTS idx_customers_status
    ON customers(status);


-- =========================================================
-- BOOKINGS
-- Single source of truth for reserved/occupied/blocked offer
-- periods (customer stays, owner use, maintenance, blocked).
-- The legacy offer_availability table is left untouched for now.
-- A future public availability endpoint will derive unavailable
-- ranges from this table.
-- =========================================================

CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    offer_id TEXT NOT NULL,
    customer_id TEXT,
    booking_type TEXT NOT NULL DEFAULT 'customer_stay'
        CHECK (booking_type IN ('customer_stay', 'owner_use', 'maintenance', 'blocked', 'other')),
    status TEXT NOT NULL DEFAULT 'tentative'
        CHECK (status IN ('draft', 'tentative', 'confirmed', 'cancelled', 'completed')),
    date_from TEXT NOT NULL,
    date_to TEXT NOT NULL,
    reason_of_stay TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    adults INTEGER NOT NULL DEFAULT 0,
    children INTEGER NOT NULL DEFAULT 0,
    price_total_cents INTEGER,
    currency TEXT NOT NULL DEFAULT 'EUR',
    source_lead_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (date_to > date_from),
    FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (source_lead_id) REFERENCES leads(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_offer_id
    ON bookings(offer_id);

CREATE INDEX IF NOT EXISTS idx_bookings_customer_id
    ON bookings(customer_id);

CREATE INDEX IF NOT EXISTS idx_bookings_source_lead_id
    ON bookings(source_lead_id);

CREATE INDEX IF NOT EXISTS idx_bookings_dates
    ON bookings(date_from, date_to);

CREATE INDEX IF NOT EXISTS idx_bookings_offer_dates
    ON bookings(offer_id, date_from, date_to);

CREATE INDEX IF NOT EXISTS idx_bookings_status
    ON bookings(status);
