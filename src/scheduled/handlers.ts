import { DATA_SOURCES } from './registry';
import { runDataSourceFetch } from './runFetch';

/**
 * Cron entry points. Wired up from `src/index.ts` and matched on
 * `controller.cron`. Keep the cron expressions in sync with `wrangler.jsonc`.
 */

export const CRON_HOURLY_FETCH = '7 * * * *';
export const CRON_SMART_GITHUB_EXPORT = '9 * * * *';

// Timezone the publish window is evaluated in. Project-wide convention.
const PUBLISH_WINDOW_TIMEZONE = 'Europe/Madrid';

// Allowed publish times in `PUBLISH_WINDOW_TIMEZONE`. The cron may fire more
// often than this — entries outside the window are logged and skipped.
const ALLOWED_PUBLISH_HOURS: readonly number[] = [5, 7, 9, 11, 13, 15, 17, 19, 21];
const PUBLISH_WINDOW_MINUTE = 9;
// Tolerance for cron-scheduler skew (Cloudflare cron can fire ±a minute or so).
const PUBLISH_WINDOW_MINUTE_TOLERANCE = 2;

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
 * Hourly cron placeholder for the smart GitHub export.
 *
 * Cron fires every hour at :09 (UTC). The handler then evaluates whether the
 * current `Europe/Madrid` clock time falls inside the allowed publish window
 * (`ALLOWED_PUBLISH_HOURS` at minute `PUBLISH_WINDOW_MINUTE`). Firing every
 * hour (rather than every 2 hours) keeps the publish window aligned with
 * Madrid clock-time across DST: 9 of the 24 daily firings land inside the
 * window in both winter and summer, the other 15 log a clean skip.
 *
 * If outside the window, the handler logs a clean skip and returns. If
 * inside, it logs the future publish conditions it will eventually check,
 * but does NOT call the GitHub API or write to D1.
 *
 * The real GitHub commit logic will be added in the next step. Intended flow
 * once implemented:
 *   1. Select rows from `external_data_sources` where publish_to_github = 1
 *      and the latest snapshot's data hash differs from the last published
 *      commit's hash (i.e. there is actually something new to push).
 *   2. Verify the previous publish wasn't too recent (rate-limit guard).
 *   3. For each, read `external_data_snapshots.normalized_json` for
 *      `latest_snapshot_id` and PUT it to `github_file_path` in the SSG repo
 *      via the GitHub Contents API.
 *   4. On success, update `latest_published_commit_sha` on the source row
 *      and `published_commit_sha` on the snapshot row.
 */
export async function runSmartGithubExportPlaceholder(_env: Env): Promise<void> {
	console.log('[scheduled] smart-github-export placeholder cron fired.');

	const clock = nowInPublishTimezone();
	const clockIso = `${pad2(clock.hour)}:${pad2(clock.minute)}`;
	console.log(`[scheduled] smart-github-export current ${PUBLISH_WINDOW_TIMEZONE} time: ${clockIso}`);

	if (!isInPublishWindow(clock)) {
		const allowed = ALLOWED_PUBLISH_HOURS.map((h) => `${pad2(h)}:${pad2(PUBLISH_WINDOW_MINUTE)}`).join(', ');
		console.log(
			`[scheduled] smart-github-export skipped — ${clockIso} ${PUBLISH_WINDOW_TIMEZONE} is outside ` +
			`the allowed publish window (${allowed}, ±${PUBLISH_WINDOW_MINUTE_TOLERANCE}min tolerance).`,
		);
		return;
	}

	// Inside the window. Real conditions will be evaluated here in the next step.
	console.log('[scheduled] smart-github-export inside publish window — placeholder evaluating future conditions:');
	console.log('  [ ] export enabled globally (TODO: read from config / env)');
	console.log('  [x] current time is allowed');
	console.log('  [ ] normalized data exists for both weather and marine sources');
	console.log('  [ ] data hash changed since last published export');
	console.log('  [ ] previous publish was not too recent (rate-limit guard)');
	console.log('  [ ] GitHub target file paths are configured for each source');
	console.log('[scheduled] smart-github-export real GitHub commit is still disabled — no-op.');
}

// ─── Publish-window helpers ──────────────────────────────────────────────────

interface PublishClockTime {
	hour: number;
	minute: number;
}

function nowInPublishTimezone(date: Date = new Date()): PublishClockTime {
	const formatter = new Intl.DateTimeFormat('en-GB', {
		timeZone: PUBLISH_WINDOW_TIMEZONE,
		hourCycle: 'h23',
		hour: '2-digit',
		minute: '2-digit',
	});
	const parts = formatter.formatToParts(date);
	const hour = Number(parts.find((p) => p.type === 'hour')?.value);
	const minute = Number(parts.find((p) => p.type === 'minute')?.value);
	return { hour, minute };
}

function isInPublishWindow(clock: PublishClockTime): boolean {
	if (!ALLOWED_PUBLISH_HOURS.includes(clock.hour)) return false;
	return Math.abs(clock.minute - PUBLISH_WINDOW_MINUTE) <= PUBLISH_WINDOW_MINUTE_TOLERANCE;
}

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}
