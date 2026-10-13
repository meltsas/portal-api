import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
	AdminTenantFormInvitation,
	AdminTenantFormInvitationDetail,
	AdminTenantFormTemplateDetail,
	AdminTenantFormTemplateListItem,
	CreateTenantFormInvitationResponse,
} from '../../src/types/api';
import { ADMIN_EMAIL, adminSessionCookie, isoFromNow, sha256Hex } from '../helpers';

const API = 'https://example.com/api/admin/tenant-forms';
const OFFER_ID = 'offer_test';
const DAY_MS = 86_400_000;

beforeEach(async () => {
	await env.portal_db
		.prepare(`INSERT INTO offers (id, slug, title, status) VALUES (?, 'test-offer', 'Test offer', 'active')`)
		.bind(OFFER_ID)
		.run();
});

async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
	return SELF.fetch(`${API}${path}`, {
		...init,
		headers: { 'Content-Type': 'application/json', Cookie: await adminSessionCookie() },
	});
}

function createInvitation(body: Record<string, unknown>): Promise<Response> {
	return adminFetch('/invitations', { method: 'POST', body: JSON.stringify(body) });
}

async function createValidInvitation(): Promise<CreateTenantFormInvitationResponse> {
	const response = await createInvitation({ displayName: 'Test Example', offerId: OFFER_ID, language: 'sv' });
	expect(response.status).toBe(201);
	return response.json();
}

async function insertInvitation(id: string, status: string, expiresAt: string): Promise<void> {
	await env.portal_db
		.prepare(
			`INSERT INTO form_invitations (id, template_id, token_hash, display_name, offer_id, language, status, expires_at, created_by_email)
			 VALUES (?, 'tenant_details_v1', ?, 'Seeded', ?, 'en', ?, ?, ?)`
		)
		.bind(id, `hash-${id}`, OFFER_ID, status, expiresAt, ADMIN_EMAIL)
		.run();
}

describe('admin tenant form routes', () => {
	it.each([
		['GET', '/templates'],
		['GET', '/templates/tenant_details_v1'],
		['GET', '/invitations'],
		['POST', '/invitations'],
		['GET', '/invitations/some-id'],
		['POST', '/invitations/some-id/revoke'],
	])('%s %s returns 401 without a session', async (method, path) => {
		const response = await SELF.fetch(`${API}${path}`, { method });
		expect(response.status).toBe(401);
	});
});

describe('POST /api/admin/tenant-forms/invitations', () => {
	it('returns the link once and stores only the token hash', async () => {
		const before = Date.now();
		const { invitation, url } = await createValidInvitation();

		expect(url.startsWith(env.TENANT_FORM_URL_BASE)).toBe(true);
		const token = url.slice(env.TENANT_FORM_URL_BASE.length);
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

		expect(invitation).toMatchObject({
			templateId: 'tenant_details_v1',
			displayName: 'Test Example',
			offerId: OFFER_ID,
			offerTitle: 'Test offer',
			language: 'sv',
			status: 'pending',
			createdByEmail: ADMIN_EMAIL,
			submissionId: null,
		});
		const expiresInMs = Date.parse(invitation.expiresAt) - before;
		expect(Math.abs(expiresInMs - 5 * DAY_MS)).toBeLessThan(60_000);

		const row = await env.portal_db
			.prepare(`SELECT * FROM form_invitations WHERE id = ?`)
			.bind(invitation.id)
			.first<Record<string, unknown>>();
		expect(row?.token_hash).toBe(await sha256Hex(token));
		expect(JSON.stringify(row)).not.toContain(token);

		const event = await env.portal_db
			.prepare(`SELECT event_type, actor_type, actor_ref, metadata_json FROM form_events WHERE invitation_id = ?`)
			.bind(invitation.id)
			.first();
		expect(event).toEqual({
			event_type: 'invitation_created',
			actor_type: 'admin',
			actor_ref: ADMIN_EMAIL,
			metadata_json: JSON.stringify({ language: 'sv', validDays: 5 }),
		});
	});

	it('creates a different token every time', async () => {
		const first = await createValidInvitation();
		const second = await createValidInvitation();
		expect(first.url).not.toBe(second.url);
	});

	it('uses validDays for the expiry', async () => {
		const before = Date.now();
		const response = await createInvitation({ displayName: 'Test', offerId: OFFER_ID, language: 'en', validDays: 14 });
		const { invitation } = (await response.json()) as CreateTenantFormInvitationResponse;
		expect(Math.abs(Date.parse(invitation.expiresAt) - before - 14 * DAY_MS)).toBeLessThan(60_000);
	});

	it.each([
		['missing displayName', { offerId: OFFER_ID, language: 'en' }],
		['unknown offer', { displayName: 'Test', offerId: 'no_such_offer', language: 'en' }],
		['unsupported language', { displayName: 'Test', offerId: OFFER_ID, language: 'de' }],
		['validDays 0', { displayName: 'Test', offerId: OFFER_ID, language: 'en', validDays: 0 }],
		['validDays 15', { displayName: 'Test', offerId: OFFER_ID, language: 'en', validDays: 15 }],
		['fractional validDays', { displayName: 'Test', offerId: OFFER_ID, language: 'en', validDays: 2.5 }],
		['validDays as string', { displayName: 'Test', offerId: OFFER_ID, language: 'en', validDays: '5' }],
		['unknown lead', { displayName: 'Test', offerId: OFFER_ID, language: 'en', leadId: 'no_such_lead' }],
	])('rejects %s with 400', async (_label, body) => {
		const response = await createInvitation(body);
		expect(response.status).toBe(400);
	});

	it('rejects a body that is not JSON', async () => {
		const response = await adminFetch('/invitations', { method: 'POST', body: 'not json' });
		expect(response.status).toBe(400);
	});
});

describe('GET /api/admin/tenant-forms/invitations', () => {
	beforeEach(async () => {
		await insertInvitation('inv_pending', 'pending', isoFromNow(DAY_MS));
		await insertInvitation('inv_expired_pending', 'pending', isoFromNow(-DAY_MS));
		await insertInvitation('inv_expired_opened', 'opened', isoFromNow(-60_000));
		await insertInvitation('inv_revoked', 'revoked', isoFromNow(DAY_MS));
		await insertInvitation('inv_submitted', 'submitted', isoFromNow(-DAY_MS));
	});

	async function listIds(query = ''): Promise<Record<string, string>> {
		const response = await adminFetch(`/invitations${query}`);
		expect(response.status).toBe(200);
		const { data } = (await response.json()) as { data: AdminTenantFormInvitation[] };
		return Object.fromEntries(data.map((invitation) => [invitation.id, invitation.status]));
	}

	it('derives expired from expires_at', async () => {
		expect(await listIds()).toEqual({
			inv_pending: 'pending',
			inv_expired_pending: 'expired',
			inv_expired_opened: 'expired',
			inv_revoked: 'revoked',
			inv_submitted: 'submitted',
		});
	});

	it('filters by derived status and offer', async () => {
		expect(await listIds('?status=expired')).toEqual({ inv_expired_pending: 'expired', inv_expired_opened: 'expired' });
		expect(await listIds('?status=pending')).toEqual({ inv_pending: 'pending' });
		expect(await listIds('?status=submitted')).toEqual({ inv_submitted: 'submitted' });
		expect(await listIds('?offerId=other_offer')).toEqual({});
	});

	it('rejects an unknown status filter', async () => {
		const response = await adminFetch('/invitations?status=deleted');
		expect(response.status).toBe(400);
	});
});

describe('GET /api/admin/tenant-forms/invitations/:id', () => {
	it('returns the invitation with its event timeline', async () => {
		const { invitation } = await createValidInvitation();
		const response = await adminFetch(`/invitations/${invitation.id}`);
		expect(response.status).toBe(200);
		const detail = (await response.json()) as AdminTenantFormInvitationDetail;
		expect(detail.id).toBe(invitation.id);
		expect(detail.events.map((event) => event.eventType)).toEqual(['invitation_created']);
		expect(detail.events[0].metadata).toEqual({ language: 'sv', validDays: 5 });
	});

	it('returns 404 for an unknown id', async () => {
		const response = await adminFetch('/invitations/no-such-id');
		expect(response.status).toBe(404);
	});
});

describe('POST /api/admin/tenant-forms/invitations/:id/revoke', () => {
	it('revokes an open invitation once', async () => {
		const { invitation } = await createValidInvitation();

		const response = await adminFetch(`/invitations/${invitation.id}/revoke`, { method: 'POST' });
		expect(response.status).toBe(200);
		const revoked = (await response.json()) as AdminTenantFormInvitation;
		expect(revoked.status).toBe('revoked');
		expect(revoked.revokedAt).not.toBeNull();

		const detail = (await (await adminFetch(`/invitations/${invitation.id}`)).json()) as AdminTenantFormInvitationDetail;
		expect(detail.events.map((event) => event.eventType)).toEqual(['invitation_created', 'revoked']);

		const again = await adminFetch(`/invitations/${invitation.id}/revoke`, { method: 'POST' });
		expect(again.status).toBe(409);
	});

	it('revokes an expired invitation', async () => {
		await insertInvitation('inv_expired', 'pending', isoFromNow(-DAY_MS));
		const response = await adminFetch('/invitations/inv_expired/revoke', { method: 'POST' });
		expect(response.status).toBe(200);
		expect(((await response.json()) as AdminTenantFormInvitation).status).toBe('revoked');
	});

	it('refuses to revoke a submitted invitation', async () => {
		await insertInvitation('inv_submitted', 'submitted', isoFromNow(DAY_MS));
		const response = await adminFetch('/invitations/inv_submitted/revoke', { method: 'POST' });
		expect(response.status).toBe(409);
	});

	it('returns 404 for an unknown id', async () => {
		const response = await adminFetch('/invitations/no-such-id/revoke', { method: 'POST' });
		expect(response.status).toBe(404);
	});
});

describe('GET /api/admin/tenant-forms/templates', () => {
	it('lists templates with translation readiness per language', async () => {
		const response = await adminFetch('/templates');
		expect(response.status).toBe(200);
		const { data } = (await response.json()) as { data: AdminTenantFormTemplateListItem[] };
		const template = data.find((item) => item.id === 'tenant_details_v1');
		expect(template).toMatchObject({ templateKey: 'tenant_details', version: 1, status: 'active', baseLanguage: 'en' });

		const readiness = Object.fromEntries(template!.languages.map((entry) => [entry.language, entry]));
		const total = readiness.en.total;
		expect(total).toBeGreaterThan(0);
		expect(readiness.en.translated).toBe(total);
		expect(readiness.sv.translated).toBe(total);
		expect(readiness.fi).toEqual({ language: 'fi', translated: 0, total });
		expect(readiness.no).toEqual({ language: 'no', translated: 0, total });
	});

	it('returns structure, text keys and texts of every supported language', async () => {
		const response = await adminFetch('/templates/tenant_details_v1');
		expect(response.status).toBe(200);
		const detail = (await response.json()) as AdminTenantFormTemplateDetail;
		expect(detail.sections).toHaveLength(10);
		expect(detail.textKeys).toContainEqual({ key: 'template.title', required: true });
		expect(detail.texts.sv['section.stay.title']).toBe('Resa & vistelse');
		expect(detail.texts.fi).toEqual({});
		expect(detail.languages.find((entry) => entry.language === 'sv')?.translated).toBe(
			Object.keys(detail.texts.en).length
		);
	});

	it('returns 404 for an unknown template', async () => {
		const response = await adminFetch('/templates/no_such_template');
		expect(response.status).toBe(404);
	});
});
