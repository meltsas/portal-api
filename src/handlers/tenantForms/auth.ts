import type { RouteHandler } from '../../router/types';
import type { TenantFormGoogleAuthPayload, TenantFormGoogleAuthResponse } from '../../types/api';
import { toIsoSeconds } from '../../utils/date';
import { verifyGoogleIdToken, type GoogleIdTokenPayload } from '../../utils/googleAuth';
import { badRequest, jsonResponse, parseJsonBody } from '../../utils/response';
import {
	deriveInvitationStatus,
	findInvitationById,
	findInvitationByToken,
	formEventStatement,
	invitationNotFoundResponse,
	unavailableInvitationResponse,
} from '../../utils/tenantFormInvitations';
import { signTenantFormToken, TENANT_FORM_TOKEN_TTL_SECONDS } from '../../utils/tenantFormToken';

type VerifyGoogleIdToken = (token: string, audience: string) => Promise<GoogleIdTokenPayload>;

type AuthRejectReason = 'invalid_google_token' | 'email_not_verified' | 'subject_mismatch';

const SUBJECT_MISMATCH_MESSAGE = 'This link is already in use with another Google account';

/**
 * Identity comes only from the Google ID token verified here, never from the request body.
 * The first successful sign-in binds the invitation to that Google account (bind-on-first-use).
 * The verifier is injected so tests never call Google.
 */
export function createTenantFormGoogleAuthHandler(verifyGoogleToken: VerifyGoogleIdToken): RouteHandler {
	return async ({ env, request }) => {
		const body = await parseJsonBody<TenantFormGoogleAuthPayload>(request);
		if (!body) {
			return badRequest('Invalid or missing JSON body');
		}
		if (typeof body.googleIdToken !== 'string' || body.googleIdToken.trim() === '') {
			return badRequest('googleIdToken is required');
		}

		const invitation = await findInvitationByToken(env.portal_db, body.token);
		if (!invitation) {
			return invitationNotFoundResponse();
		}

		const now = new Date();
		const nowIso = toIsoSeconds(now);
		const unavailable = unavailableInvitationResponse(
			deriveInvitationStatus(invitation.status, invitation.expires_at, nowIso),
			invitation.language
		);
		if (unavailable) {
			return unavailable;
		}

		let google: GoogleIdTokenPayload;
		try {
			google = await verifyGoogleToken(body.googleIdToken, env.GOOGLE_CLIENT_ID);
		} catch (error) {
			console.warn('[tenant-forms] Google token verification failed:', error instanceof Error ? error.message : 'unknown');
			return rejectAuth(env, invitation.id, 'invalid_google_token', 401, 'Invalid Google token');
		}

		if (!google.emailVerified) {
			return rejectAuth(env, invitation.id, 'email_not_verified', 401, 'Google email is not verified');
		}
		if (invitation.google_subject !== null && invitation.google_subject !== google.sub) {
			return rejectAuth(env, invitation.id, 'subject_mismatch', 403, SUBJECT_MISMATCH_MESSAGE);
		}

		const googleEmail = google.email.toLowerCase();
		const update = await env.portal_db
			.prepare(
				`UPDATE form_invitations
				 SET google_subject = ?, google_email = ?, status = 'opened', opened_at = COALESCE(opened_at, ?),
				     authenticated_at = ?, updated_at = CURRENT_TIMESTAMP
				 WHERE id = ? AND status IN ('pending', 'opened') AND (google_subject IS NULL OR google_subject = ?)`
			)
			.bind(google.sub, googleEmail, nowIso, nowIso, invitation.id, google.sub)
			.run();

		// Another account bound the invitation, or its state changed, after it was read above.
		if (update.meta.changes === 0) {
			const current = await findInvitationById(env.portal_db, invitation.id);
			const changedState = current
				? unavailableInvitationResponse(deriveInvitationStatus(current.status, current.expires_at, nowIso), current.language)
				: invitationNotFoundResponse();
			return changedState ?? rejectAuth(env, invitation.id, 'subject_mismatch', 403, SUBJECT_MISMATCH_MESSAGE);
		}

		await formEventStatement(env.portal_db, {
			invitationId: invitation.id,
			eventType: 'tenant_authenticated',
			actorType: 'tenant',
			actorRef: google.sub,
		}).run();

		const exp = Math.floor(now.getTime() / 1000) + TENANT_FORM_TOKEN_TTL_SECONDS;
		const response: TenantFormGoogleAuthResponse = {
			accessToken: await signTenantFormToken({ invitationId: invitation.id, subject: google.sub, exp }, env.TENANT_FORM_SECRET),
			expiresAt: toIsoSeconds(new Date(exp * 1000)),
			googleEmail,
		};
		return jsonResponse(response);
	};
}

export const handleTenantFormGoogleAuth = createTenantFormGoogleAuthHandler(verifyGoogleIdToken);

async function rejectAuth(
	env: Env,
	invitationId: string,
	reason: AuthRejectReason,
	status: number,
	message: string
): Promise<Response> {
	await formEventStatement(env.portal_db, {
		invitationId,
		eventType: 'auth_rejected',
		actorType: 'tenant',
		actorRef: null,
		metadata: { reason },
	}).run();
	return jsonResponse({ error: message }, status);
}
