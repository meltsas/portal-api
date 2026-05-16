/**
 * Stable SHA-256 hash over a JSON-serializable value.
 *
 * Object keys are sorted recursively before serialization so two payloads
 * that differ only in key order still hash to the same value. This is
 * what allows the hourly cron to detect "actual content changed" cheaply.
 */
export async function stableHash(value: unknown): Promise<string> {
	const canonical = canonicalStringify(value);
	const bytes = new TextEncoder().encode(canonical);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return bufferToHex(digest);
}

function canonicalStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return '[' + value.map(canonicalStringify).join(',') + ']';
	}
	const obj = value as Record<string, unknown>;
	const keys = Object.keys(obj).sort();
	const parts = keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(obj[k]));
	return '{' + parts.join(',') + '}';
}

function bufferToHex(buf: ArrayBuffer): string {
	const view = new Uint8Array(buf);
	let out = '';
	for (let i = 0; i < view.length; i++) {
		out += view[i].toString(16).padStart(2, '0');
	}
	return out;
}
