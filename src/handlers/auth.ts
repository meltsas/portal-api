import type { RouteHandler } from '../router/types';
import { jsonResponse, badRequest, parseJsonBody } from '../utils/response';
import { verifyGoogleIdToken } from '../utils/googleAuth';
import { signSession } from '../utils/session';
import { buildCookie } from '../utils/cookies';
import { requireAuth, SESSION_COOKIE_NAME } from '../middleware/requireAuth';

// Hardcoded allowlist for now. Move to env / D1 once we have more than a
// handful of admins.
const ALLOWED_EMAILS: ReadonlySet<string> = new Set([
	'martin.meltsas@googlemail.com',
]);

const SESSION_TTL_SECONDS = 60 * 60 * 24;

interface GoogleAuthBody {
	token?: unknown;
}

export const handleGoogleAuth: RouteHandler = async ({ request, env }) => {
	const body = await parseJsonBody<GoogleAuthBody>(request);
	if (!body || typeof body.token !== 'string' || body.token.trim() === '') {
		return badRequest('token is required');
	}

	let googlePayload;
	try {
		googlePayload = await verifyGoogleIdToken(body.token, env.GOOGLE_CLIENT_ID);
	} catch (error) {
		console.warn('[auth] Google token verification failed:', error instanceof Error ? error.message : error);
		return jsonResponse({ error: 'Invalid Google token' }, 401);
	}

	const email = googlePayload.email.toLowerCase();
	if (!ALLOWED_EMAILS.has(email)) {
		console.warn('[auth] login denied for', email);
		return jsonResponse({ error: 'Forbidden' }, 403);
	}

	const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
	const sessionToken = await signSession({ email, exp }, env.SESSION_SECRET);

	const cookie = buildCookie(SESSION_COOKIE_NAME, sessionToken, {
		httpOnly: true,
		secure: true,
		sameSite: 'None',
		path: '/',
		maxAge: SESSION_TTL_SECONDS,
	});

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			'Set-Cookie': cookie,
		},
	});
};

export const handleLogout: RouteHandler = () => {
	const cookie = buildCookie(SESSION_COOKIE_NAME, '', {
		httpOnly: true,
		secure: true,
		sameSite: 'None',
		path: '/',
		maxAge: 0,
	});

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: {
			'Content-Type': 'application/json',
			'Set-Cookie': cookie,
		},
	});
};

export const handleAuthMe: RouteHandler = async ({ request, env }) => {
	const session = await requireAuth(request, env);
	if (!session) {
		return jsonResponse({ error: 'Unauthorized' }, 401);
	}
	return jsonResponse({ email: session.email });
};
