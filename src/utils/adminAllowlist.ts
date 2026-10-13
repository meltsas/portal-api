// Hardcoded allowlist for now. Move to env / D1 once we have more than a
// handful of admins. Checked at login and on every authenticated request.
export const ADMIN_EMAILS: ReadonlySet<string> = new Set(['martin.meltsas@googlemail.com']);

export function isAdminEmail(email: string): boolean {
	return ADMIN_EMAILS.has(email.toLowerCase());
}
