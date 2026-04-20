import type { AvailabilityStatus, AvailabilityPeriodInput, UpdateAvailabilityPayload } from '../../types/api';
import type { OfferAvailabilityRow } from '../../types/db';
import { toAdminAvailabilityPeriod } from '../../mappers/availability';
import { jsonResponse, notFound, badRequest, parseJsonBody } from '../../utils/response';

const VALID_STATUSES: AvailabilityStatus[] = ['available', 'blocked', 'tentative'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NOTE_LENGTH = 500;
const MAX_PERIODS = 50;

export async function handleAdminGetAvailability(env: Env, offerId: string): Promise<Response> {
	const offer = await env.portal_db
		.prepare(`SELECT id FROM offers WHERE id = ?`)
		.bind(offerId)
		.first();

	if (!offer) {
		return notFound();
	}

	const result = await env.portal_db
		.prepare(
			`SELECT id, offer_id, date_from, date_to, status, note, created_at, updated_at
			 FROM offer_availability
			 WHERE offer_id = ?
			 ORDER BY date_from`
		)
		.bind(offerId)
		.all<OfferAvailabilityRow>();

	const data = result.results.map(toAdminAvailabilityPeriod);

	return jsonResponse({ data });
}

export async function handleAdminUpdateAvailability(env: Env, request: Request, offerId: string): Promise<Response> {
	const body = await parseJsonBody<UpdateAvailabilityPayload>(request);
	if (!body) {
		return badRequest('Invalid or missing JSON body');
	}

	if (!Array.isArray(body.periods)) {
		return badRequest('periods must be an array');
	}

	if (body.periods.length > MAX_PERIODS) {
		return badRequest(`periods must contain at most ${MAX_PERIODS} items`);
	}

	// --- Validate each period ---

	for (let i = 0; i < body.periods.length; i++) {
		const p = body.periods[i];
		const label = `periods[${i}]`;

		if (typeof p.dateFrom !== 'string' || !DATE_PATTERN.test(p.dateFrom)) {
			return badRequest(`${label}.dateFrom must be YYYY-MM-DD`);
		}
		if (typeof p.dateTo !== 'string' || !DATE_PATTERN.test(p.dateTo)) {
			return badRequest(`${label}.dateTo must be YYYY-MM-DD`);
		}
		if (p.dateFrom >= p.dateTo) {
			return badRequest(`${label}.dateFrom must be before dateTo`);
		}
		if (!VALID_STATUSES.includes(p.status)) {
			return badRequest(`${label}.status must be one of: ${VALID_STATUSES.join(', ')}`);
		}
		if (p.note !== undefined && p.note !== null) {
			if (typeof p.note !== 'string') {
				return badRequest(`${label}.note must be a string or null`);
			}
			if (p.note.length > MAX_NOTE_LENGTH) {
				return badRequest(`${label}.note must be at most ${MAX_NOTE_LENGTH} characters`);
			}
		}
	}

	// --- Check for overlapping date ranges ---

	const sorted = [...body.periods].sort((a, b) => a.dateFrom.localeCompare(b.dateFrom));
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i].dateFrom < sorted[i - 1].dateTo) {
			return badRequest('Availability periods must not overlap');
		}
	}

	// --- Check offer exists ---

	const offer = await env.portal_db
		.prepare(`SELECT id FROM offers WHERE id = ?`)
		.bind(offerId)
		.first();

	if (!offer) {
		return notFound();
	}

	// --- Bulk replace: delete existing, insert new ---

	const statements: D1PreparedStatement[] = [];

	statements.push(
		env.portal_db
			.prepare(`DELETE FROM offer_availability WHERE offer_id = ?`)
			.bind(offerId)
	);

	for (const p of body.periods) {
		const id = crypto.randomUUID();
		const note = typeof p.note === 'string' ? p.note.trim() || null : null;

		statements.push(
			env.portal_db
				.prepare(
					`INSERT INTO offer_availability (id, offer_id, date_from, date_to, status, note)
					 VALUES (?, ?, ?, ?, ?, ?)`
				)
				.bind(id, offerId, p.dateFrom, p.dateTo, p.status, note)
		);
	}

	await env.portal_db.batch(statements);

	return jsonResponse({ success: true, count: body.periods.length });
}
