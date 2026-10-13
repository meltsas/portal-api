import type { FormSubmissionFileRow } from '../types/db';

export const DEFAULT_MAX_FILE_BYTES = 10 * 1_048_576;
export const DEFAULT_ACCEPTED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
/** Counts deleted files too, so repeated upload/delete cannot run up R2 writes. */
export const MAX_UPLOADS_PER_INVITATION = 30;
export const MAX_STORED_BYTES_PER_INVITATION = 50 * 1_048_576;

const MAX_FILE_NAME_LENGTH = 200;

/** R2 keys are built from ids only; the original file name may contain a person's name. */
export function tenantFileKey(invitationId: string, fileId: string): string {
	return `tenant-forms/${invitationId}/${fileId}`;
}

/** File name as shown to the admin: no path, no control characters or quotes, at most 200 characters. */
export function sanitizeFileName(raw: string | null): string {
	let name = raw ?? '';
	try {
		name = decodeURIComponent(name);
	} catch {
		// Not URL-encoded; keep as sent.
	}
	name = (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f"]/g, '').trim();
	return (name || 'file').slice(0, MAX_FILE_NAME_LENGTH);
}

export async function listUploadedFiles(db: D1Database, invitationId: string): Promise<FormSubmissionFileRow[]> {
	const { results } = await db
		.prepare(
			`SELECT id, invitation_id, submission_id, field_key, r2_key, original_filename, mime_type, size_bytes,
			        status, uploaded_at, deleted_at
			 FROM form_submission_files
			 WHERE invitation_id = ? AND status = 'uploaded'
			 ORDER BY uploaded_at, rowid`
		)
		.bind(invitationId)
		.all<FormSubmissionFileRow>();
	return results;
}
