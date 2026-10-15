import { toIsoSeconds } from '../utils/date';
import {
	eventsStatement,
	findAttachedFiles,
	MAX_PURGE_BATCH,
	placeholders,
	purgeDocumentsStatements,
	type DocumentFileRow,
	type DocumentsOwner,
} from '../utils/tenantFormDocuments';

/**
 * Daily retention cleanup of the tenant form (roadmap phase 10):
 * - documents of a stay: the day after `documents_delete_after` (planned departure + 30 days);
 * - documents of a submission without a stay: 30 days after it was rejected, or archived unconverted;
 * - drafts and unsubmitted files of an invitation that is expired, revoked or submitted.
 * Runs from the hourly cron at CLEANUP_HOUR Madrid time. At most MAX_PURGE_BATCH submissions and
 * invitations per run, the rest follows the next day.
 */

const CLEANUP_TIMEZONE = 'Europe/Madrid';
export const CLEANUP_HOUR = 4;
const NO_STAY_RETENTION_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export interface CleanupSummary {
	dryRun: boolean;
	/** Submissions whose documents were deleted. */
	submissionIds: string[];
	documentFiles: number;
	/** Invitations whose draft or unsubmitted files were deleted. */
	invitationIds: string[];
	unsubmittedFiles: number;
	drafts: number;
}

interface ClosedInvitationRow {
	id: string;
	has_draft: number;
}

type UploadedFileRow = Pick<DocumentFileRow, 'id' | 'r2_key'> & { invitation_id: string };

export async function runTenantFormsCleanup(env: Env, options: { now: Date; dryRun: boolean }): Promise<CleanupSummary> {
	const db = env.portal_db;
	const nowIso = toIsoSeconds(options.now);
	const today = madridClock(options.now).date;
	const noStayCutoff = toIsoSeconds(new Date(options.now.getTime() - NO_STAY_RETENTION_DAYS * MS_PER_DAY));

	const [owners, invitations] = await Promise.all([
		findSubmissionsDue(db, today, noStayCutoff),
		findClosedInvitationsWithLeftovers(db, nowIso),
	]);
	const [documentFiles, uploadedFiles] = await Promise.all([
		findAttachedFiles(db, owners.map((owner) => owner.submissionId)),
		findUploadedFiles(db, invitations.map((invitation) => invitation.id)),
	]);

	const summary: CleanupSummary = {
		dryRun: options.dryRun,
		submissionIds: owners.map((owner) => owner.submissionId),
		documentFiles: documentFiles.length,
		invitationIds: invitations.map((invitation) => invitation.id),
		unsubmittedFiles: uploadedFiles.length,
		drafts: invitations.filter((invitation) => invitation.has_draft === 1).length,
	};
	if (options.dryRun || (owners.length === 0 && invitations.length === 0)) {
		return summary;
	}

	// R2 first: if the D1 batch then fails, the next run finds the same rows and deletes again.
	const r2Keys = [...documentFiles, ...uploadedFiles].map((file) => file.r2_key);
	if (r2Keys.length > 0) {
		await env.tenant_files.delete(r2Keys);
	}
	await db.batch([
		...purgeDocumentsStatements(db, owners, documentFiles, nowIso, { type: 'system', ref: null }),
		...unsubmittedDataStatements(db, invitations, uploadedFiles, nowIso),
	]);
	return summary;
}

/** Runs the cleanup once a day; in local development on every trigger. Never throws. */
export async function runScheduledTenantFormsCleanup(env: Env, now: Date = new Date()): Promise<void> {
	const vars = env as unknown as Record<string, unknown>;
	if (vars.ENVIRONMENT !== 'development' && madridClock(now).hour !== CLEANUP_HOUR) {
		return;
	}
	// Deletes only when explicitly switched off, so a missing variable can never delete anything.
	const dryRun = vars.TENANT_FORM_CLEANUP_DRY_RUN !== false && vars.TENANT_FORM_CLEANUP_DRY_RUN !== 'false';

	try {
		const summary = await runTenantFormsCleanup(env, { now, dryRun });
		console.log(
			`[scheduled] tenant-forms-cleanup${summary.dryRun ? ' DRY RUN, nothing deleted:' : ':'}` +
				` documents of ${summary.submissionIds.length} submissions (${summary.documentFiles} files)` +
				` [${summary.submissionIds.join(', ')}];` +
				` unsubmitted data of ${summary.invitationIds.length} invitations (${summary.drafts} drafts,` +
				` ${summary.unsubmittedFiles} files) [${summary.invitationIds.join(', ')}]`
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[scheduled] tenant-forms-cleanup failed: ${message}`);
	}
}

/** Calendar date and hour in Madrid, where the stays and their dates are. */
export function madridClock(date: Date): { date: string; hour: number } {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: CLEANUP_TIMEZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(date);
	const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? '';
	return { date: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')) };
}

// --- Queries ---

async function findSubmissionsDue(db: D1Database, today: string, noStayCutoff: string): Promise<DocumentsOwner[]> {
	const { results } = await db
		.prepare(
			`SELECT s.id, s.invitation_id FROM form_submissions s
			 WHERE EXISTS (SELECT 1 FROM form_submission_files f WHERE f.submission_id = s.id AND f.status = 'attached')
			   AND (s.documents_delete_after < ?
			        OR (s.status = 'rejected' AND s.reviewed_at <= ?)
			        OR (s.status = 'archived' AND s.customer_id IS NULL AND s.reviewed_at <= ?))
			 ORDER BY s.submitted_at
			 LIMIT ${MAX_PURGE_BATCH}`
		)
		.bind(today, noStayCutoff, noStayCutoff)
		.all<{ id: string; invitation_id: string }>();
	return results.map((row) => ({ submissionId: row.id, invitationId: row.invitation_id }));
}

/** Expired, revoked or submitted invitations that still have a draft or unsubmitted files. */
async function findClosedInvitationsWithLeftovers(db: D1Database, nowIso: string): Promise<ClosedInvitationRow[]> {
	const { results } = await db
		.prepare(
			`SELECT i.id, EXISTS (SELECT 1 FROM form_drafts d WHERE d.invitation_id = i.id) AS has_draft
			 FROM form_invitations i
			 WHERE (i.status IN ('revoked', 'submitted') OR (i.status IN ('pending', 'opened') AND i.expires_at <= ?))
			   AND (EXISTS (SELECT 1 FROM form_drafts d WHERE d.invitation_id = i.id)
			        OR EXISTS (SELECT 1 FROM form_submission_files f WHERE f.invitation_id = i.id AND f.status = 'uploaded'))
			 ORDER BY i.created_at
			 LIMIT ${MAX_PURGE_BATCH}`
		)
		.bind(nowIso)
		.all<ClosedInvitationRow>();
	return results;
}

async function findUploadedFiles(db: D1Database, invitationIds: string[]): Promise<UploadedFileRow[]> {
	if (invitationIds.length === 0) return [];
	const { results } = await db
		.prepare(
			`SELECT id, r2_key, invitation_id FROM form_submission_files
			 WHERE status = 'uploaded' AND invitation_id IN (${placeholders(invitationIds.length)})`
		)
		.bind(...invitationIds)
		.all<UploadedFileRow>();
	return results;
}

function unsubmittedDataStatements(
	db: D1Database,
	invitations: ClosedInvitationRow[],
	files: UploadedFileRow[],
	deletedAt: string
): D1PreparedStatement[] {
	if (invitations.length === 0) return [];
	const invitationIds = invitations.map((invitation) => invitation.id);
	return [
		db
			.prepare(
				`UPDATE form_submission_files SET status = 'deleted', deleted_at = ?, original_filename = ''
				 WHERE status = 'uploaded' AND invitation_id IN (${placeholders(invitationIds.length)})`
			)
			.bind(deletedAt, ...invitationIds),
		db.prepare(`DELETE FROM form_drafts WHERE invitation_id IN (${placeholders(invitationIds.length)})`).bind(...invitationIds),
		eventsStatement(
			db,
			'unsubmitted_data_deleted',
			{ type: 'system', ref: null },
			invitations.map((invitation) => ({
				invitationId: invitation.id,
				submissionId: null,
				metadata: {
					draft: invitation.has_draft === 1,
					fileCount: files.filter((file) => file.invitation_id === invitation.id).length,
				},
			}))
		),
	];
}
