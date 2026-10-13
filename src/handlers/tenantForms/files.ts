import type { RouteHandler } from '../../router/types';
import type { TenantFormUploadResponse } from '../../types/api';
import type { FormSubmissionFileRow } from '../../types/db';
import { toTenantFormUploadedFile } from '../../mappers/tenantForms';
import { requireTenantFormAccess } from '../../middleware/requireTenantFormAccess';
import { toIsoSeconds } from '../../utils/date';
import { sniffFileType } from '../../utils/fileSniff';
import { loadFormStructure } from '../../utils/formSchema';
import { badRequest, jsonResponse, notFound } from '../../utils/response';
import {
	DEFAULT_ACCEPTED_FILE_TYPES,
	DEFAULT_MAX_FILE_BYTES,
	MAX_STORED_BYTES_PER_INVITATION,
	MAX_UPLOADS_PER_INVITATION,
	sanitizeFileName,
	tenantFileKey,
} from '../../utils/tenantFormFiles';
import { formEventStatement } from '../../utils/tenantFormInvitations';

const DEFAULT_MAX_FILES = 10;

interface UploadCountsRow {
	uploads: number;
	field_files: number;
	stored_bytes: number;
}

/**
 * Raw file bytes as the body, with headers `X-Field-Key` and `X-File-Name` (URL-encoded).
 * The file is buffered (≤ 10 MB) so its first bytes can be checked before it reaches R2;
 * the browser's Content-Type and the file name are never trusted.
 */
export const handleUploadTenantFormFile: RouteHandler = async ({ env, request }) => {
	const access = await requireTenantFormAccess(request, env);
	if (access instanceof Response) {
		return access;
	}
	const { invitation, subject } = access;

	const structure = await loadFormStructure(env.portal_db, invitation.template_id);
	const fieldKey = request.headers.get('X-Field-Key');
	const field = structure?.sections
		.flatMap((section) => section.fields)
		.find((candidate) => candidate.key === fieldKey && candidate.type === 'file');
	if (!field) {
		return badRequest('X-Field-Key must name a file field of this form');
	}

	const maxFileBytes = field.validation.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
	const contentLength = Number(request.headers.get('Content-Length'));
	if (!Number.isInteger(contentLength) || contentLength <= 0) {
		return jsonResponse({ error: 'Content-Length is required' }, 411);
	}
	if (contentLength > maxFileBytes) {
		return jsonResponse({ error: 'File is too large' }, 413);
	}

	const counts = await env.portal_db
		.prepare(
			`SELECT COUNT(*) AS uploads,
			        COALESCE(SUM(CASE WHEN status != 'deleted' AND field_key = ? THEN 1 ELSE 0 END), 0) AS field_files,
			        COALESCE(SUM(CASE WHEN status != 'deleted' THEN size_bytes ELSE 0 END), 0) AS stored_bytes
			 FROM form_submission_files WHERE invitation_id = ?`
		)
		.bind(field.key, invitation.id)
		.first<UploadCountsRow>();
	if (counts && counts.uploads >= MAX_UPLOADS_PER_INVITATION) {
		return jsonResponse({ error: 'Upload limit reached' }, 409);
	}
	if (counts && counts.field_files >= (field.validation.maxFiles ?? DEFAULT_MAX_FILES)) {
		return jsonResponse({ error: 'Too many files for this field' }, 409);
	}
	if (counts && counts.stored_bytes + contentLength > MAX_STORED_BYTES_PER_INVITATION) {
		return jsonResponse({ error: 'Total size of uploaded files is too large' }, 409);
	}

	const bytes = new Uint8Array(await request.arrayBuffer());
	if (bytes.byteLength === 0) {
		return badRequest('File is empty');
	}
	if (bytes.byteLength > maxFileBytes) {
		return jsonResponse({ error: 'File is too large' }, 413);
	}

	const mimeType = sniffFileType(bytes);
	if (!mimeType || !(field.validation.accept ?? DEFAULT_ACCEPTED_FILE_TYPES).includes(mimeType)) {
		return jsonResponse({ error: 'Unsupported file type' }, 415);
	}

	const fileId = crypto.randomUUID();
	const r2Key = tenantFileKey(invitation.id, fileId);
	const row: FormSubmissionFileRow = {
		id: fileId,
		invitation_id: invitation.id,
		submission_id: null,
		field_key: field.key,
		r2_key: r2Key,
		original_filename: sanitizeFileName(request.headers.get('X-File-Name')),
		mime_type: mimeType,
		size_bytes: bytes.byteLength,
		status: 'uploaded',
		uploaded_at: toIsoSeconds(new Date()),
		deleted_at: null,
	};

	await env.tenant_files.put(r2Key, bytes, { httpMetadata: { contentType: mimeType } });

	try {
		await env.portal_db.batch([
			env.portal_db
				.prepare(
					`INSERT INTO form_submission_files
					 (id, invitation_id, field_key, r2_key, original_filename, mime_type, size_bytes, status, uploaded_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, 'uploaded', ?)`
				)
				.bind(row.id, row.invitation_id, row.field_key, row.r2_key, row.original_filename, row.mime_type, row.size_bytes, row.uploaded_at),
			formEventStatement(env.portal_db, {
				invitationId: invitation.id,
				eventType: 'file_uploaded',
				actorType: 'tenant',
				actorRef: subject,
				fileId,
				metadata: { sizeBytes: row.size_bytes, mimeType },
			}),
		]);
	} catch (error) {
		console.error('[tenant-forms] Could not record uploaded file', fileId, error instanceof Error ? error.message : 'unknown');
		await env.tenant_files.delete(r2Key).catch(() => undefined);
		return jsonResponse({ error: 'File could not be saved' }, 500);
	}

	const response: TenantFormUploadResponse = { file: toTenantFormUploadedFile(row) };
	return jsonResponse(response, 201);
};

/** Removes a file that has not been submitted yet, from R2 and from the form. */
export const handleDeleteTenantFormFile: RouteHandler = async ({ env, request, params }) => {
	const access = await requireTenantFormAccess(request, env);
	if (access instanceof Response) {
		return access;
	}
	const { invitation, subject } = access;

	const file = await env.portal_db
		.prepare(`SELECT id, r2_key FROM form_submission_files WHERE id = ? AND invitation_id = ? AND status = 'uploaded'`)
		.bind(params.fileId, invitation.id)
		.first<Pick<FormSubmissionFileRow, 'id' | 'r2_key'>>();
	if (!file) {
		return notFound();
	}

	await env.tenant_files.delete(file.r2_key);
	await env.portal_db.batch([
		env.portal_db
			.prepare(`UPDATE form_submission_files SET status = 'deleted', deleted_at = ? WHERE id = ? AND status = 'uploaded'`)
			.bind(toIsoSeconds(new Date()), file.id),
		formEventStatement(env.portal_db, {
			invitationId: invitation.id,
			eventType: 'file_deleted',
			actorType: 'tenant',
			actorRef: subject,
			fileId: file.id,
		}),
	]);

	return jsonResponse({ ok: true });
};
