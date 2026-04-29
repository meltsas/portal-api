export interface CookieOptions {
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: 'Strict' | 'Lax' | 'None';
	path?: string;
	maxAge?: number;
	domain?: string;
}

export function parseCookies(header: string | null): Record<string, string> {
	const out: Record<string, string> = {};
	if (!header) return out;
	for (const part of header.split(';')) {
		const idx = part.indexOf('=');
		if (idx === -1) continue;
		const name = part.slice(0, idx).trim();
		if (!name) continue;
		const value = part.slice(idx + 1).trim();
		if (out[name] !== undefined) continue;
		out[name] = value;
	}
	return out;
}

export function buildCookie(name: string, value: string, options: CookieOptions = {}): string {
	const parts = [`${name}=${value}`];
	if (options.path) parts.push(`Path=${options.path}`);
	if (typeof options.maxAge === 'number') parts.push(`Max-Age=${options.maxAge}`);
	if (options.domain) parts.push(`Domain=${options.domain}`);
	if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
	if (options.secure) parts.push('Secure');
	if (options.httpOnly) parts.push('HttpOnly');
	return parts.join('; ');
}
