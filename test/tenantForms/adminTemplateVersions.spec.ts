import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
	AdminTenantFormTemplateDetail,
	AdminTenantFormTemplateListItem,
	CreateTenantFormInvitationResponse,
	TenantFormSchemaResponse,
} from '../../src/types/api';
import type { FormField, FormSection } from '../../src/utils/formSchema';
import { buildStructureRows } from '../../src/utils/formStructureEditing';
import { ADMIN_EMAIL, adminSessionCookie, GOOGLE_SUB, insertTestInvitation, insertTestOffer, TEST_OFFER_ID, tenantAccessToken } from '../helpers';

const API = 'https://example.com/api';
const TEMPLATES = '/admin/tenant-forms/templates';

beforeEach(insertTestOffer);

async function adminRequest(path: string, method = 'GET', body?: unknown): Promise<Response> {
	return SELF.fetch(`${API}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Cookie: await adminSessionCookie() },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
}

async function getTemplate(id: string): Promise<AdminTenantFormTemplateDetail> {
	const response = await adminRequest(`${TEMPLATES}/${id}`);
	expect(response.status).toBe(200);
	return response.json();
}

async function createDraft(): Promise<AdminTenantFormTemplateDetail> {
	const response = await adminRequest(`${TEMPLATES}/tenant_details_v1/versions`, 'POST');
	expect(response.status).toBe(201);
	return response.json();
}

function saveStructure(template: AdminTenantFormTemplateDetail, sections: FormSection[], texts?: unknown[]): Promise<Response> {
	return adminRequest(`${TEMPLATES}/${template.id}/structure`, 'PUT', { revision: template.revision, sections, texts });
}

function activate(template: AdminTenantFormTemplateDetail): Promise<Response> {
	return adminRequest(`${TEMPLATES}/${template.id}/activate`, 'POST', { revision: template.revision });
}

function fieldIn(sections: FormSection[], key: string): FormField {
	return sections.flatMap((section) => section.fields).find((field) => field.key === key)!;
}

function sectionIn(sections: FormSection[], key: string): FormSection {
	return sections.find((section) => section.key === key)!;
}

/** Optional LinkedIn field, employer required, a new stay purpose before "other", video call time removed. */
function changedSections(template: AdminTenantFormTemplateDetail): FormSection[] {
	const sections = structuredClone(template.sections);
	sectionIn(sections, 'main_guest').fields.push({
		key: 'linkedin',
		type: 'url',
		required: false,
		validation: {},
		visibleIf: null,
		options: [],
		itemFields: [],
	});
	fieldIn(sections, 'employer').required = true;
	const purpose = fieldIn(sections, 'stay_purpose');
	purpose.options.splice(purpose.options.length - 1, 0, { key: 'digital_nomad', allowsFreeText: false });
	const verification = sectionIn(sections, 'id_verification');
	verification.fields = verification.fields.filter((field) => field.key !== 'video_call_time');
	return sections;
}

const NEW_TEXTS = [
	{ language: 'en', textKey: 'field.linkedin.label', text: 'LinkedIn profile' },
	{ language: 'en', textKey: 'option.stay_purpose.digital_nomad', text: 'Digital nomad' },
	{ language: 'sv', textKey: 'option.stay_purpose.digital_nomad', text: 'Digital nomad (SV)' },
];

async function publishChangedDraft(): Promise<AdminTenantFormTemplateDetail> {
	const draft = await createDraft();
	const saved = await saveStructure(draft, changedSections(draft), NEW_TEXTS);
	expect(saved.status).toBe(200);
	const response = await activate(await saved.json());
	expect(response.status).toBe(200);
	return response.json();
}

async function countRows(table: string, templateId: string, extra = ''): Promise<number> {
	const row = await env.portal_db
		.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE template_id = ? ${extra}`)
		.bind(templateId)
		.first<{ count: number }>();
	return row?.count ?? 0;
}

async function storedText(templateId: string, language: string, textKey: string): Promise<string | null> {
	const row = await env.portal_db
		.prepare(`SELECT text FROM form_translations WHERE template_id = ? AND language = ? AND text_key = ?`)
		.bind(templateId, language, textKey)
		.first<{ text: string }>();
	return row?.text ?? null;
}

/** Signs the guest in on the invitation and returns its form. */
async function openForm(invitationId: string): Promise<TenantFormSchemaResponse> {
	await env.portal_db
		.prepare(`UPDATE form_invitations SET status = 'opened', google_subject = ?, google_email = 'tenant@example.com' WHERE id = ?`)
		.bind(GOOGLE_SUB, invitationId)
		.run();
	const response = await SELF.fetch(`${API}/tenant-forms/form`, {
		headers: { Authorization: `Bearer ${await tenantAccessToken(invitationId)}` },
	});
	expect(response.status).toBe(200);
	return response.json();
}

async function createInvitation(): Promise<CreateTenantFormInvitationResponse> {
	const response = await adminRequest('/admin/tenant-forms/invitations', 'POST', {
		displayName: 'New Guest',
		offerId: TEST_OFFER_ID,
		language: 'sv',
	});
	expect(response.status).toBe(201);
	return response.json();
}

function fieldKeys(form: TenantFormSchemaResponse): string[] {
	return form.sections.flatMap((section) => section.fields.map((field) => field.key));
}

describe('template version routes', () => {
	it.each([
		['POST', '/tenant_details_v1/versions'],
		['PUT', '/tenant_details_v1/structure'],
		['POST', '/tenant_details_v1/activate'],
		['DELETE', '/tenant_details_v1'],
	])('%s %s returns 401 without a session', async (method, path) => {
		const response = await SELF.fetch(`${API}${TEMPLATES}${path}`, { method, body: method === 'DELETE' ? undefined : '{}' });
		expect(response.status).toBe(401);
	});
});

describe('POST /api/admin/tenant-forms/templates/:id/versions', () => {
	it('copies the structure and every text into a draft', async () => {
		const v1 = await getTemplate('tenant_details_v1');
		const draft = await createDraft();

		expect(draft).toMatchObject({
			id: 'tenant_details_v2',
			templateKey: 'tenant_details',
			version: 2,
			status: 'draft',
			basedOnTemplateId: 'tenant_details_v1',
			createdByEmail: ADMIN_EMAIL,
			activatedAt: null,
			revision: 0,
			invitationCount: 0,
			submissionCount: 0,
			problems: [],
		});
		expect(draft.sections).toEqual(v1.sections);
		expect(draft.texts).toEqual(v1.texts);
	});

	it('builds the row ids from keys, as a later save does', async () => {
		const draft = await createDraft();
		const rows = buildStructureRows(draft.id, draft.sections);
		const ids = async (sql: string) =>
			(await env.portal_db.prepare(sql).bind(draft.id).all<{ id: string }>()).results.map((row) => row.id).sort();

		expect(await ids(`SELECT id FROM form_sections WHERE template_id = ?`)).toEqual(rows.sections.map((row) => row.id).sort());
		expect(await ids(`SELECT id FROM form_fields WHERE template_id = ?`)).toEqual(rows.fields.map((row) => row.id).sort());
		expect(
			await ids(`SELECT o.id FROM form_field_options o JOIN form_fields f ON f.id = o.field_id WHERE f.template_id = ?`)
		).toEqual(rows.options.map((row) => row.id).sort());
	});

	it('allows one draft at a time and never copies a draft', async () => {
		await createDraft();
		expect((await adminRequest(`${TEMPLATES}/tenant_details_v1/versions`, 'POST')).status).toBe(409);
		expect((await adminRequest(`${TEMPLATES}/tenant_details_v2/versions`, 'POST')).status).toBe(409);
	});

	it('returns 404 for an unknown template', async () => {
		expect((await adminRequest(`${TEMPLATES}/nope/versions`, 'POST')).status).toBe(404);
	});
});

describe('PUT /api/admin/tenant-forms/templates/:id/structure', () => {
	it('saves fields, options, order and texts, and removes the texts of removed fields', async () => {
		const draft = await createDraft();
		expect(await countRows('form_translations', draft.id, `AND text_key LIKE 'field.video_call_time.%'`)).toBeGreaterThan(0);

		const response = await saveStructure(draft, changedSections(draft), NEW_TEXTS);
		expect(response.status).toBe(200);
		const saved = (await response.json()) as AdminTenantFormTemplateDetail;

		expect(saved.revision).toBe(1);
		expect(saved.problems).toEqual([]);
		expect(saved.sections).toEqual(changedSections(draft));
		expect(fieldIn(saved.sections, 'stay_purpose').options.slice(-2).map((option) => option.key)).toEqual(['digital_nomad', 'other']);
		expect(saved.texts.en['field.linkedin.label']).toBe('LinkedIn profile');
		expect(saved.texts.sv['option.stay_purpose.digital_nomad']).toBe('Digital nomad (SV)');
		expect(await countRows('form_translations', draft.id, `AND text_key LIKE 'field.video_call_time.%'`)).toBe(0);

		// The version the draft was copied from is untouched.
		const v1 = await getTemplate('tenant_details_v1');
		expect(fieldIn(v1.sections, 'video_call_time')).toBeDefined();
		expect(fieldIn(v1.sections, 'employer').required).toBe(false);
	});

	it('keeps an unfinished draft and lists what blocks publishing', async () => {
		const draft = await createDraft();
		const response = await saveStructure(draft, changedSections(draft));
		expect(response.status).toBe(200);
		const saved = (await response.json()) as AdminTenantFormTemplateDetail;
		expect(saved.problems).toEqual([
			{ path: 'sections[1].fields[7]', code: 'missing_text', detail: 'field.linkedin.label' },
			{ path: 'sections[5].fields[0].options[8]', code: 'missing_text', detail: 'option.stay_purpose.digital_nomad' },
		]);
	});

	it('rejects a structure that can not be stored and changes nothing', async () => {
		const draft = await createDraft();
		const sections = structuredClone(draft.sections);
		sectionIn(sections, 'stay').fields.push(structuredClone(fieldIn(sections, 'phone')));

		const response = await saveStructure(draft, sections);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'Invalid structure',
			errors: [{ path: 'sections[2].fields[0].key', code: 'duplicate_key' }],
		});
		expect((await getTemplate(draft.id)).revision).toBe(0);
	});

	it('rejects invalid texts', async () => {
		const draft = await createDraft();
		const response = await saveStructure(draft, changedSections(draft), [
			{ language: 'en', textKey: 'field.linkedin.label', text: 'See [profile](http://example.com)' },
		]);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Invalid text changes', errors: [{ index: 0, code: 'invalid_link' }] });
	});

	it('rejects a save based on an older revision', async () => {
		const draft = await createDraft();
		expect((await saveStructure(draft, draft.sections)).status).toBe(200);
		const stale = await saveStructure(draft, changedSections(draft), NEW_TEXTS);
		expect(stale.status).toBe(409);
		expect(fieldIn((await getTemplate(draft.id)).sections, 'linkedin')).toBeUndefined();
	});

	it('changes only drafts and needs the revision', async () => {
		const v1 = await getTemplate('tenant_details_v1');
		expect((await saveStructure(v1, v1.sections)).status).toBe(409);

		const draft = await createDraft();
		const response = await adminRequest(`${TEMPLATES}/${draft.id}/structure`, 'PUT', { sections: draft.sections });
		expect(response.status).toBe(400);
	});
});

describe('POST /api/admin/tenant-forms/templates/:id/activate', () => {
	it('refuses a draft that still has problems', async () => {
		const draft = await createDraft();
		const sections = structuredClone(draft.sections);
		sectionIn(sections, 'contact').fields = sectionIn(sections, 'contact').fields.filter((field) => field.key !== 'phone');
		const saved = (await (await saveStructure(draft, sections)).json()) as AdminTenantFormTemplateDetail;

		const response = await activate(saved);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'Template has problems',
			problems: [{ path: '', code: 'system_field', detail: 'phone: missing' }],
		});
		expect((await getTemplate('tenant_details_v1')).status).toBe('active');
	});

	it('publishes the draft for new invitations while sent links keep their version', async () => {
		const sent = await insertTestInvitation();
		const published = await publishChangedDraft();

		expect(published).toMatchObject({ status: 'active', activatedByEmail: ADMIN_EMAIL, revision: 2 });
		expect((await getTemplate('tenant_details_v1')).status).toBe('archived');

		const created = await createInvitation();
		expect(created.invitation.templateId).toBe('tenant_details_v2');
		const newForm = await openForm(created.invitation.id);
		expect(fieldKeys(newForm)).toContain('linkedin');
		expect(fieldKeys(newForm)).not.toContain('video_call_time');
		const purpose = newForm.sections.flatMap((section) => section.fields).find((field) => field.key === 'stay_purpose')!;
		expect(purpose.options.find((option) => option.key === 'digital_nomad')?.label).toBe('Digital nomad (SV)');

		const oldForm = await openForm(sent.id);
		expect(fieldKeys(oldForm)).not.toContain('linkedin');
		expect(fieldKeys(oldForm)).toContain('video_call_time');
		const draftSave = await SELF.fetch(`${API}/tenant-forms/draft`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await tenantAccessToken(sent.id)}` },
			body: JSON.stringify({ values: { linkedin: 'https://www.linkedin.com/in/example' } }),
		});
		expect(draftSave.status).toBe(400);
		expect(await draftSave.json()).toMatchObject({ errors: [{ field: 'linkedin', code: 'unknown_field' }] });
	});

	it('restores an archived version', async () => {
		await publishChangedDraft();
		const v1 = await getTemplate('tenant_details_v1');

		const response = await activate(v1);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ id: 'tenant_details_v1', status: 'active', revision: v1.revision + 1 });
		expect((await getTemplate('tenant_details_v2')).status).toBe('archived');
		expect((await createInvitation()).invitation.templateId).toBe('tenant_details_v1');
	});

	it('rejects an old revision and an already active version', async () => {
		const draft = await createDraft();
		expect((await saveStructure(draft, draft.sections)).status).toBe(200);
		expect((await activate(draft)).status).toBe(409);
		expect((await activate(await getTemplate('tenant_details_v1'))).status).toBe(409);
	});
});

describe('DELETE /api/admin/tenant-forms/templates/:id', () => {
	it('deletes a draft with its structure and texts', async () => {
		const draft = await createDraft();
		const response = await adminRequest(`${TEMPLATES}/${draft.id}`, 'DELETE');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: draft.id, deleted: true });

		for (const table of ['form_sections', 'form_fields', 'form_translations', 'form_templates']) {
			const column = table === 'form_templates' ? 'id' : 'template_id';
			const row = await env.portal_db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`).bind(draft.id).first<{ count: number }>();
			expect(row?.count).toBe(0);
		}
		expect((await adminRequest(`${TEMPLATES}/${draft.id}`)).status).toBe(404);
		expect((await createDraft()).id).toBe('tenant_details_v2');
	});

	it('never deletes a version that invitations may use', async () => {
		expect((await adminRequest(`${TEMPLATES}/tenant_details_v1`, 'DELETE')).status).toBe(409);
		expect((await adminRequest(`${TEMPLATES}/nope`, 'DELETE')).status).toBe(404);
	});
});

describe('text edits of the active version while a draft exists', () => {
	function putTexts(templateId: string, changes: unknown[]): Promise<Response> {
		return adminRequest(`${TEMPLATES}/${templateId}/translations`, 'PUT', { changes });
	}

	it('reach the draft where it still has the old text', async () => {
		const draft = await createDraft();
		expect((await putTexts('tenant_details_v1', [{ language: 'sv', textKey: 'section.stay.title', text: 'Resa' }])).status).toBe(200);
		expect(await storedText(draft.id, 'sv', 'section.stay.title')).toBe('Resa');
	});

	it('leave a text the admin already changed in the draft', async () => {
		const draft = await createDraft();
		await putTexts(draft.id, [{ language: 'sv', textKey: 'section.stay.title', text: 'Resa och vistelse' }]);
		await putTexts('tenant_details_v1', [{ language: 'sv', textKey: 'section.stay.title', text: 'Resa' }]);
		expect(await storedText(draft.id, 'sv', 'section.stay.title')).toBe('Resa och vistelse');
		expect(await storedText('tenant_details_v1', 'sv', 'section.stay.title')).toBe('Resa');
	});
});

describe('GET /api/admin/tenant-forms/templates', () => {
	it('lists versions with their origin and how many invitations use them', async () => {
		await insertTestInvitation();
		await createDraft();
		const response = await adminRequest(TEMPLATES);
		const { data } = (await response.json()) as { data: AdminTenantFormTemplateListItem[] };

		expect(data.map((item) => [item.id, item.status])).toEqual([
			['tenant_details_v2', 'draft'],
			['tenant_details_v1', 'active'],
		]);
		expect(data[0]).toMatchObject({ basedOnTemplateId: 'tenant_details_v1', invitationCount: 0, revision: 0 });
		expect(data[0]!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
		expect(data[1]).toMatchObject({ basedOnTemplateId: null, invitationCount: 1, submissionCount: 0 });
	});
});

describe('PUT /api/admin/tenant-forms/templates/:id/translations with many changes', () => {
	it('writes every text of a language in one request', async () => {
		const v1 = await getTemplate('tenant_details_v1');
		const changes = Object.keys(v1.texts.en).map((textKey) => ({ language: 'fi', textKey, text: `FI ${textKey}` }));
		const response = await adminRequest(`${TEMPLATES}/tenant_details_v1/translations`, 'PUT', { changes });
		expect(response.status).toBe(200);
		expect(await countRows('form_translations', 'tenant_details_v1', `AND language = 'fi' AND text LIKE 'FI %'`)).toBe(changes.length);
	});
});
