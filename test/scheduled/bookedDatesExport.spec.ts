import { describe, it, expect } from 'vitest';
import { groupBookedDates } from '../../src/scheduled/bookedDatesExport';

describe('groupBookedDates', () => {
	it('groups rows by offer id into the public {from,to} shape', () => {
		const out = groupBookedDates([
			{ offer_id: 'offer_001', date_from: '2026-06-27', date_to: '2026-07-13' },
			{ offer_id: 'offer_001', date_from: '2026-09-19', date_to: '2026-11-07' },
			{ offer_id: 'offer_002', date_from: '2026-08-01', date_to: '2026-08-20' },
		]);

		expect(out).toEqual({
			offer_001: [
				{ from: '2026-06-27', to: '2026-07-13' },
				{ from: '2026-09-19', to: '2026-11-07' },
			],
			offer_002: [{ from: '2026-08-01', to: '2026-08-20' }],
		});
	});

	it('preserves row order within an offer (query is pre-sorted)', () => {
		const out = groupBookedDates([
			{ offer_id: 'offer_001', date_from: '2026-01-10', date_to: '2026-01-20' },
			{ offer_id: 'offer_001', date_from: '2026-03-01', date_to: '2026-03-15' },
		]);

		expect(out.offer_001.map((r) => r.from)).toEqual(['2026-01-10', '2026-03-01']);
	});

	it('returns an empty object when there are no rows', () => {
		expect(groupBookedDates([])).toEqual({});
	});
});
