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
export type CustomerStatus = 'active' | 'inactive' | 'archived';
export type BookingType = 'customer_stay' | 'owner_use' | 'maintenance' | 'blocked' | 'other';
export type BookingStatus = 'draft' | 'tentative' | 'confirmed' | 'cancelled' | 'completed';

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
	name?: string;
	email?: string;
	phone?: string | null;
	message?: string | null;
	requestedDateFrom?: string | null;
	requestedDateTo?: string | null;
	reasonOfStay?: string | null;
}

export interface UpdateLeadResponse {
	id: string;
	status: LeadStatus;
}

// -------------------------------------------------------
// Admin — customers
// -------------------------------------------------------

export interface AdminCustomerListItem {
	id: string;
	sourceLeadId: string | null;
	fullName: string;
	email: string;
	phone: string;
	status: CustomerStatus;
	createdAt: string;
	updatedAt: string;
}

export interface AdminCustomerDetail {
	id: string;
	sourceLeadId: string | null;
	fullName: string;
	email: string;
	phone: string;
	primaryAddress: string;
	dateOfBirth: string;
	nationalIdNumber: string;
	documentNumber: string;
	occupation: string;
	employerOrPensionInfo: string;
	incomeNotes: string;
	familyMembersJson: string;
	notes: string;
	status: CustomerStatus;
	createdAt: string;
	updatedAt: string;
}

export interface CreateCustomerPayload {
	sourceLeadId?: string | null;
	fullName: string;
	email: string;
	phone?: string;
	primaryAddress?: string;
	dateOfBirth?: string;
	nationalIdNumber?: string;
	documentNumber?: string;
	occupation?: string;
	employerOrPensionInfo?: string;
	incomeNotes?: string;
	familyMembersJson?: string;
	notes?: string;
	status?: CustomerStatus;
}

export interface UpdateCustomerPayload {
	sourceLeadId?: string | null;
	fullName?: string;
	email?: string;
	phone?: string;
	primaryAddress?: string;
	dateOfBirth?: string;
	nationalIdNumber?: string;
	documentNumber?: string;
	occupation?: string;
	employerOrPensionInfo?: string;
	incomeNotes?: string;
	familyMembersJson?: string;
	notes?: string;
	status?: CustomerStatus;
}

export interface CreateCustomerResponse {
	id: string;
}

export interface UpdateCustomerResponse {
	id: string;
}

// -------------------------------------------------------
// Admin — bookings
// -------------------------------------------------------

export interface AdminBookingListItem {
	id: string;
	offerId: string;
	offerTitle: string | null;
	offerSlug: string | null;
	customerId: string | null;
	customerName: string | null;
	customerEmail: string | null;
	bookingType: BookingType;
	status: BookingStatus;
	dateFrom: string;
	dateTo: string;
	title: string;
	adults: number;
	children: number;
	priceTotalCents: number | null;
	currency: string;
	createdAt: string;
	updatedAt: string;
}

export interface AdminBookingDetail {
	id: string;
	offerId: string;
	offerTitle: string | null;
	offerSlug: string | null;
	customerId: string | null;
	customerName: string | null;
	customerEmail: string | null;
	bookingType: BookingType;
	status: BookingStatus;
	dateFrom: string;
	dateTo: string;
	reasonOfStay: string;
	title: string;
	notes: string;
	adults: number;
	children: number;
	priceTotalCents: number | null;
	currency: string;
	sourceLeadId: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface CreateBookingPayload {
	offerId: string;
	customerId?: string | null;
	bookingType?: BookingType;
	status?: BookingStatus;
	dateFrom: string;
	dateTo: string;
	reasonOfStay?: string;
	title?: string;
	notes?: string;
	adults?: number;
	children?: number;
	priceTotalCents?: number | null;
	currency?: string;
	sourceLeadId?: string | null;
}

export interface UpdateBookingPayload {
	customerId?: string | null;
	bookingType?: BookingType;
	status?: BookingStatus;
	dateFrom?: string;
	dateTo?: string;
	reasonOfStay?: string;
	title?: string;
	notes?: string;
	adults?: number;
	children?: number;
	priceTotalCents?: number | null;
	currency?: string;
	sourceLeadId?: string | null;
}

export interface CreateBookingResponse {
	id: string;
}

export interface UpdateBookingResponse {
	id: string;
}
