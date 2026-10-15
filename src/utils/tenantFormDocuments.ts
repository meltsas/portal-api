import type { FormSubmissionFileRow } from '../types/db';

// D1 allows at most 100 bound parameters per statement; events take 4 per row (see below).
export const MAX_PURGE_BATCH = 20;

export interface DocumentsOwner {
	submissionId: string;
	invitationId: string;
}

export type DocumentFileRow = Pick<FormSubmissionFileRow, 'id' | 'r2_key' | 'submission_id'>;

/** Attached files of up to MAX_PURGE_BATCH submissions. */
export async function findAttachedFiles(db: D1Database, submissionIds: string[]): Promise<DocumentFileRow[]> {
	if (submissionIds.length === 0) return [];
	const { results } = await db
		.prepare(
			`SELECT id, r2_key, submission_id FROM form_submission_files
			 WHERE status = 'attached' AND submission_id IN (${placeholders(submissionIds.length)})`
		)
		.bind(...submissionIds)
		.all<DocumentFileRow>();
	return results;
}

/**
 * Marks the attached files of the submissions deleted, clears their file names (they may contain a
 * person's name) and logs `documents_purged` per submission. Delete the R2 objects first: if this
 * batch then fails, the next run finds the files still attached and deletes again, which is harmless.
 */
export function purgeDocumentsStatements(
	db: D1Database,
	owners: DocumentsOwner[],
	files: DocumentFileRow[],
	deletedAt: string,
	actor: { type: 'admin' | 'system'; ref: string | null }
): D1PreparedStatement[] {
	if (owners.length === 0) return [];
	const submissionIds = owners.map((owner) => owner.submissionId);
	const fileCounts = countBy(files, (file) => file.submission_id ?? '');

	return [
		db
			.prepare(
				`UPDATE form_submission_files SET status = 'deleted', deleted_at = ?, original_filename = ''
				 WHERE status = 'attached' AND submission_id IN (${placeholders(submissionIds.length)})`
			)
			.bind(deletedAt, ...submissionIds),
		db
			.prepare(
				`UPDATE form_submissions SET documents_deleted_at = COALESCE(documents_deleted_at, ?), updated_at = CURRENT_TIMESTAMP
				 WHERE id IN (${placeholders(submissionIds.length)})`
			)
			.bind(deletedAt, ...submissionIds),
		eventsStatement(
			db,
			'documents_purged',
			actor,
			owners.map((owner) => ({
				invitationId: owner.invitationId,
				submissionId: owner.submissionId,
				metadata: { fileCount: fileCounts.get(owner.submissionId) ?? 0 },
			}))
		),
	];
}

export interface EventRow {
	invitationId: string;
	submissionId: string | null;
	metadata: Record<string, unknown>;
}

/** One INSERT for up to MAX_PURGE_BATCH events of the same type and actor: 3 + 4 bound values per row. */
export function eventsStatement(
	db: D1Database,
	eventType: string,
	actor: { type: 'admin' | 'system'; ref: string | null },
	rows: EventRow[]
): D1PreparedStatement {
	const rowValues = rows.flatMap((row) => [crypto.randomUUID(), row.invitationId, row.submissionId, JSON.stringify(row.metadata)]);
	return db
		.prepare(
			`INSERT INTO form_events (event_type, actor_type, actor_ref, id, invitation_id, submission_id, metadata_json)
			 SELECT ?, ?, ?, column1, column2, column3, column4
			 FROM (VALUES ${rows.map(() => '(?, ?, ?, ?)').join(', ')})`
		)
		.bind(eventType, actor.type, actor.ref, ...rowValues);
}

export function placeholders(count: number): string {
	return Array.from({ length: count }, () => '?').join(', ');
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
	const counts = new Map<string, number>();
	for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
	return counts;
}
