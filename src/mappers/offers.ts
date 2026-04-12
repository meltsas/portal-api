import type { PublicOfferSummary, PublicOfferDetail, PublicAvailabilityPeriod, AdminOfferListItem } from '../types/api';
import type { OfferRow } from '../types/db';
import { toISOTimestamp } from '../utils/date';

export function toPublicOfferSummary(row: OfferRow): PublicOfferSummary {
	return {
		slug: row.slug,
		title: row.title,
		locationName: row.location_name,
		summary: row.summary,
		coverImageUrl: row.cover_image_url,
	};
}

export function toPublicOfferDetail(
	row: OfferRow,
	availability: PublicAvailabilityPeriod[],
): PublicOfferDetail {
	return {
		slug: row.slug,
		title: row.title,
		locationName: row.location_name,
		summary: row.summary,
		coverImageUrl: row.cover_image_url,
		availability,
	};
}

export function toAdminOfferListItem(row: OfferRow): AdminOfferListItem {
	return {
		id: row.id,
		slug: row.slug,
		title: row.title,
		locationName: row.location_name,
		status: row.status as AdminOfferListItem['status'],
		coverImageUrl: row.cover_image_url,
		createdAt: toISOTimestamp(row.created_at),
		updatedAt: toISOTimestamp(row.updated_at),
	};
}
