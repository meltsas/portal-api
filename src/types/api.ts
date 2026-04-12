// -------------------------------------------------------
// Common
// -------------------------------------------------------

export interface ApiErrorResponse {
	error: string;
}

// -------------------------------------------------------
// Status enums
// -------------------------------------------------------

export type OfferStatus = 'draft' | 'active' | 'inactive' | 'archived';
export type AvailabilityStatus = 'available' | 'blocked' | 'tentative';
export type LeadStatus = 'new' | 'contacted' | 'closed' | 'spam' | 'archived';

// -------------------------------------------------------
// Public offers
// -------------------------------------------------------

export interface PublicOfferSummary {
	slug: string;
	title: string;
	locationName: string | null;
	summary: string | null;
	coverImageUrl: string | null;
}

export interface PublicOfferDetail {
	slug: string;
	title: string;
	locationName: string | null;
	summary: string | null;
	coverImageUrl: string | null;
	availability: PublicAvailabilityPeriod[];
}

export interface PublicAvailabilityPeriod {
	dateFrom: string;
	dateTo: string;
	status: 'available' | 'tentative';
}

// -------------------------------------------------------
// Lead submission (future protected)
// -------------------------------------------------------

export interface SubmitLeadPayload {
	offerSlug: string;
	name: string;
	email: string;
	phone?: string | null;
	message?: string | null;
	requestedDateFrom?: string | null;
	requestedDateTo?: string | null;
}

export interface SubmitLeadResponse {
	success: true;
	leadId: string;
}

// -------------------------------------------------------
// Admin — offers
// -------------------------------------------------------

export interface AdminOfferListItem {
	id: string;
	slug: string;
	title: string;
	locationName: string | null;
	status: OfferStatus;
	coverImageUrl: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface CreateOfferPayload {
	slug: string;
	title: string;
	locationName?: string | null;
	summary?: string | null;
	status?: OfferStatus;
	coverImageUrl?: string | null;
}

export interface CreateOfferResponse {
	id: string;
	slug: string;
}

export interface UpdateOfferPayload {
	title?: string;
	locationName?: string | null;
	summary?: string | null;
	status?: OfferStatus;
	coverImageUrl?: string | null;
}

export interface UpdateOfferResponse {
	id: string;
	slug: string;
}

// -------------------------------------------------------
// Admin — availability
// -------------------------------------------------------

export interface AdminAvailabilityPeriod {
	id: string;
	dateFrom: string;
	dateTo: string;
	status: AvailabilityStatus;
	note: string | null;
}

export interface AvailabilityPeriodInput {
	dateFrom: string;
	dateTo: string;
	status: AvailabilityStatus;
	note?: string | null;
}

export interface UpdateAvailabilityPayload {
	periods: AvailabilityPeriodInput[];
}

export interface UpdateAvailabilityResponse {
	success: true;
	count: number;
}

// -------------------------------------------------------
// Admin — leads
// -------------------------------------------------------

export interface AdminLeadListItem {
	id: string;
	offerTitle: string | null;
	status: LeadStatus;
	name: string;
	email: string;
	phone: string | null;
	requestedDateFrom: string | null;
	requestedDateTo: string | null;
	createdAt: string;
}

export interface AdminLeadDetail {
	id: string;
	offerId: string | null;
	offerTitle: string | null;
	status: LeadStatus;
	name: string;
	email: string;
	phone: string | null;
	message: string | null;
	requestedDateFrom: string | null;
	requestedDateTo: string | null;
	authProvider: string | null;
	source: string | null;
	adminNotes: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface UpdateLeadPayload {
	status?: LeadStatus;
	adminNotes?: string | null;
}

export interface UpdateLeadResponse {
	id: string;
	status: LeadStatus;
}
