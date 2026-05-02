import type { AdminBookingListItem, AdminBookingDetail, BookingType, BookingStatus } from '../types/api';
import type { BookingWithJoinsRow } from '../types/db';
import { toISOTimestamp } from '../utils/date';

export function toAdminBookingListItem(row: BookingWithJoinsRow): AdminBookingListItem {
	return {
		id: row.id,
		offerId: row.offer_id,
		offerTitle: row.offer_title,
		offerSlug: row.offer_slug,
		customerId: row.customer_id,
		customerName: row.customer_full_name,
		customerEmail: row.customer_email,
		bookingType: row.booking_type as BookingType,
		status: row.status as BookingStatus,
		dateFrom: row.date_from,
		dateTo: row.date_to,
		title: row.title,
		adults: row.adults,
		children: row.children,
		priceTotalCents: row.price_total_cents,
		currency: row.currency,
		createdAt: toISOTimestamp(row.created_at),
		updatedAt: toISOTimestamp(row.updated_at),
	};
}

export function toAdminBookingDetail(row: BookingWithJoinsRow): AdminBookingDetail {
	return {
		id: row.id,
		offerId: row.offer_id,
		offerTitle: row.offer_title,
		offerSlug: row.offer_slug,
		customerId: row.customer_id,
		customerName: row.customer_full_name,
		customerEmail: row.customer_email,
		bookingType: row.booking_type as BookingType,
		status: row.status as BookingStatus,
		dateFrom: row.date_from,
		dateTo: row.date_to,
		reasonOfStay: row.reason_of_stay,
		title: row.title,
		notes: row.notes,
		adults: row.adults,
		children: row.children,
		priceTotalCents: row.price_total_cents,
		currency: row.currency,
		sourceLeadId: row.source_lead_id,
		createdAt: toISOTimestamp(row.created_at),
		updatedAt: toISOTimestamp(row.updated_at),
	};
}
