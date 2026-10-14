import type { TenantFormInvitationAccessRow } from '../types/db';
import { toIsoSeconds } from '../utils/date';
import { jsonResponse } from '../utils/response';
import {
	deriveInvitationStatus,
	findInvitationById,
	unavailableInvitationResponse,
} from '../utils/tenantFormInvitations';
import { verifyTenantFormToken } from '../utils/tenantFormToken';

export interface TenantFormAccess {
	invitation: TenantFormInvitationAccessRow;
	/** Google subject the invitation is bound to. */
	subject: string;
}

const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_.-]+)$/;

/**
 * Call first in every tenant form handler that needs a signed-in tenant. Checks the Bearer
 * token and the invitation's current state on every request, so revoking or submitting
 * takes effect immediately.
 */
export async function requireTenantFormAccess(request: Request, env: Env): Promise<TenantFormAccess | Response> {
	const match = request.headers.get('Authorization')?.match(BEARER_PATTERN);
	if (!match) return unauthorized();

	const payload = await verifyTenantFormToken(match[1], env.TENANT_FORM_SECRET, Math.floor(Date.now() / 1000));
	if (!payload) return unauthorized();

	const invitation = await findInvitationById(env.portal_db, payload.invitationId);
	if (!invitation || invitation.google_subject !== payload.subject) return unauthorized();

	const status = deriveInvitationStatus(invitation.status, invitation.expires_at, toIsoSeconds(new Date()));
	const unavailable = unavailableInvitationResponse(status, invitation.language);
	if (unavailable) return unavailable;

	return { invitation, subject: payload.subject };
}

function unauthorized(): Response {
	return jsonResponse({ error: 'Unauthorized' }, 401);
}
