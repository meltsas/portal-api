import type {
	AdminTenantFormTemplateDetail,
	AdminTenantFormTemplateListItem,
	TenantFormLanguageReadiness,
	TenantFormTemplateStatus,
} from '../types/api';
import type { FormTemplateRow, FormTranslationRow } from '../types/db';
import { toISOTimestamp } from './date';
import { FORM_LANGUAGES, isFormLanguage, listTextKeys, loadFormStructure, type FormLanguage, type FormStructure } from './formSchema';
import { findStructureProblems, findTextProblems, type StructureProblem } from './formStructureEditing';
import type { TextOperation } from './formTextChanges';
import type { SqlCondition } from './tenantFormInvitations';

export type TemplateTexts = Record<FormLanguage, Record<string, string>>;

export interface TemplateUsage {
	invitations: number;
	submissions: number;
}

export const TEMPLATE_COLUMNS = `id, template_key, version, base_language, status, based_on_template_id, created_by_email,
	activated_at, activated_by_email, revision, created_at, updated_at`;

export function findTemplate(db: D1Database, id: string): Promise<FormTemplateRow | null> {
	return db.prepare(`SELECT ${TEMPLATE_COLUMNS} FROM form_templates WHERE id = ?`).bind(id).first<FormTemplateRow>();
}

/** Every supported language is present, possibly empty. */
export async function loadTemplateTexts(db: D1Database, templateId: string): Promise<TemplateTexts> {
	const { results } = await db
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

async function loadTemplateUsage(db: D1Database, templateId: string): Promise<TemplateUsage> {
	const [invitations, submissions] = await db.batch<{ count: number }>([
		db.prepare(`SELECT COUNT(*) AS count FROM form_invitations WHERE template_id = ?`).bind(templateId),
		db.prepare(`SELECT COUNT(*) AS count FROM form_submissions WHERE template_id = ?`).bind(templateId),
	]);
	return { invitations: invitations.results[0]?.count ?? 0, submissions: submissions.results[0]?.count ?? 0 };
}

export async function loadTemplateDetail(db: D1Database, row: FormTemplateRow): Promise<AdminTenantFormTemplateDetail> {
	const [structure, texts, usage] = await Promise.all([
		loadFormStructure(db, row.id),
		loadTemplateTexts(db, row.id),
		loadTemplateUsage(db, row.id),
	]);
	const problems = row.status === 'draft' ? await findPublishProblems(db, row, structure, texts) : [];
	return toTemplateDetail(row, structure, texts, usage, problems);
}

/** Everything that blocks activating the version, compared with the version it was copied from. */
export async function findPublishProblems(
	db: D1Database,
	row: FormTemplateRow,
	structure: FormStructure | null,
	texts: TemplateTexts
): Promise<StructureProblem[]> {
	const current = structure ?? { templateId: row.id, sections: [] };
	const base = row.based_on_template_id ? await loadFormStructure(db, row.based_on_template_id) : null;
	return [...findStructureProblems(current, base ?? current), ...findTextProblems(current, texts)];
}

export function toTemplateDetail(
	row: FormTemplateRow,
	structure: FormStructure | null,
	texts: TemplateTexts,
	usage: TemplateUsage,
	problems: StructureProblem[]
): AdminTenantFormTemplateDetail {
	const baseKeys = Object.keys(texts[baseLanguageOf(row)]);
	const countsByLanguage = new Map(
		FORM_LANGUAGES.map((language) => [language, baseKeys.filter((key) => key in texts[language]).length])
	);
	const sections = structure?.sections ?? [];

	return {
		...toTemplateListItem(row, countsByLanguage, usage),
		sections,
		textKeys: listTextKeys({ templateId: row.id, sections }),
		texts,
		problems,
	};
}

export function toTemplateListItem(
	row: FormTemplateRow,
	countsByLanguage: Map<string, number>,
	usage: TemplateUsage
): AdminTenantFormTemplateListItem {
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
		status: row.status as TenantFormTemplateStatus,
		baseLanguage: row.base_language,
		languages,
		basedOnTemplateId: row.based_on_template_id,
		createdByEmail: row.created_by_email,
		activatedAt: row.activated_at,
		activatedByEmail: row.activated_by_email,
		revision: row.revision,
		invitationCount: usage.invitations,
		submissionCount: usage.submissions,
		createdAt: toISOTimestamp(row.created_at),
		updatedAt: toISOTimestamp(row.updated_at),
	};
}

function baseLanguageOf(row: FormTemplateRow): FormLanguage {
	return isFormLanguage(row.base_language) ? row.base_language : 'en';
}

/**
 * At most three statements for any number of text operations, each with one JSON parameter. D1 counts
 * queries per Worker invocation (50 on Workers Free), so one statement per text would not scale.
 * With `onlyIf`, nothing is written unless the condition holds when the statement runs.
 */
export function textOperationStatements(
	db: D1Database,
	templateId: string,
	operations: TextOperation[],
	adminEmail: string,
	updatedAt: string,
	onlyIf?: SqlCondition
): D1PreparedStatement[] {
	const guardSql = onlyIf ? `AND ${onlyIf.sql}` : '';
	const guardBindings = onlyIf?.bindings ?? [];
	const statements: D1PreparedStatement[] = [];

	const deletedEverywhere: string[] = [];
	const deleted: { language: string; textKey: string }[] = [];
	const upserted: { language: string; textKey: string; text: string }[] = [];
	for (const operation of operations) {
		if (operation.kind === 'delete_all_languages') deletedEverywhere.push(operation.textKey);
		else if (operation.kind === 'delete') deleted.push({ language: operation.language, textKey: operation.textKey });
		else upserted.push({ language: operation.language, textKey: operation.textKey, text: operation.text });
	}

	if (deletedEverywhere.length > 0) {
		statements.push(
			db
				.prepare(
					`DELETE FROM form_translations
					 WHERE template_id = ? AND text_key IN (SELECT value FROM json_each(?)) ${guardSql}`
				)
				.bind(templateId, JSON.stringify(deletedEverywhere), ...guardBindings)
		);
	}
	if (deleted.length > 0) {
		statements.push(
			db
				.prepare(
					`DELETE FROM form_translations
					 WHERE template_id = ?
					   AND EXISTS (SELECT 1 FROM json_each(?) AS change
					               WHERE json_extract(change.value, '$.language') = form_translations.language
					                 AND json_extract(change.value, '$.textKey') = form_translations.text_key)
					   ${guardSql}`
				)
				.bind(templateId, JSON.stringify(deleted), ...guardBindings)
		);
	}
	if (upserted.length > 0) {
		// SQLite needs a WHERE clause in an INSERT … SELECT with ON CONFLICT, hence `WHERE true`.
		statements.push(
			db
				.prepare(
					`INSERT INTO form_translations (template_id, language, text_key, text, updated_at, updated_by_email)
					 SELECT ?, json_extract(value, '$.language'), json_extract(value, '$.textKey'), json_extract(value, '$.text'), ?, ?
					 FROM json_each(?)
					 WHERE true ${guardSql}
					 ON CONFLICT (template_id, language, text_key)
					 DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at, updated_by_email = excluded.updated_by_email`
				)
				.bind(templateId, updatedAt, adminEmail, JSON.stringify(upserted), ...guardBindings)
		);
	}
	return statements;
}
