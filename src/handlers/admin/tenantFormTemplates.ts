import type { RouteHandler } from '../../router/types';
import type {
	AdminTenantFormTemplateDetail,
	AdminTenantFormTemplateListItem,
	TenantFormLanguageReadiness,
} from '../../types/api';
import type { FormTemplateRow, FormTranslationRow } from '../../types/db';
import { FORM_LANGUAGES, isFormLanguage, listTextKeys, loadFormStructure, type FormLanguage } from '../../utils/formSchema';
import { jsonResponse, notFound } from '../../utils/response';

type TemplateQueryRow = Omit<FormTemplateRow, 'created_at' | 'updated_at'>;

interface TranslatedCountRow {
	template_id: string;
	language: string;
	translated: number;
}

const TEMPLATE_COLUMNS = `id, template_key, version, base_language, status`;

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
	const row = await env.portal_db
		.prepare(`SELECT ${TEMPLATE_COLUMNS} FROM form_templates WHERE id = ?`)
		.bind(params.id)
		.first<TemplateQueryRow>();
	if (!row) {
		return notFound();
	}

	const [structure, translations] = await Promise.all([
		loadFormStructure(env.portal_db, row.id),
		env.portal_db
			.prepare(`SELECT language, text_key, text FROM form_translations WHERE template_id = ?`)
			.bind(row.id)
			.all<Pick<FormTranslationRow, 'language' | 'text_key' | 'text'>>(),
	]);

	const texts = Object.fromEntries(FORM_LANGUAGES.map((language) => [language, {}])) as Record<
		FormLanguage,
		Record<string, string>
	>;
	for (const translation of translations.results) {
		if (isFormLanguage(translation.language)) {
			texts[translation.language][translation.text_key] = translation.text;
		}
	}

	const baseKeys = Object.keys(texts[baseLanguageOf(row)]);
	const countsByLanguage = new Map(
		FORM_LANGUAGES.map((language) => [language, baseKeys.filter((key) => key in texts[language]).length])
	);
	const sections = structure?.sections ?? [];

	const detail: AdminTenantFormTemplateDetail = {
		...toTemplateListItem(row, countsByLanguage),
		sections,
		textKeys: listTextKeys({ templateId: row.id, sections }),
		texts,
	};
	return jsonResponse(detail);
};

// --- Helpers ---

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
