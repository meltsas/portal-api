import type { AdminTenantFormEvent, AdminTenantFormInvitation, TenantFormInvitationStatus } from '../types/api';
import type { FormEventRow, FormInvitationWithJoinsRow } from '../types/db';
import { toISOTimestamp } from '../utils/date';

/** `expired` is never stored: an open invitation past `expires_at` is reported as expired. */
export function deriveInvitationStatus(status: string, expiresAt: string, now: string): TenantFormInvitationStatus {
	if ((status === 'pending' || status === 'opened') && expiresAt <= now) return 'expired';
	return status as TenantFormInvitationStatus;
}

export function toAdminTenantFormInvitation(row: FormInvitationWithJoinsRow, now: string): AdminTenantFormInvitation {
	return {
		id: row.id,
		templateId: row.template_id,
		displayName: row.display_name,
		offerId: row.offer_id,
		offerTitle: row.offer_title,
		language: row.language,
		status: deriveInvitationStatus(row.status, row.expires_at, now),
		expiresAt: row.expires_at,
		googleEmail: row.google_email,
		leadId: row.lead_id,
		submissionId: row.submission_id,
		createdByEmail: row.created_by_email,
		openedAt: row.opened_at,
		authenticatedAt: row.authenticated_at,
		submittedAt: row.submitted_at,
		revokedAt: row.revoked_at,
		createdAt: toISOTimestamp(row.created_at),
		updatedAt: toISOTimestamp(row.updated_at),
	};
}

export function toAdminTenantFormEvent(row: FormEventRow): AdminTenantFormEvent {
	return {
		id: row.id,
		eventType: row.event_type,
		actorType: row.actor_type,
		actorRef: row.actor_ref,
		submissionId: row.submission_id,
		fileId: row.file_id,
		metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : null,
		createdAt: toISOTimestamp(row.created_at),
	};
}
