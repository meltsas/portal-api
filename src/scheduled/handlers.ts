import { DATA_SOURCES } from './registry';
import { runDataSourceFetch } from './runFetch';

/**
 * Cron entry points. Wired up from `src/index.ts` and matched on
 * `controller.cron`. Keep the cron expressions in sync with `wrangler.jsonc`.
 */

export const CRON_HOURLY_FETCH = '7 * * * *';
export const CRON_GITHUB_EXPORT_PLACEHOLDER = '0 */8 * * *';

/**
 * Hourly cron: iterate every registered data source and fetch + persist.
 * One source's failure does not abort the others.
 */
export async function runHourlyFetch(env: Env): Promise<void> {
	for (const definition of DATA_SOURCES) {
		try {
			const result = await runDataSourceFetch(env, definition);
			console.log(`[scheduled] hourly ${definition.provider}:${definition.id} -> ${result.status}`);
		} catch (err) {
			// runDataSourceFetch already records `failed` snapshots for fetch errors;
			// this catch only covers truly unexpected errors (e.g. D1 outages).
			const message = err instanceof Error ? err.message : String(err);
			console.error(`[scheduled] hourly ${definition.provider}:${definition.id} unexpected error: ${message}`);
		}
	}
}

/**
 * 8h cron placeholder for future GitHub export/commit.
 *
 * TODO: implement GitHub export. The intended flow is:
 *   1. Select rows from `external_data_sources` where publish_to_github = 1
 *      and (latest_published_commit_sha IS NULL OR
 *           latest_published_commit_sha != latest_data_hash-equivalent).
 *   2. For each, read `external_data_snapshots.normalized_json` for
 *      `latest_snapshot_id` and PUT it to `github_file_path` in the SSG repo
 *      via the GitHub Contents API.
 *   3. On success, update `latest_published_commit_sha` on the source row
 *      and `published_commit_sha` on the snapshot row.
 *
 * For now this only logs that the cron fired so we can confirm the trigger
 * is wired correctly in Cloudflare without making any external calls or
 * D1 writes.
 */
export async function runGithubExportPlaceholder(_env: Env): Promise<void> {
	console.log('[scheduled] github-export placeholder cron fired — no-op until implemented.');
}
