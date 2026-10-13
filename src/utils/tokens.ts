import { base64UrlEncode } from './base64url';

// 256 bits of randomness, 43 base64url characters.
const INVITATION_TOKEN_BYTES = 32;

export function generateInvitationToken(): string {
	return base64UrlEncode(crypto.getRandomValues(new Uint8Array(INVITATION_TOKEN_BYTES)));
}

/** SHA-256 as lowercase hex. Only this hash is stored, never the raw token. */
export async function hashInvitationToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
