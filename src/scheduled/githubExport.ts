import type { ExternalDataSnapshotRow, GithubExportStateRow } from '../types/db';
import { createGithubClient, parseRepo, type GithubClient } from '../github/githubClient';
import { stableHash } from './hash';
import { loadBookedDatesByOffer, type BookedDatesByOffer } from './bookedDatesExport';

/**
 * Smart GitHub export orchestrator.
 *
 * Reads the latest weather + marine snapshots from D1, computes a stable
 * composite hash, compares to the last successfully published hash, and
 * (when enabled and not dry-run) commits both files to the target branch
 * via the GitHub Git Database API.
 *
 * The publish-window check lives in `handlers.ts` and is the cron-side
 * gate. This module is the export-side gate and handles everything that
 * matters once the cron is allowed to act.
 *
 * Source IDs match the rows seeded by migrations 0006 / 0007.
 */

const WEATHER_SOURCE_ID = 'weather_current_costa_blanca';
const MARINE_SOURCE_ID = 'marine_current_costa_blanca';

// Composite-hash version key — bump if the export shape changes so older
// published hashes are treated as different from new ones.
// v2: added booked-dates file to the composite export.
const COMPOSITE_HASH_VERSION = 'v2';

// Don't re-publish more often than this even if data changed. Cheap
// safety net against runaway re-commits.
const MIN_EXPORT_INTERVAL_MS = 30 * 60 * 1000;

const COMMIT_MESSAGE = 'Update weather, marine and booked-dates data';

// ─── Public types ────────────────────────────────────────────────────────────

export interface GithubExportConfig {
	enabled: boolean;
	dryRun: boolean;
	token: string | undefined;
	repo: string;
	branch: string;
	weatherFilePath: string;
	marineFilePath: string;
	bookedDatesFilePath: string;
	committerName: string;
	committerEmail: string;
}

export type SkipReason =
	| 'disabled'
	| 'missing_token'
	| 'invalid_repo'
	| 'missing_branch'
	| 'missing_file_paths'
	| 'missing_weather_snapshot'
	| 'missing_marine_snapshot'
	| 'invalid_weather_json'
	| 'invalid_marine_json'
	| 'unchanged'
	| 'too_recent';

export type ExportResult =
	| { status: 'success'; commitSha: string; compositeHash: string }
	| { status: 'dry_run'; compositeHash: string }
	| { status: 'skipped'; reason: SkipReason; compositeHash?: string }
	| { status: 'failed'; error: string };

// ─── Config reader (env → typed config) ──────────────────────────────────────

/**
 * Reads GitHub export config from the Worker env without depending on the
 * auto-generated Env type having all the fields. Defaults are conservative
 * (disabled, dry-run on) so a missing/empty config never publishes.
 */
export function readGithubExportConfig(env: Env): GithubExportConfig {
	const e = env as unknown as Record<string, unknown>;
	return {
		enabled: e.GITHUB_EXPORT_ENABLED === true,
		dryRun: e.GITHUB_EXPORT_DRY_RUN !== false, // default true if missing
		token: typeof e.GITHUB_TOKEN === 'string' && e.GITHUB_TOKEN ? e.GITHUB_TOKEN : undefined,
		repo: typeof e.GITHUB_REPO === 'string' ? e.GITHUB_REPO : '',
		branch: typeof e.GITHUB_BRANCH === 'string' ? e.GITHUB_BRANCH : '',
		weatherFilePath: typeof e.GITHUB_WEATHER_FILE_PATH === 'string' ? e.GITHUB_WEATHER_FILE_PATH : '',
		marineFilePath: typeof e.GITHUB_MARINE_FILE_PATH === 'string' ? e.GITHUB_MARINE_FILE_PATH : '',
		bookedDatesFilePath: typeof e.GITHUB_BOOKED_DATES_FILE_PATH === 'string' ? e.GITHUB_BOOKED_DATES_FILE_PATH : '',
		committerName: typeof e.GITHUB_COMMITTER_NAME === 'string' && e.GITHUB_COMMITTER_NAME
			? e.GITHUB_COMMITTER_NAME
			: 'Portal Data Bot',
		committerEmail: typeof e.GITHUB_COMMITTER_EMAIL === 'string' ? e.GITHUB_COMMITTER_EMAIL : '',
	};
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Stable, indented JSON serialization for the file content sent to GitHub.
 * Sorts object keys recursively so two logically-equivalent payloads produce
 * byte-identical output (no false-positive git diffs). Includes a trailing
 * newline to match common file conventions and keep editors happy.
 */
export function formatStableJson(value: unknown): string {
	return JSON.stringify(sortKeysDeep(value), null, 2) + '\n';
}

function sortKeysDeep(value: unknown): unknown {
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) return value.map(sortKeysDeep);
	const obj = value as Record<string, unknown>;
	const sorted: Record<string, unknown> = {};
	for (const key of Object.keys(obj).sort()) {
		sorted[key] = sortKeysDeep(obj[key]);
	}
	return sorted;
}

export interface CompositeHashInput {
	weatherData: unknown;
	marineData: unknown;
	bookedDatesData: unknown;
	weatherPath: string;
	marinePath: string;
	bookedDatesPath: string;
}

export async function computeCompositeHash(input: CompositeHashInput): Promise<string> {
	return stableHash({
		version: COMPOSITE_HASH_VERSION,
		weather: { path: input.weatherPath, data: input.weatherData },
		marine: { path: input.marinePath, data: input.marineData },
		bookedDates: { path: input.bookedDatesPath, data: input.bookedDatesData },
	});
}

// ─── Pure decision logic ─────────────────────────────────────────────────────

export type PublishDecision =
	| { action: 'commit' }
	| { action: 'dry_run' }
	| { action: 'skip'; reason: SkipReason };

export interface ConditionInput {
	config: GithubExportConfig;
	hasWeatherSnapshot: boolean;
	hasMarineSnapshot: boolean;
	weatherJsonValid: boolean;
	marineJsonValid: boolean;
	compositeHash: string;
	priorState: GithubExportStateRow | null;
	now: Date;
	minExportIntervalMs?: number;
}

/**
 * Decide whether to commit, dry-run, or skip — given everything already
 * loaded from env + D1. Pure: no I/O, no clock reads. Tests exercise this
 * directly with synthetic inputs.
 *
 * Ordering matters:
 *   1. Config-only failures first (cheap, deterministic).
 *   2. Data-availability failures next (D1 snapshots).
 *   3. Hash unchanged → skip even when enabled.
 *   4. Too-recent → skip.
 *   5. Disabled → skip (master switch beats everything below).
 *   6. Dry-run → dry-run.
 *   7. Missing token → skip (only relevant when we'd actually call GitHub).
 *   8. Otherwise commit.
 */
export function evaluatePublishConditions(input: ConditionInput): PublishDecision {
	const cfg = input.config;

	if (!parseRepo(cfg.repo)) return { action: 'skip', reason: 'invalid_repo' };
	if (!cfg.branch) return { action: 'skip', reason: 'missing_branch' };
	if (!cfg.weatherFilePath || !cfg.marineFilePath || !cfg.bookedDatesFilePath) {
		return { action: 'skip', reason: 'missing_file_paths' };
	}

	if (!input.hasWeatherSnapshot) return { action: 'skip', reason: 'missing_weather_snapshot' };
	if (!input.hasMarineSnapshot) return { action: 'skip', reason: 'missing_marine_snapshot' };
	if (!input.weatherJsonValid) return { action: 'skip', reason: 'invalid_weather_json' };
	if (!input.marineJsonValid) return { action: 'skip', reason: 'invalid_marine_json' };

	if (input.priorState?.latest_export_hash === input.compositeHash) {
		return { action: 'skip', reason: 'unchanged' };
	}

	if (input.priorState?.latest_exported_at) {
		const lastTs = Date.parse(input.priorState.latest_exported_at);
		const minInterval = input.minExportIntervalMs ?? MIN_EXPORT_INTERVAL_MS;
		if (Number.isFinite(lastTs) && input.now.getTime() - lastTs < minInterval) {
			return { action: 'skip', reason: 'too_recent' };
		}
	}

	if (!cfg.enabled) return { action: 'skip', reason: 'disabled' };
	if (cfg.dryRun) return { action: 'dry_run' };
	if (!cfg.token) return { action: 'skip', reason: 'missing_token' };

	return { action: 'commit' };
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

const log = (level: 'log' | 'warn' | 'error', msg: string) => console[level](`[github-export] ${msg}`);

export async function runGithubExport(env: Env): Promise<ExportResult> {
	const config = readGithubExportConfig(env);

	// Load snapshots (always — even in dry-run / disabled, so logs are useful).
	const weatherSnapshot = await loadLatestSnapshot(env, WEATHER_SOURCE_ID);
	const marineSnapshot = await loadLatestSnapshot(env, MARINE_SOURCE_ID);

	// Parse JSON. Track validity separately so the decision can return a
	// precise skip reason without throwing.
	const parsedWeather = tryParseJson(weatherSnapshot?.normalized_json ?? null);
	const parsedMarine = tryParseJson(marineSnapshot?.normalized_json ?? null);

	// Booked dates are derived live from D1 (not a snapshot), so there is no
	// "missing snapshot" / "invalid JSON" failure mode — an empty result is a
	// valid export (no offers currently have confirmed bookings).
	const today = new Date().toISOString().slice(0, 10);
	const bookedDates = await loadBookedDatesByOffer(env, today);

	// Composite hash. Only meaningful when both JSONs parsed; otherwise we use
	// empty placeholders so the decision step can reach its `invalid_*` branch.
	const compositeHash = await computeCompositeHash({
		weatherData: parsedWeather.ok ? parsedWeather.value : null,
		marineData: parsedMarine.ok ? parsedMarine.value : null,
		bookedDatesData: bookedDates,
		weatherPath: config.weatherFilePath,
		marinePath: config.marineFilePath,
		bookedDatesPath: config.bookedDatesFilePath,
	});

	const priorState = await loadExportState(env, config.repo, config.branch);

	const decision = evaluatePublishConditions({
		config,
		hasWeatherSnapshot: weatherSnapshot !== null,
		hasMarineSnapshot: marineSnapshot !== null,
		weatherJsonValid: parsedWeather.ok,
		marineJsonValid: parsedMarine.ok,
		compositeHash,
		priorState,
		now: new Date(),
	});

	if (decision.action === 'skip') {
		log('log', skipMessage(decision.reason, { config, compositeHash, priorState }));
		return { status: 'skipped', reason: decision.reason, compositeHash };
	}

	if (decision.action === 'dry_run') {
		log(
			'log',
			`dry-run — would commit hash ${compositeHash.slice(0, 12)}… to ${config.repo}@${config.branch} ` +
				`(${config.weatherFilePath}, ${config.marineFilePath}, ${config.bookedDatesFilePath}). ` +
				`GITHUB_EXPORT_DRY_RUN=true, no GitHub calls made.`,
		);
		return { status: 'dry_run', compositeHash };
	}

	// commit
	if (!config.token) {
		// Belt-and-suspenders — evaluatePublishConditions should have caught this.
		log('error', 'commit decision reached without GITHUB_TOKEN — refusing to call GitHub.');
		return { status: 'skipped', reason: 'missing_token', compositeHash };
	}

	const repoId = parseRepo(config.repo);
	if (!repoId) {
		// Also belt-and-suspenders.
		log('error', `commit decision reached with invalid GITHUB_REPO: "${config.repo}"`);
		return { status: 'skipped', reason: 'invalid_repo', compositeHash };
	}

	const client = createGithubClient({
		token: config.token,
		owner: repoId.owner,
		repo: repoId.repo,
	});

	try {
		const commitSha = await commitDataFiles(client, {
			branch: config.branch,
			weatherFilePath: config.weatherFilePath,
			marineFilePath: config.marineFilePath,
			bookedDatesFilePath: config.bookedDatesFilePath,
			weatherContent: formatStableJson(parsedWeather.ok ? parsedWeather.value : null),
			marineContent: formatStableJson(parsedMarine.ok ? parsedMarine.value : null),
			bookedDatesContent: formatStableJson(bookedDates),
			committer: { name: config.committerName, email: config.committerEmail },
			message: COMMIT_MESSAGE,
		});

		await saveExportStateSuccess(env, config.repo, config.branch, compositeHash, commitSha);
		log(
			'log',
			`success — committed ${commitSha.slice(0, 8)} to ${config.repo}@${config.branch} ` +
				`(hash ${compositeHash.slice(0, 12)}…).`,
		);
		return { status: 'success', commitSha, compositeHash };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await saveExportStateFailure(env, config.repo, config.branch, message);
		log('error', `failed — ${message}`);
		return { status: 'failed', error: message };
	}
}

// ─── GitHub commit composition ───────────────────────────────────────────────

interface CommitDataFilesInput {
	branch: string;
	weatherFilePath: string;
	marineFilePath: string;
	bookedDatesFilePath: string;
	weatherContent: string;
	marineContent: string;
	bookedDatesContent: string;
	committer: { name: string; email: string };
	message: string;
}

async function commitDataFiles(client: GithubClient, input: CommitDataFilesInput): Promise<string> {
	const head = await client.getBranchHead(input.branch);
	const parentCommit = await client.getCommit(head.commitSha);
	const tree = await client.createTree(parentCommit.treeSha, [
		{ path: input.weatherFilePath, content: input.weatherContent },
		{ path: input.marineFilePath, content: input.marineContent },
		{ path: input.bookedDatesFilePath, content: input.bookedDatesContent },
	]);
	const newCommit = await client.createCommit({
		message: input.message,
		treeSha: tree.treeSha,
		parentSha: parentCommit.commitSha,
		author: input.committer,
		committer: input.committer,
	});
	await client.updateBranchRef(input.branch, newCommit.commitSha, { force: false });
	return newCommit.commitSha;
}

// ─── D1 helpers ──────────────────────────────────────────────────────────────

async function loadLatestSnapshot(env: Env, sourceId: string): Promise<ExternalDataSnapshotRow | null> {
	const source = await env.portal_db
		.prepare('SELECT latest_snapshot_id FROM external_data_sources WHERE id = ?')
		.bind(sourceId)
		.first<{ latest_snapshot_id: string | null }>();
	if (!source?.latest_snapshot_id) return null;
	return env.portal_db
		.prepare('SELECT * FROM external_data_snapshots WHERE id = ? AND status = ?')
		.bind(source.latest_snapshot_id, 'success')
		.first<ExternalDataSnapshotRow>();
}

async function loadExportState(env: Env, repo: string, branch: string): Promise<GithubExportStateRow | null> {
	return env.portal_db
		.prepare('SELECT * FROM github_export_state WHERE repo = ? AND branch = ?')
		.bind(repo, branch)
		.first<GithubExportStateRow>();
}

async function saveExportStateSuccess(
	env: Env,
	repo: string,
	branch: string,
	hash: string,
	commitSha: string,
): Promise<void> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	await env.portal_db
		.prepare(
			`INSERT INTO github_export_state
			   (id, repo, branch, latest_export_hash, latest_commit_sha, latest_exported_at,
			    last_attempt_at, last_status, last_error, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 'success', NULL, ?, ?)
			 ON CONFLICT(repo, branch) DO UPDATE SET
			   latest_export_hash = excluded.latest_export_hash,
			   latest_commit_sha  = excluded.latest_commit_sha,
			   latest_exported_at = excluded.latest_exported_at,
			   last_attempt_at    = excluded.last_attempt_at,
			   last_status        = 'success',
			   last_error         = NULL,
			   updated_at         = excluded.updated_at`,
		)
		.bind(id, repo, branch, hash, commitSha, now, now, now, now)
		.run();
}

async function saveExportStateFailure(env: Env, repo: string, branch: string, errorMessage: string): Promise<void> {
	const id = crypto.randomUUID();
	const now = new Date().toISOString();
	const truncated = errorMessage.length > 1000 ? errorMessage.slice(0, 1000) : errorMessage;
	await env.portal_db
		.prepare(
			`INSERT INTO github_export_state
			   (id, repo, branch, latest_export_hash, latest_commit_sha, latest_exported_at,
			    last_attempt_at, last_status, last_error, created_at, updated_at)
			 VALUES (?, ?, ?, NULL, NULL, NULL, ?, 'failed', ?, ?, ?)
			 ON CONFLICT(repo, branch) DO UPDATE SET
			   last_attempt_at = excluded.last_attempt_at,
			   last_status     = 'failed',
			   last_error      = excluded.last_error,
			   updated_at      = excluded.updated_at`,
		)
		.bind(id, repo, branch, now, truncated, now, now)
		.run();
}

// ─── Internal helpers ────────────────────────────────────────────────────────

type ParsedJson = { ok: true; value: unknown } | { ok: false };

function tryParseJson(raw: string | null): ParsedJson {
	if (raw === null) return { ok: false };
	try {
		return { ok: true, value: JSON.parse(raw) };
	} catch {
		return { ok: false };
	}
}

interface SkipContext {
	config: GithubExportConfig;
	compositeHash: string;
	priorState: GithubExportStateRow | null;
}

function skipMessage(reason: SkipReason, ctx: SkipContext): string {
	const tag = `skipped (${reason})`;
	switch (reason) {
		case 'disabled':
			return `${tag} — GITHUB_EXPORT_ENABLED=false. Would commit hash ${ctx.compositeHash.slice(0, 12)}… ` +
				`to ${ctx.config.repo}@${ctx.config.branch}.`;
		case 'unchanged':
			return `${tag} — composite hash ${ctx.compositeHash.slice(0, 12)}… matches last published export.`;
		case 'too_recent':
			return `${tag} — last successful export at ${ctx.priorState?.latest_exported_at ?? '?'} is within the ` +
				`min interval (${MIN_EXPORT_INTERVAL_MS / 60000}min).`;
		case 'invalid_repo':
			return `${tag} — GITHUB_REPO is missing or not in "owner/repo" form (got "${ctx.config.repo}").`;
		case 'missing_branch':
			return `${tag} — GITHUB_BRANCH not configured.`;
		case 'missing_file_paths':
			return `${tag} — GITHUB_WEATHER_FILE_PATH, GITHUB_MARINE_FILE_PATH or ` +
				`GITHUB_BOOKED_DATES_FILE_PATH not configured.`;
		case 'missing_weather_snapshot':
			return `${tag} — no successful snapshot found for source ${WEATHER_SOURCE_ID}.`;
		case 'missing_marine_snapshot':
			return `${tag} — no successful snapshot found for source ${MARINE_SOURCE_ID}.`;
		case 'invalid_weather_json':
			return `${tag} — latest weather snapshot has invalid JSON in normalized_json.`;
		case 'invalid_marine_json':
			return `${tag} — latest marine snapshot has invalid JSON in normalized_json.`;
		case 'missing_token':
			return `${tag} — GITHUB_TOKEN secret not configured. Set via "wrangler secret put GITHUB_TOKEN".`;
	}
}
