import type { RouteHandler } from '../../router/types';
import type {
	CleanupExternalDataSnapshotsPayload,
	CleanupExternalDataSnapshotsResponse,
	ExternalDataSnapshotStatus,
	RunExternalDataSourceResponse,
} from '../../types/api';
import type { ExternalDataSnapshotRow, ExternalDataSourceRow } from '../../types/db';
import {
	toAdminExternalDataSnapshotDetail,
	toAdminExternalDataSnapshotListItem,
	toAdminExternalDataSource,
} from '../../mappers/externalData';
import { badRequest, jsonResponse, notFound, parseJsonBody } from '../../utils/response';
import { DATA_SOURCES } from '../../scheduled/registry';
import { runDataSourceFetch } from '../../scheduled/runFetch';

const VALID_SNAPSHOT_STATUSES: ExternalDataSnapshotStatus[] = ['success', 'failed', 'skipped'];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DEFAULT_CLEANUP_OLDER_THAN_DAYS = 3;
const MAX_CLEANUP_OLDER_THAN_DAYS = 3650; // ~10 years — defensive upper bound

const SOURCE_COLUMNS =
	`id, type, provider, name, is_active, publish_to_github, github_file_path,
	 latest_snapshot_id, latest_data_hash, latest_updated_at,
	 latest_published_commit_sha, created_at, updated_at`;

const SNAPSHOT_LIST_COLUMNS =
	`id, source_id, status, fetched_at, data_hash, error_message,
	 published_commit_sha, created_at`;

const SNAPSHOT_DETAIL_COLUMNS =
	`id, source_id, status, fetched_at, data_hash, normalized_json,
	 raw_r2_key, error_message, published_commit_sha, created_at`;

// --- Sources ---

export const handleAdminGetExternalDataSources: RouteHandler = async ({ env, url }) => {
	const pagination = readPagination(url);
	if (pagination instanceof Response) return pagination;

	const result = await env.portal_db
		.prepare(
			`SELECT ${SOURCE_COLUMNS}
			 FROM external_data_sources
			 ORDER BY created_at DESC
			 LIMIT ? OFFSET ?`,
		)
		.bind(pagination.limit, pagination.offset)
		.all<ExternalDataSourceRow>();

	const data = result.results.map(toAdminExternalDataSource);

	return jsonResponse({ data, limit: pagination.limit, offset: pagination.offset });
};

export const handleAdminGetExternalDataSource: RouteHandler = async ({ env, params }) => {
	const id = params.id;

	const row = await env.portal_db
		.prepare(`SELECT ${SOURCE_COLUMNS} FROM external_data_sources WHERE id = ?`)
		.bind(id)
		.first<ExternalDataSourceRow>();

	if (!row) {
		return notFound();
	}

	return jsonResponse(toAdminExternalDataSource(row));
};

// --- Snapshots ---

export const handleAdminGetExternalDataSnapshots: RouteHandler = async ({ env, params, url }) => {
	const sourceId = params.id;

	const pagination = readPagination(url);
	if (pagination instanceof Response) return pagination;

	const statusFilter = url.searchParams.get('status');
	if (statusFilter && !VALID_SNAPSHOT_STATUSES.includes(statusFilter as ExternalDataSnapshotStatus)) {
		return badRequest(`Invalid status filter. Must be one of: ${VALID_SNAPSHOT_STATUSES.join(', ')}`);
	}

	const source = await env.portal_db
		.prepare(`SELECT id FROM external_data_sources WHERE id = ?`)
		.bind(sourceId)
		.first<Pick<ExternalDataSourceRow, 'id'>>();

	if (!source) {
		return notFound();
	}

	const conditions: string[] = ['source_id = ?'];
	const bindings: unknown[] = [sourceId];

	if (statusFilter) {
		conditions.push('status = ?');
		bindings.push(statusFilter);
	}

	const sql =
		`SELECT ${SNAPSHOT_LIST_COLUMNS}
		 FROM external_data_snapshots
		 WHERE ${conditions.join(' AND ')}
		 ORDER BY fetched_at DESC
		 LIMIT ? OFFSET ?`;

	bindings.push(pagination.limit, pagination.offset);

	const result = await env.portal_db.prepare(sql).bind(...bindings).all<ExternalDataSnapshotRow>();

	const data = result.results.map(toAdminExternalDataSnapshotListItem);

	return jsonResponse({ data, limit: pagination.limit, offset: pagination.offset });
};

export const handleAdminGetExternalDataSnapshot: RouteHandler = async ({ env, params }) => {
	const id = params.id;

	const row = await env.portal_db
		.prepare(`SELECT ${SNAPSHOT_DETAIL_COLUMNS} FROM external_data_snapshots WHERE id = ?`)
		.bind(id)
		.first<ExternalDataSnapshotRow>();

	if (!row) {
		return notFound();
	}

	return jsonResponse(toAdminExternalDataSnapshotDetail(row));
};

// --- Manual run ---

export const handleAdminRunExternalDataSource: RouteHandler = async ({ env, params }) => {
	const sourceId = params.id;

	const definition = DATA_SOURCES.find((d) => d.id === sourceId);
	if (!definition) {
		// Either the source id is unknown, or a row exists in D1 but no code-side
		// definition is registered for it (the hourly cron wouldn't run it either).
		const row = await env.portal_db
			.prepare(`SELECT id FROM external_data_sources WHERE id = ?`)
			.bind(sourceId)
			.first<Pick<ExternalDataSourceRow, 'id'>>();
		if (!row) {
			return notFound();
		}
		return jsonResponse({ error: 'No fetcher is registered for this data source' }, 422);
	}

	const result = await runDataSourceFetch(env, definition);

	switch (result.status) {
		case 'missing':
			// Definition is registered but the D1 row was removed since.
			return notFound();
		case 'inactive':
			return jsonResponse({ error: 'Data source is not active' }, 422);
		case 'success':
		case 'skipped':
		case 'failed': {
			const body: RunExternalDataSourceResponse = {
				sourceId: definition.id,
				status: result.status,
				snapshotId: result.snapshotId,
				dataHash: result.dataHash,
				fetchedAt: result.fetchedAtIso ?? new Date().toISOString(),
				errorMessage: result.errorMessage,
			};
			return jsonResponse(body);
		}
	}
};

// --- Cleanup ---

export const handleAdminCleanupExternalDataSnapshots: RouteHandler = async ({ env, request, params }) => {
	const sourceId = params.id;

	const body = await parseJsonBody<CleanupExternalDataSnapshotsPayload>(request);
	// Empty body is allowed — applies all defaults.
	const payload = body ?? {};

	let olderThanDays: number = DEFAULT_CLEANUP_OLDER_THAN_DAYS;
	if (payload.olderThanDays !== undefined && payload.olderThanDays !== null) {
		if (typeof payload.olderThanDays !== 'number' || !Number.isFinite(payload.olderThanDays)) {
			return badRequest('olderThanDays must be a number');
		}
		if (!Number.isInteger(payload.olderThanDays)) {
			return badRequest('olderThanDays must be an integer');
		}
		if (payload.olderThanDays < 1) {
			return badRequest('olderThanDays must be at least 1');
		}
		if (payload.olderThanDays > MAX_CLEANUP_OLDER_THAN_DAYS) {
			return badRequest(`olderThanDays must be at most ${MAX_CLEANUP_OLDER_THAN_DAYS}`);
		}
		olderThanDays = payload.olderThanDays;
	}

	let keepLatest = true;
	if (payload.keepLatest !== undefined && payload.keepLatest !== null) {
		if (typeof payload.keepLatest !== 'boolean') {
			return badRequest('keepLatest must be a boolean');
		}
		keepLatest = payload.keepLatest;
	}

	const source = await env.portal_db
		.prepare(`SELECT id, latest_snapshot_id FROM external_data_sources WHERE id = ?`)
		.bind(sourceId)
		.first<Pick<ExternalDataSourceRow, 'id' | 'latest_snapshot_id'>>();

	if (!source) {
		return notFound();
	}

	const cutoffIso = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

	let sql = `DELETE FROM external_data_snapshots
	           WHERE source_id = ? AND fetched_at < ?`;
	const bindings: unknown[] = [source.id, cutoffIso];

	if (keepLatest && source.latest_snapshot_id) {
		sql += ` AND id != ?`;
		bindings.push(source.latest_snapshot_id);
	}

	const result = await env.portal_db.prepare(sql).bind(...bindings).run();

	const response: CleanupExternalDataSnapshotsResponse = {
		sourceId: source.id,
		deletedCount: result.meta.changes ?? 0,
		olderThanDays,
		keepLatest,
	};

	return jsonResponse(response);
};

// --- Helpers ---

interface PaginationInput {
	limit: number;
	offset: number;
}

function readPagination(url: URL): PaginationInput | Response {
	const rawLimit = url.searchParams.get('limit');
	const rawOffset = url.searchParams.get('offset');

	let limit = DEFAULT_LIMIT;
	if (rawLimit !== null) {
		const parsed = Number(rawLimit);
		if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
			return badRequest('limit must be an integer');
		}
		if (parsed < 1) {
			return badRequest('limit must be at least 1');
		}
		if (parsed > MAX_LIMIT) {
			return badRequest(`limit must be at most ${MAX_LIMIT}`);
		}
		limit = parsed;
	}

	let offset = 0;
	if (rawOffset !== null) {
		const parsed = Number(rawOffset);
		if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
			return badRequest('offset must be an integer');
		}
		if (parsed < 0) {
			return badRequest('offset must be at least 0');
		}
		offset = parsed;
	}

	return { limit, offset };
}
