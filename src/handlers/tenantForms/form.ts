import type { RouteHandler } from '../../router/types';
import type { FormDraftRow } from '../../types/db';
import { toTenantFormSchema } from '../../mappers/tenantForms';
import { requireTenantFormAccess } from '../../middleware/requireTenantFormAccess';
import { BASE_LANGUAGE, isFormLanguage, loadFormStructure, loadFormTexts } from '../../utils/formSchema';
import { jsonResponse } from '../../utils/response';
import { listUploadedFiles } from '../../utils/tenantFormFiles';

export const handleGetTenantForm: RouteHandler = async ({ env, request }) => {
	const access = await requireTenantFormAccess(request, env);
	if (access instanceof Response) {
		return access;
	}

	const { invitation } = access;
	const language = isFormLanguage(invitation.language) ? invitation.language : BASE_LANGUAGE;
	const [structure, texts, draft, uploadedFiles] = await Promise.all([
		loadFormStructure(env.portal_db, invitation.template_id),
		loadFormTexts(env.portal_db, invitation.template_id, language),
		env.portal_db
			.prepare(`SELECT invitation_id, values_json, updated_at FROM form_drafts WHERE invitation_id = ?`)
			.bind(invitation.id)
			.first<FormDraftRow>(),
		listUploadedFiles(env.portal_db, invitation.id),
	]);

	if (!structure) {
		console.error('[tenant-forms] Template missing for invitation', invitation.id);
		return jsonResponse({ error: 'Form is not available' }, 500);
	}

	return jsonResponse(toTenantFormSchema(invitation, language, structure, texts, { draft, uploadedFiles }));
};
