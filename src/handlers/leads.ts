import type { RouteHandler } from '../router/types';
import type { SubmitLeadPayload } from '../types/api';
import type { OfferRow } from '../types/db';
import { jsonResponse, badRequest, parseJsonBody } from '../utils/response';

const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 30;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_USER_AGENT_LENGTH = 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const handleSubmitLead: RouteHandler = async ({ env, request }) => {
	const body = await parseJsonBody<SubmitLeadPayload>(request);
	if (!body) {
		return badRequest('Invalid or missing JSON body');
	}

	// --- Required fields ---

	if (typeof body.offerSlug !== 'string' || body.offerSlug.trim() === '') {
		return badRequest('offerSlug is required');
	}
	if (typeof body.name !== 'string' || body.name.trim() === '') {
		return badRequest('name is required');
	}
	if (typeof body.email !== 'string' || body.email.trim() === '') {
		return badRequest('email is required');
	}

	const offerSlug = body.offerSlug.trim();
	const name = body.name.trim();
	const email = body.email.trim().toLowerCase();

	if (name.length > MAX_NAME_LENGTH) {
		return badRequest(`name must be at most ${MAX_NAME_LENGTH} characters`);
	}
	if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
		return badRequest('Invalid email format');
	}

	// --- Optional fields ---

	const phone = typeof body.phone === 'string' ? body.phone.trim() : null;
	if (phone && phone.length > MAX_PHONE_LENGTH) {
		return badRequest(`phone must be at most ${MAX_PHONE_LENGTH} characters`);
	}

	const message = typeof body.message === 'string' ? body.message.trim() : null;
	if (message && message.length > MAX_MESSAGE_LENGTH) {
		return badRequest(`message must be at most ${MAX_MESSAGE_LENGTH} characters`);
	}

	const requestedDateFrom = typeof body.requestedDateFrom === 'string' ? body.requestedDateFrom.trim() : null;
	const requestedDateTo = typeof body.requestedDateTo === 'string' ? body.requestedDateTo.trim() : null;

	if (requestedDateFrom && !DATE_PATTERN.test(requestedDateFrom)) {
		return badRequest('requestedDateFrom must be YYYY-MM-DD');
	}
	if (requestedDateTo && !DATE_PATTERN.test(requestedDateTo)) {
		return badRequest('requestedDateTo must be YYYY-MM-DD');
	}
	if (requestedDateFrom && requestedDateTo && requestedDateFrom > requestedDateTo) {
		return badRequest('requestedDateFrom must not be after requestedDateTo');
	}

	// --- Resolve offer ---

	const offer = await env.portal_db
		.prepare(`SELECT id, status FROM offers WHERE slug = ?`)
		.bind(offerSlug)
		.first<Pick<OfferRow, 'id' | 'status'>>();

	if (!offer) {
		return badRequest('Offer not found');
	}
	if (offer.status !== 'active') {
		return jsonResponse({ error: 'Offer is not currently active' }, 422);
	}

	// --- Capture request metadata ---
	// CF-Connecting-IP is set by Cloudflare's edge and cannot be spoofed by the client
	// (in a normal, non-stacked-CDN setup). User-Agent is client-controlled, so we cap
	// its length defensively to bound storage cost.

	const remoteIp = request.headers.get('CF-Connecting-IP');
	const rawUserAgent = request.headers.get('User-Agent');
	const userAgent = rawUserAgent ? rawUserAgent.slice(0, MAX_USER_AGENT_LENGTH) : null;

	// --- Insert lead ---

	const leadId = crypto.randomUUID();

	await env.portal_db
		.prepare(
			`INSERT INTO leads (id, offer_id, name, email, phone, message, requested_date_from, requested_date_to, source, remote_ip, user_agent)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(leadId, offer.id, name, email, phone, message, requestedDateFrom, requestedDateTo, 'portal_form', remoteIp, userAgent)
		.run();

	return jsonResponse({ success: true, leadId }, 201);
};
