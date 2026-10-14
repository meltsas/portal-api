import type { RouteHandler } from '../../router/types';
import type {
	AdminTenantFormConversionPreview,
	BookingStatus,
	ConvertTenantFormSubmissionPayload,
	ConvertTenantFormSubmissionResponse,
	TenantFormConversionBooking,
	TenantFormConversionBookingStatus,
	TenantFormConversionCustomer,
} from '../../types/api';
import type { CustomerRow, FormSubmissionRow } from '../../types/db';
import { CUSTOMER_COLUMNS } from './customers';
import { toAdminCustomerListItem } from '../../mappers/customers';
import { requireAuth } from '../../middleware/requireAuth';
import { BLOCKING_STATUSES, BOOKING_OVERLAP_ERROR, findOverlap, listOverlappingBookings } from '../../utils/bookingOverlap';
import { loadFormTexts, type FormValues } from '../../utils/formSchema';
import { badRequest, jsonResponse, notFound, parseJsonBody } from '../../utils/response';
import { toBookingFields, toCustomerFields } from '../../utils/tenantFormConversion';
import { formEventStatement, type SqlCondition } from '../../utils/tenantFormInvitations';

const CONVERSION_BOOKING_STATUSES: TenantFormConversionBookingStatus[] = ['draft', 'tentative', 'confirmed'];

const CUSTOMER_FIELD_COLUMNS: [keyof TenantFormConversionCustomer, string][] = [
	['fullName', 'full_name'],
	['email', 'email'],
	['phone', 'phone'],
	['primaryAddress', 'primary_address'],
	['dateOfBirth', 'date_of_birth'],
	['nationality', 'nationality'],
	['sex', 'sex'],
	['documentType', 'document_type'],
	['documentNumber', 'document_number'],
	['occupation', 'occupation'],
	['employerOrPensionInfo', 'employer_or_pension_info'],
	['familyMembersJson', 'family_members_json'],
];

type ConversionSourceRow = Pick<
	FormSubmissionRow,
	'id' | 'invitation_id' | 'template_id' | 'status' | 'google_email' | 'values_json' | 'customer_id'
> & {
	offer_id: string;
	offer_title: string | null;
	lead_id: string | null;
};

interface ConversionSource {
	row: ConversionSourceRow;
	customer: TenantFormConversionCustomer;
	booking: TenantFormConversionBooking | null;
}

/** What the conversion would write, with matching customers and blocking bookings in the planned stay. */
export const handleAdminGetTenantFormConversionPreview: RouteHandler = async ({ env, params }) => {
	const source = await loadConversionSource(env.portal_db, params.id);
	if (!source) {
		return notFound();
	}
	const { row, customer, booking } = source;

	const emails = [...new Set([customer.email, row.google_email.toLowerCase()].filter((email) => email !== ''))];
	const [matches, overlapping] = await Promise.all([
		findCustomersByEmail(env.portal_db, emails),
		booking ? listOverlappingBookings(env.portal_db, booking.offerId, booking.dateFrom, booking.dateTo) : [],
	]);

	const preview: AdminTenantFormConversionPreview = {
		customer,
		booking,
		customerMatches: matches.map(toAdminCustomerListItem),
		overlappingBookings: overlapping.map((overlap) => ({
			id: overlap.id,
			status: overlap.status as BookingStatus,
			dateFrom: overlap.date_from,
			dateTo: overlap.date_to,
			title: overlap.title,
			customerName: overlap.customer_full_name,
		})),
	};
	return jsonResponse(preview);
};

/**
 * Creates or updates a customer from an approved submission and optionally creates a booking, in one
 * D1 batch. A submission is converted once: every write is conditional on the submission still being
 * unconverted, and the link to the new records is written last.
 */
export const handleAdminConvertTenantFormSubmission: RouteHandler = async ({ env, request, params }) => {
	const admin = await requireAuth(request, env);
	if (!admin) {
		return jsonResponse({ error: 'Unauthorized' }, 401);
	}

	const payload = parseConvertPayload(await parseJsonBody(request));
	if (typeof payload === 'string') {
		return badRequest(payload);
	}

	const source = await loadConversionSource(env.portal_db, params.id);
	if (!source) {
		return notFound();
	}
	const { row, customer, booking } = source;

	if (row.status !== 'approved') {
		return notApprovedResponse();
	}
	if (row.customer_id) {
		return alreadyConvertedResponse();
	}

	if (payload.customer.mode === 'update') {
		const existing = await env.portal_db
			.prepare(`SELECT id FROM customers WHERE id = ?`)
			.bind(payload.customer.customerId)
			.first<{ id: string }>();
		if (!existing) {
			return badRequest('Customer not found');
		}
	}

	if (payload.booking) {
		if (!booking) {
			return jsonResponse({ error: 'Submission has no planned stay' }, 409);
		}
		if (BLOCKING_STATUSES.includes(payload.booking.status)) {
			const overlap = await findOverlap(env.portal_db, booking.offerId, booking.dateFrom, booking.dateTo, null);
			if (overlap) {
				return jsonResponse({ error: BOOKING_OVERLAP_ERROR }, 409);
			}
		}
	}

	const db = env.portal_db;
	const customerId = payload.customer.mode === 'create' ? crypto.randomUUID() : payload.customer.customerId;
	const bookingId = payload.booking ? crypto.randomUUID() : null;
	// Re-checked by every write, so a review that rejects or archives the submission meanwhile also stops the conversion.
	const notYetConverted: SqlCondition = {
		sql: "EXISTS (SELECT 1 FROM form_submissions WHERE id = ? AND customer_id IS NULL AND status = 'approved')",
		bindings: [row.id],
	};
	const event = (eventType: string, metadata: Record<string, unknown>) =>
		formEventStatement(
			db,
			{ invitationId: row.invitation_id, eventType, actorType: 'admin', actorRef: admin.email, submissionId: row.id, metadata },
			notYetConverted
		);

	const statements: D1PreparedStatement[] = [
		payload.customer.mode === 'create'
			? insertCustomerStatement(db, customerId, customer, row.lead_id, notYetConverted)
			: updateCustomerStatement(db, customerId, customer, row.lead_id, notYetConverted),
		event('converted_to_customer', { mode: payload.customer.mode, customerId }),
	];
	if (payload.booking && booking && bookingId) {
		statements.push(
			insertBookingStatement(db, bookingId, customerId, payload.booking.status, booking, row.lead_id, notYetConverted),
			event('converted_to_booking', { bookingId, status: payload.booking.status })
		);
	}
	statements.push(
		db
			.prepare(
				`UPDATE form_submissions SET customer_id = ?, booking_id = ?, updated_at = CURRENT_TIMESTAMP
				 WHERE id = ? AND customer_id IS NULL AND status = 'approved'`
			)
			.bind(customerId, bookingId, row.id)
	);

	const results = await db.batch(statements);
	// Another conversion or a review committed first, so ours wrote nothing.
	if (results[results.length - 1].meta.changes !== 1) {
		return changedMeanwhileResponse(db, row.id);
	}

	const response: ConvertTenantFormSubmissionResponse = { customerId, bookingId };
	return jsonResponse(response, 201);
};

// --- Helpers ---

async function loadConversionSource(db: D1Database, submissionId: string): Promise<ConversionSource | null> {
	const row = await db
		.prepare(
			`SELECT s.id, s.invitation_id, s.template_id, s.status, s.google_email, s.values_json, s.customer_id,
			        i.offer_id, i.lead_id, o.title AS offer_title
			 FROM form_submissions s
			 JOIN form_invitations i ON i.id = s.invitation_id
			 LEFT JOIN offers o ON o.id = i.offer_id
			 WHERE s.id = ?`
		)
		.bind(submissionId)
		.first<ConversionSourceRow>();
	if (!row) return null;

	const values = JSON.parse(row.values_json) as FormValues;
	const enTexts = await loadFormTexts(db, row.template_id, 'en');
	const customer = toCustomerFields(values, enTexts);
	const bookingFields = toBookingFields(values, enTexts, customer.fullName);
	return {
		row,
		customer,
		booking: bookingFields ? { offerId: row.offer_id, offerTitle: row.offer_title, ...bookingFields } : null,
	};
}

async function findCustomersByEmail(db: D1Database, emails: string[]): Promise<CustomerRow[]> {
	if (emails.length === 0) return [];
	const { results } = await db
		.prepare(
			`SELECT ${CUSTOMER_COLUMNS} FROM customers
			 WHERE lower(email) IN (${emails.map(() => '?').join(', ')})
			 ORDER BY created_at DESC`
		)
		.bind(...emails)
		.all<CustomerRow>();
	return results;
}

function insertCustomerStatement(
	db: D1Database,
	customerId: string,
	customer: TenantFormConversionCustomer,
	leadId: string | null,
	onlyIf: SqlCondition
): D1PreparedStatement {
	const columns = CUSTOMER_FIELD_COLUMNS.map(([, column]) => column);
	const values = CUSTOMER_FIELD_COLUMNS.map(([field]) => customer[field]);
	return db
		.prepare(
			`INSERT INTO customers (id, source_lead_id, ${columns.join(', ')}, status)
			 SELECT ?, ?, ${columns.map(() => '?').join(', ')}, 'active' WHERE ${onlyIf.sql}`
		)
		.bind(customerId, leadId, ...values, ...onlyIf.bindings);
}

/** Only non-empty values overwrite; the lead is set when the customer has none yet. */
function updateCustomerStatement(
	db: D1Database,
	customerId: string,
	customer: TenantFormConversionCustomer,
	leadId: string | null,
	onlyIf: SqlCondition
): D1PreparedStatement {
	const changed = CUSTOMER_FIELD_COLUMNS.filter(([field]) => !isEmptyConversionValue(customer[field]));
	const assignments = [
		...changed.map(([, column]) => `${column} = ?`),
		'source_lead_id = COALESCE(source_lead_id, ?)',
		'updated_at = CURRENT_TIMESTAMP',
	];
	return db
		.prepare(`UPDATE customers SET ${assignments.join(', ')} WHERE id = ? AND ${onlyIf.sql}`)
		.bind(...changed.map(([field]) => customer[field]), leadId, customerId, ...onlyIf.bindings);
}

function isEmptyConversionValue(value: string): boolean {
	return value === '' || value === '[]';
}

function insertBookingStatement(
	db: D1Database,
	bookingId: string,
	customerId: string,
	status: TenantFormConversionBookingStatus,
	booking: TenantFormConversionBooking,
	leadId: string | null,
	onlyIf: SqlCondition
): D1PreparedStatement {
	return db
		.prepare(
			`INSERT INTO bookings
			 (id, offer_id, customer_id, booking_type, status, date_from, date_to, reason_of_stay, title, notes,
			  adults, children, source_lead_id)
			 SELECT ?, ?, ?, 'customer_stay', ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${onlyIf.sql}`
		)
		.bind(
			bookingId,
			booking.offerId,
			customerId,
			status,
			booking.dateFrom,
			booking.dateTo,
			booking.reasonOfStay,
			booking.title,
			booking.notes,
			booking.adults,
			booking.children,
			leadId,
			...onlyIf.bindings
		);
}

function parseConvertPayload(body: unknown): ConvertTenantFormSubmissionPayload | string {
	if (!isObject(body)) return 'Invalid or missing JSON body';

	const customer = body.customer;
	let customerChoice: ConvertTenantFormSubmissionPayload['customer'];
	if (isObject(customer) && customer.mode === 'create') {
		customerChoice = { mode: 'create' };
	} else if (isObject(customer) && customer.mode === 'update') {
		if (typeof customer.customerId !== 'string' || customer.customerId.trim() === '') {
			return 'customer.customerId is required when customer.mode is "update"';
		}
		customerChoice = { mode: 'update', customerId: customer.customerId.trim() };
	} else {
		return 'customer.mode must be "create" or "update"';
	}

	if (body.booking === null) {
		return { customer: customerChoice, booking: null };
	}
	const status = isObject(body.booking) ? body.booking.status : undefined;
	if (!CONVERSION_BOOKING_STATUSES.includes(status as TenantFormConversionBookingStatus)) {
		return `booking must be null or { status } with status one of: ${CONVERSION_BOOKING_STATUSES.join(', ')}`;
	}
	return { customer: customerChoice, booking: { status: status as TenantFormConversionBookingStatus } };
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function alreadyConvertedResponse(): Response {
	return jsonResponse({ error: 'Submission has already been converted' }, 409);
}

function notApprovedResponse(): Response {
	return jsonResponse({ error: 'Only approved submissions can be converted' }, 409);
}

async function changedMeanwhileResponse(db: D1Database, submissionId: string): Promise<Response> {
	const current = await db
		.prepare(`SELECT customer_id FROM form_submissions WHERE id = ?`)
		.bind(submissionId)
		.first<{ customer_id: string | null }>();
	return current?.customer_id ? alreadyConvertedResponse() : notApprovedResponse();
}
