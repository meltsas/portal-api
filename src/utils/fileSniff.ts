export type SniffedFileType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

const SIGNATURES: { type: SniffedFileType; offset: number; bytes: number[] }[] = [
	{ type: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
	{ type: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
	{ type: 'application/pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // "%PDF-"
];

const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/** Detects the file type from its first bytes. Anything else (HTML, SVG, HEIC, …) returns null. */
export function sniffFileType(bytes: Uint8Array): SniffedFileType | null {
	for (const signature of SIGNATURES) {
		if (startsWith(bytes, signature.bytes, signature.offset)) return signature.type;
	}
	if (startsWith(bytes, RIFF, 0) && startsWith(bytes, WEBP, 8)) return 'image/webp';
	return null;
}

function startsWith(bytes: Uint8Array, expected: number[], offset: number): boolean {
	if (bytes.length < offset + expected.length) return false;
	return expected.every((byte, index) => bytes[offset + index] === byte);
}
