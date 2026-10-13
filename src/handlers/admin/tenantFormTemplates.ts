import type { RouteHandler } from '../../router/types';
import type {
	AdminTenantFormTemplateDetail,
	AdminTenantFormTemplateListItem,
	TenantFormLanguageReadiness,
	UpdateTenantFormTranslationsPayload,
} from '../../types/api';
import type { FormTemplateRow, FormTranslationRow } from '../../types/db';
import { requireAuth } from '../../middleware/requireAuth';
import { toIsoSeconds } from '../../utils/date';
import {
	FORM_LANGUAGES,
	isFormLanguage,
	listTextKeys,
	loadFormStructure,
	type FormLanguage,
	type FormStructure,
} from '../../utils/formSchema';
import { validateTextChanges, type TextOperation } from '../../utils/formTextChanges';
import { jsonResponse, notFound, parseJsonBodyWithLimit } from '../../utils/response';

type TemplateQueryRow = Omit<FormTemplateRow, 'created_at' | 'updated_at'>;
type TemplateTexts = Record<FormLanguage, Record<string, string>>;

interface TranslatedCountRow {
	template_id: string;
	language: string;
	translated: number;
}

const TEMPLATE_COLUMNS = `id, template_key, version, base_language, status`;
const MAX_TRANSLATIONS_BODY_BYTES = 1_000_000;

export const handleAdminGetTenantFormTemplates: RouteHandler = async ({ env }) => {
	const [templates, counts] = await env.portal_db.batch<Record<string, unknown>>([
		env.portal_db.prepare(`SELECT ${TEMPLATE_COLUMNS} FROM form_templates ORDER BY template_key, version DESC`),
		// Counts only texts whose key also exists in the template's base language.
		env.portal_db.prepare(
			`SELECT tr.template_id, tr.language, COUNT(*) AS translated
			 FROM form_translations tr
			 JOIN form_templates t ON t.id = tr.template_id
			 JOIN form_translations base
			   ON base.template_id = tr.template_id AND base.language = t.base_language AND base.text_key = tr.text_key
			 GROUP BY tr.template_id, tr.language`
		),
	]);

	const countRows = counts.results as unknown as TranslatedCountRow[];
	const data: AdminTenantFormTemplateListItem[] = (templates.results as unknown as TemplateQueryRow[]).map((row) => {
		const countsByLanguage = new Map(
			countRows.filter((count) => count.template_id === row.id).map((count) => [count.language, count.translated])
		);
		return toTemplateListItem(row, countsByLanguage);
	});

	return jsonResponse({ data });
};

export const handleAdminGetTenantFormTemplate: RouteHandler = async ({ env, params }) => {
	const row = await findTemplate(env, params.id);
	if (!row) {
		return notFound();
	}

	const [structure, texts] = await Promise.all([loadFormStructure(env.portal_db, row.id), loadTemplateTexts(env, row.id)]);
	return jsonResponse(toTemplateDetail(row, structure, texts));
};

/**
 * Edits texts of existing keys and adds or removes translations; never changes the structure.
 * The whole batch is validated first and written in one D1 batch, or rejected as a whole.
 */
export const handleAdminUpdateTenantFormTranslations: RouteHandler = async ({ env, request, params }) => {
	const admin = await requireAuth(request, env);
	if (!admin) {
		return jsonResponse({ error: 'Unauthorized' }, 401);
	}

	const row = await findTemplate(env, params.id);
	if (!row) {
		return notFound();
	}

	const parsed = await parseJsonBodyWithLimit<UpdateTenantFormTranslationsPayload>(request, MAX_TRANSLATIONS_BODY_BYTES);
	if (parsed instanceof Response) {
		return parsed;
	}

	const [structure, storedTexts] = await Promise.all([
		loadFormStructure(env.portal_db, row.id),
		loadTemplateTexts(env, row.id),
	]);
	const result = validateTextChanges(structure ?? { templateId: row.id, sections: [] }, storedTexts, parsed.body?.changes);
	if (!result.ok) {
		return jsonResponse({ error: 'Invalid text changes', errors: result.errors }, 400);
	}

	if (result.operations.length > 0) {
		const updatedAt = toIsoSeconds(new Date());
		await env.portal_db.batch(
			result.operations.map((operation) => textOperationStatement(env, row.id, operation, admin.email, updatedAt))
		);
	}

	return jsonResponse(toTemplateDetail(row, structure, await loadTemplateTexts(env, row.id)));
};

// --- Helpers ---

function findTemplate(env: Env, id: string): Promise<TemplateQueryRow | null> {
	return env.portal_db.prepare(`SELECT ${TEMPLATE_COLUMNS} FROM form_templates WHERE id = ?`).bind(id).first<TemplateQueryRow>();
}

/** Every supported language is present, possibly empty. */
async function loadTemplateTexts(env: Env, templateId: string): Promise<TemplateTexts> {
	const { results } = await env.portal_db
		.prepare(`SELECT language, text_key, text FROM form_translations WHERE template_id = ?`)
		.bind(templateId)
		.all<Pick<FormTranslationRow, 'language' | 'text_key' | 'text'>>();

	const texts = Object.fromEntries(FORM_LANGUAGES.map((language) => [language, {}])) as TemplateTexts;
	for (const translation of results) {
		if (isFormLanguage(translation.language)) {
			texts[translation.language][translation.text_key] = translation.text;
		}
	}
	return texts;
}

function toTemplateDetail(
	row: TemplateQueryRow,
	structure: FormStructure | null,
	texts: TemplateTexts
): AdminTenantFormTemplateDetail {
	const baseKeys = Object.keys(texts[baseLanguageOf(row)]);
	const countsByLanguage = new Map(
		FORM_LANGUAGES.map((language) => [language, baseKeys.filter((key) => key in texts[language]).length])
	);
	const sections = structure?.sections ?? [];

	return {
		...toTemplateListItem(row, countsByLanguage),
		sections,
		textKeys: listTextKeys({ templateId: row.id, sections }),
		texts,
	};
}

function textOperationStatement(
	env: Env,
	templateId: string,
	operation: TextOperation,
	adminEmail: string,
	updatedAt: string
): D1PreparedStatement {
	switch (operation.kind) {
		case 'upsert':
			return env.portal_db
				.prepare(
					`INSERT INTO form_translations (template_id, language, text_key, text, updated_at, updated_by_email)
					 VALUES (?, ?, ?, ?, ?, ?)
					 ON CONFLICT (template_id, language, text_key)
					 DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at, updated_by_email = excluded.updated_by_email`
				)
				.bind(templateId, operation.language, operation.textKey, operation.text, updatedAt, adminEmail);
		case 'delete':
			return env.portal_db
				.prepare(`DELETE FROM form_translations WHERE template_id = ? AND language = ? AND text_key = ?`)
				.bind(templateId, operation.language, operation.textKey);
		case 'delete_all_languages':
			return env.portal_db
				.prepare(`DELETE FROM form_translations WHERE template_id = ? AND text_key = ?`)
				.bind(templateId, operation.textKey);
	}
}

function toTemplateListItem(row: TemplateQueryRow, countsByLanguage: Map<string, number>): AdminTenantFormTemplateListItem {
	const total = countsByLanguage.get(row.base_language) ?? 0;
	const languages: TenantFormLanguageReadiness[] = FORM_LANGUAGES.map((language) => ({
		language,
		translated: countsByLanguage.get(language) ?? 0,
		total,
	}));

	return {
		id: row.id,
		templateKey: row.template_key,
		version: row.version,
		status: row.status,
		baseLanguage: row.base_language,
		languages,
	};
}

function baseLanguageOf(row: TemplateQueryRow): FormLanguage {
	return isFormLanguage(row.base_language) ? row.base_language : 'en';
}
