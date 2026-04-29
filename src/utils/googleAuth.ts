import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');
// Google ID tokens are issued with either form; both are documented as valid.
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// JWKS lookups are cached internally by jose; reusing the resolver across
// requests keeps Google's key material in the isolate's memory.
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
	if (!cachedJwks) {
		cachedJwks = createRemoteJWKSet(GOOGLE_JWKS_URL);
	}
	return cachedJwks;
}

export interface GoogleIdTokenPayload {
	email: string;
	sub: string;
	exp: number;
}

export async function verifyGoogleIdToken(token: string, audience: string): Promise<GoogleIdTokenPayload> {
	const { payload } = await jwtVerify(token, getJwks(), {
		audience,
		issuer: GOOGLE_ISSUERS,
	});

	if (typeof payload.email !== 'string' || typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
		throw new Error('Google ID token missing required claims');
	}

	return { email: payload.email, sub: payload.sub, exp: payload.exp };
}
