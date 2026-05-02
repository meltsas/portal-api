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
// Lead submission (Google ID token verified per request)
// -------------------------------------------------------

export interface SubmitLeadPayload {
	offerId: string;
	name: string;
	message: string;
	dateFrom: string;
	dateTo: string;
	googleToken: string;
	reasonOfStay?: string | null;
}

export interface SubmitLeadResponse {
	ok: true;
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
	offerId: string | null;
	offerTitle: string | null;
	status: LeadStatus;
	name: string;
	email: string;
	phone: string | null;
	message: string | null;
	requestedDateFrom: string | null;
	requestedDateTo: string | null;
	reasonOfStay: string | null;
	authProvider: string | null;
	source: string | null;
	adminNotes: string | null;
	remoteIp: string | null;
	userAgent: string | null;
	createdAt: string;
	updatedAt: string;
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
	reasonOfStay: string | null;
	authProvider: string | null;
	source: string | null;
	adminNotes: string | null;
	remoteIp: string | null;
	userAgent: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface CreateLeadPayload {
	offerId: string;
	email: string;
	name: string;
	message: string;
	dateFrom: string;
	dateTo: string;
	reasonOfStay?: string | null;
}

export interface CreateLeadResponse {
	id: string;
}

export interface UpdateLeadPayload {
	status?: LeadStatus;
	adminNotes?: string | null;
}

export interface UpdateLeadResponse {
	id: string;
	status: LeadStatus;
}
