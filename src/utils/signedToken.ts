// Stateless signed token: base64url(JSON payload).base64url(HMAC-SHA256(payload)).
// Callers check the payload's `typ`, so a token of one kind is never accepted as another.

import { base64UrlDecode, base64UrlEncode } from './base64url';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function signToken(payload: Record<string, unknown>, secret: string): Promise<string> {
	const key = await importKey(secret);
	const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
	const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64)));
	return `${payloadB64}.${base64UrlEncode(signature)}`;
}

/** Returns the payload when the signature is valid, otherwise null. Does not check expiry. */
export async function verifyToken(token: string, secret: string): Promise<Record<string, unknown> | null> {
	const dot = token.indexOf('.');
	if (dot <= 0 || dot === token.length - 1) return null;
	const payloadB64 = token.slice(0, dot);
	const sigB64 = token.slice(dot + 1);

	let signature: Uint8Array;
	try {
		signature = base64UrlDecode(sigB64);
	} catch {
		return null;
	}

	const key = await importKey(secret);
	const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(payloadB64));
	if (!valid) return null;

	try {
		const parsed: unknown = JSON.parse(decoder.decode(base64UrlDecode(payloadB64)));
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

function importKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign',
		'verify',
	]);
}
