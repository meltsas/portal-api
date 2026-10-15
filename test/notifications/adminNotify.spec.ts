import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newSubmissionEmail, notifyAdminsOfSubmission, type NewSubmissionNotice } from '../../src/notifications/adminNotify';
import { ADMIN_EMAILS } from '../../src/utils/adminAllowlist';

const NOTICE: NewSubmissionNotice = {
	submissionId: 'sub-123',
	fullName: 'Åsa Exempel',
	googleEmail: 'asa@example.com',
	offerTitle: 'Casa Bonita',
	submittedAt: '2026-10-15T12:30:00Z',
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe('newSubmissionEmail', () => {
	it('names the guest in the subject and links to the submission in the admin UI', () => {
		expect(newSubmissionEmail(NOTICE, 'https://admin.example.com/')).toEqual({
			subject: 'New Form Submission from Åsa Exempel',
			text: [
				'A guest has submitted the tenant details form.',
				'',
				'Name: Åsa Exempel',
				'Google account: asa@example.com',
				'Offer: Casa Bonita',
				'Submitted: 2026-10-15 12:30:00 UTC',
				'',
				'Review the submission:',
				'https://admin.example.com/tenant-forms/submissions/sub-123',
			].join('\n'),
		});
	});

	it('keeps line breaks out of the subject and handles missing values', () => {
		const email = newSubmissionEmail({ ...NOTICE, fullName: 'Åsa\r\nBcc: someone@example.com', offerTitle: null }, 'https://a.example');
		expect(email.subject).toBe('New Form Submission from Åsa Bcc: someone@example.com');
		expect(email.text).toContain('Offer: -');
		expect(newSubmissionEmail({ ...NOTICE, fullName: '' }, 'https://a.example').subject).toBe('New Form Submission from a guest');
	});
});

describe('notifyAdminsOfSubmission', () => {
	it('emails every admin from the configured sender', async () => {
		const send = vi.fn().mockResolvedValue({ messageId: 'm1' });

		await notifyAdminsOfSubmission({ ...env, EMAIL: { send } } as unknown as Env, NOTICE);

		expect(send).toHaveBeenCalledTimes(ADMIN_EMAILS.size);
		const email = newSubmissionEmail(NOTICE, env.ADMIN_UI_URL);
		for (const to of ADMIN_EMAILS) {
			expect(send).toHaveBeenCalledWith({
				from: { email: env.NOTIFICATION_FROM_EMAIL, name: 'Costa Seasons' },
				to,
				subject: email.subject,
				text: email.text,
			});
		}
	});

	it('only logs a failed send, with the error code and without personal data', async () => {
		const error = Object.assign(new Error('Recipient not in allowed list'), { code: 'E_RECIPIENT_NOT_ALLOWED' });
		const send = vi.fn().mockRejectedValue(error);
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(notifyAdminsOfSubmission({ ...env, EMAIL: { send } } as unknown as Env, NOTICE)).resolves.toBeUndefined();

		expect(log).toHaveBeenCalledWith('[tenant-forms] admin notification for submission sub-123 failed: E_RECIPIENT_NOT_ALLOWED');
		expect(log.mock.calls.flat().join(' ')).not.toContain('Åsa');
	});

	it('is accepted by the configured send_email binding (local simulator)', async () => {
		const log = vi.spyOn(console, 'error');

		await notifyAdminsOfSubmission(env, NOTICE);

		expect(log).not.toHaveBeenCalled();
	});
});
