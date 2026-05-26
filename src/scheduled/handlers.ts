import { DATA_SOURCES } from './registry';
import { runDataSourceFetch } from './runFetch';
import { runGithubExport } from './githubExport';

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
 * Hourly cron entry point for the smart GitHub export.
 *
 * Cron fires every hour at :09 (UTC). The handler first checks the current
 * `Europe/Madrid` clock time against the allowed publish window
 * (`ALLOWED_PUBLISH_HOURS` at minute `PUBLISH_WINDOW_MINUTE`). Firing every
 * hour (rather than every 2 hours) keeps the publish window aligned with
 * Madrid clock-time across DST: 9 of the 24 daily firings land inside the
 * window in both winter and summer, the other 15 log a clean skip.
 *
 * If outside the window, the handler logs and returns. If inside, it
 * delegates to `runGithubExport`, which loads the latest weather + marine
 * snapshots from D1, computes a composite hash, and (when enabled and not
 * in dry-run) commits both files to the target branch via the GitHub Git
 * Database API.
 */
export async function runSmartGithubExport(env: Env): Promise<void> {
	console.log('[scheduled] smart-github-export cron fired.');

	const clock = nowInPublishTimezone();
	const clockIso = `${pad2(clock.hour)}:${pad2(clock.minute)}`;
	console.log(`[scheduled] smart-github-export current ${PUBLISH_WINDOW_TIMEZONE} time: ${clockIso}`);

	if (!isInPublishWindow(clock)) {
		if (shouldBypassGithubExportWindowForDev(env)) {
			console.log(
				'[scheduled] smart github export dev override: bypassing publish window because ' +
					'ENVIRONMENT=development and GITHUB_EXPORT_DRY_RUN=true',
			);
			// Fall through to runGithubExport. The export still respects its own
			// internal `dry_run` decision, so this is safe — no GitHub call will
			// happen while DRY_RUN is true.
		} else {
			if (isDevelopmentEnv(env)) {
				console.log(
					'[scheduled] smart-github-export dev override NOT applied — ' +
						'GITHUB_EXPORT_DRY_RUN is not true. Falling through to normal skip.',
				);
			}
			const allowed = ALLOWED_PUBLISH_HOURS.map((h) => `${pad2(h)}:${pad2(PUBLISH_WINDOW_MINUTE)}`).join(', ');
			console.log(
				`[scheduled] smart-github-export skipped — ${clockIso} ${PUBLISH_WINDOW_TIMEZONE} is outside ` +
					`the allowed publish window (${allowed}, ±${PUBLISH_WINDOW_MINUTE_TOLERANCE}min tolerance).`,
			);
			return;
		}
	}

	try {
		const result = await runGithubExport(env);
		console.log(`[scheduled] smart-github-export result: ${result.status}`);
	} catch (err) {
		// runGithubExport handles its own per-attempt persistence; this catch
		// only covers unexpected failures (e.g. D1 outage during state writes).
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[scheduled] smart-github-export unexpected error: ${message}`);
	}
}

/**
 * Dev-only override that lets the smart GitHub export handler continue past
 * the Madrid publish-window guard when running locally in dry-run.
 *
 * Production safety: the override is gated on BOTH `ENVIRONMENT==='development'`
 * AND `GITHUB_EXPORT_DRY_RUN===true`. `ENVIRONMENT` is set to `production` in
 * `wrangler.jsonc` for deployed Workers; `development` only comes from
 * `.dev.vars` during `wrangler dev`. The `DRY_RUN` clause guarantees that even
 * a misconfigured local env can never make a real GitHub commit outside the
 * normal publish window.
 */
export function shouldBypassGithubExportWindowForDev(env: Env): boolean {
	const e = env as unknown as Record<string, unknown>;
	return e.ENVIRONMENT === 'development' && e.GITHUB_EXPORT_DRY_RUN === true;
}

function isDevelopmentEnv(env: Env): boolean {
	return (env as unknown as Record<string, unknown>).ENVIRONMENT === 'development';
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
