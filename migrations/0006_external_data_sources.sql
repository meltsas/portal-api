-- =========================================================
-- EXTERNAL DATA SOURCES
-- Registry of scheduled external data feeds (e.g. weather, etc.).
-- Each row represents one configured data source the scheduled
-- Worker can fetch on a cron tick. `latest_*` columns are an
-- always-up-to-date pointer to the most recent successful snapshot
-- for fast lookup / change detection without scanning snapshots.
-- =========================================================

CREATE TABLE IF NOT EXISTS external_data_sources (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,                                -- e.g. weather_current
    provider TEXT NOT NULL,                            -- e.g. open-meteo
    name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    publish_to_github INTEGER NOT NULL DEFAULT 0,      -- whether 8h export should pick this up
    github_file_path TEXT,                             -- target path in the SSG repo
    latest_snapshot_id TEXT,
    latest_data_hash TEXT,
    latest_updated_at TEXT,
    latest_published_commit_sha TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_external_data_sources_is_active
    ON external_data_sources(is_active);

CREATE INDEX IF NOT EXISTS idx_external_data_sources_publish
    ON external_data_sources(publish_to_github);


-- =========================================================
-- EXTERNAL DATA SNAPSHOTS
-- Append-only history of fetch attempts per source. Stores
-- normalized JSON for successful fetches, an error message for
-- failed ones, and a lightweight `skipped` row when the hash
-- matches the previous successful snapshot (kept for observability,
-- without duplicating the payload).
-- =========================================================

CREATE TABLE IF NOT EXISTS external_data_snapshots (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    status TEXT NOT NULL,                              -- success / failed / skipped
    fetched_at TEXT NOT NULL,
    data_hash TEXT,
    normalized_json TEXT,
    raw_r2_key TEXT,
    error_message TEXT,
    published_commit_sha TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES external_data_sources(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_external_data_snapshots_source_fetched_at
    ON external_data_snapshots(source_id, fetched_at);

CREATE INDEX IF NOT EXISTS idx_external_data_snapshots_status
    ON external_data_snapshots(status);


-- =========================================================
-- Initial source: Open-Meteo current weather for Costa Blanca.
-- Inserted as inactive-by-default-safe `is_active = 1` so the
-- hourly cron starts working once the migration is applied.
-- =========================================================

INSERT INTO external_data_sources (
    id, type, provider, name,
    is_active, publish_to_github, github_file_path,
    created_at, updated_at
) VALUES (
    'weather_current_costa_blanca',
    'weather_current',
    'open-meteo',
    'Current weather for Costa Blanca / nearby locations',
    1,
    1,
    'src/data/weather/open-meteo-responses.json',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT(id) DO NOTHING;
