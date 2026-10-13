import { base64UrlEncode } from './base64url';

const encoder = new TextEncoder();

/**
 * Invitation link token: HMAC-SHA256(TENANT_LINK_SECRET, invitation id) as base64url (43 characters,
 * 256 bits). Derived instead of random so the admin can show the link again, while D1 still stores
 * only its hash: the token cannot be recovered from D1 without the secret.
 */
export async function deriveInvitationToken(invitationId: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`tenant-form-invitation:${invitationId}`));
	return base64UrlEncode(new Uint8Array(signature));
}

/** SHA-256 as lowercase hex. Only this hash is stored, never the raw token. */
export async function hashInvitationToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
