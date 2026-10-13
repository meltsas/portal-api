// Short-lived Bearer token for one tenant form invitation. Signed with TENANT_FORM_SECRET,
// never with SESSION_SECRET, and typed so it can never pass as an admin session.

import { signToken, verifyToken } from './signedToken';

const TENANT_FORM_TOKEN_TYPE = 'tenant_form';
export const TENANT_FORM_TOKEN_TTL_SECONDS = 2 * 60 * 60;

export interface TenantFormTokenPayload {
	invitationId: string;
	/** Google `sub` the invitation is bound to. */
	subject: string;
	exp: number;
}

export function signTenantFormToken(payload: TenantFormTokenPayload, secret: string): Promise<string> {
	return signToken(
		{ typ: TENANT_FORM_TOKEN_TYPE, inv: payload.invitationId, sub: payload.subject, exp: payload.exp },
		secret
	);
}

/** Returns null for a bad signature, wrong type, malformed payload or an expired token. */
export async function verifyTenantFormToken(
	token: string,
	secret: string,
	nowSeconds: number
): Promise<TenantFormTokenPayload | null> {
	const payload = await verifyToken(token, secret);
	if (!payload || payload.typ !== TENANT_FORM_TOKEN_TYPE) return null;
	if (typeof payload.inv !== 'string' || typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
	if (payload.exp <= nowSeconds) return null;
	return { invitationId: payload.inv, subject: payload.sub, exp: payload.exp };
}
