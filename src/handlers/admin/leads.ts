import type { RouteHandler } from '../../router/types';
import type { LeadStatus, UpdateLeadPayload } from '../../types/api';
import type { LeadWithOfferTitleRow } from '../../types/db';
import { toAdminLeadListItem, toAdminLeadDetail } from '../../mappers/leads';
import { jsonResponse, notFound, badRequest, parseJsonBody } from '../../utils/response';

const VALID_STATUSES: LeadStatus[] = ['new', 'contacted', 'closed', 'spam', 'archived'];
const MAX_ADMIN_NOTES_LENGTH = 5000;

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
		`SELECT l.id, l.offer_id, l.status, l.name, l.email, l.phone, l.message,
		        l.requested_date_from, l.requested_date_to, l.auth_provider, l.auth_subject,
		        l.source, l.admin_notes, l.created_at, l.updated_at,
		        o.title AS offer_title
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
			`SELECT l.id, l.offer_id, l.status, l.name, l.email, l.phone, l.message,
			        l.requested_date_from, l.requested_date_to, l.auth_provider, l.auth_subject,
			        l.source, l.admin_notes, l.created_at, l.updated_at,
			        o.title AS offer_title
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
