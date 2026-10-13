// Stateless signed-session token: base64url(payload).base64url(HMAC-SHA256(payload)).
// We use base64url so the value is safe to put in a Set-Cookie header without
// percent-encoding. The session is self-contained — no DB lookup is required.

import { base64UrlDecode, base64UrlEncode } from './base64url';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface SessionPayload {
	email: string;
	exp: number;
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
	const key = await importKey(secret);
	const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
	const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64)));
	return `${payloadB64}.${base64UrlEncode(signature)}`;
}

export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
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
		const json = decoder.decode(base64UrlDecode(payloadB64));
		const parsed = JSON.parse(json) as Partial<SessionPayload>;
		if (typeof parsed.email !== 'string' || typeof parsed.exp !== 'number') return null;
		return { email: parsed.email, exp: parsed.exp };
	} catch {
		return null;
	}
}

function importKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify'],
	);
}

