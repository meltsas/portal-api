import type { RouteHandler } from '../../router/types';
import type { TenantFormSubmitResponse, TenantFormValuesPayload } from '../../types/api';
import type { FormSubmissionFileRow } from '../../types/db';
import { requireTenantFormAccess } from '../../middleware/requireTenantFormAccess';
import { addDays, toIsoSeconds, todayIsoDate } from '../../utils/date';
import {
	collectFileIds,
	loadFormStructure,
	validateFormValues,
	type FieldError,
	type FormValues,
} from '../../utils/formSchema';
import { jsonResponse, parseJsonBodyWithLimit } from '../../utils/response';
import { formEventStatement } from '../../utils/tenantFormInvitations';
import { notifyAdminsOfSubmission } from '../../notifications/adminNotify';

const MAX_SUBMIT_BODY_BYTES = 200_000;
const MAX_USER_AGENT_LENGTH = 1000;
// Q9: identity documents are deleted this many days after the planned departure.
const DOCUMENT_RETENTION_DAYS = 30;

/**
 * Validates the complete form, checks that every referenced file was uploaded for this invitation,
 * then creates the submission, attaches the files, closes the invitation and deletes the draft
 * in one D1 batch (all or nothing).
 */
export const handleSubmitTenantForm: RouteHandler = async ({ env, ctx, request }) => {
	const access = await requireTenantFormAccess(request, env);
	if (access instanceof Response) {
		return access;
	}
	const { invitation, subject } = access;

	const parsed = await parseJsonBodyWithLimit<TenantFormValuesPayload>(request, MAX_SUBMIT_BODY_BYTES);
	if (parsed instanceof Response) {
		return parsed;
	}

	const structure = await loadFormStructure(env.portal_db, invitation.template_id);
	if (!structure) {
		return jsonResponse({ error: 'Form is not available' }, 500);
	}

	const result = validateFormValues(structure, parsed.body?.values, todayIsoDate(), 'submit');
	if (!result.ok) {
		return invalidValues(result.errors);
	}
	const values = result.values;

	const fileIdsByField = collectFileIds(structure, values);
	const allFileIds = [...fileIdsByField.values()].flat();
	const fileErrors = await findFileErrors(env.portal_db, invitation.id, fileIdsByField);
	if (fileErrors.length > 0) {
		return invalidValues(fileErrors);
	}

	const submissionId = crypto.randomUUID();
	const submittedAt = toIsoSeconds(new Date());
	const plannedDeparture = stringValue(values, 'planned_departure');
	const rawUserAgent = request.headers.get('User-Agent');

	const statements: D1PreparedStatement[] = [
		env.portal_db
			.prepare(
				`INSERT INTO form_submissions
				 (id, invitation_id, template_id, language, google_subject, google_email, contact_email, phone, full_name,
				  planned_arrival, planned_departure, values_json, documents_delete_after, remote_ip, user_agent, submitted_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				submissionId,
				invitation.id,
				invitation.template_id,
				invitation.language,
				subject,
				invitation.google_email ?? '',
				stringValue(values, 'contact_email') ?? '',
				stringValue(values, 'phone') ?? '',
				fullName(values),
				stringValue(values, 'planned_arrival'),
				plannedDeparture,
				JSON.stringify(values),
				plannedDeparture ? addDays(plannedDeparture, DOCUMENT_RETENTION_DAYS) : null,
				request.headers.get('CF-Connecting-IP'),
				rawUserAgent ? rawUserAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
				submittedAt
			),
	];

	if (allFileIds.length > 0) {
		statements.push(
			env.portal_db
				.prepare(
					`UPDATE form_submission_files SET status = 'attached', submission_id = ?
					 WHERE invitation_id = ? AND status = 'uploaded' AND id IN (${placeholders(allFileIds.length)})`
				)
				.bind(submissionId, invitation.id, ...allFileIds)
		);
	}

	statements.push(
		env.portal_db
			.prepare(
				`UPDATE form_invitations SET status = 'submitted', submitted_at = ?, updated_at = CURRENT_TIMESTAMP
				 WHERE id = ? AND status IN ('pending', 'opened')`
			)
			.bind(submittedAt, invitation.id),
		env.portal_db.prepare(`DELETE FROM form_drafts WHERE invitation_id = ?`).bind(invitation.id),
		formEventStatement(env.portal_db, {
			invitationId: invitation.id,
			eventType: 'submitted',
			actorType: 'tenant',
			actorRef: subject,
			submissionId,
			metadata: { fileCount: allFileIds.length },
		})
	);

	try {
		await env.portal_db.batch(statements);
	} catch (error) {
		// form_submissions.invitation_id is UNIQUE: a parallel submit already went through.
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			return jsonResponse({ error: 'Form has already been submitted', status: 'submitted' }, 409);
		}
		throw error;
	}

	// After the response; a failed email never affects the submission.
	ctx.waitUntil(
		notifyAdminsOfSubmission(env, {
			submissionId,
			fullName: fullName(values),
			googleEmail: invitation.google_email ?? '',
			offerTitle: invitation.offer_title,
			submittedAt,
		})
	);

	const response: TenantFormSubmitResponse = { submissionId, submittedAt };
	return jsonResponse(response, 201);
};

// --- Helpers ---

async function findFileErrors(
	db: D1Database,
	invitationId: string,
	fileIdsByField: Map<string, string[]>
): Promise<FieldError[]> {
	const allFileIds = [...fileIdsByField.values()].flat();
	if (allFileIds.length === 0) return [];

	const { results } = await db
		.prepare(
			`SELECT id, field_key FROM form_submission_files
			 WHERE invitation_id = ? AND status = 'uploaded' AND id IN (${placeholders(allFileIds.length)})`
		)
		.bind(invitationId, ...allFileIds)
		.all<Pick<FormSubmissionFileRow, 'id' | 'field_key'>>();
	const fieldByFileId = new Map(results.map((row) => [row.id, row.field_key]));

	const errors: FieldError[] = [];
	for (const [fieldKey, fileIds] of fileIdsByField) {
		if (fileIds.some((fileId) => fieldByFileId.get(fileId) !== fieldKey)) {
			errors.push({ field: fieldKey, code: 'invalid_file' });
		}
	}
	return errors;
}

function invalidValues(errors: FieldError[]): Response {
	return jsonResponse({ error: 'Invalid form values', errors }, 400);
}

function stringValue(values: FormValues, key: string): string | null {
	const value = values[key];
	return typeof value === 'string' ? value : null;
}

function fullName(values: FormValues): string {
	return [stringValue(values, 'first_name'), stringValue(values, 'last_name')].filter(Boolean).join(' ');
}

function placeholders(count: number): string {
	return Array.from({ length: count }, () => '?').join(', ');
}
