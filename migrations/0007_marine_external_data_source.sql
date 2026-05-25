-- =========================================================
-- MARINE DATA SOURCE
-- Registers Open-Meteo current marine + forecast (sea conditions
-- for the four landing-page beaches). Runs on the same hourly cron
-- as the weather source via `src/scheduled/registry.ts`.
-- =========================================================

INSERT INTO external_data_sources (
    id, type, provider, name,
    is_active, publish_to_github, github_file_path,
    created_at, updated_at
) VALUES (
    'marine_current_costa_blanca',
    'marine_current',
    'open-meteo',
    'Current marine + forecast for Costa Blanca landing-page beaches',
    1,
    1,
    'src/data/marine/open-meteo-responses.json',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT(id) DO NOTHING;
