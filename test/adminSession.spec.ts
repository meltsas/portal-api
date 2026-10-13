import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { signToken } from '../src/utils/signedToken';
import { signTenantFormToken } from '../src/utils/tenantFormToken';
import { ADMIN_EMAIL, adminSessionCookie } from './helpers';

const ADMIN_ROUTE = 'https://example.com/api/admin/offers';
const ME_ROUTE = 'https://example.com/api/auth/me';

function inOneHour(): number {
	return Math.floor(Date.now() / 1000) + 3600;
}

function withCookie(url: string, cookie: string): Promise<Response> {
	return SELF.fetch(url, { headers: { Cookie: cookie } });
}

describe('admin session', () => {
	it('accepts an admin session for an allowlisted email', async () => {
		const cookie = await adminSessionCookie();
		expect((await withCookie(ADMIN_ROUTE, cookie)).status).toBe(200);

		const me = await withCookie(ME_ROUTE, cookie);
		expect(await me.json()).toEqual({ email: ADMIN_EMAIL });
	});

	it('rejects a valid session for an email that is not allowlisted', async () => {
		const cookie = await adminSessionCookie('someone@example.com');
		expect((await withCookie(ADMIN_ROUTE, cookie)).status).toBe(401);
		expect((await withCookie(ME_ROUTE, cookie)).status).toBe(401);
	});

	it('rejects a session issued before sessions were typed', async () => {
		const legacy = await signToken({ email: ADMIN_EMAIL, exp: inOneHour() }, env.SESSION_SECRET);
		expect((await withCookie(ADMIN_ROUTE, `session=${legacy}`)).status).toBe(401);
	});

	it('rejects a tenant form token used as the session cookie', async () => {
		const payload = { invitationId: 'inv', subject: ADMIN_EMAIL, exp: inOneHour() };
		const withTenantSecret = await signTenantFormToken(payload, env.TENANT_FORM_SECRET);
		const withSessionSecret = await signTenantFormToken(payload, env.SESSION_SECRET);

		expect((await withCookie(ADMIN_ROUTE, `session=${withTenantSecret}`)).status).toBe(401);
		expect((await withCookie(ADMIN_ROUTE, `session=${withSessionSecret}`)).status).toBe(401);
	});

	it('ignores a tenant form Bearer token on admin routes', async () => {
		const token = await signTenantFormToken(
			{ invitationId: 'inv', subject: 'sub', exp: inOneHour() },
			env.TENANT_FORM_SECRET
		);
		const response = await SELF.fetch(ADMIN_ROUTE, { headers: { Authorization: `Bearer ${token}` } });
		expect(response.status).toBe(401);
	});
});
