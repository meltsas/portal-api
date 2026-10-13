import { parseCookies } from '../utils/cookies';
import { isAdminEmail } from '../utils/adminAllowlist';
import { verifySession, type SessionPayload } from '../utils/session';

export const SESSION_COOKIE_NAME = 'session';

// Returns the session payload if the request carries a valid, unexpired
// signed admin cookie for an allowlisted email. Returns null otherwise. Callers decide how to react
// (401 for admin endpoints, anonymous fall-through for public ones).
export async function requireAuth(request: Request, env: Env): Promise<SessionPayload | null> {
	const token = parseCookies(request.headers.get('Cookie'))[SESSION_COOKIE_NAME];
	if (!token) return null;

	const payload = await verifySession(token, env.SESSION_SECRET);
	if (!payload) return null;

	const nowSeconds = Math.floor(Date.now() / 1000);
	if (payload.exp <= nowSeconds) return null;

	// Re-checked on every request so removing an email from the allowlist ends its sessions.
	if (!isAdminEmail(payload.email)) return null;

	return payload;
}
