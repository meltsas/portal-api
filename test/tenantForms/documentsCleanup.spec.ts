import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PurgeTenantFormDocumentsResponse } from '../../src/types/api';
import { madridClock, runScheduledTenantFormsCleanup, runTenantFormsCleanup } from '../../src/scheduled/tenantFormsCleanup';
import { toIsoSeconds } from '../../src/utils/date';
import { ADMIN_EMAIL, adminSessionCookie, GOOGLE_SUB, insertTestInvitation, insertTestOffer, isoFromNow } from '../helpers';

// 04:07 in Madrid (UTC+1 in November): the daily cleanup hour.
const NOW = new Date('2026-11-20T03:07:00Z');
const DAY_MS = 86_400_000;

beforeEach(async () => {
	await insertTestOffer();
});

function daysBeforeNow(days: number): string {
	return toIsoSeconds(new Date(NOW.getTime() - days * DAY_MS));
}

interface SeededFile {
	id: string;
	r2Key: string;
}

async function insertFile(invitationId: string, submissionId: string | null, status: 'uploaded' | 'attached'): Promise<SeededFile> {
	const id = crypto.randomUUID();
	const r2Key = `tenant-forms/${invitationId}/${id}`;
	await env.tenant_files.put(r2Key, 'file bytes');
	await env.portal_db
		.prepare(
			`INSERT INTO form_submission_files
			 (id, invitation_id, submission_id, field_key, r2_key, original_filename, mime_type, size_bytes, status, uploaded_at)
			 VALUES (?, ?, ?, 'id_documents', ?, 'Pass Åsa Exempel.jpg', 'image/jpeg', 10, ?, '2026-10-01T10:00:00Z')`
		)
		.bind(id, invitationId, submissionId, r2Key, status)
		.run();
	return { id, r2Key };
}

interface SubmissionOptions {
	status?: string;
	documentsDeleteAfter?: string;
	reviewedAt?: string | null;
	customerId?: string | null;
}

/** A submitted form with one attached document. */
async function insertSubmission(options: SubmissionOptions = {}): Promise<{ id: string; invitationId: string; file: SeededFile }> {
	const invitationId = (await insertTestInvitation({ status: 'submitted', googleSubject: GOOGLE_SUB })).id;
	const id = crypto.randomUUID();
	await env.portal_db
		.prepare(
			`INSERT INTO form_submissions
			 (id, invitation_id, template_id, language, google_subject, google_email, contact_email, phone, full_name,
			  planned_arrival, planned_departure, values_json, status, reviewed_at, customer_id, documents_delete_after, submitted_at)
			 VALUES (?, ?, 'tenant_details_v1', 'sv', ?, 'g@example.com', 'c@example.com', '+46 70', 'Åsa Exempel',
			         '2026-12-01', '2027-01-15', '{}', ?, ?, ?, ?, '2026-10-01T10:00:00Z')`
		)
		.bind(
			id,
			invitationId,
			GOOGLE_SUB,
			options.status ?? 'approved',
			options.reviewedAt ?? null,
			options.customerId ?? null,
			options.documentsDeleteAfter ?? '2027-02-14'
		)
		.run();
	return { id, invitationId, file: await insertFile(invitationId, id, 'attached') };
}

async function insertDraft(invitationId: string): Promise<void> {
	await env.portal_db
		.prepare(`INSERT INTO form_drafts (invitation_id, values_json, updated_at) VALUES (?, '{"first_name":"Åsa"}', '2026-10-01T10:00:00Z')`)
		.bind(invitationId)
		.run();
}

async function insertCustomer(id: string): Promise<void> {
	await env.portal_db.prepare(`INSERT INTO customers (id, full_name, email) VALUES (?, 'Åsa Exempel', 'c@example.com')`).bind(id).run();
}

async function inR2(file: SeededFile): Promise<boolean> {
	return (await env.tenant_files.head(file.r2Key)) !== null;
}

function fileRow(file: SeededFile) {
	return env.portal_db
		.prepare(`SELECT status, deleted_at, original_filename FROM form_submission_files WHERE id = ?`)
		.bind(file.id)
		.first<{ status: string; deleted_at: string | null; original_filename: string }>();
}

async function events(type: string): Promise<{ invitation_id: string; submission_id: string | null; actor_type: string; actor_ref: string | null; metadata_json: string }[]> {
	const { results } = await env.portal_db
		.prepare(`SELECT invitation_id, submission_id, actor_type, actor_ref, metadata_json FROM form_events WHERE event_type = ?`)
		.bind(type)
		.all<{ invitation_id: string; submission_id: string | null; actor_type: string; actor_ref: string | null; metadata_json: string }>();
	return results;
}

function cleanup(dryRun = false) {
	return runTenantFormsCleanup(env, { now: NOW, dryRun });
}

describe('documents of a stay', () => {
	it('are deleted the day after documents_delete_after', async () => {
		const due = await insertSubmission({ documentsDeleteAfter: '2026-11-19' });
		const notYet = await insertSubmission({ documentsDeleteAfter: '2026-11-20' });

		const summary = await cleanup();

		expect(summary.submissionIds).toEqual([due.id]);
		expect(await inR2(due.file)).toBe(false);
		expect(await inR2(notYet.file)).toBe(true);
	});

	it('leave the file row without its name and log the deletion', async () => {
		const due = await insertSubmission({ documentsDeleteAfter: '2026-11-19' });

		await cleanup();

		expect(await fileRow(due.file)).toEqual({ status: 'deleted', deleted_at: toIsoSeconds(NOW), original_filename: '' });
		const submission = await env.portal_db
			.prepare(`SELECT documents_deleted_at FROM form_submissions WHERE id = ?`)
			.bind(due.id)
			.first<{ documents_deleted_at: string }>();
		expect(submission?.documents_deleted_at).toBe(toIsoSeconds(NOW));
		expect(await events('documents_purged')).toEqual([
			{ invitation_id: due.invitationId, submission_id: due.id, actor_type: 'system', actor_ref: null, metadata_json: '{"fileCount":1}' },
		]);
	});
});

describe('documents of a submission without a stay', () => {
	it('are deleted 30 days after a rejection or an unconverted archive', async () => {
		await insertCustomer('cust_1');
		const rejectedLong = await insertSubmission({ status: 'rejected', reviewedAt: daysBeforeNow(31) });
		const rejectedRecently = await insertSubmission({ status: 'rejected', reviewedAt: daysBeforeNow(29) });
		const archived = await insertSubmission({ status: 'archived', reviewedAt: daysBeforeNow(31) });
		const archivedConverted = await insertSubmission({ status: 'archived', reviewedAt: daysBeforeNow(31), customerId: 'cust_1' });
		const reconsidered = await insertSubmission({ status: 'approved', reviewedAt: daysBeforeNow(31) });

		const summary = await cleanup();

		expect(summary.submissionIds.sort()).toEqual([rejectedLong.id, archived.id].sort());
		expect(await inR2(rejectedRecently.file)).toBe(true);
		expect(await inR2(archivedConverted.file)).toBe(true);
		expect(await inR2(reconsidered.file)).toBe(true);
	});
});

describe('unsubmitted data', () => {
	it('is deleted for expired, revoked and submitted invitations', async () => {
		const expired = (await insertTestInvitation({ status: 'opened', expiresAt: daysBeforeNow(1) })).id;
		await insertDraft(expired);
		const expiredFile = await insertFile(expired, null, 'uploaded');

		const revoked = (await insertTestInvitation({ status: 'revoked', expiresAt: isoFromNow(5 * DAY_MS) })).id;
		await insertDraft(revoked);

		const submitted = await insertSubmission();
		const leftover = await insertFile(submitted.invitationId, null, 'uploaded');

		const open = (await insertTestInvitation({ status: 'opened', expiresAt: toIsoSeconds(new Date(NOW.getTime() + DAY_MS)) })).id;
		await insertDraft(open);
		const openFile = await insertFile(open, null, 'uploaded');

		const summary = await cleanup();

		expect(summary.invitationIds.sort()).toEqual([expired, revoked, submitted.invitationId].sort());
		expect(summary).toMatchObject({ drafts: 2, unsubmittedFiles: 2 });
		expect(await inR2(expiredFile)).toBe(false);
		expect(await inR2(leftover)).toBe(false);
		expect(await inR2(submitted.file)).toBe(true);
		expect(await inR2(openFile)).toBe(true);
		expect(await fileRow(leftover)).toMatchObject({ status: 'deleted', original_filename: '' });

		const drafts = await env.portal_db.prepare(`SELECT invitation_id FROM form_drafts`).all<{ invitation_id: string }>();
		expect(drafts.results.map((draft) => draft.invitation_id)).toEqual([open]);

		const metadataByInvitation = Object.fromEntries(
			(await events('unsubmitted_data_deleted')).map((event) => [event.invitation_id, JSON.parse(event.metadata_json)])
		);
		expect(metadataByInvitation).toEqual({
			[expired]: { draft: true, fileCount: 1 },
			[revoked]: { draft: true, fileCount: 0 },
			[submitted.invitationId]: { draft: false, fileCount: 1 },
		});
	});
});

describe('runTenantFormsCleanup', () => {
	it('deletes nothing in a dry run', async () => {
		const due = await insertSubmission({ documentsDeleteAfter: '2026-11-19' });
		const expired = (await insertTestInvitation({ status: 'pending', expiresAt: daysBeforeNow(1) })).id;
		await insertDraft(expired);

		const summary = await cleanup(true);

		expect(summary).toMatchObject({ dryRun: true, submissionIds: [due.id], invitationIds: [expired], drafts: 1 });
		expect(await inR2(due.file)).toBe(true);
		expect((await fileRow(due.file))?.status).toBe('attached');
		expect((await env.portal_db.prepare(`SELECT COUNT(*) AS n FROM form_drafts`).first<{ n: number }>())?.n).toBe(1);
		expect(await events('documents_purged')).toEqual([]);
	});

	it('finds nothing more on a second run', async () => {
		await insertSubmission({ documentsDeleteAfter: '2026-11-19' });
		await cleanup();

		expect(await cleanup()).toMatchObject({ submissionIds: [], invitationIds: [], documentFiles: 0, unsubmittedFiles: 0 });
		expect(await events('documents_purged')).toHaveLength(1);
	});
});

describe('scheduled cleanup', () => {
	async function insertDue(): Promise<SeededFile> {
		return (await insertSubmission({ documentsDeleteAfter: '2026-11-19' })).file;
	}

	it('runs only at 04:xx Madrid time outside development', async () => {
		const file = await insertDue();
		const productionEnv = { ...env, ENVIRONMENT: 'production', TENANT_FORM_CLEANUP_DRY_RUN: false } as unknown as Env;

		await runScheduledTenantFormsCleanup(productionEnv, new Date('2026-11-20T05:07:00Z'));
		expect(await inR2(file)).toBe(true);

		await runScheduledTenantFormsCleanup(productionEnv, NOW);
		expect(await inR2(file)).toBe(false);
	});

	it('only logs while TENANT_FORM_CLEANUP_DRY_RUN is not false', async () => {
		const file = await insertDue();

		await runScheduledTenantFormsCleanup({ ...env, ENVIRONMENT: 'production' } as Env, NOW);
		expect(await inR2(file)).toBe(true);
	});

	it('uses the Madrid calendar date and hour in summer and winter', () => {
		expect(madridClock(new Date('2026-07-15T02:07:00Z'))).toEqual({ date: '2026-07-15', hour: 4 });
		expect(madridClock(new Date('2026-01-15T03:07:00Z'))).toEqual({ date: '2026-01-15', hour: 4 });
		expect(madridClock(new Date('2026-01-15T23:30:00Z'))).toEqual({ date: '2026-01-16', hour: 0 });
	});
});

describe('POST /api/admin/tenant-forms/submissions/:id/purge-documents', () => {
	function purge(submissionId: string, cookie?: string): Promise<Response> {
		return SELF.fetch(`https://example.com/api/admin/tenant-forms/submissions/${submissionId}/purge-documents`, {
			method: 'POST',
			headers: cookie ? { Cookie: cookie } : {},
		});
	}

	it('returns 401 without a session', async () => {
		expect((await purge('some-id')).status).toBe(401);
	});

	it('deletes the documents now and only once', async () => {
		const submission = await insertSubmission();
		const cookie = await adminSessionCookie();

		const response = await purge(submission.id, cookie);
		expect(response.status).toBe(200);
		const body = (await response.json()) as PurgeTenantFormDocumentsResponse;
		expect(body).toMatchObject({ submissionId: submission.id, fileCount: 1 });

		expect(await inR2(submission.file)).toBe(false);
		expect(await fileRow(submission.file)).toMatchObject({ status: 'deleted', original_filename: '' });
		expect(await events('documents_purged')).toEqual([
			{
				invitation_id: submission.invitationId,
				submission_id: submission.id,
				actor_type: 'admin',
				actor_ref: ADMIN_EMAIL,
				metadata_json: '{"fileCount":1}',
			},
		]);

		const again = await purge(submission.id, cookie);
		expect(again.status).toBe(409);
		expect(await again.json()).toEqual({ error: 'Documents have already been deleted' });
	});

	it('returns 404 for an unknown submission', async () => {
		expect((await purge('unknown', await adminSessionCookie())).status).toBe(404);
	});
});
