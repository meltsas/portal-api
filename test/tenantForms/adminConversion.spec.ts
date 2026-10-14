import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
	AdminBookingDetail,
	AdminCustomerDetail,
	AdminTenantFormConversionPreview,
	AdminTenantFormSubmissionDetail,
	ConvertTenantFormSubmissionResponse,
	TenantFormSubmitResponse,
	TenantFormUploadResponse,
} from '../../src/types/api';
import { BOOKING_OVERLAP_ERROR } from '../../src/utils/bookingOverlap';
import {
	ADMIN_EMAIL,
	adminSessionCookie,
	GOOGLE_SUB,
	insertTestInvitation,
	insertTestOffer,
	swedishSubmission,
	TEST_OFFER_ID,
	tenantAccessToken,
} from '../helpers';

const ADMIN_API = 'https://example.com/api/admin';
const TENANT_API = 'https://example.com/api/tenant-forms';
const GOOGLE_EMAIL = 'tenant@example.com';

const JPEG = new Uint8Array(2048);
JPEG.set([0xff, 0xd8, 0xff, 0xe0]);

beforeEach(async () => {
	await insertTestOffer();
});

async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
	return SELF.fetch(`${ADMIN_API}${path}`, {
		...init,
		headers: { 'Content-Type': 'application/json', Cookie: await adminSessionCookie() },
	});
}

function convert(submissionId: string, body: unknown): Promise<Response> {
	return adminFetch(`/tenant-forms/submissions/${submissionId}/convert`, { method: 'POST', body: JSON.stringify(body) });
}

async function preview(submissionId: string): Promise<AdminTenantFormConversionPreview> {
	const response = await adminFetch(`/tenant-forms/submissions/${submissionId}/conversion`);
	expect(response.status).toBe(200);
	return (await response.json()) as AdminTenantFormConversionPreview;
}

async function getJson<T>(path: string): Promise<T> {
	return (await (await adminFetch(path)).json()) as T;
}

/** A submission written straight to D1, as the submit endpoint stores it. */
async function insertSubmission(options: { status?: string; leadId?: string; values?: Record<string, unknown> } = {}): Promise<string> {
	const invitation = await insertTestInvitation({ status: 'submitted', googleSubject: GOOGLE_SUB });
	if (options.leadId) {
		await env.portal_db.prepare(`UPDATE form_invitations SET lead_id = ? WHERE id = ?`).bind(options.leadId, invitation.id).run();
	}
	const values = options.values ?? swedishSubmission(['file-1']);
	const id = crypto.randomUUID();
	await env.portal_db
		.prepare(
			`INSERT INTO form_submissions
			 (id, invitation_id, template_id, language, google_subject, google_email, contact_email, phone, full_name,
			  planned_arrival, planned_departure, values_json, status, submitted_at)
			 VALUES (?, ?, 'tenant_details_v1', 'sv', ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-10-14T10:00:00Z')`
		)
		.bind(
			id,
			invitation.id,
			GOOGLE_SUB,
			GOOGLE_EMAIL,
			values.contact_email,
			values.phone,
			`${values.first_name} ${values.last_name}`,
			values.planned_arrival,
			values.planned_departure,
			JSON.stringify(values),
			options.status ?? 'approved'
		)
		.run();
	return id;
}

async function insertLead(id: string): Promise<void> {
	await env.portal_db
		.prepare(`INSERT INTO leads (id, offer_id, name, email) VALUES (?, ?, 'Åsa Exempel', 'asa@example.com')`)
		.bind(id, TEST_OFFER_ID)
		.run();
}

async function insertCustomer(id: string, email: string, extra: Record<string, string> = {}): Promise<void> {
	const columns = ['id', 'full_name', 'email', ...Object.keys(extra)];
	await env.portal_db
		.prepare(`INSERT INTO customers (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
		.bind(id, 'Existing Customer', email, ...Object.values(extra))
		.run();
}

async function insertBooking(id: string, status: string, dateFrom: string, dateTo: string, offerId = TEST_OFFER_ID): Promise<void> {
	await env.portal_db
		.prepare(`INSERT INTO bookings (id, offer_id, status, date_from, date_to, title) VALUES (?, ?, ?, ?, ?, 'Other stay')`)
		.bind(id, offerId, status, dateFrom, dateTo)
		.run();
}

async function count(table: string): Promise<number> {
	return (await env.portal_db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
}

async function conversionEvents(): Promise<{ event_type: string; actor_ref: string; metadata_json: string }[]> {
	const { results } = await env.portal_db
		.prepare(
			`SELECT event_type, actor_ref, metadata_json FROM form_events
			 WHERE event_type LIKE 'converted_to_%' ORDER BY event_type`
		)
		.all<{ event_type: string; actor_ref: string; metadata_json: string }>();
	return results;
}

describe('tenant form conversion routes', () => {
	it.each([
		['GET', '/tenant-forms/submissions/some-id/conversion'],
		['POST', '/tenant-forms/submissions/some-id/convert'],
	])('%s %s returns 401 without a session', async (method, path) => {
		expect((await SELF.fetch(`${ADMIN_API}${path}`, { method })).status).toBe(401);
	});

	it('returns 404 for an unknown submission', async () => {
		expect((await adminFetch('/tenant-forms/submissions/unknown/conversion')).status).toBe(404);
		expect((await convert('unknown', { customer: { mode: 'create' }, booking: null })).status).toBe(404);
	});
});

describe('submitted, approved and converted end to end', () => {
	it('creates a customer and a draft booking from a form filled in Swedish', async () => {
		const invitationId = (await insertTestInvitation({ status: 'opened', googleSubject: GOOGLE_SUB, language: 'sv' })).id;
		const token = await tenantAccessToken(invitationId);
		const uploaded = await SELF.fetch(`${TENANT_API}/files`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'X-Field-Key': 'id_documents', 'X-File-Name': 'pass.jpg' },
			body: JPEG,
		});
		const fileId = ((await uploaded.json()) as TenantFormUploadResponse).file.id;
		const submit = await SELF.fetch(`${TENANT_API}/submit`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ values: swedishSubmission([fileId]) }),
		});
		const { submissionId } = (await submit.json()) as TenantFormSubmitResponse;

		const notApproved = await convert(submissionId, { customer: { mode: 'create' }, booking: null });
		expect(notApproved.status).toBe(409);
		expect(await notApproved.json()).toEqual({ error: 'Only approved submissions can be converted' });

		const review = await adminFetch(`/tenant-forms/submissions/${submissionId}/review`, {
			method: 'PUT',
			body: JSON.stringify({ status: 'approved' }),
		});
		expect(review.status).toBe(200);

		const { customer, booking } = await preview(submissionId);
		expect(customer).toEqual({
			fullName: 'Åsa Exempel',
			email: 'asa@example.com',
			phone: '+46 70 123 45 67',
			primaryAddress: 'Testgatan 1, 753 10 Uppsala, Sverige',
			dateOfBirth: '1980-05-20',
			nationality: 'Svensk',
			sex: 'female',
			documentType: 'passport',
			documentNumber: 'X1234567',
			occupation: 'Pensioner',
			employerOrPensionInfo: '',
			familyMembersJson: JSON.stringify(swedishSubmission([]).other_guests),
		});
		expect(booking).toEqual({
			offerId: TEST_OFFER_ID,
			offerTitle: 'Test offer',
			dateFrom: '2026-12-01',
			dateTo: '2027-01-15',
			nights: 45,
			adults: 1,
			children: 1,
			reasonOfStay: 'Other non-tourist reason (please specify): Språkkurs',
			title: 'Åsa Exempel',
			notes: '',
		});

		const response = await convert(submissionId, { customer: { mode: 'create' }, booking: { status: 'draft' } });
		expect(response.status).toBe(201);
		const { customerId, bookingId } = (await response.json()) as ConvertTenantFormSubmissionResponse;

		expect(await getJson<AdminCustomerDetail>(`/customers/${customerId}`)).toMatchObject({
			...customer,
			status: 'active',
			notes: '',
			nationalIdNumber: '',
			sourceLeadId: null,
		});
		expect(await getJson<AdminBookingDetail>(`/bookings/${bookingId}`)).toMatchObject({
			offerId: TEST_OFFER_ID,
			customerId,
			bookingType: 'customer_stay',
			status: 'draft',
			dateFrom: '2026-12-01',
			dateTo: '2027-01-15',
			adults: 1,
			children: 1,
			reasonOfStay: 'Other non-tourist reason (please specify): Språkkurs',
			title: 'Åsa Exempel',
			priceTotalCents: null,
			currency: 'EUR',
		});

		const detail = await getJson<AdminTenantFormSubmissionDetail>(`/tenant-forms/submissions/${submissionId}`);
		expect(detail).toMatchObject({ customerId, bookingId });
		expect(detail.conversion).toEqual({
			customerId,
			customerName: 'Åsa Exempel',
			bookingId,
			bookingStatus: 'draft',
			bookingDateFrom: '2026-12-01',
			bookingDateTo: '2027-01-15',
		});

		const events = await conversionEvents();
		expect(events).toEqual([
			{ event_type: 'converted_to_booking', actor_ref: ADMIN_EMAIL, metadata_json: JSON.stringify({ bookingId, status: 'draft' }) },
			{ event_type: 'converted_to_customer', actor_ref: ADMIN_EMAIL, metadata_json: JSON.stringify({ mode: 'create', customerId }) },
		]);
	});
});

describe('GET /api/admin/tenant-forms/submissions/:id/conversion', () => {
	it('suggests customers with the contact or the Google email', async () => {
		await insertCustomer('by-contact', 'ASA@example.com');
		await insertCustomer('by-google', GOOGLE_EMAIL);
		await insertCustomer('unrelated', 'someone@example.com');
		const submissionId = await insertSubmission();

		const { customerMatches } = await preview(submissionId);
		expect(customerMatches.map((match) => match.id).sort()).toEqual(['by-contact', 'by-google']);
	});

	it('lists tentative and confirmed bookings of the offer that overlap the stay', async () => {
		await env.portal_db.prepare(`INSERT INTO offers (id, slug, title) VALUES ('offer_other', 'other', 'Other')`).run();
		await insertBooking('tentative-overlap', 'tentative', '2026-11-20', '2026-12-05');
		await insertBooking('confirmed-overlap', 'confirmed', '2027-01-10', '2027-02-01');
		await insertBooking('draft-overlap', 'draft', '2026-12-10', '2026-12-20');
		await insertBooking('before-arrival', 'confirmed', '2026-11-01', '2026-12-01');
		await insertBooking('other-offer', 'confirmed', '2026-12-10', '2026-12-20', 'offer_other');
		const submissionId = await insertSubmission();

		const { overlappingBookings } = await preview(submissionId);
		expect(overlappingBookings).toEqual([
			{ id: 'tentative-overlap', status: 'tentative', dateFrom: '2026-11-20', dateTo: '2026-12-05', title: 'Other stay', customerName: null },
			{ id: 'confirmed-overlap', status: 'confirmed', dateFrom: '2027-01-10', dateTo: '2027-02-01', title: 'Other stay', customerName: null },
		]);
	});
});

describe('POST /api/admin/tenant-forms/submissions/:id/convert', () => {
	it('updates an existing customer with the non-empty values only and links the lead when it has none', async () => {
		await insertLead('lead-1');
		await insertCustomer('existing', 'asa@example.com', {
			phone: '+1 555',
			primary_address: 'Old street 1',
			employer_or_pension_info: 'Old employer',
			family_members_json: '[{"name":"Old guest"}]',
			national_id_number: 'N-1',
			income_notes: 'Income',
			notes: 'VIP',
			status: 'inactive',
		});
		const values = { ...swedishSubmission(['file-1']), other_guests: [] };
		const submissionId = await insertSubmission({ leadId: 'lead-1', values });

		const response = await convert(submissionId, { customer: { mode: 'update', customerId: 'existing' }, booking: null });
		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({ customerId: 'existing', bookingId: null });

		expect(await getJson<AdminCustomerDetail>('/customers/existing')).toMatchObject({
			fullName: 'Åsa Exempel',
			email: 'asa@example.com',
			phone: '+46 70 123 45 67',
			primaryAddress: 'Testgatan 1, 753 10 Uppsala, Sverige',
			nationality: 'Svensk',
			sex: 'female',
			documentType: 'passport',
			occupation: 'Pensioner',
			employerOrPensionInfo: 'Old employer',
			familyMembersJson: '[{"name":"Old guest"}]',
			nationalIdNumber: 'N-1',
			incomeNotes: 'Income',
			notes: 'VIP',
			status: 'inactive',
			sourceLeadId: 'lead-1',
		});
		expect(await count('bookings')).toBe(0);
		expect((await conversionEvents()).map((event) => event.event_type)).toEqual(['converted_to_customer']);
	});

	it('keeps the lead of an existing customer', async () => {
		await insertLead('lead-1');
		await insertLead('lead-2');
		await insertCustomer('existing', 'asa@example.com', { source_lead_id: 'lead-2' });
		const submissionId = await insertSubmission({ leadId: 'lead-1' });

		await convert(submissionId, { customer: { mode: 'update', customerId: 'existing' }, booking: null });
		expect((await getJson<AdminCustomerDetail>('/customers/existing')).sourceLeadId).toBe('lead-2');
	});

	it('sets the lead on a new customer and booking', async () => {
		await insertLead('lead-1');
		const submissionId = await insertSubmission({ leadId: 'lead-1' });

		const response = await convert(submissionId, { customer: { mode: 'create' }, booking: { status: 'confirmed' } });
		const { customerId, bookingId } = (await response.json()) as ConvertTenantFormSubmissionResponse;
		expect((await getJson<AdminCustomerDetail>(`/customers/${customerId}`)).sourceLeadId).toBe('lead-1');
		expect(await getJson<AdminBookingDetail>(`/bookings/${bookingId}`)).toMatchObject({ sourceLeadId: 'lead-1', status: 'confirmed' });
	});

	it('converts a submission only once', async () => {
		const submissionId = await insertSubmission();
		expect((await convert(submissionId, { customer: { mode: 'create' }, booking: { status: 'draft' } })).status).toBe(201);

		const again = await convert(submissionId, { customer: { mode: 'create' }, booking: { status: 'draft' } });
		expect(again.status).toBe(409);
		expect(await again.json()).toEqual({ error: 'Submission has already been converted' });
		expect(await count('customers')).toBe(1);
		expect(await count('bookings')).toBe(1);
	});

	it('lets only one of two parallel conversions through', async () => {
		const submissionId = await insertSubmission();
		const body = { customer: { mode: 'create' }, booking: { status: 'draft' } };

		const statuses = (await Promise.all([convert(submissionId, body), convert(submissionId, body)])).map((response) => response.status);
		expect(statuses.sort()).toEqual([201, 409]);
		expect(await count('customers')).toBe(1);
		expect(await count('bookings')).toBe(1);
		expect(await conversionEvents()).toHaveLength(2);
	});

	it('never leaves a rejected submission converted when a rejection and a conversion run together', async () => {
		const submissionId = await insertSubmission();

		await Promise.all([
			convert(submissionId, { customer: { mode: 'create' }, booking: { status: 'draft' } }),
			adminFetch(`/tenant-forms/submissions/${submissionId}/review`, { method: 'PUT', body: JSON.stringify({ status: 'rejected' }) }),
		]);

		const row = await env.portal_db
			.prepare(`SELECT status, customer_id FROM form_submissions WHERE id = ?`)
			.bind(submissionId)
			.first<{ status: string; customer_id: string | null }>();
		const converted = row!.customer_id !== null;
		expect(row!.status).toBe(converted ? 'approved' : 'rejected');
		expect(await count('customers')).toBe(converted ? 1 : 0);
	});

	it('rejects a blocking booking that overlaps and writes nothing', async () => {
		await insertBooking('taken', 'confirmed', '2026-12-20', '2027-01-05');
		const submissionId = await insertSubmission();

		const response = await convert(submissionId, { customer: { mode: 'create' }, booking: { status: 'tentative' } });
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: BOOKING_OVERLAP_ERROR });
		expect(await count('customers')).toBe(0);
		expect(await conversionEvents()).toEqual([]);

		const asDraft = await convert(submissionId, { customer: { mode: 'create' }, booking: { status: 'draft' } });
		expect(asDraft.status).toBe(201);
	});

	it.each(['submitted', 'rejected', 'archived'])('rejects a %s submission', async (status) => {
		const submissionId = await insertSubmission({ status });
		const response = await convert(submissionId, { customer: { mode: 'create' }, booking: null });
		expect(response.status).toBe(409);
		expect(await count('customers')).toBe(0);
	});

	it.each([
		['no body', undefined],
		['an unknown mode', { customer: { mode: 'merge' }, booking: null }],
		['update without a customer', { customer: { mode: 'update' }, booking: null }],
		['a missing booking', { customer: { mode: 'create' } }],
		['a non-blocking booking status other than draft', { customer: { mode: 'create' }, booking: { status: 'cancelled' } }],
	])('rejects %s', async (_, body) => {
		const submissionId = await insertSubmission();
		const response = await adminFetch(`/tenant-forms/submissions/${submissionId}/convert`, {
			method: 'POST',
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		expect(response.status).toBe(400);
	});

	it('rejects an unknown customer', async () => {
		const submissionId = await insertSubmission();
		const response = await convert(submissionId, { customer: { mode: 'update', customerId: 'missing' }, booking: null });
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Customer not found' });
	});
});
