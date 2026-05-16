import type { ExternalDataSourceRow } from '../types/db';
import type { DataSourceDefinition } from './types';
import { stableHash } from './hash';

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
 * Returns the resulting status string so the cron handler can log per-source.
 */
export async function runDataSourceFetch(
	env: Env,
	definition: DataSourceDefinition,
	opts?: { signal?: AbortSignal },
): Promise<'success' | 'skipped' | 'failed' | 'inactive' | 'missing'> {
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
		return 'missing';
	}

	if (source.is_active !== 1) {
		return 'inactive';
	}

	const fetchedAtIso = new Date().toISOString();

	let normalized: unknown;
	let dataHash: string;
	try {
		const result = await definition.
		fetchAndNormalize({ env, signal: opts?.signal });
		normalized = result.normalized;
		dataHash = await stableHash(normalized);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await insertSnapshot(env, {
			sourceId: source.id,
			status: 'failed',
			fetchedAtIso,
			dataHash: null,
			normalizedJson: null,
			errorMessage: truncate(message, 1000),
		});
		console.warn(`[scheduled] ${definition.provider}:${definition.id} failed: ${message}`);
		return 'failed';
	}

	if (source.latest_data_hash && source.latest_data_hash === dataHash) {
		// Hash unchanged: keep a lightweight observability row but skip the heavy fields.
		await insertSnapshot(env, {
			sourceId: source.id,
			status: 'skipped',
			fetchedAtIso,
			dataHash,
			normalizedJson: null,
			errorMessage: null,
		});
		return 'skipped';
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

	return 'success';
}

interface InsertSnapshotInput {
	id?: string;
	sourceId: string;
	status: 'success' | 'skipped' | 'failed';
	fetchedAtIso: string;
	dataHash: string | null;
	normalizedJson: string | null;
	errorMessage: string | null;
}

async function insertSnapshot(env: Env, input: InsertSnapshotInput): Promise<void> {
	const id = input.id ?? crypto.randomUUID();
	await env.portal_db
		.prepare(
			`INSERT INTO external_data_snapshots
			   (id, source_id, status, fetched_at, data_hash, normalized_json, error_message)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			id,
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
