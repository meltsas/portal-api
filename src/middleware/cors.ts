import type { Middleware } from '../router/types';

// Origins permitted to make credentialed requests. The wildcard origin (`*`)
// cannot be used together with `Access-Control-Allow-Credentials: true`, so
// the origin must be echoed back from this list on a per-request basis.
//
// Trailing slashes are tolerated by normalising on lookup — browsers never
// send a trailing slash in the `Origin` header, but the allowlist is
// hand-edited and easy to misconfigure.
const ALLOWED_ORIGINS = [
	'http://localhost:5173',
	'http://localhost:5174',
	'https://portal-api-admin-ui.pages.dev',
];

const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type';
const MAX_AGE_SECONDS = '86400';

const NORMALISED_ALLOWLIST: ReadonlySet<string> = new Set(ALLOWED_ORIGINS.map(stripTrailingSlash));

export function cors(): Middleware {
	return async (context, next) => {
		const origin = context.request.headers.get('Origin');
		const allowedOrigin = origin && NORMALISED_ALLOWLIST.has(stripTrailingSlash(origin)) ? origin : null;

		if (context.request.method === 'OPTIONS') {
			const headers = new Headers();
			if (allowedOrigin) {
				applyCorsHeaders(headers, allowedOrigin);
				headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
				headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
				headers.set('Access-Control-Max-Age', MAX_AGE_SECONDS);
				headers.set('Vary', 'Origin');
			}
			return new Response(null, { status: 204, headers });
		}

		const response = await next();
		if (!allowedOrigin) {
			return response;
		}

		const headers = new Headers(response.headers);
		applyCorsHeaders(headers, allowedOrigin);
		appendVary(headers, 'Origin');

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	};
}

function applyCorsHeaders(headers: Headers, origin: string): void {
	headers.set('Access-Control-Allow-Origin', origin);
	headers.set('Access-Control-Allow-Credentials', 'true');
}

function appendVary(headers: Headers, value: string): void {
	const existing = headers.get('Vary');
	if (!existing) {
		headers.set('Vary', value);
		return;
	}
	const tokens = existing.split(',').map((s) => s.trim().toLowerCase());
	if (tokens.includes(value.toLowerCase())) return;
	headers.set('Vary', `${existing}, ${value}`);
}

function stripTrailingSlash(origin: string): string {
	return origin.endsWith('/') ? origin.slice(0, -1) : origin;
}
