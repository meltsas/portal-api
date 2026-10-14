import { env } from 'cloudflare:test';
import { ADMIN_EMAILS } from '../src/utils/adminAllowlist';
import { signSession } from '../src/utils/session';
import { signTenantFormToken } from '../src/utils/tenantFormToken';
import { base64UrlEncode } from '../src/utils/base64url';
import { deriveInvitationToken } from '../src/utils/tokens';

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

export const TEST_OFFER_ID = 'offer_test';
export const GOOGLE_SUB = 'google-sub-1';
const DAY_MS = 86_400_000;

export async function insertTestOffer(): Promise<void> {
	await env.portal_db
		.prepare(`INSERT INTO offers (id, slug, title, status) VALUES (?, 'test-offer', 'Test offer', 'active')`)
		.bind(TEST_OFFER_ID)
		.run();
}

export interface TestInvitationOptions {
	status?: string;
	expiresAt?: string;
	language?: string;
	googleSubject?: string | null;
	/** Defaults to the token derived from the id, like the admin endpoint creates it. */
	token?: string;
}

/** Inserts an invitation for the test offer and returns its id and raw token. */
export async function insertTestInvitation(options: TestInvitationOptions = {}): Promise<{ id: string; token: string }> {
	const id = crypto.randomUUID();
	const token = options.token ?? (await deriveInvitationToken(id, env.TENANT_LINK_SECRET));
	const googleSubject = options.googleSubject ?? null;
	await env.portal_db
		.prepare(
			`INSERT INTO form_invitations
			 (id, template_id, token_hash, display_name, offer_id, language, status, expires_at,
			  google_subject, google_email, created_by_email)
			 VALUES (?, 'tenant_details_v1', ?, 'Test Example', ?, ?, ?, ?, ?, ?, 'admin@example.com')`
		)
		.bind(
			id,
			await sha256Hex(token),
			TEST_OFFER_ID,
			options.language ?? 'sv',
			options.status ?? 'pending',
			options.expiresAt ?? isoFromNow(DAY_MS),
			googleSubject,
			googleSubject ? 'tenant@example.com' : null
		)
		.run();
	return { id, token };
}

export function tenantAccessToken(
	invitationId: string,
	options: { subject?: string; expInSeconds?: number; secret?: string } = {}
): Promise<string> {
	return signTenantFormToken(
		{
			invitationId,
			subject: options.subject ?? GOOGLE_SUB,
			exp: Math.floor(Date.now() / 1000) + (options.expInSeconds ?? 3600),
		},
		options.secret ?? env.TENANT_FORM_SECRET
	);
}

/** A well-formed token that matches no invitation. */
export function randomInvitationToken(): string {
	return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

/** A complete, valid tenant_details_v1 submission filled in Swedish. */
export function swedishSubmission(fileIds: string[]): Record<string, unknown> {
	return {
		planned_arrival: '2026-12-01',
		planned_departure: '2027-01-15',
		first_name: 'Åsa',
		last_name: 'Exempel',
		sex: 'female',
		date_of_birth: '1980-05-20',
		citizenship: 'Svensk',
		document_type: 'passport',
		document_number: 'X1234567',
		phone: '+46 70 123 45 67',
		contact_email: 'asa@example.com',
		address_line1: 'Testgatan 1',
		city: 'Uppsala',
		postcode: '753 10',
		country: 'Sverige',
		other_guests: [
			{
				first_name: 'Barn',
				last_name: 'Exempel',
				sex: 'male',
				date_of_birth: '2015-03-01',
				citizenship: 'Svensk',
				document_type: 'id_card',
				document_number: 'Y7654321',
				relationship: 'child',
			},
		],
		stay_purpose: 'other',
		stay_purpose_other: 'Språkkurs',
		employment_type: 'pensioner',
		id_documents: fileIds,
		video_call_willing: 'yes',
		video_call_time: 'Kvällar',
		privacy_consent: true,
	};
}
