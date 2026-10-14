import type { RouteHandler } from '../../router/types';
import type {
	AdminTenantFormSubmissionDetail,
	ReviewTenantFormSubmissionPayload,
	TenantFormReviewStatus,
	TenantFormSubmissionStatus,
} from '../../types/api';
import type { FormEventRow, FormSubmissionFileRow, FormSubmissionRow, FormSubmissionWithJoinsRow } from '../../types/db';
import {
	toAdminTenantFormAnswers,
	toAdminTenantFormConversionSummary,
	toAdminTenantFormEvent,
	toAdminTenantFormSubmissionFile,
	toAdminTenantFormSubmissionListItem,
} from '../../mappers/tenantForms';
import { requireAuth } from '../../middleware/requireAuth';
import { toIsoSeconds } from '../../utils/date';
import { loadFormStructure, loadFormTexts, type FormValues } from '../../utils/formSchema';
import { badRequest, jsonResponse, notFound, parseJsonBody } from '../../utils/response';
import { formEventStatement, type SqlCondition } from '../../utils/tenantFormInvitations';
import { allowedReviewStatuses, reviewNotAllowedMessage } from '../../utils/tenantFormReview';

const STATUS_FILTERS: TenantFormSubmissionStatus[] = ['submitted', 'approved', 'rejected', 'archived'];
const REVIEW_STATUSES: TenantFormReviewStatus[] = ['approved', 'rejected', 'archived'];
const MAX_REVIEW_NOTES_LENGTH = 2000;

const SUBMISSION_SELECT = `
	SELECT s.id, s.invitation_id, s.template_id, s.language, s.google_email, s.contact_email, s.phone, s.full_name,
	       s.planned_arrival, s.planned_departure, s.status, s.reviewed_by_email, s.reviewed_at, s.review_notes,
	       s.documents_delete_after, s.documents_deleted_at, s.remote_ip, s.user_agent, s.submitted_at,
	       s.customer_id, s.booking_id,
	       i.display_name, i.offer_id, o.title AS offer_title,
	       (SELECT COUNT(*) FROM form_submission_files f WHERE f.submission_id = s.id AND f.status = 'attached') AS file_count,
	       c.full_name AS customer_full_name, b.status AS booking_status, b.date_from AS booking_date_from,
	       b.date_to AS booking_date_to
	FROM form_submissions s
	JOIN form_invitations i ON i.id = s.invitation_id
	LEFT JOIN offers o ON o.id = i.offer_id
	LEFT JOIN customers c ON c.id = s.customer_id
	LEFT JOIN bookings b ON b.id = s.booking_id`;

export const handleAdminGetTenantFormSubmissions: RouteHandler = async ({ env, url }) => {
	const statusFilter = url.searchParams.get('status');
	const offerIdFilter = url.searchParams.get('offerId');

	if (statusFilter && !STATUS_FILTERS.includes(statusFilter as TenantFormSubmissionStatus)) {
		return badRequest(`Invalid status filter. Must be one of: ${STATUS_FILTERS.join(', ')}`);
	}

	const conditions: string[] = [];
	const bindings: string[] = [];
	if (statusFilter) {
		conditions.push('s.status = ?');
		bindings.push(statusFilter);
	}
	if (offerIdFilter) {
		conditions.push('i.offer_id = ?');
		bindings.push(offerIdFilter);
	}

	let sql = SUBMISSION_SELECT;
	if (conditions.length > 0) {
		sql += ` WHERE ${conditions.join(' AND ')}`;
	}
	sql += ` ORDER BY s.submitted_at DESC`;

	const result = await env.portal_db
		.prepare(sql)
		.bind(...bindings)
		.all<FormSubmissionWithJoinsRow>();

	return jsonResponse({ data: result.results.map(toAdminTenantFormSubmissionListItem) });
};

/** Answers with English labels whatever language the form was filled in. Every view is logged. */
export const handleAdminGetTenantFormSubmission: RouteHandler = async ({ env, request, params }) => {
	const admin = await requireAuth(request, env);
	if (!admin) {
		return jsonResponse({ error: 'Unauthorized' }, 401);
	}

	const row = await env.portal_db
		.prepare(`${SUBMISSION_SELECT} WHERE s.id = ?`)
		.bind(params.id)
		.first<FormSubmissionWithJoinsRow>();
	if (!row) {
		return notFound();
	}

	await formEventStatement(env.portal_db, {
		invitationId: row.invitation_id,
		eventType: 'submission_viewed',
		actorType: 'admin',
		actorRef: admin.email,
		submissionId: row.id,
	}).run();

	const [valuesRow, structure, texts, files, events] = await Promise.all([
		env.portal_db
			.prepare(`SELECT values_json FROM form_submissions WHERE id = ?`)
			.bind(row.id)
			.first<{ values_json: string }>(),
		loadFormStructure(env.portal_db, row.template_id),
		loadFormTexts(env.portal_db, row.template_id, 'en'),
		env.portal_db
			.prepare(
				`SELECT id, invitation_id, submission_id, field_key, r2_key, original_filename, mime_type, size_bytes,
				        status, uploaded_at, deleted_at
				 FROM form_submission_files WHERE submission_id = ? ORDER BY uploaded_at, rowid`
			)
			.bind(row.id)
			.all<FormSubmissionFileRow>(),
		env.portal_db
			.prepare(
				`SELECT id, invitation_id, submission_id, file_id, event_type, actor_type, actor_ref, metadata_json, created_at
				 FROM form_events WHERE invitation_id = ? ORDER BY created_at, rowid`
			)
			.bind(row.invitation_id)
			.all<FormEventRow>(),
	]);

	const values = JSON.parse(valuesRow?.values_json ?? '{}') as FormValues;
	const detail: AdminTenantFormSubmissionDetail = {
		...toAdminTenantFormSubmissionListItem(row),
		templateId: row.template_id,
		googleEmail: row.google_email,
		reviewedByEmail: row.reviewed_by_email,
		reviewNotes: row.review_notes,
		documentsDeleteAfter: row.documents_delete_after,
		documentsDeletedAt: row.documents_deleted_at,
		sections: structure ? toAdminTenantFormAnswers(structure, texts, values) : [],
		files: files.results.map(toAdminTenantFormSubmissionFile),
		values,
		events: events.results.map(toAdminTenantFormEvent),
		conversion: toAdminTenantFormConversionSummary(row),
		allowedReviewStatuses: allowedReviewStatuses(row.status as TenantFormSubmissionStatus, row.customer_id !== null),
	};
	return jsonResponse(detail);
};

export const handleAdminReviewTenantFormSubmission: RouteHandler = async ({ env, request, params }) => {
	const admin = await requireAuth(request, env);
	if (!admin) {
		return jsonResponse({ error: 'Unauthorized' }, 401);
	}

	const body = await parseJsonBody<ReviewTenantFormSubmissionPayload>(request);
	if (!body) {
		return badRequest('Invalid or missing JSON body');
	}
	if (body.status !== undefined && !REVIEW_STATUSES.includes(body.status)) {
		return badRequest(`status must be one of: ${REVIEW_STATUSES.join(', ')}`);
	}

	let reviewNotes: string | null | undefined;
	if (body.reviewNotes !== undefined) {
		if (body.reviewNotes !== null && typeof body.reviewNotes !== 'string') {
			return badRequest('reviewNotes must be a string or null');
		}
		const trimmed = body.reviewNotes?.trim() ?? '';
		if (trimmed.length > MAX_REVIEW_NOTES_LENGTH) {
			return badRequest(`reviewNotes must be at most ${MAX_REVIEW_NOTES_LENGTH} characters`);
		}
		reviewNotes = trimmed === '' ? null : trimmed;
	}
	if (body.status === undefined && reviewNotes === undefined) {
		return badRequest('status or reviewNotes is required');
	}

	const existing = await env.portal_db
		.prepare(`SELECT id, invitation_id, status, customer_id FROM form_submissions WHERE id = ?`)
		.bind(params.id)
		.first<Pick<FormSubmissionRow, 'id' | 'invitation_id' | 'status' | 'customer_id'>>();
	if (!existing) {
		return notFound();
	}

	const db = env.portal_db;
	const eventInput = { invitationId: existing.invitation_id, actorType: 'admin' as const, actorRef: admin.email, submissionId: existing.id };

	if (body.status === undefined) {
		// Notes only: the decision, the reviewer and the review time stay as they are.
		// Review notes may contain personal details, so they stay out of the event log.
		await db.batch([
			db
				.prepare(`UPDATE form_submissions SET review_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
				.bind(reviewNotes ?? null, existing.id),
			formEventStatement(db, { ...eventInput, eventType: 'review_notes_updated' }),
		]);
	} else {
		const status = existing.status as TenantFormSubmissionStatus;
		const converted = existing.customer_id !== null;
		const allowed = allowedReviewStatuses(status, converted);
		if (!allowed.includes(body.status)) {
			return jsonResponse({ error: reviewNotAllowedMessage(status, converted, body.status), allowedStatuses: allowed }, 409);
		}

		// Both writes require the state the decision was checked against, so a review cannot race a
		// conversion or another review. The event goes first, while that state is still in place.
		const unchanged: SqlCondition = {
			sql: 'EXISTS (SELECT 1 FROM form_submissions WHERE id = ? AND status = ? AND (customer_id IS NOT NULL) = ?)',
			bindings: [existing.id, status, converted ? 1 : 0],
		};
		const notesSql = reviewNotes === undefined ? '' : ', review_notes = ?';
		const notesBinding = reviewNotes === undefined ? [] : [reviewNotes];
		const results = await db.batch([
			formEventStatement(db, { ...eventInput, eventType: body.status }, unchanged),
			db
				.prepare(
					`UPDATE form_submissions
					 SET status = ?, reviewed_by_email = ?, reviewed_at = ?${notesSql}, updated_at = CURRENT_TIMESTAMP
					 WHERE id = ? AND ${unchanged.sql}`
				)
				.bind(body.status, admin.email, toIsoSeconds(new Date()), ...notesBinding, existing.id, ...unchanged.bindings),
		]);
		if (results[1].meta.changes !== 1) {
			return jsonResponse({ error: 'The submission was changed meanwhile. Reload it and try again' }, 409);
		}
	}

	const row = await env.portal_db
		.prepare(`${SUBMISSION_SELECT} WHERE s.id = ?`)
		.bind(existing.id)
		.first<FormSubmissionWithJoinsRow>();
	return jsonResponse({
		...toAdminTenantFormSubmissionListItem(row!),
		reviewedByEmail: row!.reviewed_by_email,
		reviewNotes: row!.review_notes,
	});
};

/**
 * Streams a submitted file from the private bucket. The headers keep the browser from running
 * anything inside it (sandbox CSP, nosniff) or caching it. Every view is logged.
 */
export const handleAdminGetTenantFormFile: RouteHandler = async ({ env, request, url, params }) => {
	const admin = await requireAuth(request, env);
	if (!admin) {
		return jsonResponse({ error: 'Unauthorized' }, 401);
	}

	const file = await env.portal_db
		.prepare(
			`SELECT id, invitation_id, submission_id, r2_key, original_filename, mime_type
			 FROM form_submission_files WHERE id = ? AND status = 'attached'`
		)
		.bind(params.fileId)
		.first<Pick<FormSubmissionFileRow, 'id' | 'invitation_id' | 'submission_id' | 'r2_key' | 'original_filename' | 'mime_type'>>();
	if (!file) {
		return notFound();
	}

	const object = await env.tenant_files.get(file.r2_key);
	if (!object) {
		console.error('[tenant-forms] R2 object missing for file', file.id);
		return notFound();
	}

	const download = url.searchParams.get('download') === '1';
	await formEventStatement(env.portal_db, {
		invitationId: file.invitation_id,
		eventType: 'file_viewed',
		actorType: 'admin',
		actorRef: admin.email,
		submissionId: file.submission_id,
		fileId: file.id,
		metadata: { download },
	}).run();

	return new Response(object.body, {
		status: 200,
		headers: {
			'Content-Type': file.mime_type,
			'Content-Length': String(object.size),
			'Content-Disposition': contentDisposition(download ? 'attachment' : 'inline', file.original_filename),
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff',
			'Content-Security-Policy': "sandbox; default-src 'none'",
		},
	});
};

// --- Helpers ---

function contentDisposition(kind: 'inline' | 'attachment', fileName: string): string {
	const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
	return `${kind}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
