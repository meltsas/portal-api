import type { RouteHandler } from '../../router/types';
import type { ResolveTenantFormInvitationPayload, ResolveTenantFormInvitationResponse } from '../../types/api';
import { toIsoSeconds } from '../../utils/date';
import { BASE_LANGUAGE, isFormLanguage } from '../../utils/formSchema';
import { badRequest, jsonResponse, parseJsonBody } from '../../utils/response';
import {
	deriveInvitationStatus,
	findInvitationByToken,
	formEventStatement,
	invitationNotFoundResponse,
	unavailableInvitationResponse,
} from '../../utils/tenantFormInvitations';

// The token travels in the body, never in the URL, so it does not end up in request logs.
export const handleResolveTenantFormInvitation: RouteHandler = async ({ env, request }) => {
	const body = await parseJsonBody<ResolveTenantFormInvitationPayload>(request);
	if (!body) {
		return badRequest('Invalid or missing JSON body');
	}

	const invitation = await findInvitationByToken(env.portal_db, body.token);
	if (!invitation) {
		return invitationNotFoundResponse();
	}

	const now = toIsoSeconds(new Date());
	const status = deriveInvitationStatus(invitation.status, invitation.expires_at, now);
	const unavailable = unavailableInvitationResponse(status, invitation.language);
	if (unavailable) {
		return unavailable;
	}

	if (status === 'pending') {
		await env.portal_db.batch([
			env.portal_db
				.prepare(
					`UPDATE form_invitations SET status = 'opened', opened_at = ?, updated_at = CURRENT_TIMESTAMP
					 WHERE id = ? AND status = 'pending'`
				)
				.bind(now, invitation.id),
			formEventStatement(env.portal_db, {
				invitationId: invitation.id,
				eventType: 'invitation_opened',
				actorType: 'tenant',
				actorRef: null,
			}),
		]);
	}

	const response: ResolveTenantFormInvitationResponse = {
		status: 'opened',
		displayName: invitation.display_name,
		offer: { title: invitation.offer_title, slug: invitation.offer_slug },
		language: isFormLanguage(invitation.language) ? invitation.language : BASE_LANGUAGE,
		expiresAt: invitation.expires_at,
	};
	return jsonResponse(response);
};
