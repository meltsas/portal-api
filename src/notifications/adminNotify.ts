import { ADMIN_EMAILS } from '../utils/adminAllowlist';

const SENDER_NAME = 'Costa Seasons';
const MAX_SUBJECT_NAME_LENGTH = 100;

export interface NewSubmissionNotice {
	submissionId: string;
	fullName: string;
	googleEmail: string;
	offerTitle: string | null;
	/** ISO timestamp, e.g. `2026-10-15T12:30:00Z`. */
	submittedAt: string;
}

export interface NotificationEmail {
	subject: string;
	text: string;
}

export function newSubmissionEmail(notice: NewSubmissionNotice, adminUiUrl: string): NotificationEmail {
	const name = singleLine(notice.fullName) || 'a guest';
	const link = `${adminUiUrl.replace(/\/+$/, '')}/tenant-forms/submissions/${encodeURIComponent(notice.submissionId)}`;
	return {
		subject: `New Form Submission from ${name.slice(0, MAX_SUBJECT_NAME_LENGTH)}`,
		text: [
			'A guest has submitted the tenant details form.',
			'',
			`Name: ${name}`,
			`Google account: ${singleLine(notice.googleEmail) || '-'}`,
			`Offer: ${singleLine(notice.offerTitle ?? '') || '-'}`,
			`Submitted: ${notice.submittedAt.replace('T', ' ').replace('Z', ' UTC')}`,
			'',
			'Review the submission:',
			link,
		].join('\n'),
	};
}

/**
 * Emails every admin in ADMIN_EMAILS about a new submission. Each address must be a verified
 * destination address in Cloudflare Email Routing. Never throws: a failed notification must not
 * affect the submission, so failures are only logged (without personal data).
 */
export async function notifyAdminsOfSubmission(env: Env, notice: NewSubmissionNotice): Promise<void> {
	const email = newSubmissionEmail(notice, env.ADMIN_UI_URL);
	const results = await Promise.allSettled(
		[...ADMIN_EMAILS].map((to) =>
			env.EMAIL.send({ from: { email: env.NOTIFICATION_FROM_EMAIL, name: SENDER_NAME }, to, subject: email.subject, text: email.text })
		)
	);
	for (const result of results) {
		if (result.status === 'rejected') {
			console.error(`[tenant-forms] admin notification for submission ${notice.submissionId} failed: ${errorCode(result.reason)}`);
		}
	}
}

/** Collapses line breaks and control characters, so a value cannot add lines or headers. */
function singleLine(value: string): string {
	return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
}

function errorCode(error: unknown): string {
	if (error instanceof Error) {
		const code = (error as Error & { code?: unknown }).code;
		return typeof code === 'string' ? code : error.message;
	}
	return String(error);
}
