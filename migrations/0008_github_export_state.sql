-- =========================================================
-- GITHUB EXPORT STATE
-- One row per (repo, branch) tracking the smart GitHub export's
-- most recent successful publish + the last attempt's outcome.
--
-- `latest_*` fields are only updated on a successful commit.
-- `last_attempt_at` / `last_status` / `last_error` track every
-- non-skipped attempt (success or failure) so operators can spot
-- silently-broken exports without scanning Worker logs.
--
-- Skipped runs (outside publish window, unchanged hash, disabled,
-- dry-run) do NOT write to this table — they're observability-only
-- via Worker logs.
-- =========================================================

CREATE TABLE IF NOT EXISTS github_export_state (
    id TEXT PRIMARY KEY,
    repo TEXT NOT NULL,
    branch TEXT NOT NULL,
    latest_export_hash TEXT,
    latest_commit_sha TEXT,
    latest_exported_at TEXT,
    last_attempt_at TEXT,
    last_status TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(repo, branch)
);

CREATE INDEX IF NOT EXISTS idx_github_export_state_repo_branch
    ON github_export_state(repo, branch);
