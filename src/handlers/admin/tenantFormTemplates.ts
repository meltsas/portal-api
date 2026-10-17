import type { RouteHandler } from '../../router/types';
import type { AdminTenantFormTemplateListItem, UpdateTenantFormTranslationsPayload } from '../../types/api';
import type { FormTemplateRow } from '../../types/db';
import { requireAuth } from '../../middleware/requireAuth';
import { toIsoSeconds } from '../../utils/date';
import { listTextKeys, loadFormStructure } from '../../utils/formSchema';
import {
	propagateTextOperations,
	validateTextChanges,
	type StoredTexts,
	type TextOperation,
} from '../../utils/formTextChanges';
import { jsonResponse, notFound, parseJsonBodyWithLimit } from '../../utils/response';
import {
	findTemplate,
	loadTemplateDetail,
	loadTemplateTexts,
	TEMPLATE_COLUMNS,
	textOperationStatements,
	toTemplateListItem,
} from '../../utils/tenantFormTemplates';

interface TranslatedCountRow {
	template_id: string;
	language: string;
	translated: number;
}

interface UsageCountRow {
	template_id: string;
	count: number;
}

const MAX_TRANSLATIONS_BODY_BYTES = 1_000_000;

export const handleAdminGetTenantFormTemplates: RouteHandler = async ({ env }) => {
	const [templates, counts, invitations, submissions] = await env.portal_db.batch<Record<string, unknown>>([
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
		env.portal_db.prepare(`SELECT template_id, COUNT(*) AS count FROM form_invitations GROUP BY template_id`),
		env.portal_db.prepare(`SELECT template_id, COUNT(*) AS count FROM form_submissions GROUP BY template_id`),
	]);

	const countRows = counts.results as unknown as TranslatedCountRow[];
	const invitationCounts = countsByTemplate(invitations.results as unknown as UsageCountRow[]);
	const submissionCounts = countsByTemplate(submissions.results as unknown as UsageCountRow[]);
	const data: AdminTenantFormTemplateListItem[] = (templates.results as unknown as FormTemplateRow[]).map((row) => {
		const countsByLanguage = new Map(
			countRows.filter((count) => count.template_id === row.id).map((count) => [count.language, count.translated])
		);
		return toTemplateListItem(row, countsByLanguage, {
			invitations: invitationCounts.get(row.id) ?? 0,
			submissions: submissionCounts.get(row.id) ?? 0,
		});
	});

	return jsonResponse({ data });
};

export const handleAdminGetTenantFormTemplate: RouteHandler = async ({ env, params }) => {
	const row = await findTemplate(env.portal_db, params.id);
	if (!row) {
		return notFound();
	}
	return jsonResponse(await loadTemplateDetail(env.portal_db, row));
};

/**
 * Edits texts of existing keys and adds or removes translations; never changes the structure.
 * The whole batch is validated first and written in one D1 batch, or rejected as a whole.
 * Edits of the active version also reach its draft where the draft still has the old text.
 */
export const handleAdminUpdateTenantFormTranslations: RouteHandler = async ({ env, request, params }) => {
	const admin = await requireAuth(request, env);
	if (!admin) {
		return jsonResponse({ error: 'Unauthorized' }, 401);
	}

	const row = await findTemplate(env.portal_db, params.id);
	if (!row) {
		return notFound();
	}

	const parsed = await parseJsonBodyWithLimit<UpdateTenantFormTranslationsPayload>(request, MAX_TRANSLATIONS_BODY_BYTES);
	if (parsed instanceof Response) {
		return parsed;
	}

	const [structure, storedTexts] = await Promise.all([
		loadFormStructure(env.portal_db, row.id),
		loadTemplateTexts(env.portal_db, row.id),
	]);
	const result = validateTextChanges(structure ?? { templateId: row.id, sections: [] }, storedTexts, parsed.body?.changes);
	if (!result.ok) {
		return jsonResponse({ error: 'Invalid text changes', errors: result.errors }, 400);
	}

	if (result.operations.length > 0) {
		const updatedAt = toIsoSeconds(new Date());
		await env.portal_db.batch([
			...textOperationStatements(env.portal_db, row.id, result.operations, admin.email, updatedAt),
			...(await draftFollowUpStatements(env.portal_db, row, storedTexts, result.operations, admin.email, updatedAt)),
		]);
	}

	return jsonResponse(await loadTemplateDetail(env.portal_db, row));
};

// --- Helpers ---

function countsByTemplate(rows: UsageCountRow[]): Map<string, number> {
	return new Map(rows.map((row) => [row.template_id, row.count]));
}

/** So a typo fixed in the active version is not brought back when its draft is published. */
async function draftFollowUpStatements(
	db: D1Database,
	row: FormTemplateRow,
	activeTexts: StoredTexts,
	operations: TextOperation[],
	adminEmail: string,
	updatedAt: string
): Promise<D1PreparedStatement[]> {
	if (row.status !== 'active') return [];
	const draft = await db
		.prepare(`SELECT id FROM form_templates WHERE template_key = ? AND status = 'draft'`)
		.bind(row.template_key)
		.first<{ id: string }>();
	if (!draft) return [];

	const [draftStructure, draftTexts] = await Promise.all([loadFormStructure(db, draft.id), loadTemplateTexts(db, draft.id)]);
	const draftKeySpecs = listTextKeys(draftStructure ?? { templateId: draft.id, sections: [] });
	const propagated = propagateTextOperations(operations, activeTexts, draftTexts, draftKeySpecs);
	return textOperationStatements(db, draft.id, propagated, adminEmail, updatedAt);
}
