import type {
	FieldError,
	FieldType,
	FieldValidation,
	FormLanguage,
	FormSection,
	FormValue,
	FormValues,
	TextKeySpec,
	VisibleIf,
} from '../utils/formSchema';
import type { TextChangeError } from '../utils/formTextChanges';

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

// -------------------------------------------------------
// Admin — external data (scheduled fetch system)
// -------------------------------------------------------

export type ExternalDataSnapshotStatus = 'success' | 'failed' | 'skipped';

export interface AdminExternalDataSource {
	id: string;
	type: string;
	provider: string;
	name: string;
	isActive: boolean;
	publishToGithub: boolean;
	githubFilePath: string | null;
	latestSnapshotId: string | null;
	latestDataHash: string | null;
	latestUpdatedAt: string | null;
	latestPublishedCommitSha: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface AdminExternalDataSnapshotListItem {
	id: string;
	sourceId: string;
	status: ExternalDataSnapshotStatus;
	fetchedAt: string;
	dataHash: string | null;
	errorMessage: string | null;
	publishedCommitSha: string | null;
	createdAt: string;
}

export interface AdminExternalDataSnapshotDetail extends AdminExternalDataSnapshotListItem {
	normalizedJson: string | null;
	rawR2Key: string | null;
}

export interface RunExternalDataSourceResponse {
	sourceId: string;
	status: 'success' | 'skipped' | 'failed';
	snapshotId: string | null;
	dataHash: string | null;
	fetchedAt: string;
	errorMessage: string | null;
}

export interface CleanupExternalDataSnapshotsPayload {
	olderThanDays?: number;
	keepLatest?: boolean;
}

export interface CleanupExternalDataSnapshotsResponse {
	sourceId: string;
	deletedCount: number;
	olderThanDays: number;
	keepLatest: boolean;
}

// -------------------------------------------------------
// Admin — tenant details forms
// -------------------------------------------------------

export type TenantFormInvitationStatus = 'pending' | 'opened' | 'submitted' | 'expired' | 'revoked';

export interface TenantFormLanguageReadiness {
	language: FormLanguage;
	/** Base-language text keys that have a text in this language. */
	translated: number;
	total: number;
}

export interface AdminTenantFormTemplateListItem {
	id: string;
	templateKey: string;
	version: number;
	status: string;
	baseLanguage: string;
	languages: TenantFormLanguageReadiness[];
}

export interface AdminTenantFormTemplateDetail extends AdminTenantFormTemplateListItem {
	sections: FormSection[];
	textKeys: TextKeySpec[];
	/** language → text key → text. Every supported language is present, possibly empty. */
	texts: Record<FormLanguage, Record<string, string>>;
}

export interface TenantFormTextChange {
	language: FormLanguage;
	textKey: string;
	/** Empty text removes a translation (English is shown instead) or an optional English text in every language. */
	text: string;
}

export interface UpdateTenantFormTranslationsPayload {
	changes: TenantFormTextChange[];
}

export interface UpdateTenantFormTranslationsErrorResponse {
	error: string;
	errors: TextChangeError[];
}

export interface AdminTenantFormInvitation {
	id: string;
	templateId: string;
	displayName: string;
	offerId: string;
	offerTitle: string | null;
	language: string;
	status: TenantFormInvitationStatus;
	expiresAt: string;
	googleEmail: string | null;
	leadId: string | null;
	submissionId: string | null;
	createdByEmail: string;
	openedAt: string | null;
	authenticatedAt: string | null;
	submittedAt: string | null;
	revokedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface AdminTenantFormEvent {
	id: string;
	eventType: string;
	actorType: string;
	actorRef: string | null;
	submissionId: string | null;
	fileId: string | null;
	metadata: Record<string, unknown> | null;
	createdAt: string;
}

export interface AdminTenantFormInvitationDetail extends AdminTenantFormInvitation {
	events: AdminTenantFormEvent[];
}

export interface CreateTenantFormInvitationPayload {
	displayName: string;
	offerId: string;
	language: string;
	/** 1–14, default 5. */
	validDays?: number;
	leadId?: string | null;
}

export interface CreateTenantFormInvitationResponse {
	invitation: AdminTenantFormInvitation;
	/** Contains the token. Never stored; GET …/invitations/:id/link recomputes it. */
	url: string;
}

export interface TenantFormInvitationLinkResponse {
	url: string;
}

// -------------------------------------------------------
// Public — tenant details form
// -------------------------------------------------------

export interface ResolveTenantFormInvitationPayload {
	token: string;
}

export interface ResolveTenantFormInvitationResponse {
	status: TenantFormInvitationStatus;
	displayName: string;
	offer: { title: string; slug: string };
	language: FormLanguage;
	expiresAt: string;
}

export interface TenantFormGoogleAuthPayload {
	token: string;
	googleIdToken: string;
}

export interface TenantFormGoogleAuthResponse {
	/** Send as `Authorization: Bearer <accessToken>`. */
	accessToken: string;
	expiresAt: string;
	googleEmail: string;
}

export interface TenantFormOptionView {
	key: string;
	label: string;
	allowsFreeText: boolean;
}

/** Texts are in the invitation's language (English where missing), variables already filled in. */
export interface TenantFormFieldView {
	key: string;
	type: FieldType;
	required: boolean;
	validation: FieldValidation;
	visibleIf: VisibleIf | null;
	label: string | null;
	help: string | null;
	placeholder: string | null;
	body: string | null;
	options: TenantFormOptionView[];
	itemFields: TenantFormFieldView[];
}

export interface TenantFormSectionView {
	key: string;
	title: string | null;
	description: string | null;
	fields: TenantFormFieldView[];
}

export interface TenantFormSchemaResponse {
	invitation: {
		displayName: string;
		language: FormLanguage;
		expiresAt: string;
		offer: { title: string; slug: string };
	};
	prefill: { contactEmail: string | null };
	template: {
		id: string;
		title: string | null;
		intro: string | null;
		successMessage: string | null;
	};
	sections: TenantFormSectionView[];
	/** Saved unfinished answers, so the tenant can continue after signing in again. */
	draft: { values: FormValues; savedAt: string } | null;
	/** Files uploaded but not yet submitted. */
	uploadedFiles: TenantFormUploadedFile[];
}

export interface TenantFormUploadedFile {
	id: string;
	fieldKey: string;
	originalFilename: string;
	mimeType: string;
	sizeBytes: number;
	uploadedAt: string;
}

export interface TenantFormUploadResponse {
	file: TenantFormUploadedFile;
}

export interface TenantFormValuesPayload {
	values: Record<string, unknown>;
}

export interface TenantFormDraftResponse {
	savedAt: string;
}

export interface TenantFormSubmitResponse {
	submissionId: string;
	submittedAt: string;
}

export interface TenantFormValidationErrorResponse {
	error: string;
	errors: FieldError[];
}

// -------------------------------------------------------
// Admin — tenant form submissions
// -------------------------------------------------------

export type TenantFormSubmissionStatus = 'submitted' | 'approved' | 'rejected' | 'archived';
export type TenantFormReviewStatus = Exclude<TenantFormSubmissionStatus, 'submitted'>;

export interface AdminTenantFormSubmissionListItem {
	id: string;
	invitationId: string;
	displayName: string;
	offerId: string;
	offerTitle: string | null;
	fullName: string;
	contactEmail: string;
	phone: string;
	plannedArrival: string | null;
	plannedDeparture: string | null;
	/** Language the tenant filled the form in. Answers are always shown in English. */
	language: string;
	status: TenantFormSubmissionStatus;
	fileCount: number;
	submittedAt: string;
	reviewedAt: string | null;
	/** Captured at submit, shown like on leads to help spot misuse. */
	remoteIp: string | null;
	userAgent: string | null;
}

/** One answer with its English label. `displayValue` is a readable English rendering of `value`. */
export interface AdminTenantFormAnswer {
	key: string;
	type: FieldType;
	label: string;
	value: FormValue | null;
	displayValue: string | null;
	/** Rows of a guest list, each with its own answers; null for other field types. */
	items: AdminTenantFormAnswer[][] | null;
}

export interface AdminTenantFormAnswerSection {
	key: string;
	title: string;
	answers: AdminTenantFormAnswer[];
}

export interface AdminTenantFormSubmissionFile {
	id: string;
	fieldKey: string;
	originalFilename: string;
	mimeType: string;
	sizeBytes: number;
	status: string;
	uploadedAt: string;
}

export interface AdminTenantFormSubmissionDetail extends AdminTenantFormSubmissionListItem {
	templateId: string;
	googleEmail: string;
	reviewedByEmail: string | null;
	reviewNotes: string | null;
	documentsDeleteAfter: string | null;
	documentsDeletedAt: string | null;
	sections: AdminTenantFormAnswerSection[];
	files: AdminTenantFormSubmissionFile[];
	/** Stored values keyed by field key, for later conversion to customer/booking. */
	values: FormValues;
	events: AdminTenantFormEvent[];
}

export interface ReviewTenantFormSubmissionPayload {
	status: TenantFormReviewStatus;
	/** Omit to keep the current notes, null or empty string to clear them. */
	reviewNotes?: string | null;
}
