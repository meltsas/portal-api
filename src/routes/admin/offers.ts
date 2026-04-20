import type { OfferStatus, CreateOfferPayload, UpdateOfferPayload } from '../../types/api';
import type { OfferRow } from '../../types/db';
import { toAdminOfferListItem } from '../../mappers/offers';
import { jsonResponse, notFound, badRequest, parseJsonBody } from '../../utils/response';

const VALID_STATUSES: OfferStatus[] = ['draft', 'active', 'inactive', 'archived'];
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 120;
const MAX_TITLE_LENGTH = 300;
const MAX_SUMMARY_LENGTH = 2000;
const MAX_LOCATION_LENGTH = 200;
const MAX_URL_LENGTH = 1000;

export async function handleAdminGetOffers(env: Env, url: URL): Promise<Response> {
	const statusFilter = url.searchParams.get('status');

	if (statusFilter && !VALID_STATUSES.includes(statusFilter as OfferStatus)) {
		return badRequest(`Invalid status filter. Must be one of: ${VALID_STATUSES.join(', ')}`);
	}

	let sql = `SELECT id, slug, title, location_name, summary, status, cover_image_url, created_at, updated_at FROM offers`;
	const bindings: string[] = [];

	if (statusFilter) {
		sql += ` WHERE status = ?`;
		bindings.push(statusFilter);
	}

	sql += ` ORDER BY created_at DESC`;

	const result = await env.portal_db
		.prepare(sql)
		.bind(...bindings)
		.all<OfferRow>();

	const data = result.results.map(toAdminOfferListItem);

	return jsonResponse({ data });
}

export async function handleAdminCreateOffer(env: Env, request: Request): Promise<Response> {
	const body = await parseJsonBody<CreateOfferPayload>(request);
	if (!body) {
		return badRequest('Invalid or missing JSON body');
	}

	// --- Required fields ---

	if (typeof body.slug !== 'string' || body.slug.trim() === '') {
		return badRequest('slug is required');
	}
	if (typeof body.title !== 'string' || body.title.trim() === '') {
		return badRequest('title is required');
	}

	const slug = body.slug.trim();
	const title = body.title.trim();

	if (slug.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(slug)) {
		return badRequest('slug must be lowercase alphanumeric with hyphens, max 120 characters');
	}
	if (title.length > MAX_TITLE_LENGTH) {
		return badRequest(`title must be at most ${MAX_TITLE_LENGTH} characters`);
	}

	// --- Optional fields ---

	const locationName = typeof body.locationName === 'string' ? body.locationName.trim() || null : null;
	const summary = typeof body.summary === 'string' ? body.summary.trim() || null : null;
	const coverImageUrl = typeof body.coverImageUrl === 'string' ? body.coverImageUrl.trim() || null : null;
	const status: OfferStatus = body.status ?? 'draft';

	if (locationName && locationName.length > MAX_LOCATION_LENGTH) {
		return badRequest(`locationName must be at most ${MAX_LOCATION_LENGTH} characters`);
	}
	if (summary && summary.length > MAX_SUMMARY_LENGTH) {
		return badRequest(`summary must be at most ${MAX_SUMMARY_LENGTH} characters`);
	}
	if (coverImageUrl && coverImageUrl.length > MAX_URL_LENGTH) {
		return badRequest(`coverImageUrl must be at most ${MAX_URL_LENGTH} characters`);
	}
	if (!VALID_STATUSES.includes(status)) {
		return badRequest(`status must be one of: ${VALID_STATUSES.join(', ')}`);
	}

	// --- Check slug uniqueness ---

	const existing = await env.portal_db
		.prepare(`SELECT id FROM offers WHERE slug = ?`)
		.bind(slug)
		.first();

	if (existing) {
		return jsonResponse({ error: 'An offer with this slug already exists' }, 409);
	}

	// --- Insert ---

	const id = crypto.randomUUID();

	await env.portal_db
		.prepare(
			`INSERT INTO offers (id, slug, title, location_name, summary, status, cover_image_url)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(id, slug, title, locationName, summary, status, coverImageUrl)
		.run();

	return jsonResponse({ id, slug }, 201);
}

export async function handleAdminUpdateOffer(env: Env, request: Request, offerId: string): Promise<Response> {
	const body = await parseJsonBody<UpdateOfferPayload>(request);
	if (!body) {
		return badRequest('Invalid or missing JSON body');
	}

	// --- Check offer exists ---

	const existing = await env.portal_db
		.prepare(`SELECT id, slug FROM offers WHERE id = ?`)
		.bind(offerId)
		.first<Pick<OfferRow, 'id' | 'slug'>>();

	if (!existing) {
		return notFound();
	}

	// --- Build update ---

	const fields: string[] = [];
	const values: unknown[] = [];

	if (body.title !== undefined) {
		if (typeof body.title !== 'string' || body.title.trim() === '') {
			return badRequest('title must be a non-empty string');
		}
		if (body.title.trim().length > MAX_TITLE_LENGTH) {
			return badRequest(`title must be at most ${MAX_TITLE_LENGTH} characters`);
		}
		fields.push('title = ?');
		values.push(body.title.trim());
	}

	if (body.locationName !== undefined) {
		const val = typeof body.locationName === 'string' ? body.locationName.trim() || null : null;
		if (val && val.length > MAX_LOCATION_LENGTH) {
			return badRequest(`locationName must be at most ${MAX_LOCATION_LENGTH} characters`);
		}
		fields.push('location_name = ?');
		values.push(val);
	}

	if (body.summary !== undefined) {
		const val = typeof body.summary === 'string' ? body.summary.trim() || null : null;
		if (val && val.length > MAX_SUMMARY_LENGTH) {
			return badRequest(`summary must be at most ${MAX_SUMMARY_LENGTH} characters`);
		}
		fields.push('summary = ?');
		values.push(val);
	}

	if (body.status !== undefined) {
		if (!VALID_STATUSES.includes(body.status)) {
			return badRequest(`status must be one of: ${VALID_STATUSES.join(', ')}`);
		}
		fields.push('status = ?');
		values.push(body.status);
	}

	if (body.coverImageUrl !== undefined) {
		const val = typeof body.coverImageUrl === 'string' ? body.coverImageUrl.trim() || null : null;
		if (val && val.length > MAX_URL_LENGTH) {
			return badRequest(`coverImageUrl must be at most ${MAX_URL_LENGTH} characters`);
		}
		fields.push('cover_image_url = ?');
		values.push(val);
	}

	if (fields.length === 0) {
		return badRequest('No fields to update');
	}

	fields.push('updated_at = CURRENT_TIMESTAMP');
	values.push(offerId);

	await env.portal_db
		.prepare(`UPDATE offers SET ${fields.join(', ')} WHERE id = ?`)
		.bind(...values)
		.run();

	return jsonResponse({ id: existing.id, slug: existing.slug });
}
