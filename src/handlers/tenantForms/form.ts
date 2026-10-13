import type { RouteHandler } from '../../router/types';
import { toTenantFormSchema } from '../../mappers/tenantForms';
import { requireTenantFormAccess } from '../../middleware/requireTenantFormAccess';
import { BASE_LANGUAGE, isFormLanguage, loadFormStructure, loadFormTexts } from '../../utils/formSchema';
import { jsonResponse } from '../../utils/response';

export const handleGetTenantForm: RouteHandler = async ({ env, request }) => {
	const access = await requireTenantFormAccess(request, env);
	if (access instanceof Response) {
		return access;
	}

	const { invitation } = access;
	const language = isFormLanguage(invitation.language) ? invitation.language : BASE_LANGUAGE;
	const [structure, texts] = await Promise.all([
		loadFormStructure(env.portal_db, invitation.template_id),
		loadFormTexts(env.portal_db, invitation.template_id, language),
	]);

	if (!structure) {
		console.error('[tenant-forms] Template missing for invitation', invitation.id);
		return jsonResponse({ error: 'Form is not available' }, 500);
	}

	return jsonResponse(toTenantFormSchema(invitation, language, structure, texts));
};
