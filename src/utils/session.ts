// Admin session token, signed with SESSION_SECRET and stored in the `session` cookie.
// The session is self-contained — no DB lookup is required.

import { signToken, verifyToken } from './signedToken';

const SESSION_TOKEN_TYPE = 'admin';

export interface SessionPayload {
	email: string;
	exp: number;
}

export function signSession(payload: SessionPayload, secret: string): Promise<string> {
	return signToken({ typ: SESSION_TOKEN_TYPE, email: payload.email, exp: payload.exp }, secret);
}

/** Checks signature and shape. Tokens without `typ: 'admin'` (incl. sessions issued before it existed) are rejected. */
export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
	const payload = await verifyToken(token, secret);
	if (!payload || payload.typ !== SESSION_TOKEN_TYPE) return null;
	if (typeof payload.email !== 'string' || typeof payload.exp !== 'number') return null;
	return { email: payload.email, exp: payload.exp };
}
