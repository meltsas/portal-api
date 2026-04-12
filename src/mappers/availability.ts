import type { PublicAvailabilityPeriod, AdminAvailabilityPeriod } from '../types/api';
import type { OfferAvailabilityRow } from '../types/db';

export function toPublicAvailabilityPeriod(row: OfferAvailabilityRow): PublicAvailabilityPeriod {
	return {
		dateFrom: row.date_from,
		dateTo: row.date_to,
		status: row.status as PublicAvailabilityPeriod['status'],
	};
}

export function toAdminAvailabilityPeriod(row: OfferAvailabilityRow): AdminAvailabilityPeriod {
	return {
		id: row.id,
		dateFrom: row.date_from,
		dateTo: row.date_to,
		status: row.status as AdminAvailabilityPeriod['status'],
		note: row.note,
	};
}
