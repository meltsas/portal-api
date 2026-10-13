import { env } from 'cloudflare:test';
import { ADMIN_EMAILS } from '../src/utils/adminAllowlist';
import { signSession } from '../src/utils/session';

export const ADMIN_EMAIL = [...ADMIN_EMAILS][0];

export async function adminSessionCookie(email: string = ADMIN_EMAIL): Promise<string> {
	const token = await signSession({ email, exp: Math.floor(Date.now() / 1000) + 3600 }, env.SESSION_SECRET);
	return `session=${token}`;
}

export async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** ISO timestamp without milliseconds, `ms` from now (negative for the past). */
export function isoFromNow(ms: number): string {
	return new Date(Date.now() + ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
