export interface OfferRow {
	id: string;
	slug: string;
	title: string;
	location_name: string | null;
	summary: string | null;
	status: string;
	cover_image_url: string | null;
	created_at: string;
	updated_at: string;
}

export interface OfferAvailabilityRow {
	id: string;
	offer_id: string;
	date_from: string;
	date_to: string;
	status: string;
	note: string | null;
	created_at: string;
	updated_at: string;
}

export interface LeadRow {
	id: string;
	offer_id: string | null;
	status: string;
	name: string;
	email: string;
	phone: string | null;
	message: string | null;
	requested_date_from: string | null;
	requested_date_to: string | null;
	auth_provider: string | null;
	auth_subject: string | null;
	source: string | null;
	admin_notes: string | null;
	created_at: string;
	updated_at: string;
}

export interface LeadWithOfferTitleRow extends LeadRow {
	offer_title: string | null;
}
