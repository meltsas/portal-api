import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
	TenantFormDraftResponse,
	TenantFormSchemaResponse,
	TenantFormSubmitResponse,
	TenantFormUploadResponse,
} from '../../src/types/api';
import { GOOGLE_SUB, insertTestInvitation, insertTestOffer, isoFromNow, tenantAccessToken } from '../helpers';

const API = 'https://example.com/api/tenant-forms';
const MB = 1_048_576;

const JPEG = bytesWith([0xff, 0xd8, 0xff, 0xe0], 2048);
const PNG = bytesWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 2048);
const PDF = new TextEncoder().encode('%PDF-1.7\n%test document\n');
const WEBP = bytesWith([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50], 2048);
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>');
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

function bytesWith(header: number[], size: number): Uint8Array {
	const bytes = new Uint8Array(size);
	bytes.set(header);
	return bytes;
}

let invitationId: string;
let token: string;

beforeEach(async () => {
	await insertTestOffer();
	invitationId = (await insertTestInvitation({ status: 'opened', googleSubject: GOOGLE_SUB })).id;
	token = await tenantAccessToken(invitationId);
});

function upload(
	body: Uint8Array,
	options: { fieldKey?: string | null; fileName?: string; contentType?: string; accessToken?: string } = {}
): Promise<Response> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${options.accessToken ?? token}`,
		'Content-Type': options.contentType ?? 'application/octet-stream',
		'X-File-Name': encodeURIComponent(options.fileName ?? 'passport.jpg'),
	};
	if (options.fieldKey !== null) headers['X-Field-Key'] = options.fieldKey ?? 'id_documents';
	return SELF.fetch(`${API}/files`, { method: 'POST', headers, body });
}

async function uploadJpeg(): Promise<string> {
	const response = await upload(JPEG);
	expect(response.status).toBe(201);
	return ((await response.json()) as TenantFormUploadResponse).file.id;
}

function sendJson(method: string, path: string, body: unknown, accessToken = token): Promise<Response> {
	return SELF.fetch(`${API}${path}`, {
		method,
		headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body),
	});
}

async function getForm(): Promise<TenantFormSchemaResponse> {
	const response = await SELF.fetch(`${API}/form`, { headers: { Authorization: `Bearer ${token}` } });
	expect(response.status).toBe(200);
	return response.json();
}

function fileRows() {
	return env.portal_db
		.prepare(`SELECT id, status, r2_key, submission_id, original_filename FROM form_submission_files WHERE invitation_id = ?`)
		.bind(invitationId)
		.all<{ id: string; status: string; r2_key: string; submission_id: string | null; original_filename: string }>();
}

async function storedObjectKeys(): Promise<string[]> {
	const listed = await env.tenant_files.list({ prefix: `tenant-forms/${invitationId}/` });
	return listed.objects.map((object) => object.key);
}

async function insertFileRows(count: number, status: string): Promise<void> {
	for (let index = 0; index < count; index++) {
		const id = crypto.randomUUID();
		await env.portal_db
			.prepare(
				`INSERT INTO form_submission_files (id, invitation_id, field_key, r2_key, original_filename, mime_type, size_bytes, status, uploaded_at)
				 VALUES (?, ?, 'id_documents', ?, 'x.jpg', 'image/jpeg', 100, ?, ?)`
			)
			.bind(id, invitationId, `tenant-forms/${invitationId}/${id}`, status, isoFromNow(0))
			.run();
	}
}

function submissionValues(fileIds: string[]): Record<string, unknown> {
	return {
		planned_arrival: '2026-12-01',
		planned_departure: '2027-01-15',
		first_name: 'Test',
		last_name: 'Example',
		sex: 'female',
		date_of_birth: '1980-05-20',
		citizenship: 'Swedish',
		document_type: 'passport',
		document_number: 'X1234567',
		phone: '+46 70 123 45 67',
		contact_email: 'guest@example.com',
		address_line1: 'Testgatan 1',
		city: 'Uppsala',
		postcode: '753 10',
		country: 'Sweden',
		stay_purpose: 'pensioner_seasonal',
		employment_type: 'pensioner',
		id_documents: fileIds,
		video_call_willing: 'no',
		privacy_consent: true,
	};
}

describe('POST /api/tenant-forms/files', () => {
	it('stores the file in R2 under an id-only key and records metadata', async () => {
		const response = await upload(JPEG, { fileName: 'Annika passport.jpg', contentType: 'image/heic' });
		expect(response.status).toBe(201);
		const { file } = (await response.json()) as TenantFormUploadResponse;
		expect(file).toMatchObject({
			fieldKey: 'id_documents',
			originalFilename: 'Annika passport.jpg',
			mimeType: 'image/jpeg',
			sizeBytes: JPEG.byteLength,
		});

		const expectedKey = `tenant-forms/${invitationId}/${file.id}`;
		expect(await storedObjectKeys()).toEqual([expectedKey]);
		expect((await env.tenant_files.head(expectedKey))?.httpMetadata?.contentType).toBe('image/jpeg');

		const { results } = await fileRows();
		expect(results).toEqual([
			{ id: file.id, status: 'uploaded', r2_key: expectedKey, submission_id: null, original_filename: 'Annika passport.jpg' },
		]);

		const event = await env.portal_db
			.prepare(`SELECT event_type, actor_ref, file_id, metadata_json FROM form_events WHERE invitation_id = ?`)
			.bind(invitationId)
			.first();
		expect(event).toEqual({
			event_type: 'file_uploaded',
			actor_ref: GOOGLE_SUB,
			file_id: file.id,
			metadata_json: JSON.stringify({ sizeBytes: JPEG.byteLength, mimeType: 'image/jpeg' }),
		});
	});

	it('accepts PNG and PDF', async () => {
		expect((await upload(PNG)).status).toBe(201);
		expect((await upload(PDF, { fileName: 'scan.pdf' })).status).toBe(201);
	});

	it.each([
		['HTML disguised as a JPEG', HTML],
		['SVG', SVG],
		['WebP, which the field does not accept', WEBP],
	])('rejects %s without storing anything', async (_label, body) => {
		const response = await upload(body, { contentType: 'image/jpeg' });
		expect(response.status).toBe(415);
		expect(await storedObjectKeys()).toEqual([]);
		expect((await fileRows()).results).toEqual([]);
	});

	it('rejects a file over 10 MB', async () => {
		const response = await upload(bytesWith([0xff, 0xd8, 0xff], 10 * MB + 1));
		expect(response.status).toBe(413);
		expect(await storedObjectKeys()).toEqual([]);
	});

	it('requires a file field key', async () => {
		expect((await upload(JPEG, { fieldKey: null })).status).toBe(400);
		expect((await upload(JPEG, { fieldKey: 'first_name' })).status).toBe(400);
	});

	it('enforces the per-field file limit and the upload limit', async () => {
		await insertFileRows(10, 'uploaded');
		expect((await upload(JPEG)).status).toBe(409);
	});

	it('limits repeated upload and delete', async () => {
		await insertFileRows(30, 'deleted');
		expect((await upload(JPEG)).status).toBe(409);
	});

	it('strips paths and control characters from the file name', async () => {
		const response = await upload(JPEG, { fileName: '../../etc/"pass\u0007wd".jpg' });
		expect(((await response.json()) as TenantFormUploadResponse).file.originalFilename).toBe('passwd.jpg');
	});

	it('requires a tenant token for an open invitation', async () => {
		expect((await upload(JPEG, { accessToken: 'invalid' })).status).toBe(401);

		await env.portal_db.prepare(`UPDATE form_invitations SET status = 'revoked' WHERE id = ?`).bind(invitationId).run();
		expect((await upload(JPEG)).status).toBe(410);
	});
});

describe('DELETE /api/tenant-forms/files/:fileId', () => {
	it('removes an uploaded file from R2 and the form', async () => {
		const fileId = await uploadJpeg();

		const response = await SELF.fetch(`${API}/files/${fileId}`, {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(response.status).toBe(200);
		expect(await storedObjectKeys()).toEqual([]);
		expect((await fileRows()).results[0].status).toBe('deleted');
		expect((await getForm()).uploadedFiles).toEqual([]);

		const again = await SELF.fetch(`${API}/files/${fileId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
		expect(again.status).toBe(404);
	});

	it("does not touch another invitation's file", async () => {
		const fileId = await uploadJpeg();
		const other = await insertTestInvitation({ status: 'opened', googleSubject: GOOGLE_SUB });
		const otherToken = await tenantAccessToken(other.id);

		const response = await SELF.fetch(`${API}/files/${fileId}`, {
			method: 'DELETE',
			headers: { Authorization: `Bearer ${otherToken}` },
		});
		expect(response.status).toBe(404);
		expect((await fileRows()).results[0].status).toBe('uploaded');
	});
});

describe('PUT /api/tenant-forms/draft', () => {
	it('saves unfinished answers and returns them with uploaded files on the next visit', async () => {
		const fileId = await uploadJpeg();
		const values = { first_name: 'Test', phone: '12', contact_email: 'guest@', id_documents: [fileId] };

		const response = await sendJson('PUT', '/draft', { values });
		expect(response.status).toBe(200);
		const { savedAt } = (await response.json()) as TenantFormDraftResponse;

		const form = await getForm();
		expect(form.draft).toEqual({ values: { first_name: 'Test', phone: '12', contact_email: 'guest@' }, savedAt });
		expect(form.uploadedFiles.map((file) => file.id)).toEqual([fileId]);
	});

	it('replaces the previous draft', async () => {
		await sendJson('PUT', '/draft', { values: { first_name: 'Old' } });
		await sendJson('PUT', '/draft', { values: { last_name: 'New' } });
		expect((await getForm()).draft?.values).toEqual({ last_name: 'New' });
	});

	it('still rejects unknown fields and too long values', async () => {
		const response = await sendJson('PUT', '/draft', { values: { is_admin: true, document_number: 'x'.repeat(51) } });
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'Invalid form values',
			errors: [
				{ field: 'is_admin', code: 'unknown_field' },
				{ field: 'document_number', code: 'too_long' },
			],
		});
	});

	it('rejects a body over 100 KB', async () => {
		const response = await sendJson('PUT', '/draft', { values: { special_requests: 'x'.repeat(100_001) } });
		expect(response.status).toBe(413);
	});
});

describe('POST /api/tenant-forms/submit', () => {
	it('creates the submission, attaches files, closes the invitation and deletes the draft', async () => {
		const fileId = await uploadJpeg();
		await sendJson('PUT', '/draft', { values: { first_name: 'Test' } });

		const response = await sendJson('POST', '/submit', { values: submissionValues([fileId]) });
		expect(response.status).toBe(201);
		const { submissionId } = (await response.json()) as TenantFormSubmitResponse;

		const submission = await env.portal_db
			.prepare(
				`SELECT invitation_id, google_subject, google_email, contact_email, phone, full_name, planned_arrival,
				        planned_departure, documents_delete_after, status, language
				 FROM form_submissions WHERE id = ?`
			)
			.bind(submissionId)
			.first();
		expect(submission).toEqual({
			invitation_id: invitationId,
			google_subject: GOOGLE_SUB,
			google_email: 'tenant@example.com',
			contact_email: 'guest@example.com',
			phone: '+46 70 123 45 67',
			full_name: 'Test Example',
			planned_arrival: '2026-12-01',
			planned_departure: '2027-01-15',
			documents_delete_after: '2027-02-14',
			status: 'submitted',
			language: 'sv',
		});

		expect((await fileRows()).results).toMatchObject([{ id: fileId, status: 'attached', submission_id: submissionId }]);
		const invitation = await env.portal_db
			.prepare(`SELECT status, submitted_at FROM form_invitations WHERE id = ?`)
			.bind(invitationId)
			.first<{ status: string; submitted_at: string | null }>();
		expect(invitation?.status).toBe('submitted');
		expect(invitation?.submitted_at).not.toBeNull();
		expect(await env.portal_db.prepare(`SELECT * FROM form_drafts WHERE invitation_id = ?`).bind(invitationId).first()).toBeNull();

		const event = await env.portal_db
			.prepare(`SELECT submission_id, metadata_json FROM form_events WHERE invitation_id = ? AND event_type = 'submitted'`)
			.bind(invitationId)
			.first();
		expect(event).toEqual({ submission_id: submissionId, metadata_json: JSON.stringify({ fileCount: 1 }) });

		const formAfter = await SELF.fetch(`${API}/form`, { headers: { Authorization: `Bearer ${token}` } });
		expect(formAfter.status).toBe(409);
	});

	it('refuses a second submit', async () => {
		const fileId = await uploadJpeg();
		expect((await sendJson('POST', '/submit', { values: submissionValues([fileId]) })).status).toBe(201);
		expect((await sendJson('POST', '/submit', { values: submissionValues([fileId]) })).status).toBe(409);
	});

	it('rejects files that were not uploaded for this invitation', async () => {
		const other = await insertTestInvitation({ status: 'opened', googleSubject: GOOGLE_SUB });
		const foreignFile = await upload(JPEG, { accessToken: await tenantAccessToken(other.id) });
		const foreignFileId = ((await foreignFile.json()) as TenantFormUploadResponse).file.id;

		const deletedFileId = await uploadJpeg();
		await SELF.fetch(`${API}/files/${deletedFileId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });

		for (const fileIds of [[foreignFileId], [deletedFileId], [crypto.randomUUID()]]) {
			const response = await sendJson('POST', '/submit', { values: submissionValues(fileIds) });
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({ errors: [{ field: 'id_documents', code: 'invalid_file' }] });
		}
		expect((await env.portal_db.prepare(`SELECT COUNT(*) AS n FROM form_submissions`).first<{ n: number }>())?.n).toBe(0);
	});

	it('returns field errors for incomplete values', async () => {
		const values = submissionValues([await uploadJpeg()]);
		delete values.first_name;
		const response = await sendJson('POST', '/submit', { values });
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'Invalid form values',
			errors: [{ field: 'first_name', code: 'required' }],
		});
	});

	it('requires a tenant token', async () => {
		const response = await SELF.fetch(`${API}/submit`, { method: 'POST', body: '{}' });
		expect(response.status).toBe(401);
	});
});
