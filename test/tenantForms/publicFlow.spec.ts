import { createExecutionContext, env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTenantFormGoogleAuthHandler } from '../../src/handlers/tenantForms/auth';
import type {
	ResolveTenantFormInvitationResponse,
	TenantFormFieldView,
	TenantFormGoogleAuthResponse,
	TenantFormSchemaResponse,
} from '../../src/types/api';
import type { GoogleIdTokenPayload } from '../../src/utils/googleAuth';
import { signSession } from '../../src/utils/session';
import { verifyTenantFormToken } from '../../src/utils/tenantFormToken';
import {
	adminSessionCookie,
	GOOGLE_SUB,
	insertTestInvitation,
	insertTestOffer,
	isoFromNow,
	randomInvitationToken,
	tenantAccessToken,
} from '../helpers';

const API = 'https://example.com/api/tenant-forms';
const DAY_MS = 86_400_000;

beforeEach(insertTestOffer);

function invitationRow(id: string) {
	return env.portal_db
		.prepare(`SELECT status, opened_at, authenticated_at, google_subject, google_email FROM form_invitations WHERE id = ?`)
		.bind(id)
		.first<Record<string, string | null>>();
}

async function eventTypes(invitationId: string): Promise<{ event_type: string; actor_ref: string | null; metadata_json: string | null }[]> {
	const { results } = await env.portal_db
		.prepare(`SELECT event_type, actor_ref, metadata_json FROM form_events WHERE invitation_id = ? ORDER BY created_at, rowid`)
		.bind(invitationId)
		.all<{ event_type: string; actor_ref: string | null; metadata_json: string | null }>();
	return results;
}

function postJson(path: string, body: unknown): Promise<Response> {
	return SELF.fetch(`${API}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: typeof body === 'string' ? body : JSON.stringify(body),
	});
}

describe('POST /api/tenant-forms/invitations/resolve', () => {
	it('opens a pending invitation once', async () => {
		const { id, token } = await insertTestInvitation();

		const response = await postJson('/invitations/resolve', { token });
		expect(response.status).toBe(200);
		const body = (await response.json()) as ResolveTenantFormInvitationResponse;
		expect(body).toMatchObject({
			status: 'opened',
			displayName: 'Test Example',
			offer: { title: 'Test offer', slug: 'test-offer' },
			language: 'sv',
		});

		const row = await invitationRow(id);
		expect(row?.status).toBe('opened');
		expect(row?.opened_at).not.toBeNull();

		await postJson('/invitations/resolve', { token });
		expect((await eventTypes(id)).map((event) => event.event_type)).toEqual(['invitation_opened']);
	});

	it.each([
		['an unknown token', randomInvitationToken()],
		['a malformed token', 'short'],
		['a missing token', undefined],
	])('returns 404 for %s', async (_label, token) => {
		const response = await postJson('/invitations/resolve', { token });
		expect(response.status).toBe(404);
	});

	it('returns 400 for a body that is not JSON', async () => {
		expect((await postJson('/invitations/resolve', 'nope')).status).toBe(400);
	});

	it.each([
		['expired', { status: 'pending', expiresAt: isoFromNow(-DAY_MS) }, 410],
		['revoked', { status: 'revoked' }, 410],
		['submitted', { status: 'submitted' }, 409],
	])('reports a %s invitation', async (expectedStatus, options, httpStatus) => {
		const { token } = await insertTestInvitation(options);
		const response = await postJson('/invitations/resolve', { token });
		expect(response.status).toBe(httpStatus);
		expect(await response.json()).toMatchObject({ status: expectedStatus });
	});
});

describe('POST /api/tenant-forms/auth/google', () => {
	function fakeGoogle(overrides: Partial<GoogleIdTokenPayload> = {}) {
		return vi.fn(async () => ({
			email: 'Tenant@Example.com',
			emailVerified: true,
			sub: GOOGLE_SUB,
			exp: Math.floor(Date.now() / 1000) + 3600,
			...overrides,
		}));
	}

	async function signIn(verify: ReturnType<typeof vi.fn>, body: Record<string, unknown>): Promise<Response> {
		const handler = createTenantFormGoogleAuthHandler(verify as never);
		const request = new Request(`${API}/auth/google`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		return handler({ request, env, ctx: createExecutionContext(), url: new URL(request.url), params: {} });
	}

	it('binds the invitation to the first Google account and issues an access token', async () => {
		const { id, token } = await insertTestInvitation();

		const response = await signIn(fakeGoogle(), { token, googleIdToken: 'google-jwt' });
		expect(response.status).toBe(200);
		const body = (await response.json()) as TenantFormGoogleAuthResponse;
		expect(body.googleEmail).toBe('tenant@example.com');

		const payload = await verifyTenantFormToken(body.accessToken, env.TENANT_FORM_SECRET, Math.floor(Date.now() / 1000));
		expect(payload).toMatchObject({ invitationId: id, subject: GOOGLE_SUB });
		expect(payload!.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(2 * 3600);

		const row = await invitationRow(id);
		expect(row).toMatchObject({ status: 'opened', google_subject: GOOGLE_SUB, google_email: 'tenant@example.com' });
		expect(row?.authenticated_at).not.toBeNull();
		expect(await eventTypes(id)).toEqual([{ event_type: 'tenant_authenticated', actor_ref: GOOGLE_SUB, metadata_json: null }]);
	});

	it('lets the same Google account sign in again', async () => {
		const { token } = await insertTestInvitation({ status: 'opened', googleSubject: GOOGLE_SUB });
		expect((await signIn(fakeGoogle(), { token, googleIdToken: 'google-jwt' })).status).toBe(200);
	});

	it('rejects another Google account once the invitation is bound', async () => {
		const { id, token } = await insertTestInvitation({ status: 'opened', googleSubject: GOOGLE_SUB });

		const response = await signIn(fakeGoogle({ sub: 'someone-else' }), { token, googleIdToken: 'google-jwt' });
		expect(response.status).toBe(403);
		expect((await invitationRow(id))?.google_subject).toBe(GOOGLE_SUB);
		expect(await eventTypes(id)).toEqual([
			{ event_type: 'auth_rejected', actor_ref: null, metadata_json: JSON.stringify({ reason: 'subject_mismatch' }) },
		]);
	});

	it('rejects an unverified Google email without binding', async () => {
		const { id, token } = await insertTestInvitation();
		const response = await signIn(fakeGoogle({ emailVerified: false }), { token, googleIdToken: 'google-jwt' });
		expect(response.status).toBe(401);
		expect((await invitationRow(id))?.google_subject).toBeNull();
	});

	it('rejects a Google token that fails verification', async () => {
		const { token } = await insertTestInvitation();
		const verify = vi.fn(async () => {
			throw new Error('bad signature');
		});
		expect((await signIn(verify, { token, googleIdToken: 'google-jwt' })).status).toBe(401);
	});

	it('does not call Google for an expired invitation', async () => {
		const { token } = await insertTestInvitation({ expiresAt: isoFromNow(-DAY_MS) });
		const verify = fakeGoogle();
		expect((await signIn(verify, { token, googleIdToken: 'google-jwt' })).status).toBe(410);
		expect(verify).not.toHaveBeenCalled();
	});

	it('validates the body', async () => {
		const { token } = await insertTestInvitation();
		expect((await signIn(fakeGoogle(), { token })).status).toBe(400);
		expect((await signIn(fakeGoogle(), { token: randomInvitationToken(), googleIdToken: 'x' })).status).toBe(404);
	});

	it('is wired to the real route, which rejects a token that is not a JWT', async () => {
		const { token } = await insertTestInvitation();
		const response = await postJson('/auth/google', { token, googleIdToken: 'not-a-jwt' });
		expect(response.status).toBe(401);
	});
});

describe('GET /api/tenant-forms/form', () => {
	function getForm(authorization?: string, cookie?: string): Promise<Response> {
		const headers: Record<string, string> = {};
		if (authorization) headers.Authorization = authorization;
		if (cookie) headers.Cookie = cookie;
		return SELF.fetch(`${API}/form`, { headers });
	}

	function findField(schema: TenantFormSchemaResponse, key: string): TenantFormFieldView {
		const field = schema.sections.flatMap((section) => section.fields).find((candidate) => candidate.key === key);
		if (!field) throw new Error(`No field ${key}`);
		return field;
	}

	it('returns the form in the invitation language with variables filled in', async () => {
		const { id } = await insertTestInvitation({ status: 'opened', googleSubject: GOOGLE_SUB });

		const response = await getForm(`Bearer ${await tenantAccessToken(id)}`);
		expect(response.status).toBe(200);
		const schema = (await response.json()) as TenantFormSchemaResponse;

		expect(schema.invitation).toMatchObject({ displayName: 'Test Example', language: 'sv', offer: { title: 'Test offer' } });
		expect(schema.prefill.contactEmail).toBe('tenant@example.com');
		expect(schema.template.title).toBe('Test offer – uthyrning / frågeformulär');
		expect(schema.sections[0]).toMatchObject({ key: 'stay', title: 'Resa & vistelse' });

		const documents = findField(schema, 'id_documents');
		expect(documents.help).toContain('högst 10 filer, max 10 MB per fil');
		expect(findField(schema, 'sex').options[0]).toEqual({ key: 'female', label: 'Kvinna', allowsFreeText: false });
		expect(findField(schema, 'other_guests').itemFields.find((field) => field.key === 'relationship')?.label).toBe(
			'Relation till huvudgästen'
		);
		expect(JSON.stringify(schema)).not.toMatch(/\{(offerTitle|displayName|maxFiles|maxFileSizeMb)\}/);
	});

	it('falls back to English for texts missing in the invitation language', async () => {
		const { id } = await insertTestInvitation({ status: 'opened', googleSubject: GOOGLE_SUB, language: 'no' });
		await env.portal_db
			.prepare(`INSERT INTO form_translations (template_id, language, text_key, text) VALUES ('tenant_details_v1', 'no', ?, ?)`)
			.bind('section.stay.title', 'Reise og opphold')
			.run();

		const schema = (await (await getForm(`Bearer ${await tenantAccessToken(id)}`)).json()) as TenantFormSchemaResponse;
		expect(schema.sections[0].title).toBe('Reise og opphold');
		expect(schema.sections[1].title).toBe('Main guest');
	});

	it('rejects requests without a valid tenant token', async () => {
		const { id } = await insertTestInvitation({ status: 'opened', googleSubject: GOOGLE_SUB });

		expect((await getForm()).status).toBe(401);
		expect((await getForm('Bearer not.a-token')).status).toBe(401);
		expect((await getForm(`Bearer ${await tenantAccessToken(id, { expInSeconds: -1 })}`)).status).toBe(401);
		expect((await getForm(`Bearer ${await tenantAccessToken(id, { subject: 'someone-else' })}`)).status).toBe(401);
		expect((await getForm(`Bearer ${await tenantAccessToken(id, { secret: env.SESSION_SECRET })}`)).status).toBe(401);
	});

	it('rejects admin credentials', async () => {
		await insertTestInvitation({ status: 'opened', googleSubject: GOOGLE_SUB });
		const adminTokenWithTenantSecret = await signSession(
			{ email: 'admin@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
			env.TENANT_FORM_SECRET
		);

		expect((await getForm(undefined, await adminSessionCookie())).status).toBe(401);
		expect((await getForm(`Bearer ${adminTokenWithTenantSecret}`)).status).toBe(401);
	});

	it.each([
		['revoked', { status: 'revoked' }, 410],
		['submitted', { status: 'submitted' }, 409],
		['expired', { status: 'opened', expiresAt: isoFromNow(-60_000) }, 410],
	])('stops a valid token once the invitation is %s', async (_label, options, httpStatus) => {
		const { id } = await insertTestInvitation({ googleSubject: GOOGLE_SUB, ...options });
		expect((await getForm(`Bearer ${await tenantAccessToken(id)}`)).status).toBe(httpStatus);
	});
});

describe('CORS', () => {
	it('allows the Authorization header from the public site', async () => {
		const response = await SELF.fetch(`${API}/form`, {
			method: 'OPTIONS',
			headers: { Origin: 'https://costaseasons.com', 'Access-Control-Request-Headers': 'authorization' },
		});
		expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
	});
});
