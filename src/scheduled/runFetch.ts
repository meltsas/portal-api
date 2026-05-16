import type { ExternalDataSourceRow } from '../types/db';
import type { DataSourceDefinition } from './types';
import { stableHash } from './hash';

export type RunFetchStatus = 'success' | 'skipped' | 'failed' | 'inactive' | 'missing';

export interface RunFetchResult {
	status: RunFetchStatus;
	snapshotId: string | null;
	dataHash: string | null;
	fetchedAtIso: string | null;
	errorMessage: string | null;
}

/**
 * Run one data-source fetch end-to-end:
 *   1. Look up the source row in D1.
 *   2. Call the definition's fetchAndNormalize.
 *   3. Hash the normalized payload.
 *   4. If hash matches the latest, insert a lightweight `skipped` snapshot.
 *      If hash changed, insert a `success` snapshot and update the source's
 *      latest_* pointer.
 *   5. On any failure, insert a `failed` snapshot without touching the
 *      latest pointer, so the previous successful data stays the source
 *      of truth.
 *
 * Returns a structured result that callers (cron handler, admin run endpoint)
 * can surface to logs or HTTP responses.
 */
export async function runDataSourceFetch(
	env: Env,
	definition: DataSourceDefinition,
	opts?: { signal?: AbortSignal },
): Promise<RunFetchResult> {
	const source = await env.portal_db
		.prepare(
			`SELECT id, type, provider, name, is_active, publish_to_github, github_file_path,
			        latest_snapshot_id, latest_data_hash, latest_updated_at,
			        latest_published_commit_sha, created_at, updated_at
			 FROM external_data_sources
			 WHERE id = ?`,
		)
		.bind(definition.id)
		.first<ExternalDataSourceRow>();

	if (!source) {
		console.warn(`[scheduled] data source '${definition.id}' has no row in external_data_sources — skipping.`);
		return { status: 'missing', snapshotId: null, dataHash: null, fetchedAtIso: null, errorMessage: null };
	}

	if (source.is_active !== 1) {
		return { status: 'inactive', snapshotId: null, dataHash: null, fetchedAtIso: null, errorMessage: null };
	}

	const fetchedAtIso = new Date().toISOString();

	let normalized: unknown;
	let dataHash: string;
	try {
		const result = await definition.fetchAndNormalize({ env, signal: opts?.signal });
		normalized = result.normalized;
		dataHash = await stableHash(normalized);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const truncated = truncate(message, 1000);
		const snapshotId = crypto.randomUUID();
		await insertSnapshot(env, {
			id: snapshotId,
			sourceId: source.id,
			status: 'failed',
			fetchedAtIso,
			dataHash: null,
			normalizedJson: null,
			errorMessage: truncated,
		});
		console.warn(`[scheduled] ${definition.provider}:${definition.id} failed: ${message}`);
		return {
			status: 'failed',
			snapshotId,
			dataHash: null,
			fetchedAtIso,
			errorMessage: truncated,
		};
	}

	if (source.latest_data_hash && source.latest_data_hash === dataHash) {
		// Hash unchanged: keep a lightweight observability row but skip the heavy fields.
		const snapshotId = crypto.randomUUID();
		await insertSnapshot(env, {
			id: snapshotId,
			sourceId: source.id,
			status: 'skipped',
			fetchedAtIso,
			dataHash,
			normalizedJson: null,
			errorMessage: null,
		});
		return {
			status: 'skipped',
			snapshotId,
			dataHash,
			fetchedAtIso,
			errorMessage: null,
		};
	}

	const snapshotId = crypto.randomUUID();
	const normalizedJson = JSON.stringify(normalized);

	await insertSnapshot(env, {
		id: snapshotId,
		sourceId: source.id,
		status: 'success',
		fetchedAtIso,
		dataHash,
		normalizedJson,
		errorMessage: null,
	});

	await env.portal_db
		.prepare(
			`UPDATE external_data_sources
			 SET latest_snapshot_id = ?, latest_data_hash = ?, latest_updated_at = ?,
			     updated_at = CURRENT_TIMESTAMP
			 WHERE id = ?`,
		)
		.bind(snapshotId, dataHash, fetchedAtIso, source.id)
		.run();

	return {
		status: 'success',
		snapshotId,
		dataHash,
		fetchedAtIso,
		errorMessage: null,
	};
}

interface InsertSnapshotInput {
	id: string;
	sourceId: string;
	status: 'success' | 'skipped' | 'failed';
	fetchedAtIso: string;
	dataHash: string | null;
	normalizedJson: string | null;
	errorMessage: string | null;
}

async function insertSnapshot(env: Env, input: InsertSnapshotInput): Promise<void> {
	await env.portal_db
		.prepare(
			`INSERT INTO external_data_snapshots
			   (id, source_id, status, fetched_at, data_hash, normalized_json, error_message)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			input.id,
			input.sourceId,
			input.status,
			input.fetchedAtIso,
			input.dataHash,
			input.normalizedJson,
			input.errorMessage,
		)
		.run();
}

function truncate(s: string, max: number): string {
	return s.length > max ? s.slice(0, max) : s;
}
