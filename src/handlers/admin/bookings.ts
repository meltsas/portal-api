import type { RouteHandler } from '../../router/types';
import type {
	BookingType,
	BookingStatus,
	CreateBookingPayload,
	UpdateBookingPayload,
} from '../../types/api';
import type { BookingRow, BookingWithJoinsRow } from '../../types/db';
import { toAdminBookingListItem, toAdminBookingDetail } from '../../mappers/bookings';
import { jsonResponse, notFound, badRequest, parseJsonBody } from '../../utils/response';

const VALID_BOOKING_TYPES: BookingType[] = ['customer_stay', 'owner_use', 'maintenance', 'blocked', 'other'];
const VALID_STATUSES: BookingStatus[] = ['draft', 'tentative', 'confirmed', 'cancelled', 'completed'];
const BLOCKING_STATUSES: BookingStatus[] = ['tentative', 'confirmed'];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TITLE_LENGTH = 200;
const MAX_REASON_LENGTH = 500;
const MAX_NOTES_LENGTH = 5000;
const MAX_CURRENCY_LENGTH = 8;
const MAX_HEAD_COUNT = 100;
const MAX_PRICE_CENTS = 100_000_000_000; // 1B EUR — defensive upper bound

const BOOKING_SELECT_COLUMNS =
	`b.id, b.offer_id, b.customer_id, b.booking_type, b.status, b.date_from, b.date_to,
	 b.reason_of_stay, b.title, b.notes, b.adults, b.children, b.price_total_cents,
	 b.currency, b.source_lead_id, b.created_at, b.updated_at,
	 o.title AS offer_title, o.slug AS offer_slug,
	 c.full_name AS customer_full_name, c.email AS customer_email`;

const BOOKING_FROM_JOIN =
	`FROM bookings b
	 LEFT JOIN offers o ON b.offer_id = o.id
	 LEFT JOIN customers c ON b.customer_id = c.id`;

export const handleAdminGetBookings: RouteHandler = async ({ env, url }) => {
	const offerId = url.searchParams.get('offerId');
	const customerId = url.searchParams.get('customerId');
	const status = url.searchParams.get('status');
	const bookingType = url.searchParams.get('bookingType');
	const dateFrom = url.searchParams.get('dateFrom');
	const dateTo = url.searchParams.get('dateTo');

	if (status && !VALID_STATUSES.includes(status as BookingStatus)) {
		return badRequest(`Invalid status filter. Must be one of: ${VALID_STATUSES.join(', ')}`);
	}
	if (bookingType && !VALID_BOOKING_TYPES.includes(bookingType as BookingType)) {
		return badRequest(`Invalid bookingType filter. Must be one of: ${VALID_BOOKING_TYPES.join(', ')}`);
	}
	if (dateFrom && !DATE_PATTERN.test(dateFrom)) {
		return badRequest('dateFrom must be YYYY-MM-DD');
	}
	if (dateTo && !DATE_PATTERN.test(dateTo)) {
		return badRequest('dateTo must be YYYY-MM-DD');
	}
	if (dateFrom && dateTo && dateFrom >= dateTo) {
		return badRequest('dateFrom must be before dateTo');
	}

	const conditions: string[] = [];
	const bindings: (string | number)[] = [];

	if (offerId) {
		conditions.push('b.offer_id = ?');
		bindings.push(offerId);
	}
	if (customerId) {
		conditions.push('b.customer_id = ?');
		bindings.push(customerId);
	}
	if (status) {
		conditions.push('b.status = ?');
		bindings.push(status);
	}
	if (bookingType) {
		conditions.push('b.booking_type = ?');
		bindings.push(bookingType);
	}
	// Date-range filter returns bookings that OVERLAP the requested window,
	// not only ones fully contained inside it.
	if (dateFrom && dateTo) {
		conditions.push('b.date_from < ? AND b.date_to > ?');
		bindings.push(dateTo, dateFrom);
	} else if (dateFrom) {
		conditions.push('b.date_to > ?');
		bindings.push(dateFrom);
	} else if (dateTo) {
		conditions.push('b.date_from < ?');
		bindings.push(dateTo);
	}

	let sql = `SELECT ${BOOKING_SELECT_COLUMNS} ${BOOKING_FROM_JOIN}`;
	if (conditions.length > 0) {
		sql += ` WHERE ${conditions.join(' AND ')}`;
	}
	sql += ` ORDER BY b.date_from DESC`;

	const result = await env.portal_db
		.prepare(sql)
		.bind(...bindings)
		.all<BookingWithJoinsRow>();

	const data = result.results.map(toAdminBookingListItem);

	return jsonResponse({ data });
};

export const handleAdminGetBooking: RouteHandler = async ({ env, params }) => {
	const id = params.id;

	const row = await env.portal_db
		.prepare(`SELECT ${BOOKING_SELECT_COLUMNS} ${BOOKING_FROM_JOIN} WHERE b.id = ?`)
		.bind(id)
		.first<BookingWithJoinsRow>();

	if (!row) {
		return notFound();
	}

	return jsonResponse(toAdminBookingDetail(row));
};

export const handleAdminCreateBooking: RouteHandler = async ({ env, request }) => {
	const body = await parseJsonBody<CreateBookingPayload>(request);
	if (!body) {
		return badRequest('Invalid or missing JSON body');
	}

	if (typeof body.offerId !== 'string' || body.offerId.trim() === '') {
		return badRequest('offerId is required');
	}
	if (typeof body.dateFrom !== 'string' || !DATE_PATTERN.test(body.dateFrom)) {
		return badRequest('dateFrom must be YYYY-MM-DD');
	}
	if (typeof body.dateTo !== 'string' || !DATE_PATTERN.test(body.dateTo)) {
		return badRequest('dateTo must be YYYY-MM-DD');
	}

	const offerId = body.offerId.trim();
	const dateFrom = body.dateFrom.trim();
	const dateTo = body.dateTo.trim();

	if (dateFrom >= dateTo) {
		return badRequest('dateTo must be greater than dateFrom');
	}

	const bookingType: BookingType = body.bookingType ?? 'customer_stay';
	if (!VALID_BOOKING_TYPES.includes(bookingType)) {
		return badRequest(`bookingType must be one of: ${VALID_BOOKING_TYPES.join(', ')}`);
	}

	const status: BookingStatus = body.status ?? 'tentative';
	if (!VALID_STATUSES.includes(status)) {
		return badRequest(`status must be one of: ${VALID_STATUSES.join(', ')}`);
	}

	const customerId = body.customerId ?? null;
	if (customerId !== null && typeof customerId !== 'string') {
		return badRequest('customerId must be a string or null');
	}

	const sourceLeadId = body.sourceLeadId ?? null;
	if (sourceLeadId !== null && typeof sourceLeadId !== 'string') {
		return badRequest('sourceLeadId must be a string or null');
	}

	const reasonOfStay = readBoundedString(body.reasonOfStay, MAX_REASON_LENGTH, 'reasonOfStay');
	if (reasonOfStay instanceof Response) return reasonOfStay;

	const title = readBoundedString(body.title, MAX_TITLE_LENGTH, 'title');
	if (title instanceof Response) return title;

	const notes = readBoundedString(body.notes, MAX_NOTES_LENGTH, 'notes');
	if (notes instanceof Response) return notes;

	const currency = readBoundedString(body.currency, MAX_CURRENCY_LENGTH, 'currency');
	if (currency instanceof Response) return currency;

	const adults = readNonNegativeInt(body.adults, MAX_HEAD_COUNT, 'adults');
	if (adults instanceof Response) return adults;

	const children = readNonNegativeInt(body.children, MAX_HEAD_COUNT, 'children');
	if (children instanceof Response) return children;

	const priceTotalCents = readOptionalNonNegativeInt(body.priceTotalCents, MAX_PRICE_CENTS, 'priceTotalCents');
	if (priceTotalCents instanceof Response) return priceTotalCents;

	// --- Resolve offer ---

	const offer = await env.portal_db
		.prepare(`SELECT id FROM offers WHERE id = ?`)
		.bind(offerId)
		.first<{ id: string }>();
	if (!offer) {
		return badRequest('Offer not found');
	}

	if (customerId) {
		const customer = await env.portal_db
			.prepare(`SELECT id FROM customers WHERE id = ?`)
			.bind(customerId)
			.first<{ id: string }>();
		if (!customer) {
			return badRequest('Customer not found');
		}
	}

	// --- Overlap check ---
	// Only blocking statuses (tentative/confirmed) compete for the same window.
	// draft / cancelled / completed are non-blocking by design.

	if (BLOCKING_STATUSES.includes(status)) {
		const overlap = await findOverlap(env, offerId, dateFrom, dateTo, null);
		if (overlap) {
			return jsonResponse(
				{ error: 'Booking overlaps an existing tentative or confirmed booking for this offer' },
				409,
			);
		}
	}

	const id = crypto.randomUUID();

	await env.portal_db
		.prepare(
			`INSERT INTO bookings
			 (id, offer_id, customer_id, booking_type, status, date_from, date_to,
			  reason_of_stay, title, notes, adults, children, price_total_cents,
			  currency, source_lead_id)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id, offerId, customerId, bookingType, status, dateFrom, dateTo,
			reasonOfStay, title, notes, adults, children, priceTotalCents,
			currency || 'EUR', sourceLeadId,
		)
		.run();

	return jsonResponse({ id }, 201);
};

export const handleAdminUpdateBooking: RouteHandler = async ({ env, request, params }) => {
	const id = params.id;

	const body = await parseJsonBody<UpdateBookingPayload>(request);
	if (!body) {
		return badRequest('Invalid or missing JSON body');
	}

	const existing = await env.portal_db
		.prepare(
			`SELECT id, offer_id, status, date_from, date_to FROM bookings WHERE id = ?`
		)
		.bind(id)
		.first<Pick<BookingRow, 'id' | 'offer_id' | 'status' | 'date_from' | 'date_to'>>();

	if (!existing) {
		return notFound();
	}

	const fields: string[] = [];
	const values: unknown[] = [];

	let nextStatus: BookingStatus = existing.status as BookingStatus;
	let nextDateFrom = existing.date_from;
	let nextDateTo = existing.date_to;

	if (body.bookingType !== undefined) {
		if (!VALID_BOOKING_TYPES.includes(body.bookingType)) {
			return badRequest(`bookingType must be one of: ${VALID_BOOKING_TYPES.join(', ')}`);
		}
		fields.push('booking_type = ?');
		values.push(body.bookingType);
	}

	if (body.status !== undefined) {
		if (!VALID_STATUSES.includes(body.status)) {
			return badRequest(`status must be one of: ${VALID_STATUSES.join(', ')}`);
		}
		nextStatus = body.status;
		fields.push('status = ?');
		values.push(body.status);
	}

	if (body.dateFrom !== undefined) {
		if (typeof body.dateFrom !== 'string' || !DATE_PATTERN.test(body.dateFrom)) {
			return badRequest('dateFrom must be YYYY-MM-DD');
		}
		nextDateFrom = body.dateFrom.trim();
		fields.push('date_from = ?');
		values.push(nextDateFrom);
	}

	if (body.dateTo !== undefined) {
		if (typeof body.dateTo !== 'string' || !DATE_PATTERN.test(body.dateTo)) {
			return badRequest('dateTo must be YYYY-MM-DD');
		}
		nextDateTo = body.dateTo.trim();
		fields.push('date_to = ?');
		values.push(nextDateTo);
	}

	if (nextDateFrom >= nextDateTo) {
		return badRequest('dateTo must be greater than dateFrom');
	}

	if (body.customerId !== undefined) {
		if (body.customerId !== null && typeof body.customerId !== 'string') {
			return badRequest('customerId must be a string or null');
		}
		if (body.customerId) {
			const customer = await env.portal_db
				.prepare(`SELECT id FROM customers WHERE id = ?`)
				.bind(body.customerId)
				.first<{ id: string }>();
			if (!customer) {
				return badRequest('Customer not found');
			}
		}
		fields.push('customer_id = ?');
		values.push(body.customerId);
	}

	if (body.sourceLeadId !== undefined) {
		if (body.sourceLeadId !== null && typeof body.sourceLeadId !== 'string') {
			return badRequest('sourceLeadId must be a string or null');
		}
		fields.push('source_lead_id = ?');
		values.push(body.sourceLeadId);
	}

	const stringUpdates: Array<[string, keyof UpdateBookingPayload, number, string]> = [
		['reason_of_stay', 'reasonOfStay', MAX_REASON_LENGTH, 'reasonOfStay'],
		['title', 'title', MAX_TITLE_LENGTH, 'title'],
		['notes', 'notes', MAX_NOTES_LENGTH, 'notes'],
		['currency', 'currency', MAX_CURRENCY_LENGTH, 'currency'],
	];

	for (const [column, key, max, label] of stringUpdates) {
		const incoming = body[key];
		if (incoming === undefined) continue;
		if (typeof incoming !== 'string') {
			return badRequest(`${label} must be a string`);
		}
		const trimmed = incoming.trim();
		if (trimmed.length > max) {
			return badRequest(`${label} must be at most ${max} characters`);
		}
		fields.push(`${column} = ?`);
		values.push(trimmed);
	}

	if (body.adults !== undefined) {
		const v = readNonNegativeInt(body.adults, MAX_HEAD_COUNT, 'adults');
		if (v instanceof Response) return v;
		fields.push('adults = ?');
		values.push(v);
	}
	if (body.children !== undefined) {
		const v = readNonNegativeInt(body.children, MAX_HEAD_COUNT, 'children');
		if (v instanceof Response) return v;
		fields.push('children = ?');
		values.push(v);
	}
	if (body.priceTotalCents !== undefined) {
		const v = readOptionalNonNegativeInt(body.priceTotalCents, MAX_PRICE_CENTS, 'priceTotalCents');
		if (v instanceof Response) return v;
		fields.push('price_total_cents = ?');
		values.push(v);
	}

	if (fields.length === 0) {
		return badRequest('No fields to update');
	}

	// --- Overlap check ---
	// Re-check whenever the resulting booking is blocking and the window or
	// status changed. Cheap enough to always run when blocking.

	if (BLOCKING_STATUSES.includes(nextStatus)) {
		const overlap = await findOverlap(env, existing.offer_id, nextDateFrom, nextDateTo, id);
		if (overlap) {
			return jsonResponse(
				{ error: 'Booking overlaps an existing tentative or confirmed booking for this offer' },
				409,
			);
		}
	}

	fields.push('updated_at = CURRENT_TIMESTAMP');
	values.push(id);

	await env.portal_db
		.prepare(`UPDATE bookings SET ${fields.join(', ')} WHERE id = ?`)
		.bind(...values)
		.run();

	return jsonResponse({ id });
};

// --- Helpers ---

async function findOverlap(
	env: Env,
	offerId: string,
	dateFrom: string,
	dateTo: string,
	excludeId: string | null,
): Promise<{ id: string } | null> {
	const placeholders = BLOCKING_STATUSES.map(() => '?').join(', ');
	let sql = `SELECT id FROM bookings
	           WHERE offer_id = ?
	             AND status IN (${placeholders})
	             AND date_from < ? AND date_to > ?`;
	const bindings: (string | number)[] = [offerId, ...BLOCKING_STATUSES, dateTo, dateFrom];

	if (excludeId) {
		sql += ' AND id != ?';
		bindings.push(excludeId);
	}

	sql += ' LIMIT 1';

	return env.portal_db
		.prepare(sql)
		.bind(...bindings)
		.first<{ id: string }>();
}

function readBoundedString(value: unknown, max: number, label: string): string | Response {
	if (value === undefined || value === null) return '';
	if (typeof value !== 'string') {
		return badRequest(`${label} must be a string`);
	}
	const trimmed = value.trim();
	if (trimmed.length > max) {
		return badRequest(`${label} must be at most ${max} characters`);
	}
	return trimmed;
}

function readNonNegativeInt(value: unknown, max: number, label: string): number | Response {
	if (value === undefined || value === null) return 0;
	if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > max) {
		return badRequest(`${label} must be a non-negative integer up to ${max}`);
	}
	return value;
}

function readOptionalNonNegativeInt(value: unknown, max: number, label: string): number | null | Response {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > max) {
		return badRequest(`${label} must be a non-negative integer up to ${max}, or null`);
	}
	return value;
}
