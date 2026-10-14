import { SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { GOOGLE_SUB, insertTestInvitation, insertTestOffer, randomInvitationToken, tenantAccessToken } from '../helpers';

const API = 'https://example.com/api/tenant-forms';
const IP_LIMIT = 20;
const SESSION_LIMIT = 60;
const WINDOW_MS = 60_000;
const TEST_TIMEOUT_MS = 30_000;

beforeEach(insertTestOffer);

// The local limiter counts in fixed 60 s windows, so start well before a window ends.
async function startInFreshWindow(): Promise<void> {
	const remaining = WINDOW_MS - (Date.now() % WINDOW_MS);
	if (remaining < 10_000) await new Promise((resolve) => setTimeout(resolve, remaining + 100));
}

function randomClientIp(): string {
	const group = () => crypto.randomUUID().slice(0, 4);
	return `2001:db8::${group()}:${group()}`;
}

function postFrom(clientIp: string, path: string, body: unknown, origin?: string): Promise<Response> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json', 'CF-Connecting-IP': clientIp };
	if (origin) headers.Origin = origin;
	return SELF.fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

function deleteFile(accessToken: string): Promise<Response> {
	return SELF.fetch(`${API}/files/${crypto.randomUUID()}`, {
		method: 'DELETE',
		headers: { Authorization: `Bearer ${accessToken}` },
	});
}

describe('tenant form rate limits', () => {
	it(
		'limits resolve and Google sign-in together per client IP',
		async () => {
			await startInFreshWindow();
			const clientIp = randomClientIp();

			const allowed = await Promise.all(
				Array.from({ length: IP_LIMIT }, (_, index) =>
					index % 2 === 0
						? postFrom(clientIp, '/invitations/resolve', { token: randomInvitationToken() })
						: postFrom(clientIp, '/auth/google', { token: randomInvitationToken(), googleIdToken: 'not-a-jwt' })
				)
			);
			expect(allowed.map((response) => response.status)).not.toContain(429);

			const limited = await postFrom(clientIp, '/invitations/resolve', { token: randomInvitationToken() }, 'https://costaseasons.com');
			expect(limited.status).toBe(429);
			expect(limited.headers.get('Retry-After')).toBe('60');
			expect(limited.headers.get('Access-Control-Allow-Origin')).toBe('https://costaseasons.com');
			expect(await limited.json()).toEqual({ error: 'Too many requests' });
			expect((await postFrom(clientIp, '/auth/google', { token: randomInvitationToken(), googleIdToken: 'x' })).status).toBe(429);

			expect((await postFrom(randomClientIp(), '/invitations/resolve', { token: randomInvitationToken() })).status).toBe(404);
		},
		TEST_TIMEOUT_MS
	);

	it(
		'limits signed-in requests per invitation',
		async () => {
			await startInFreshWindow();
			const { id } = await insertTestInvitation({ status: 'opened', googleSubject: GOOGLE_SUB });
			const { id: otherId } = await insertTestInvitation({ status: 'opened', googleSubject: GOOGLE_SUB });
			const accessToken = await tenantAccessToken(id);

			const allowed = await Promise.all(Array.from({ length: SESSION_LIMIT }, () => deleteFile(accessToken)));
			expect(new Set(allowed.map((response) => response.status))).toEqual(new Set([404]));

			const limited = await deleteFile(accessToken);
			expect(limited.status).toBe(429);
			expect(limited.headers.get('Retry-After')).toBe('60');

			expect((await deleteFile(await tenantAccessToken(otherId))).status).toBe(404);
		},
		TEST_TIMEOUT_MS
	);

	it('does not count requests without a valid tenant token', async () => {
		const { id } = await insertTestInvitation({ status: 'opened', googleSubject: GOOGLE_SUB });
		const expired = await tenantAccessToken(id, { expInSeconds: -1 });

		const responses = await Promise.all(Array.from({ length: SESSION_LIMIT + 1 }, () => deleteFile(expired)));
		expect(new Set(responses.map((response) => response.status))).toEqual(new Set([401]));
		expect((await deleteFile(await tenantAccessToken(id))).status).toBe(404);
	});
});
