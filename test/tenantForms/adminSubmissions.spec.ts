import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
	AdminTenantFormAnswer,
	AdminTenantFormSubmissionDetail,
	AdminTenantFormSubmissionListItem,
	TenantFormSubmitResponse,
	TenantFormUploadResponse,
} from '../../src/types/api';
import {
	ADMIN_EMAIL,
	adminSessionCookie,
	GOOGLE_SUB,
	insertTestInvitation,
	insertTestOffer,
	swedishSubmission,
	tenantAccessToken,
} from '../helpers';

const TENANT_API = 'https://example.com/api/tenant-forms';
const ADMIN_API = 'https://example.com/api/admin/tenant-forms';
const TENANT_IP = '203.0.113.7';
const TENANT_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';

const JPEG = new Uint8Array(2048);
JPEG.set([0xff, 0xd8, 0xff, 0xe0]);

let invitationId: string;
let submissionId: string;
let fileId: string;

beforeEach(async () => {
	await insertTestOffer();
	invitationId = (await insertTestInvitation({ status: 'opened', googleSubject: GOOGLE_SUB, language: 'sv' })).id;
	const token = await tenantAccessToken(invitationId);

	const upload = await SELF.fetch(`${TENANT_API}/files`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'X-Field-Key': 'id_documents',
			'X-File-Name': encodeURIComponent('Pass Åsa.jpg'),
		},
		body: JPEG,
	});
	fileId = ((await upload.json()) as TenantFormUploadResponse).file.id;

	const submit = await SELF.fetch(`${TENANT_API}/submit`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			'CF-Connecting-IP': TENANT_IP,
			'User-Agent': TENANT_USER_AGENT,
		},
		body: JSON.stringify({ values: swedishSubmission([fileId]) }),
	});
	expect(submit.status).toBe(201);
	submissionId = ((await submit.json()) as TenantFormSubmitResponse).submissionId;
});

async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
	return SELF.fetch(`${ADMIN_API}${path}`, {
		...init,
		headers: { 'Content-Type': 'application/json', Cookie: await adminSessionCookie() },
	});
}

function answer(detail: AdminTenantFormSubmissionDetail, key: string): AdminTenantFormAnswer {
	const found = detail.sections.flatMap((section) => section.answers).find((candidate) => candidate.key === key);
	if (!found) throw new Error(`No answer ${key}`);
	return found;
}

function eventsOf(type: string) {
	return env.portal_db
		.prepare(`SELECT actor_type, actor_ref, submission_id, file_id, metadata_json FROM form_events WHERE event_type = ?`)
		.bind(type)
		.all();
}

describe('admin tenant form submission routes', () => {
	it.each([
		['GET', '/submissions'],
		['GET', '/submissions/some-id'],
		['PUT', '/submissions/some-id/review'],
		['GET', '/files/some-id'],
	])('%s %s returns 401 without a session', async (method, path) => {
		expect((await SELF.fetch(`${ADMIN_API}${path}`, { method })).status).toBe(401);
	});

	it('rejects a tenant token', async () => {
		const response = await SELF.fetch(`${ADMIN_API}/files/${fileId}`, {
			headers: { Authorization: `Bearer ${await tenantAccessToken(invitationId)}` },
		});
		expect(response.status).toBe(401);
	});
});

describe('GET /api/admin/tenant-forms/submissions', () => {
	it('lists submissions with offer and file count', async () => {
		const response = await adminFetch('/submissions');
		expect(response.status).toBe(200);
		const { data } = (await response.json()) as { data: AdminTenantFormSubmissionListItem[] };
		expect(data).toEqual([
			expect.objectContaining({
				id: submissionId,
				invitationId,
				displayName: 'Test Example',
				offerTitle: 'Test offer',
				fullName: 'Åsa Exempel',
				contactEmail: 'asa@example.com',
				language: 'sv',
				status: 'submitted',
				fileCount: 1,
				reviewedAt: null,
				remoteIp: TENANT_IP,
				userAgent: TENANT_USER_AGENT,
			}),
		]);
	});

	it('filters by status', async () => {
		const approved = (await (await adminFetch('/submissions?status=approved')).json()) as { data: unknown[] };
		expect(approved.data).toEqual([]);
		expect((await adminFetch('/submissions?status=deleted')).status).toBe(400);
	});
});

describe('GET /api/admin/tenant-forms/submissions/:id', () => {
	it('shows a Swedish submission with English labels and logs the view', async () => {
		const response = await adminFetch(`/submissions/${submissionId}`);
		expect(response.status).toBe(200);
		const detail = (await response.json()) as AdminTenantFormSubmissionDetail;

		expect(detail.sections[0].title).toBe('Trip & stay');
		expect(answer(detail, 'first_name')).toMatchObject({ label: 'First name(s)', displayValue: 'Åsa' });
		expect(answer(detail, 'sex').displayValue).toBe('Female');
		expect(answer(detail, 'stay_purpose').displayValue).toBe('Other non-tourist reason (please specify): Språkkurs');
		expect(answer(detail, 'privacy_consent').displayValue).toBe('Yes');
		expect(answer(detail, 'id_documents').displayValue).toBe('1 file');
		expect(answer(detail, 'region')).toMatchObject({ value: null, displayValue: null });

		const guests = answer(detail, 'other_guests');
		expect(guests.displayValue).toBe('1 guest');
		const guestRow = guests.items![0];
		expect(guestRow.find((item) => item.key === 'relationship')).toMatchObject({
			label: 'Relationship to the main guest',
			displayValue: 'Child',
		});
		expect(guestRow.find((item) => item.key === 'document_type')?.displayValue).toBe('National ID card');

		expect(detail.files).toEqual([
			expect.objectContaining({ id: fileId, originalFilename: 'Pass Åsa.jpg', mimeType: 'image/jpeg', status: 'attached' }),
		]);
		expect(detail.values.stay_purpose_other).toBe('Språkkurs');
		expect(detail.googleEmail).toBe('tenant@example.com');
		expect(detail).toMatchObject({ remoteIp: TENANT_IP, userAgent: TENANT_USER_AGENT });
		expect(detail).not.toHaveProperty('googleSubject');
		expect(detail.events.map((event) => event.eventType)).toEqual([
			'file_uploaded',
			'submitted',
			'submission_viewed',
		]);

		expect((await eventsOf('submission_viewed')).results).toEqual([
			{ actor_type: 'admin', actor_ref: ADMIN_EMAIL, submission_id: submissionId, file_id: null, metadata_json: null },
		]);
	});

	it('returns 404 for an unknown submission', async () => {
		expect((await adminFetch('/submissions/no-such-id')).status).toBe(404);
	});
});

describe('PUT /api/admin/tenant-forms/submissions/:id/review', () => {
	function review(body: unknown): Promise<Response> {
		return adminFetch(`/submissions/${submissionId}/review`, { method: 'PUT', body: JSON.stringify(body) });
	}

	function submissionRow() {
		return env.portal_db
			.prepare(`SELECT status, reviewed_by_email, reviewed_at, review_notes FROM form_submissions WHERE id = ?`)
			.bind(submissionId)
			.first();
	}

	/** What a conversion leaves behind; the conversion itself is tested in adminConversion.spec.ts. */
	async function markConverted(): Promise<void> {
		await env.portal_db.prepare(`INSERT INTO customers (id, full_name, email) VALUES ('cust_1', 'Åsa Exempel', 'asa@example.com')`).run();
		await env.portal_db.prepare(`UPDATE form_submissions SET customer_id = 'cust_1' WHERE id = ?`).bind(submissionId).run();
	}

	it('records the decision, the reviewer and the notes', async () => {
		const response = await review({ status: 'approved', reviewNotes: ' Video call done ' });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			status: 'approved',
			reviewedByEmail: ADMIN_EMAIL,
			reviewNotes: 'Video call done',
		});

		const keepsNotes = (await (await review({ status: 'rejected' })).json()) as { reviewNotes: string | null };
		expect(keepsNotes.reviewNotes).toBe('Video call done');

		const events = await eventsOf('approved');
		expect(events.results).toEqual([
			{ actor_type: 'admin', actor_ref: ADMIN_EMAIL, submission_id: submissionId, file_id: null, metadata_json: null },
		]);
	});

	it('edits only the notes when no status is sent', async () => {
		await review({ status: 'approved', reviewNotes: 'Video call done' });
		const before = await submissionRow();

		const response = await review({ reviewNotes: '' });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ status: 'approved', reviewNotes: null });

		const after = await submissionRow();
		expect(after).toEqual({ ...before, review_notes: null });
		expect((await eventsOf('review_notes_updated')).results).toHaveLength(1);
		expect((await eventsOf('approved')).results).toHaveLength(1);
	});

	it.each([
		['approve twice', [['approved', 200], ['approved', 409]]],
		['reject, then reconsider', [['rejected', 200], ['approved', 200]]],
		['approve, reject, archive, then nothing', [['approved', 200], ['rejected', 200], ['archived', 200], ['approved', 409]]],
		['archive is final', [['archived', 200], ['rejected', 409], ['archived', 409]]],
	] as const)('allows only valid decisions: %s', async (_label, steps) => {
		for (const [status, expected] of steps) {
			expect((await review({ status })).status).toBe(expected);
		}
	});

	it('keeps the notes of an archived submission editable', async () => {
		await review({ status: 'archived' });
		const response = await review({ reviewNotes: 'Stay finished' });
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ status: 'archived', reviewNotes: 'Stay finished' });
	});

	it('only archives a converted submission', async () => {
		await review({ status: 'approved' });
		await markConverted();

		const rejected = await review({ status: 'rejected' });
		expect(rejected.status).toBe(409);
		expect(await rejected.json()).toEqual({
			error: 'A converted submission can only be archived. Cancel its booking in Bookings if the stay will not happen',
			allowedStatuses: ['archived'],
		});
		expect((await review({ status: 'archived' })).status).toBe(200);
	});

	it('lists the possible decisions in the detail', async () => {
		const allowed = async () =>
			((await (await adminFetch(`/submissions/${submissionId}`)).json()) as AdminTenantFormSubmissionDetail).allowedReviewStatuses;

		expect(await allowed()).toEqual(['approved', 'rejected', 'archived']);
		await review({ status: 'approved' });
		expect(await allowed()).toEqual(['rejected', 'archived']);
		await markConverted();
		expect(await allowed()).toEqual(['archived']);
		await review({ status: 'archived' });
		expect(await allowed()).toEqual([]);
	});

	it.each([
		['an unknown status', { status: 'submitted' }],
		['neither a status nor notes', {}],
		['notes that are too long', { status: 'approved', reviewNotes: 'x'.repeat(2001) }],
		['notes of the wrong type', { status: 'approved', reviewNotes: 5 }],
	])('rejects %s', async (_label, body) => {
		expect((await review(body)).status).toBe(400);
	});

	it('returns 404 for an unknown submission', async () => {
		const response = await adminFetch('/submissions/no-such-id/review', {
			method: 'PUT',
			body: JSON.stringify({ status: 'approved' }),
		});
		expect(response.status).toBe(404);
	});
});

describe('GET /api/admin/tenant-forms/files/:fileId', () => {
	it('streams the file with headers that keep the browser from running or caching it', async () => {
		const response = await adminFetch(`/files/${fileId}`);
		expect(response.status).toBe(200);
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG);

		expect(response.headers.get('Content-Type')).toBe('image/jpeg');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('Content-Security-Policy')).toBe("sandbox; default-src 'none'");
		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
		expect(response.headers.get('Content-Disposition')).toBe(
			`inline; filename="Pass _sa.jpg"; filename*=UTF-8''${encodeURIComponent('Pass Åsa.jpg')}`
		);

		expect((await eventsOf('file_viewed')).results).toEqual([
			{
				actor_type: 'admin',
				actor_ref: ADMIN_EMAIL,
				submission_id: submissionId,
				file_id: fileId,
				metadata_json: JSON.stringify({ download: false }),
			},
		]);
	});

	it('offers a download with ?download=1', async () => {
		const response = await adminFetch(`/files/${fileId}?download=1`);
		expect(response.headers.get('Content-Disposition')).toMatch(/^attachment; /);
		await response.arrayBuffer();
	});

	it('does not serve files that have not been submitted', async () => {
		const other = await insertTestInvitation({ status: 'opened', googleSubject: GOOGLE_SUB });
		const upload = await SELF.fetch(`${TENANT_API}/files`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${await tenantAccessToken(other.id)}`, 'X-Field-Key': 'id_documents' },
			body: JPEG,
		});
		const unsubmittedId = ((await upload.json()) as TenantFormUploadResponse).file.id;

		expect((await adminFetch(`/files/${unsubmittedId}`)).status).toBe(404);
		expect((await adminFetch('/files/no-such-id')).status).toBe(404);
	});
});
