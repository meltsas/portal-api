import type { BookingStatus } from '../types/api';
import type { BookingRow } from '../types/db';

export const BOOKING_OVERLAP_ERROR = 'Booking overlaps an existing tentative or confirmed booking for this offer';

// Only these statuses compete for the same window; draft / cancelled / completed are non-blocking by design.
export const BLOCKING_STATUSES: BookingStatus[] = ['tentative', 'confirmed'];

const OVERLAP_CONDITION = `b.offer_id = ?
	AND b.status IN (${BLOCKING_STATUSES.map(() => '?').join(', ')})
	AND b.date_from < ? AND b.date_to > ?`;

function overlapBindings(offerId: string, dateFrom: string, dateTo: string): string[] {
	return [offerId, ...BLOCKING_STATUSES, dateTo, dateFrom];
}

/** A blocking booking of the offer that overlaps `dateFrom`–`dateTo`, other than `excludeId`. */
export function findOverlap(
	db: D1Database,
	offerId: string,
	dateFrom: string,
	dateTo: string,
	excludeId: string | null,
): Promise<{ id: string } | null> {
	let sql = `SELECT b.id FROM bookings b WHERE ${OVERLAP_CONDITION}`;
	const bindings = overlapBindings(offerId, dateFrom, dateTo);

	if (excludeId) {
		sql += ' AND b.id != ?';
		bindings.push(excludeId);
	}

	return db
		.prepare(`${sql} LIMIT 1`)
		.bind(...bindings)
		.first<{ id: string }>();
}

export type OverlappingBookingRow = Pick<BookingRow, 'id' | 'status' | 'date_from' | 'date_to' | 'title'> & {
	customer_full_name: string | null;
};

/** Every blocking booking of the offer that overlaps `dateFrom`–`dateTo`. */
export async function listOverlappingBookings(
	db: D1Database,
	offerId: string,
	dateFrom: string,
	dateTo: string,
): Promise<OverlappingBookingRow[]> {
	const { results } = await db
		.prepare(
			`SELECT b.id, b.status, b.date_from, b.date_to, b.title, c.full_name AS customer_full_name
			 FROM bookings b LEFT JOIN customers c ON c.id = b.customer_id
			 WHERE ${OVERLAP_CONDITION}
			 ORDER BY b.date_from`
		)
		.bind(...overlapBindings(offerId, dateFrom, dateTo))
		.all<OverlappingBookingRow>();
	return results;
}
