import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdminTenantFormTemplateDetail, TenantFormSchemaResponse } from '../../src/types/api';
import { ADMIN_EMAIL, adminSessionCookie, GOOGLE_SUB, insertTestInvitation, insertTestOffer, tenantAccessToken } from '../helpers';

const TEMPLATE_URL = 'https://example.com/api/admin/tenant-forms/templates/tenant_details_v1';

beforeEach(insertTestOffer);

async function putChanges(changes: unknown, cookie?: string): Promise<Response> {
	return SELF.fetch(`${TEMPLATE_URL}/translations`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json', Cookie: cookie ?? (await adminSessionCookie()) },
		body: JSON.stringify({ changes }),
	});
}

async function expectErrors(changes: unknown, errors: unknown[]): Promise<void> {
	const response = await putChanges(changes);
	expect(response.status).toBe(400);
	expect(await response.json()).toEqual({ error: 'Invalid text changes', errors });
}

function storedText(language: string, textKey: string) {
	return env.portal_db
		.prepare(`SELECT text, updated_by_email FROM form_translations WHERE template_id = 'tenant_details_v1' AND language = ? AND text_key = ?`)
		.bind(language, textKey)
		.first<{ text: string; updated_by_email: string | null }>();
}

async function tenantForm(language: string): Promise<TenantFormSchemaResponse> {
	const { id } = await insertTestInvitation({ status: 'opened', googleSubject: GOOGLE_SUB, language });
	const response = await SELF.fetch('https://example.com/api/tenant-forms/form', {
		headers: { Authorization: `Bearer ${await tenantAccessToken(id)}` },
	});
	return response.json();
}

describe('PUT /api/admin/tenant-forms/templates/:id/translations', () => {
	it('requires an admin session', async () => {
		const response = await SELF.fetch(`${TEMPLATE_URL}/translations`, { method: 'PUT', body: '{}' });
		expect(response.status).toBe(401);
	});

	it('returns 404 for an unknown template', async () => {
		const response = await SELF.fetch('https://example.com/api/admin/tenant-forms/templates/nope/translations', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Cookie: await adminSessionCookie() },
			body: JSON.stringify({ changes: [] }),
		});
		expect(response.status).toBe(404);
	});

	it('edits texts, adds translations and returns the updated template', async () => {
		const response = await putChanges([
			{ language: 'sv', textKey: 'section.stay.title', text: 'Resa och vistelse' },
			{ language: 'fi', textKey: 'section.stay.title', text: '  Matka ja majoitus\r\n' },
			{ language: 'en', textKey: 'field.first_name.help', text: 'As in your **passport**.' },
		]);
		expect(response.status).toBe(200);
		const detail = (await response.json()) as AdminTenantFormTemplateDetail;

		expect(detail.texts.sv['section.stay.title']).toBe('Resa och vistelse');
		expect(detail.texts.fi['section.stay.title']).toBe('Matka ja majoitus');
		expect(detail.texts.en['field.first_name.help']).toBe('As in your **passport**.');
		// The new English help text has no Finnish translation yet.
		const total = Object.keys(detail.texts.en).length;
		expect(detail.languages.find((entry) => entry.language === 'fi')).toEqual({ language: 'fi', translated: total - 1, total });

		expect(await storedText('fi', 'section.stay.title')).toEqual({ text: 'Matka ja majoitus', updated_by_email: ADMIN_EMAIL });
	});

	it('shows a translation in the form and falls back to English once it is removed', async () => {
		expect((await tenantForm('fi')).sections[0].title).toBe('Matka ja oleskelu');

		const removed = await putChanges([{ language: 'fi', textKey: 'section.stay.title', text: '' }]);
		expect(removed.status).toBe(200);
		const fi = ((await removed.json()) as AdminTenantFormTemplateDetail).languages.find((entry) => entry.language === 'fi')!;
		expect(fi.translated).toBe(fi.total - 1);
		expect(await storedText('fi', 'section.stay.title')).toBeNull();
		expect((await tenantForm('fi')).sections[0].title).toBe('Trip & stay');
	});

	it('removes an optional English text in every language', async () => {
		expect(await storedText('sv', 'field.last_name.help')).not.toBeNull();
		expect((await putChanges([{ language: 'en', textKey: 'field.last_name.help', text: '' }])).status).toBe(200);
		expect(await storedText('en', 'field.last_name.help')).toBeNull();
		expect(await storedText('sv', 'field.last_name.help')).toBeNull();
	});

	it('writes nothing for an unchanged text', async () => {
		const response = await putChanges([{ language: 'sv', textKey: 'section.stay.title', text: 'Resa & vistelse' }]);
		expect(response.status).toBe(200);
		expect((await storedText('sv', 'section.stay.title'))?.updated_by_email).toBeNull();
	});

	it('rejects the whole batch when one change is invalid', async () => {
		await expectErrors(
			[
				{ language: 'sv', textKey: 'section.stay.title', text: 'Valid change' },
				{ language: 'sv', textKey: 'field.nickname.label', text: 'Smeknamn' },
			],
			[{ index: 1, code: 'unknown_text_key' }]
		);
		expect((await storedText('sv', 'section.stay.title'))?.text).toBe('Resa & vistelse');
	});

	it.each([
		['an unsupported language', { language: 'de', textKey: 'section.stay.title', text: 'Reise' }, 'unsupported_language'],
		['a text that is not a string', { language: 'sv', textKey: 'section.stay.title', text: 5 }, 'invalid_type'],
		['a too long text', { language: 'sv', textKey: 'section.stay.title', text: 'x'.repeat(5001) }, 'too_long'],
		['a link that is not https', { language: 'en', textKey: 'template.intro', text: 'See [terms](http://example.com)' }, 'invalid_link'],
		['an empty required English text', { language: 'en', textKey: 'section.stay.title', text: '  ' }, 'required_text'],
		['a translation without an English text', { language: 'sv', textKey: 'field.first_name.help', text: 'Som i passet' }, 'missing_base_text'],
	])('rejects %s', async (_label, change, code) => {
		await expectErrors([change], [{ index: 0, code }]);
	});

	it('names unknown variables', async () => {
		await expectErrors(
			[{ language: 'en', textKey: 'template.title', text: '{offerTitle} for {price} per {night}' }],
			[{ index: 0, code: 'unknown_variable', variables: ['price', 'night'] }]
		);
	});

	it('rejects the same text twice in one batch', async () => {
		await expectErrors(
			[
				{ language: 'sv', textKey: 'section.stay.title', text: 'A' },
				{ language: 'sv', textKey: 'section.stay.title', text: 'B' },
			],
			[{ index: 1, code: 'duplicate_change' }]
		);
	});

	it('accepts a new English text and its translation in the same batch', async () => {
		const response = await putChanges([
			{ language: 'sv', textKey: 'field.first_name.help', text: 'Som i passet' },
			{ language: 'en', textKey: 'field.first_name.help', text: 'As in your passport' },
		]);
		expect(response.status).toBe(200);
	});

	it.each([
		['not an array', { language: 'sv' }],
		['empty', []],
		['too many changes', Array.from({ length: 501 }, () => ({ language: 'sv', textKey: 'section.stay.title', text: 'x' }))],
	])('rejects a changes list that is %s', async (_label, changes) => {
		await expectErrors(changes, [{ index: -1, code: 'invalid_type' }]);
	});
});
