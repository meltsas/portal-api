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

export interface GithubExportStateRow {
	id: string;
	repo: string;
	branch: string;
	latest_export_hash: string | null;
	latest_commit_sha: string | null;
	latest_exported_at: string | null;
	last_attempt_at: string | null;
	last_status: string | null;
	last_error: string | null;
	created_at: string;
	updated_at: string;
}

export interface FormTemplateRow {
	id: string;
	template_key: string;
	version: number;
	base_language: string;
	status: string;
	created_at: string;
	updated_at: string;
}

export interface FormSectionRow {
	id: string;
	template_id: string;
	section_key: string;
	sort_order: number;
}

export interface FormFieldRow {
	id: string;
	template_id: string;
	section_id: string;
	parent_field_id: string | null;
	field_key: string;
	field_type: string;
	is_required: number;
	sort_order: number;
	validation_json: string;
	visible_if_json: string | null;
}

export interface FormFieldOptionRow {
	id: string;
	field_id: string;
	option_key: string;
	sort_order: number;
	allows_free_text: number;
}

export interface FormTranslationRow {
	template_id: string;
	language: string;
	text_key: string;
	text: string;
	updated_at: string;
	updated_by_email: string | null;
}

export interface FormInvitationRow {
	id: string;
	template_id: string;
	token_hash: string;
	display_name: string;
	offer_id: string;
	language: string;
	status: string;
	expires_at: string;
	google_subject: string | null;
	google_email: string | null;
	lead_id: string | null;
	created_by_email: string;
	opened_at: string | null;
	authenticated_at: string | null;
	submitted_at: string | null;
	revoked_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface FormSubmissionRow {
	id: string;
	invitation_id: string;
	template_id: string;
	language: string;
	google_subject: string;
	google_email: string;
	contact_email: string;
	phone: string;
	full_name: string;
	planned_arrival: string | null;
	planned_departure: string | null;
	values_json: string;
	status: string;
	reviewed_by_email: string | null;
	reviewed_at: string | null;
	review_notes: string | null;
	documents_delete_after: string | null;
	documents_deleted_at: string | null;
	remote_ip: string | null;
	user_agent: string | null;
	submitted_at: string;
	created_at: string;
	updated_at: string;
}

export interface FormSubmissionFileRow {
	id: string;
	invitation_id: string;
	submission_id: string | null;
	field_key: string;
	r2_key: string;
	original_filename: string;
	mime_type: string;
	size_bytes: number;
	status: string;
	uploaded_at: string;
	deleted_at: string | null;
}

export interface FormEventRow {
	id: string;
	invitation_id: string | null;
	submission_id: string | null;
	file_id: string | null;
	event_type: string;
	actor_type: string;
	actor_ref: string | null;
	metadata_json: string | null;
	created_at: string;
}
