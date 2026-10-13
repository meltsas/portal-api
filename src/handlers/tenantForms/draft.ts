import type { RouteHandler } from '../../router/types';
import type { TenantFormDraftResponse, TenantFormValuesPayload } from '../../types/api';
import { requireTenantFormAccess } from '../../middleware/requireTenantFormAccess';
import { toIsoSeconds, todayIsoDate } from '../../utils/date';
import { loadFormStructure, validateFormValues } from '../../utils/formSchema';
import { jsonResponse, parseJsonBodyWithLimit } from '../../utils/response';

const MAX_DRAFT_BODY_BYTES = 100_000;

/** Saves unfinished answers (replacing the previous draft) so the tenant can continue later. */
export const handleSaveTenantFormDraft: RouteHandler = async ({ env, request }) => {
	const access = await requireTenantFormAccess(request, env);
	if (access instanceof Response) {
		return access;
	}
	const { invitation } = access;

	const parsed = await parseJsonBodyWithLimit<TenantFormValuesPayload>(request, MAX_DRAFT_BODY_BYTES);
	if (parsed instanceof Response) {
		return parsed;
	}

	const structure = await loadFormStructure(env.portal_db, invitation.template_id);
	if (!structure) {
		return jsonResponse({ error: 'Form is not available' }, 500);
	}

	const result = validateFormValues(structure, parsed.body?.values, todayIsoDate(), 'draft');
	if (!result.ok) {
		return jsonResponse({ error: 'Invalid form values', errors: result.errors }, 400);
	}

	const savedAt = toIsoSeconds(new Date());
	await env.portal_db
		.prepare(
			`INSERT INTO form_drafts (invitation_id, values_json, updated_at) VALUES (?, ?, ?)
			 ON CONFLICT (invitation_id) DO UPDATE SET values_json = excluded.values_json, updated_at = excluded.updated_at`
		)
		.bind(invitation.id, JSON.stringify(result.values), savedAt)
		.run();

	const response: TenantFormDraftResponse = { savedAt };
	return jsonResponse(response);
};
