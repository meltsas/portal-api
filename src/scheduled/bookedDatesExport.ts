import type { BookingRow } from '../types/db';

/**
 * Booked-dates export source.
 *
 * Unlike the weather/marine sources (which come from `external_data_snapshots`
 * populated by the hourly fetch cron), booked dates are derived live from the
 * `bookings` table at export time — there is no external API to fetch.
 *
 * The shape produced here is the public contract consumed by the SSG website
 * (`non-touristic-rentals/app/data/offers/booked-dates/*.json`):
 *
 *   { "offer_001": [{ "from": "2026-06-27", "to": "2026-07-13" }, … ], … }
 *
 * `from`/`to` are the raw booking check-in / check-out dates. The website is
 * responsible for turning these into disabled calendar ranges (it extends the
 * end past check-out to keep the gap before the next stay).
 */

/** A single booked period for an offer, in ISO `YYYY-MM-DD` form. */
export interface BookedDateRange {
	from: string;
	to: string;
}

/** Booked periods keyed by offer id. */
export type BookedDatesByOffer = Record<string, BookedDateRange[]>;

// Only confirmed bookings block the public calendar. Tentative holds can fall
// through, so they stay selectable on the site (see feature discussion).
const CONFIRMED_STATUS = 'confirmed';

type BookingDatesRow = Pick<BookingRow, 'offer_id' | 'date_from' | 'date_to'>;

/**
 * Load confirmed, non-past bookings grouped by offer id.
 *
 * `todayIso` (YYYY-MM-DD) is injected so the past-booking filter is
 * deterministic and testable — bookings whose check-out date is before today
 * are excluded to keep the exported file focused on current/future
 * availability.
 */
export async function loadBookedDatesByOffer(env: Env, todayIso: string): Promise<BookedDatesByOffer> {
	const result = await env.portal_db
		.prepare(
			`SELECT offer_id, date_from, date_to
			   FROM bookings
			  WHERE status = ?
			    AND date_to >= ?
			  ORDER BY offer_id ASC, date_from ASC, date_to ASC`,
		)
		.bind(CONFIRMED_STATUS, todayIso)
		.all<BookingDatesRow>();

	return groupBookedDates(result.results);
}

/**
 * Pure grouping of booking rows into the public booked-dates shape. Rows are
 * assumed pre-sorted by the query; this keeps the per-offer arrays in the same
 * order so the exported JSON is stable across runs.
 */
export function groupBookedDates(rows: BookingDatesRow[]): BookedDatesByOffer {
	const byOffer: BookedDatesByOffer = {};
	for (const row of rows) {
		(byOffer[row.offer_id] ??= []).push({ from: row.date_from, to: row.date_to });
	}
	return byOffer;
}
