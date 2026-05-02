import type { RouteHandler } from '../../router/types';
import type { LeadStatus, CreateLeadPayload, UpdateLeadPayload } from '../../types/api';
import type { LeadWithOfferTitleRow, OfferRow } from '../../types/db';
import { toAdminLeadListItem, toAdminLeadDetail } from '../../mappers/leads';
import { jsonResponse, notFound, badRequest, parseJsonBody } from '../../utils/response';

const VALID_STATUSES: LeadStatus[] = ['new', 'contacted', 'closed', 'spam', 'archived'];
const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 254;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_REASON_OF_STAY_LENGTH = 300;
const MAX_ADMIN_NOTES_LENGTH = 5000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const LEAD_SELECT_COLUMNS =
	`l.id, l.offer_id, l.status, l.name, l.email, l.phone, l.message,
	 l.requested_date_from, l.requested_date_to, l.reason_of_stay,
	 l.auth_provider, l.auth_subject, l.source, l.admin_notes,
	 l.remote_ip, l.user_agent, l.created_at, l.updated_at,
	 o.title AS offer_title`;

export const handleAdminGetLeads: RouteHandler = async ({ env, url }) => {
	const statusFilter = url.searchParams.get('status');
	const offerIdFilter = url.searchParams.get('offerId');

	if (statusFilter && !VALID_STATUSES.includes(statusFilter as LeadStatus)) {
		return badRequest(`Invalid status filter. Must be one of: ${VALID_STATUSES.join(', ')}`);
	}

	const conditions: string[] = [];
	const bindings: string[] = [];

	if (statusFilter) {
		conditions.push('l.status = ?');
		bindings.push(statusFilter);
	}
	if (offerIdFilter) {
		conditions.push('l.offer_id = ?');
		bindings.push(offerIdFilter);
	}

	let sql =
		`SELECT ${LEAD_SELECT_COLUMNS}
		 FROM leads l
		 LEFT JOIN offers o ON l.offer_id = o.id`;

	if (conditions.length > 0) {
		sql += ` WHERE ${conditions.join(' AND ')}`;
	}

	sql += ` ORDER BY l.created_at DESC`;

	const result = await env.portal_db
		.prepare(sql)
		.bind(...bindings)
		.all<LeadWithOfferTitleRow>();

	const data = result.results.map(toAdminLeadListItem);

	return jsonResponse({ data });
};

export const handleAdminGetLead: RouteHandler = async ({ env, params }) => {
	const leadId = params.leadId;

	const row = await env.portal_db
		.prepare(
			`SELECT ${LEAD_SELECT_COLUMNS}
			 FROM leads l
			 LEFT JOIN offers o ON l.offer_id = o.id
			 WHERE l.id = ?`
		)
		.bind(leadId)
		.first<LeadWithOfferTitleRow>();

	if (!row) {
		return notFound();
	}

	return jsonResponse(toAdminLeadDetail(row));
};

export const handleAdminCreateLead: RouteHandler = async ({ env, request }) => {
	const body = await parseJsonBody<CreateLeadPayload>(request);
	if (!body) {
		return badRequest('Invalid or missing JSON body');
	}

	// --- Required fields ---

	if (typeof body.offerId !== 'string' || body.offerId.trim() === '') {
		return badRequest('offerId is required');
	}
	if (typeof body.email !== 'string' || body.email.trim() === '') {
		return badRequest('email is required');
	}
	if (typeof body.name !== 'string' || body.name.trim() === '') {
		return badRequest('name is required');
	}
	if (typeof body.message !== 'string' || body.message.trim() === '') {
		return badRequest('message is required');
	}
	if (typeof body.dateFrom !== 'string' || !DATE_PATTERN.test(body.dateFrom)) {
		return badRequest('dateFrom must be YYYY-MM-DD');
	}
	if (typeof body.dateTo !== 'string' || !DATE_PATTERN.test(body.dateTo)) {
		return badRequest('dateTo must be YYYY-MM-DD');
	}

	const offerId = body.offerId.trim();
	const email = body.email.trim().toLowerCase();
	const name = body.name.trim();
	const message = body.message.trim();
	const dateFrom = body.dateFrom.trim();
	const dateTo = body.dateTo.trim();

	if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
		return badRequest('Invalid email format');
	}
	if (name.length > MAX_NAME_LENGTH) {
		return badRequest(`name must be at most ${MAX_NAME_LENGTH} characters`);
	}
	if (message.length > MAX_MESSAGE_LENGTH) {
		return badRequest(`message must be at most ${MAX_MESSAGE_LENGTH} characters`);
	}
	if (dateFrom > dateTo) {
		return badRequest('dateFrom must not be after dateTo');
	}

	// --- Optional reasonOfStay ---

	let reasonOfStay: string | null = null;
	if (body.reasonOfStay !== undefined && body.reasonOfStay !== null) {
		if (typeof body.reasonOfStay !== 'string') {
			return badRequest('reasonOfStay must be a string');
		}
		const trimmed = body.reasonOfStay.trim();
		if (trimmed.length > MAX_REASON_OF_STAY_LENGTH) {
			return badRequest(`reasonOfStay must be at most ${MAX_REASON_OF_STAY_LENGTH} characters`);
		}
		reasonOfStay = trimmed.length > 0 ? trimmed : null;
	}

	// --- Resolve offer ---

	const offer = await env.portal_db
		.prepare(`SELECT id FROM offers WHERE id = ?`)
		.bind(offerId)
		.first<Pick<OfferRow, 'id'>>();

	if (!offer) {
		return badRequest('Offer not found');
	}

	// --- Insert ---
	// Admin-created leads have no Google identity verification: auth_provider /
	// auth_subject stay NULL and source distinguishes the row from the public flow.

	const id = crypto.randomUUID();

	await env.portal_db
		.prepare(
			`INSERT INTO leads (id, offer_id, name, email, message, requested_date_from, requested_date_to,
			                    reason_of_stay, source)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(id, offer.id, name, email, message, dateFrom, dateTo, reasonOfStay, 'admin_manual')
		.run();

	return jsonResponse({ id }, 201);
};

export const handleAdminUpdateLead: RouteHandler = async ({ env, request, params }) => {
	const leadId = params.leadId;

	const body = await parseJsonBody<UpdateLeadPayload>(request);
	if (!body) {
		return badRequest('Invalid or missing JSON body');
	}

	// --- Check lead exists ---

	const existing = await env.portal_db
		.prepare(`SELECT id, status FROM leads WHERE id = ?`)
		.bind(leadId)
		.first<{ id: string; status: string }>();

	if (!existing) {
		return notFound();
	}

	// --- Build update ---

	const fields: string[] = [];
	const values: unknown[] = [];

	if (body.status !== undefined) {
		if (!VALID_STATUSES.includes(body.status)) {
			return badRequest(`status must be one of: ${VALID_STATUSES.join(', ')}`);
		}
		fields.push('status = ?');
		values.push(body.status);
	}

	if (body.adminNotes !== undefined) {
		const val = typeof body.adminNotes === 'string' ? body.adminNotes.trim() || null : null;
		if (val && val.length > MAX_ADMIN_NOTES_LENGTH) {
			return badRequest(`adminNotes must be at most ${MAX_ADMIN_NOTES_LENGTH} characters`);
		}
		fields.push('admin_notes = ?');
		values.push(val);
	}

	if (fields.length === 0) {
		return badRequest('No fields to update');
	}

	fields.push('updated_at = CURRENT_TIMESTAMP');
	values.push(leadId);

	await env.portal_db
		.prepare(`UPDATE leads SET ${fields.join(', ')} WHERE id = ?`)
		.bind(...values)
		.run();

	const newStatus = body.status ?? existing.status;

	return jsonResponse({ id: existing.id, status: newStatus });
};

export const handleAdminRemoveLead: RouteHandler = async ({ env, params }) => {
	const leadId = params.leadId;

	const result = await env.portal_db
		.prepare(`DELETE FROM leads WHERE id = ?`)
		.bind(leadId)
		.run();

	if (result.meta.changes === 0) {
		return notFound();
	}

	return jsonResponse({ id: leadId, deleted: true });
};
