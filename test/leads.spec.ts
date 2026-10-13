import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { MIN_STAY_NIGHTS } from '../src/utils/stay';

function submitLead(dateFrom: string, dateTo: string): Promise<Response> {
	return SELF.fetch('https://example.com/api/leads', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			// Not a JWT, so verification fails locally without contacting Google.
			googleToken: 'not-a-jwt',
			offerId: 'offer_001',
			name: 'Test Example',
			message: 'Hello',
			dateFrom,
			dateTo,
		}),
	});
}

describe('POST /api/leads stay length', () => {
	it(`rejects stays shorter than ${MIN_STAY_NIGHTS} nights`, async () => {
		const response = await submitLead('2026-12-01', '2026-12-14');
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: `stay must be at least ${MIN_STAY_NIGHTS} nights` });
	});

	it(`accepts ${MIN_STAY_NIGHTS} nights and moves on to token verification`, async () => {
		const response = await submitLead('2026-12-01', '2026-12-15');
		expect(response.status).toBe(401);
	});

	it('rejects dates that do not exist', async () => {
		const response = await submitLead('2026-02-30', '2026-03-30');
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'dateFrom must be YYYY-MM-DD' });
	});
});
