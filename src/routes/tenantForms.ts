import { del, get, post, put } from '../router/createRouter';
import type { Route } from '../router/types';
import { handleResolveTenantFormInvitation } from '../handlers/tenantForms/resolve';
import { handleTenantFormGoogleAuth } from '../handlers/tenantForms/auth';
import { handleGetTenantForm } from '../handlers/tenantForms/form';
import { handleDeleteTenantFormFile, handleUploadTenantFormFile } from '../handlers/tenantForms/files';
import { handleSaveTenantFormDraft } from '../handlers/tenantForms/draft';
import { handleSubmitTenantForm } from '../handlers/tenantForms/submit';

// Public tenant form routes. Handlers past auth/google call requireTenantFormAccess() first.
export const tenantFormRoutes: Route[] = [
	post('/api/tenant-forms/invitations/resolve', handleResolveTenantFormInvitation),
	post('/api/tenant-forms/auth/google', handleTenantFormGoogleAuth),
	get('/api/tenant-forms/form', handleGetTenantForm),
	post('/api/tenant-forms/files', handleUploadTenantFormFile),
	del('/api/tenant-forms/files/:fileId', handleDeleteTenantFormFile),
	put('/api/tenant-forms/draft', handleSaveTenantFormDraft),
	post('/api/tenant-forms/submit', handleSubmitTenantForm),
];
