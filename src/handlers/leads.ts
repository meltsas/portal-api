import type { RouteHandler } from '../router/types';
import type { SubmitLeadPayload } from '../types/api';
import type { OfferRow, LeadRow } from '../types/db';
import { jsonResponse, badRequest, parseJsonBody } from '../utils/response';
import { verifyGoogleIdToken } from '../utils/googleAuth';

const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 254;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_REASON_OF_STAY_LENGTH = 300;
const MAX_USER_AGENT_LENGTH = 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const handleSubmitLead: RouteHandler = async ({ env, request }) => {
	const body = await parseJsonBody<SubmitLeadPayload>(request);
	if (!body) {
		return badRequest('Invalid or missing JSON body');
	}

	// --- Required fields (excluding email — that comes from the verified token) ---

	if (typeof body.googleToken !== 'string' || body.googleToken.trim() === '') {
		return badRequest('googleToken is required');
	}
	if (typeof body.offerId !== 'string' || body.offerId.trim() === '') {
		return badRequest('offerId is required');
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
	const name = body.name.trim();
	const message = body.message.trim();
	const dateFrom = body.dateFrom.trim();
	const dateTo = body.dateTo.trim();

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

	// --- Verify Google ID token ---
	// Identity comes ONLY from the verified token. We never trust an email
	// supplied in the request body — there isn't one to begin with.

	let tokenPayload;
	try {
		tokenPayload = await verifyGoogleIdToken(body.googleToken, env.GOOGLE_CLIENT_ID);
	} catch (error) {
		console.warn('[leads] Google token verification failed:', error instanceof Error ? error.message : error);
		return jsonResponse({ error: 'Invalid Google token' }, 401);
	}

	const email = tokenPayload.email.toLowerCase();
	const authSubject = tokenPayload.sub;

	if (email.length > MAX_EMAIL_LENGTH) {
		// Should never happen for a real Google account, but guard the column width.
		return badRequest('Verified email exceeds allowed length');
	}

	// --- Resolve offer ---

	const offer = await env.portal_db
		.prepare(`SELECT id, status FROM offers WHERE id = ?`)
		.bind(offerId)
		.first<Pick<OfferRow, 'id' | 'status'>>();

	if (!offer) {
		return badRequest('Offer not found');
	}
	if (offer.status !== 'active') {
		return jsonResponse({ error: 'Offer is not currently active' }, 422);
	}

	// --- Capture request metadata ---
	// CF-Connecting-IP is set by Cloudflare's edge and cannot be spoofed by the
	// client (in a normal, non-stacked-CDN setup). User-Agent is client-controlled,
	// so we cap its length defensively. Rate limiting / abuse protection for this
	// public endpoint is expected to live in Cloudflare WAF / Rate Limiting rules
	// rather than in the Worker itself.

	const remoteIp = request.headers.get('CF-Connecting-IP');
	const rawUserAgent = request.headers.get('User-Agent');
	const userAgent = rawUserAgent ? rawUserAgent.slice(0, MAX_USER_AGENT_LENGTH) : null;

	// --- Dedup: find an existing non-archived lead for (email, offerId) ---

	const existing = await env.portal_db
		.prepare(
			`SELECT id FROM leads
			 WHERE email = ? AND offer_id = ? AND status != ?
			 ORDER BY created_at DESC
			 LIMIT 1`
		)
		.bind(email, offer.id, 'archived')
		.first<Pick<LeadRow, 'id'>>();

	if (existing) {
		await env.portal_db
			.prepare(
				`UPDATE leads
				 SET name = ?, message = ?, requested_date_from = ?, requested_date_to = ?,
				     reason_of_stay = ?, auth_provider = ?, auth_subject = ?,
				     remote_ip = ?, user_agent = ?, updated_at = CURRENT_TIMESTAMP
				 WHERE id = ?`
			)
			.bind(name, message, dateFrom, dateTo, reasonOfStay, 'google', authSubject, remoteIp, userAgent, existing.id)
			.run();

		return jsonResponse({ ok: true });
	}

	const leadId = crypto.randomUUID();

	await env.portal_db
		.prepare(
			`INSERT INTO leads (id, offer_id, name, email, message, requested_date_from, requested_date_to,
			                    reason_of_stay, auth_provider, auth_subject, source, remote_ip, user_agent)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(leadId, offer.id, name, email, message, dateFrom, dateTo, reasonOfStay, 'google', authSubject, 'portal_form', remoteIp, userAgent)
		.run();

	return jsonResponse({ ok: true });
};
