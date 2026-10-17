import type { RouteHandler } from '../../router/types';
import type {
	ActivateTenantFormTemplatePayload,
	DeleteTenantFormTemplateResponse,
	SaveTenantFormStructurePayload,
} from '../../types/api';
import type { FormTemplateRow } from '../../types/db';
import { requireAuth } from '../../middleware/requireAuth';
import { toIsoSeconds } from '../../utils/date';
import { listTextKeys, loadFormStructure, type FormStructure } from '../../utils/formSchema';
import { buildStructureRows, parseStructureInput } from '../../utils/formStructureEditing';
import { validateTextChanges, type StoredTexts, type TextOperation } from '../../utils/formTextChanges';
import { badRequest, jsonResponse, notFound, parseJsonBodyWithLimit } from '../../utils/response';
import type { SqlCondition } from '../../utils/tenantFormInvitations';
import {
	findPublishProblems,
	findTemplate,
	loadTemplateDetail,
	loadTemplateTexts,
	textOperationStatements,
} from '../../utils/tenantFormTemplates';

const MAX_STRUCTURE_BODY_BYTES = 200_000;
const MAX_ACTIVATE_BODY_BYTES = 1_000;
const DRAFT_EXISTS_MESSAGE = 'A draft of this form already exists';

/**
 * Copies a version into a new draft: the structure and every text. Structure changes are only made in a
 * draft, because invitations and submissions keep reading the version they were created with.
 */
export const handleAdminCreateTenantFormVersion: RouteHandler = async ({ env, request, params }) => {
	const admin = await requireAuth(request, env);
	if (!admin) {
		return jsonResponse({ error: 'Unauthorized' }, 401);
	}

	const db = env.portal_db;
	const source = await findTemplate(db, params.id);
	if (!source) {
		return notFound();
	}
	if (source.status === 'draft') {
		return jsonResponse({ error: 'A draft can not be copied' }, 409);
	}

	const latest = await db
		.prepare(`SELECT MAX(version) AS version, SUM(status = 'draft') AS drafts FROM form_templates WHERE template_key = ?`)
		.bind(source.template_key)
		.first<{ version: number; drafts: number | null }>();
	if (latest?.drafts) {
		return jsonResponse({ error: DRAFT_EXISTS_MESSAGE }, 409);
	}

	const version = (latest?.version ?? source.version) + 1;
	const id = `${source.template_key}_v${version}`;
	try {
		await db.batch(copyTemplateStatements(db, source, id, version, admin.email));
	} catch (error) {
		// Another admin created the same version at the same moment.
		if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
			return jsonResponse({ error: DRAFT_EXISTS_MESSAGE }, 409);
		}
		throw error;
	}

	const draft = await findTemplate(db, id);
	return jsonResponse(await loadTemplateDetail(db, draft!), 201);
};

/**
 * Replaces the structure of a draft. A structure that can not be stored is rejected (400); one that only
 * can not be published yet is saved and its problems are returned with the detail.
 */
export const handleAdminSaveTenantFormStructure: RouteHandler = async ({ env, request, params }) => {
	const admin = await requireAuth(request, env);
	if (!admin) {
		return jsonResponse({ error: 'Unauthorized' }, 401);
	}

	const db = env.portal_db;
	const row = await findTemplate(db, params.id);
	if (!row) {
		return notFound();
	}

	const parsed = await parseJsonBodyWithLimit<SaveTenantFormStructurePayload>(request, MAX_STRUCTURE_BODY_BYTES);
	if (parsed instanceof Response) {
		return parsed;
	}
	const body = parsed.body;
	if (typeof body?.revision !== 'number') {
		return badRequest('revision is required');
	}
	if (row.status !== 'draft') {
		return jsonResponse({ error: 'Only a draft can be changed' }, 409);
	}
	if (body.revision !== row.revision) {
		return changedMeanwhileResponse();
	}

	const structureResult = parseStructureInput(body.sections);
	if (!structureResult.ok) {
		return jsonResponse({ error: 'Invalid structure', errors: structureResult.errors }, 400);
	}
	const structure: FormStructure = { templateId: row.id, sections: structureResult.sections };

	// Texts of removed sections, fields and options go in every language.
	const storedTexts = await loadTemplateTexts(db, row.id);
	const knownKeys = new Set(listTextKeys(structure).map((spec) => spec.key));
	const removedKeys = [...new Set(Object.values(storedTexts).flatMap((texts) => Object.keys(texts)))].filter(
		(textKey) => !knownKeys.has(textKey)
	);
	const operations: TextOperation[] = removedKeys.map((textKey) => ({ kind: 'delete_all_languages', textKey }));

	const hasTexts = body.texts !== undefined && !(Array.isArray(body.texts) && body.texts.length === 0);
	if (hasTexts) {
		const textResult = validateTextChanges(structure, withoutKeys(storedTexts, removedKeys), body.texts);
		if (!textResult.ok) {
			return jsonResponse({ error: 'Invalid text changes', errors: textResult.errors }, 400);
		}
		operations.push(...textResult.operations);
	}

	// Every write needs the draft to be unchanged since it was read, so two admins never mix their saves.
	const unchanged: SqlCondition = {
		sql: "EXISTS (SELECT 1 FROM form_templates WHERE id = ? AND status = 'draft' AND revision = ?)",
		bindings: [row.id, row.revision],
	};
	const results = await db.batch([
		...replaceStructureStatements(db, structure, unchanged),
		...textOperationStatements(db, row.id, operations, admin.email, toIsoSeconds(new Date()), unchanged),
		db
			.prepare(
				`UPDATE form_templates SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP
				 WHERE id = ? AND status = 'draft' AND revision = ?`
			)
			.bind(row.id, row.revision),
	]);
	if (results[results.length - 1].meta.changes !== 1) {
		return changedMeanwhileResponse();
	}

	return jsonResponse(await loadTemplateDetail(db, (await findTemplate(db, row.id))!));
};

/**
 * Makes a draft or an archived version the active one; the previously active version is archived.
 * New invitations use the active version, links already sent stay on their own version.
 */
export const handleAdminActivateTenantFormTemplate: RouteHandler = async ({ env, request, params }) => {
	const admin = await requireAuth(request, env);
	if (!admin) {
		return jsonResponse({ error: 'Unauthorized' }, 401);
	}

	const db = env.portal_db;
	const row = await findTemplate(db, params.id);
	if (!row) {
		return notFound();
	}

	const parsed = await parseJsonBodyWithLimit<ActivateTenantFormTemplatePayload>(request, MAX_ACTIVATE_BODY_BYTES);
	if (parsed instanceof Response) {
		return parsed;
	}
	if (typeof parsed.body?.revision !== 'number') {
		return badRequest('revision is required');
	}
	if (row.status === 'active') {
		return jsonResponse({ error: 'Template is already active' }, 409);
	}
	if (parsed.body.revision !== row.revision) {
		return changedMeanwhileResponse();
	}

	// Also when restoring an archived version: the system fields in code may have changed since.
	const [structure, texts] = await Promise.all([loadFormStructure(db, row.id), loadTemplateTexts(db, row.id)]);
	const problems = await findPublishProblems(db, row, structure, texts);
	if (problems.length > 0) {
		return jsonResponse({ error: 'Template has problems', problems }, 400);
	}

	// Both writes check the same state, so there is always exactly one active version.
	const unchanged: SqlCondition = {
		sql: 'EXISTS (SELECT 1 FROM form_templates WHERE id = ? AND status = ? AND revision = ?)',
		bindings: [row.id, row.status, row.revision],
	};
	const results = await db.batch([
		db
			.prepare(
				`UPDATE form_templates SET status = 'archived', updated_at = CURRENT_TIMESTAMP
				 WHERE template_key = ? AND status = 'active' AND ${unchanged.sql}`
			)
			.bind(row.template_key, ...unchanged.bindings),
		db
			.prepare(
				`UPDATE form_templates
				 SET status = 'active', activated_at = ?, activated_by_email = ?, revision = revision + 1,
				     updated_at = CURRENT_TIMESTAMP
				 WHERE id = ? AND status = ? AND revision = ?`
			)
			.bind(toIsoSeconds(new Date()), admin.email, row.id, row.status, row.revision),
	]);
	if (results[1].meta.changes !== 1) {
		return changedMeanwhileResponse();
	}

	return jsonResponse(await loadTemplateDetail(db, (await findTemplate(db, row.id))!));
};

/** Only a draft can be deleted: invitations and submissions refer to every other version. */
export const handleAdminDeleteTenantFormTemplate: RouteHandler = async ({ env, params }) => {
	const db = env.portal_db;
	const row = await findTemplate(db, params.id);
	if (!row) {
		return notFound();
	}
	if (row.status !== 'draft') {
		return jsonResponse({ error: 'Only a draft can be deleted' }, 409);
	}

	const stillDraft = "AND EXISTS (SELECT 1 FROM form_templates WHERE id = ? AND status = 'draft')";
	const results = await db.batch([
		db.prepare(`DELETE FROM form_translations WHERE template_id = ? ${stillDraft}`).bind(row.id, row.id),
		db
			.prepare(`DELETE FROM form_field_options WHERE field_id IN (SELECT id FROM form_fields WHERE template_id = ?) ${stillDraft}`)
			.bind(row.id, row.id),
		db.prepare(`DELETE FROM form_fields WHERE template_id = ? ${stillDraft}`).bind(row.id, row.id),
		db.prepare(`DELETE FROM form_sections WHERE template_id = ? ${stillDraft}`).bind(row.id, row.id),
		db.prepare(`DELETE FROM form_templates WHERE id = ? AND status = 'draft'`).bind(row.id),
	]);
	if (results[results.length - 1].meta.changes !== 1) {
		return changedMeanwhileResponse();
	}

	const response: DeleteTenantFormTemplateResponse = { id: row.id, deleted: true };
	return jsonResponse(response);
};

// --- Helpers ---

function changedMeanwhileResponse(): Response {
	return jsonResponse({ error: 'The form was changed meanwhile, reload it' }, 409);
}

/**
 * The copy builds row ids from keys exactly like buildStructureRows(), so later saves of the draft keep
 * them. A few INSERT … SELECT statements instead of one per row: D1 counts queries per Worker invocation.
 */
function copyTemplateStatements(
	db: D1Database,
	source: FormTemplateRow,
	id: string,
	version: number,
	createdBy: string
): D1PreparedStatement[] {
	const newFieldId = `?1 || ':f:' || CASE WHEN p.field_key IS NULL THEN f.field_key ELSE p.field_key || '.' || f.field_key END`;
	return [
		db
			.prepare(
				`INSERT INTO form_templates (id, template_key, version, base_language, status, based_on_template_id, created_by_email)
				 VALUES (?, ?, ?, ?, 'draft', ?, ?)`
			)
			.bind(id, source.template_key, version, source.base_language, source.id, createdBy),
		db
			.prepare(
				`INSERT INTO form_sections (id, template_id, section_key, sort_order)
				 SELECT ?1 || ':s:' || section_key, ?1, section_key, sort_order FROM form_sections WHERE template_id = ?2`
			)
			.bind(id, source.id),
		db
			.prepare(
				`INSERT INTO form_fields
				 (id, template_id, section_id, parent_field_id, field_key, field_type, is_required, sort_order, validation_json, visible_if_json)
				 SELECT ${newFieldId}, ?1, ?1 || ':s:' || s.section_key,
				        CASE WHEN p.field_key IS NULL THEN NULL ELSE ?1 || ':f:' || p.field_key END,
				        f.field_key, f.field_type, f.is_required, f.sort_order, f.validation_json, f.visible_if_json
				 FROM form_fields f
				 JOIN form_sections s ON s.id = f.section_id
				 LEFT JOIN form_fields p ON p.id = f.parent_field_id
				 WHERE f.template_id = ?2
				 ORDER BY f.parent_field_id IS NOT NULL, f.sort_order`
			)
			.bind(id, source.id),
		db
			.prepare(
				`INSERT INTO form_field_options (id, field_id, option_key, sort_order, allows_free_text)
				 SELECT ${newFieldId} || ':o:' || o.option_key, ${newFieldId}, o.option_key, o.sort_order, o.allows_free_text
				 FROM form_field_options o
				 JOIN form_fields f ON f.id = o.field_id
				 LEFT JOIN form_fields p ON p.id = f.parent_field_id
				 WHERE f.template_id = ?2`
			)
			.bind(id, source.id),
		db
			.prepare(
				`INSERT INTO form_translations (template_id, language, text_key, text, updated_at, updated_by_email)
				 SELECT ?1, language, text_key, text, updated_at, updated_by_email FROM form_translations WHERE template_id = ?2`
			)
			.bind(id, source.id),
	];
}

/** Deletes the draft's rows and inserts the new ones, one statement per table with the rows as one JSON parameter. */
function replaceStructureStatements(db: D1Database, structure: FormStructure, unchanged: SqlCondition): D1PreparedStatement[] {
	const templateId = structure.templateId;
	const rows = buildStructureRows(templateId, structure.sections);
	const guarded = (sql: string, ...bindings: unknown[]) =>
		db.prepare(`${sql} AND ${unchanged.sql}`).bind(...bindings, ...unchanged.bindings);

	return [
		guarded(`DELETE FROM form_field_options WHERE field_id IN (SELECT id FROM form_fields WHERE template_id = ?)`, templateId),
		guarded(`DELETE FROM form_fields WHERE template_id = ?`, templateId),
		guarded(`DELETE FROM form_sections WHERE template_id = ?`, templateId),
		guarded(
			`INSERT INTO form_sections (id, template_id, section_key, sort_order)
			 SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.key'), json_extract(value, '$.sortOrder')
			 FROM json_each(?) WHERE true`,
			templateId,
			JSON.stringify(rows.sections)
		),
		guarded(
			`INSERT INTO form_fields
			 (id, template_id, section_id, parent_field_id, field_key, field_type, is_required, sort_order, validation_json, visible_if_json)
			 SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.sectionId'), json_extract(value, '$.parentId'),
			        json_extract(value, '$.key'), json_extract(value, '$.type'), json_extract(value, '$.required'),
			        json_extract(value, '$.sortOrder'), json_extract(value, '$.validation'), json_extract(value, '$.visibleIf')
			 FROM json_each(?) WHERE true`,
			templateId,
			JSON.stringify(rows.fields)
		),
		guarded(
			`INSERT INTO form_field_options (id, field_id, option_key, sort_order, allows_free_text)
			 SELECT json_extract(value, '$.id'), json_extract(value, '$.fieldId'), json_extract(value, '$.key'),
			        json_extract(value, '$.sortOrder'), json_extract(value, '$.allowsFreeText')
			 FROM json_each(?) WHERE true`,
			JSON.stringify(rows.options)
		),
	];
}

function withoutKeys(texts: StoredTexts, textKeys: string[]): StoredTexts {
	const removed = new Set(textKeys);
	return Object.fromEntries(
		Object.entries(texts).map(([language, byKey]) => [
			language,
			Object.fromEntries(Object.entries(byKey ?? {}).filter(([textKey]) => !removed.has(textKey))),
		])
	);
}
