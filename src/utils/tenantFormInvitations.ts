import type { TenantFormInvitationStatus } from '../types/api';
import type { TenantFormInvitationAccessRow } from '../types/db';
import { jsonResponse } from './response';
import { hashInvitationToken } from './tokens';

// generateInvitationToken() output: 32 bytes as base64url.
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const ACCESS_SELECT = `
	SELECT i.id, i.template_id, i.display_name, i.offer_id, i.language, i.status, i.expires_at,
	       i.google_subject, i.google_email, o.title AS offer_title, o.slug AS offer_slug
	FROM form_invitations i
	JOIN offers o ON o.id = i.offer_id`;

/** `expired` is never stored: an open invitation past `expires_at` is reported as expired. */
export function deriveInvitationStatus(status: string, expiresAt: string, now: string): TenantFormInvitationStatus {
	if ((status === 'pending' || status === 'opened') && expiresAt <= now) return 'expired';
	return status as TenantFormInvitationStatus;
}

export async function findInvitationByToken(db: D1Database, token: unknown): Promise<TenantFormInvitationAccessRow | null> {
	if (typeof token !== 'string' || !INVITATION_TOKEN_PATTERN.test(token)) return null;
	const tokenHash = await hashInvitationToken(token);
	return db.prepare(`${ACCESS_SELECT} WHERE i.token_hash = ?`).bind(tokenHash).first<TenantFormInvitationAccessRow>();
}

export function findInvitationById(db: D1Database, id: string): Promise<TenantFormInvitationAccessRow | null> {
	return db.prepare(`${ACCESS_SELECT} WHERE i.id = ?`).bind(id).first<TenantFormInvitationAccessRow>();
}

export function invitationNotFoundResponse(): Response {
	return jsonResponse({ error: 'Invitation not found' }, 404);
}

/** Response for an invitation that can no longer be filled in, or null while it is open. */
export function unavailableInvitationResponse(status: TenantFormInvitationStatus): Response | null {
	switch (status) {
		case 'expired':
			return jsonResponse({ error: 'Invitation has expired', status }, 410);
		case 'revoked':
			return jsonResponse({ error: 'Invitation has been revoked', status }, 410);
		case 'submitted':
			return jsonResponse({ error: 'Form has already been submitted', status }, 409);
		default:
			return null;
	}
}

export interface FormEventInput {
	invitationId: string;
	eventType: string;
	actorType: 'admin' | 'tenant' | 'system';
	/** Admin email or tenant Google subject. Never names, document data or file links. */
	actorRef: string | null;
	submissionId?: string | null;
	fileId?: string | null;
	metadata?: Record<string, unknown> | null;
}

export function formEventStatement(db: D1Database, event: FormEventInput): D1PreparedStatement {
	return db
		.prepare(
			`INSERT INTO form_events (id, invitation_id, submission_id, file_id, event_type, actor_type, actor_ref, metadata_json)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			crypto.randomUUID(),
			event.invitationId,
			event.submissionId ?? null,
			event.fileId ?? null,
			event.eventType,
			event.actorType,
			event.actorRef,
			event.metadata ? JSON.stringify(event.metadata) : null
		);
}
