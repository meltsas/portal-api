import { SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CreateBookingResponse } from '../src/types/api';
import { BOOKING_OVERLAP_ERROR } from '../src/utils/bookingOverlap';
import { adminSessionCookie, insertTestOffer, TEST_OFFER_ID } from './helpers';

const BOOKINGS_API = 'https://example.com/api/admin/bookings';

async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
	return SELF.fetch(`${BOOKINGS_API}${path}`, {
		...init,
		headers: { 'Content-Type': 'application/json', Cookie: await adminSessionCookie() },
	});
}

function createBooking(status: string, dateFrom: string, dateTo: string): Promise<Response> {
	return adminFetch('', { method: 'POST', body: JSON.stringify({ offerId: TEST_OFFER_ID, status, dateFrom, dateTo }) });
}

beforeEach(async () => {
	await insertTestOffer();
	expect((await createBooking('tentative', '2026-12-01', '2027-01-01')).status).toBe(201);
});

describe('booking overlap check', () => {
	it.each(['tentative', 'confirmed'])('rejects an overlapping %s booking', async (status) => {
		const response = await createBooking(status, '2026-12-20', '2027-01-10');
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: BOOKING_OVERLAP_ERROR });
	});

	it('accepts an overlapping draft and a booking that starts on the departure day', async () => {
		expect((await createBooking('draft', '2026-12-20', '2027-01-10')).status).toBe(201);
		expect((await createBooking('confirmed', '2027-01-01', '2027-01-20')).status).toBe(201);
	});

	it('checks a draft again when it becomes blocking', async () => {
		const { id } = (await (await createBooking('draft', '2026-12-20', '2027-01-10')).json()) as CreateBookingResponse;

		const update = await adminFetch(`/${id}`, { method: 'PUT', body: JSON.stringify({ status: 'tentative' }) });
		expect(update.status).toBe(409);
	});
});
