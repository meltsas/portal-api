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
	reason_of_stay: string | null;
	auth_provider: string | null;
	auth_subject: string | null;
	source: string | null;
	admin_notes: string | null;
	remote_ip: string | null;
	user_agent: string | null;
	created_at: string;
	updated_at: string;
}

export interface LeadWithOfferTitleRow extends LeadRow {
	offer_title: string | null;
}

export interface CustomerRow {
	id: string;
	source_lead_id: string | null;
	full_name: string;
	email: string;
	phone: string;
	primary_address: string;
	date_of_birth: string;
	national_id_number: string;
	document_number: string;
	occupation: string;
	employer_or_pension_info: string;
	income_notes: string;
	family_members_json: string;
	notes: string;
	status: string;
	created_at: string;
	updated_at: string;
}

export interface BookingRow {
	id: string;
	offer_id: string;
	customer_id: string | null;
	booking_type: string;
	status: string;
	date_from: string;
	date_to: string;
	reason_of_stay: string;
	title: string;
	notes: string;
	adults: number;
	children: number;
	price_total_cents: number | null;
	currency: string;
	source_lead_id: string | null;
	created_at: string;
	updated_at: string;
}

export interface BookingWithJoinsRow extends BookingRow {
	offer_title: string | null;
	offer_slug: string | null;
	customer_full_name: string | null;
	customer_email: string | null;
}

export interface ExternalDataSourceRow {
	id: string;
	type: string;
	provider: string;
	name: string;
	is_active: number;
	publish_to_github: number;
	github_file_path: string | null;
	latest_snapshot_id: string | null;
	latest_data_hash: string | null;
	latest_updated_at: string | null;
	latest_published_commit_sha: string | null;
	created_at: string;
	updated_at: string;
}

export interface ExternalDataSnapshotRow {
	id: string;
	source_id: string;
	status: string;
	fetched_at: string;
	data_hash: string | null;
	normalized_json: string | null;
	raw_r2_key: string | null;
	error_message: string | null;
	published_commit_sha: string | null;
	created_at: string;
}
