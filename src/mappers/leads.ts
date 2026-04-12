import type { AdminLeadListItem, AdminLeadDetail } from '../types/api';
import type { LeadWithOfferTitleRow } from '../types/db';
import { toISOTimestamp } from '../utils/date';

export function toAdminLeadListItem(row: LeadWithOfferTitleRow): AdminLeadListItem {
	return {
		id: row.id,
		offerTitle: row.offer_title,
		status: row.status as AdminLeadListItem['status'],
		name: row.name,
		email: row.email,
		phone: row.phone,
		requestedDateFrom: row.requested_date_from,
		requestedDateTo: row.requested_date_to,
		createdAt: toISOTimestamp(row.created_at),
	};
}

export function toAdminLeadDetail(row: LeadWithOfferTitleRow): AdminLeadDetail {
	return {
		id: row.id,
		offerId: row.offer_id,
		offerTitle: row.offer_title,
		status: row.status as AdminLeadDetail['status'],
		name: row.name,
		email: row.email,
		phone: row.phone,
		message: row.message,
		requestedDateFrom: row.requested_date_from,
		requestedDateTo: row.requested_date_to,
		authProvider: row.auth_provider,
		source: row.source,
		adminNotes: row.admin_notes,
		createdAt: toISOTimestamp(row.created_at),
		updatedAt: toISOTimestamp(row.updated_at),
	};
}
