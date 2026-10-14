import type { RouteHandler } from '../../router/types';
import type {
	CreateTenantFormInvitationPayload,
	CreateTenantFormInvitationResponse,
	TenantFormInvitationLinkResponse,
	TenantFormInvitationStatus,
	TenantFormSubmissionStatus,
} from '../../types/api';
import type {
	FormEventRow,
	FormInvitationRow,
	FormInvitationWithJoinsRow,
	FormTemplateRow,
	LeadRow,
	OfferRow,
} from '../../types/db';
import { toAdminTenantFormEvent, toAdminTenantFormInvitation } from '../../mappers/tenantForms';
import { requireAuth } from '../../middleware/requireAuth';
import { toIsoSeconds } from '../../utils/date';
import { FORM_LANGUAGES, isFormLanguage } from '../../utils/formSchema';
import { deriveInvitationStatus, formEventStatement } from '../../utils/tenantFormInvitations';
import { deriveInvitationToken, hashInvitationToken } from '../../utils/tokens';
import { badRequest, jsonResponse, notFound, parseJsonBody } from '../../utils/response';

const TENANT_FORM_TEMPLATE_KEY = 'tenant_details';
const MAX_DISPLAY_NAME_LENGTH = 200;
const DEFAULT_VALID_DAYS = 5;
const MIN_VALID_DAYS = 1;
const MAX_VALID_DAYS = 14;
const MS_PER_DAY = 86_400_000;
const STATUS_FILTERS: TenantFormInvitationStatus[] = ['pending', 'opened', 'submitted', 'expired', 'revoked'];
const SUBMISSION_STATUS_FILTERS: TenantFormSubmissionStatus[] = ['submitted', 'approved', 'rejected', 'archived'];
const CONVERTED_FILTERS = ['true', 'false'];

const INVITATION_SELECT = `
	SELECT i.id, i.template_id, i.display_name, i.offer_id, i.language, i.status, i.expires_at,
	       i.google_email, i.lead_id, i.created_by_email, i.opened_at, i.authenticated_at,
	       i.submitted_at, i.revoked_at, i.created_at, i.updated_at,
	       o.title AS offer_title, s.id AS submission_id, s.status AS submission_status,
	       s.customer_id AS submission_customer_id
	FROM form_invitations i
	LEFT JOIN offers o ON o.id = i.offer_id
	LEFT JOIN form_submissions s ON s.invitation_id = i.id`;

export const handleAdminCreateTenantFormInvitation: RouteHandler = async ({ env, request }) => {
	const admin = await requireAuth(request, env);
	if (!admin) {
		return jsonResponse({ error: 'Unauthorized' }, 401);
	}

	const body = await parseJsonBody<CreateTenantFormInvitationPayload>(request);
	if (!body) {
		return badRequest('Invalid or missing JSON body');
	}

	if (typeof body.displayName !== 'string' || body.displayName.trim() === '') {
		return badRequest('displayName is required');
	}
	const displayName = body.displayName.trim();
	if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
		return badRequest(`displayName must be at most ${MAX_DISPLAY_NAME_LENGTH} characters`);
	}
	if (typeof body.offerId !== 'string' || body.offerId.trim() === '') {
		return badRequest('offerId is required');
	}
	if (!isFormLanguage(body.language)) {
		return badRequest(`language must be one of: ${FORM_LANGUAGES.join(', ')}`);
	}
	const language = body.language;

	const validDays = body.validDays ?? DEFAULT_VALID_DAYS;
	if (!Number.isInteger(validDays) || validDays < MIN_VALID_DAYS || validDays > MAX_VALID_DAYS) {
		return badRequest(`validDays must be an integer from ${MIN_VALID_DAYS} to ${MAX_VALID_DAYS}`);
	}

	let leadId: string | null = null;
	if (body.leadId !== undefined && body.leadId !== null) {
		if (typeof body.leadId !== 'string' || body.leadId.trim() === '') {
			return badRequest('leadId must be a non-empty string or null');
		}
		leadId = body.leadId.trim();
	}

	const [templateResult, offerResult, leadResult] = await env.portal_db.batch<Record<string, unknown>>([
		env.portal_db
			.prepare(
				`SELECT id FROM form_templates WHERE template_key = ? AND status = 'active' ORDER BY version DESC LIMIT 1`
			)
			.bind(TENANT_FORM_TEMPLATE_KEY),
		env.portal_db.prepare(`SELECT id FROM offers WHERE id = ?`).bind(body.offerId.trim()),
		env.portal_db.prepare(`SELECT id FROM leads WHERE id = ?`).bind(leadId),
	]);

	const template = templateResult.results[0] as Pick<FormTemplateRow, 'id'> | undefined;
	const offer = offerResult.results[0] as Pick<OfferRow, 'id'> | undefined;
	const lead = leadResult.results[0] as Pick<LeadRow, 'id'> | undefined;

	if (!template) {
		console.error('[tenant-forms] No active tenant form template');
		return jsonResponse({ error: 'Tenant form template is not available' }, 500);
	}
	if (!offer) {
		return badRequest('Offer not found');
	}
	if (leadId && !lead) {
		return badRequest('Lead not found');
	}

	const id = crypto.randomUUID();
	const token = await deriveInvitationToken(id, env.TENANT_LINK_SECRET);
	const tokenHash = await hashInvitationToken(token);
	const expiresAt = toIsoSeconds(new Date(Date.now() + validDays * MS_PER_DAY));

	await env.portal_db.batch([
		env.portal_db
			.prepare(
				`INSERT INTO form_invitations
				 (id, template_id, token_hash, display_name, offer_id, language, expires_at, lead_id, created_by_email)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(id, template.id, tokenHash, displayName, offer.id, language, expiresAt, leadId, admin.email),
		adminEvent(env, id, 'invitation_created', admin.email, { language, validDays }),
	]);

	const row = await selectInvitation(env, id);
	if (!row) {
		return jsonResponse({ error: 'Invitation could not be created' }, 500);
	}

	const response: CreateTenantFormInvitationResponse = {
		invitation: toAdminTenantFormInvitation(row, toIsoSeconds(new Date())),
		url: buildInvitationUrl(env.TENANT_FORM_URL_BASE, token),
	};
	return jsonResponse(response, 201);
};

export const handleAdminGetTenantFormInvitations: RouteHandler = async ({ env, url }) => {
	const statusFilter = url.searchParams.get('status');
	const submissionStatusFilter = url.searchParams.get('submissionStatus');
	const convertedFilter = url.searchParams.get('converted');
	const offerIdFilter = url.searchParams.get('offerId');

	if (statusFilter && !STATUS_FILTERS.includes(statusFilter as TenantFormInvitationStatus)) {
		return badRequest(`Invalid status filter. Must be one of: ${STATUS_FILTERS.join(', ')}`);
	}
	if (submissionStatusFilter && !SUBMISSION_STATUS_FILTERS.includes(submissionStatusFilter as TenantFormSubmissionStatus)) {
		return badRequest(`Invalid submissionStatus filter. Must be one of: ${SUBMISSION_STATUS_FILTERS.join(', ')}`);
	}
	if (convertedFilter && !CONVERTED_FILTERS.includes(convertedFilter)) {
		return badRequest(`Invalid converted filter. Must be one of: ${CONVERTED_FILTERS.join(', ')}`);
	}

	const now = toIsoSeconds(new Date());
	const conditions: string[] = [];
	const bindings: string[] = [];

	if (statusFilter === 'expired') {
		conditions.push(`i.status IN ('pending', 'opened') AND i.expires_at <= ?`);
		bindings.push(now);
	} else if (statusFilter === 'pending' || statusFilter === 'opened') {
		conditions.push('i.status = ? AND i.expires_at > ?');
		bindings.push(statusFilter, now);
	} else if (statusFilter) {
		conditions.push('i.status = ?');
		bindings.push(statusFilter);
	}
	if (submissionStatusFilter) {
		conditions.push('s.status = ?');
		bindings.push(submissionStatusFilter);
	}
	if (convertedFilter) {
		conditions.push(convertedFilter === 'true' ? 's.customer_id IS NOT NULL' : 's.customer_id IS NULL');
	}
	if (offerIdFilter) {
		conditions.push('i.offer_id = ?');
		bindings.push(offerIdFilter);
	}

	let sql = INVITATION_SELECT;
	if (conditions.length > 0) {
		sql += ` WHERE ${conditions.join(' AND ')}`;
	}
	sql += ` ORDER BY i.created_at DESC`;

	const result = await env.portal_db
		.prepare(sql)
		.bind(...bindings)
		.all<FormInvitationWithJoinsRow>();

	return jsonResponse({ data: result.results.map((row) => toAdminTenantFormInvitation(row, now)) });
};

export const handleAdminGetTenantFormInvitation: RouteHandler = async ({ env, params }) => {
	const row = await selectInvitation(env, params.id);
	if (!row) {
		return notFound();
	}

	const events = await env.portal_db
		.prepare(
			`SELECT id, invitation_id, submission_id, file_id, event_type, actor_type, actor_ref, metadata_json, created_at
			 FROM form_events WHERE invitation_id = ? ORDER BY created_at, rowid`
		)
		.bind(row.id)
		.all<FormEventRow>();

	return jsonResponse({
		...toAdminTenantFormInvitation(row, toIsoSeconds(new Date())),
		events: events.results.map(toAdminTenantFormEvent),
	});
};

/**
 * Recomputes the link of an open invitation from its id. Every reveal is logged. Invitations
 * whose token was not derived with the current TENANT_LINK_SECRET (created before links were
 * derived, or after a secret rotation) keep working for the tenant but cannot be shown again.
 */
export const handleAdminGetTenantFormInvitationLink: RouteHandler = async ({ env, request, params }) => {
	const admin = await requireAuth(request, env);
	if (!admin) {
		return jsonResponse({ error: 'Unauthorized' }, 401);
	}

	const invitation = await env.portal_db
		.prepare(`SELECT id, status, expires_at, token_hash FROM form_invitations WHERE id = ?`)
		.bind(params.id)
		.first<Pick<FormInvitationRow, 'id' | 'status' | 'expires_at' | 'token_hash'>>();
	if (!invitation) {
		return notFound();
	}

	const status = deriveInvitationStatus(invitation.status, invitation.expires_at, toIsoSeconds(new Date()));
	if (status !== 'pending' && status !== 'opened') {
		return jsonResponse({ error: `The link no longer works because the invitation is ${status}`, status }, 409);
	}

	const token = await deriveInvitationToken(invitation.id, env.TENANT_LINK_SECRET);
	if ((await hashInvitationToken(token)) !== invitation.token_hash) {
		return jsonResponse({ error: 'This link cannot be shown again. Revoke the invitation and create a new one.' }, 409);
	}

	await adminEvent(env, invitation.id, 'link_viewed', admin.email, null).run();
	const response: TenantFormInvitationLinkResponse = { url: buildInvitationUrl(env.TENANT_FORM_URL_BASE, token) };
	return jsonResponse(response);
};

// Only an invitation that has not been submitted can be revoked. Revoking never deletes data.
export const handleAdminRevokeTenantFormInvitation: RouteHandler = async ({ env, request, params }) => {
	const admin = await requireAuth(request, env);
	if (!admin) {
		return jsonResponse({ error: 'Unauthorized' }, 401);
	}

	const existing = await selectInvitation(env, params.id);
	if (!existing) {
		return notFound();
	}
	if (existing.status === 'revoked') {
		return jsonResponse({ error: 'Invitation is already revoked' }, 409);
	}
	if (existing.status === 'submitted') {
		return jsonResponse({ error: 'Invitation is already submitted' }, 409);
	}

	const now = toIsoSeconds(new Date());
	await env.portal_db.batch([
		env.portal_db
			.prepare(
				`UPDATE form_invitations SET status = 'revoked', revoked_at = ?, updated_at = CURRENT_TIMESTAMP
				 WHERE id = ? AND status IN ('pending', 'opened')`
			)
			.bind(now, existing.id),
		adminEvent(env, existing.id, 'revoked', admin.email, null),
	]);

	const row = await selectInvitation(env, existing.id);
	return jsonResponse(toAdminTenantFormInvitation(row!, now));
};

// --- Helpers ---

function selectInvitation(env: Env, id: string): Promise<FormInvitationWithJoinsRow | null> {
	return env.portal_db.prepare(`${INVITATION_SELECT} WHERE i.id = ?`).bind(id).first<FormInvitationWithJoinsRow>();
}

function adminEvent(
	env: Env,
	invitationId: string,
	eventType: string,
	adminEmail: string,
	metadata: Record<string, unknown> | null
): D1PreparedStatement {
	return formEventStatement(env.portal_db, { invitationId, eventType, actorType: 'admin', actorRef: adminEmail, metadata });
}

function buildInvitationUrl(base: string, token: string): string {
	return `${base.replace(/\/+$/, '')}/${token}`;
}
