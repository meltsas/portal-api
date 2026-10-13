export function base64UrlEncode(bytes: Uint8Array): string {
	let bin = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		bin += String.fromCharCode(bytes[i]);
	}
	return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function base64UrlDecode(input: string): Uint8Array {
	const padded = input.replace(/-/g, '+').replace(/_/g, '/');
	const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
	const bin = atob(padded + padding);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}
