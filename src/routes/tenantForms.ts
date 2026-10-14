import { del, get, post, put } from '../router/createRouter';
import type { Route } from '../router/types';
import { handleResolveTenantFormInvitation } from '../handlers/tenantForms/resolve';
import { handleTenantFormGoogleAuth } from '../handlers/tenantForms/auth';
import { handleGetTenantForm } from '../handlers/tenantForms/form';
import { handleDeleteTenantFormFile, handleUploadTenantFormFile } from '../handlers/tenantForms/files';
import { handleSaveTenantFormDraft } from '../handlers/tenantForms/draft';
import { handleSubmitTenantForm } from '../handlers/tenantForms/submit';
import { limitTenantFormClientIp } from '../middleware/rateLimit';

// Public tenant form routes. Handlers past auth/google call requireTenantFormAccess() first,
// which also applies the per-invitation rate limit.
export const tenantFormRoutes: Route[] = [
	post('/api/tenant-forms/invitations/resolve', handleResolveTenantFormInvitation, [limitTenantFormClientIp()]),
	post('/api/tenant-forms/auth/google', handleTenantFormGoogleAuth, [limitTenantFormClientIp()]),
	get('/api/tenant-forms/form', handleGetTenantForm),
	post('/api/tenant-forms/files', handleUploadTenantFormFile),
	del('/api/tenant-forms/files/:fileId', handleDeleteTenantFormFile),
	put('/api/tenant-forms/draft', handleSaveTenantFormDraft),
	post('/api/tenant-forms/submit', handleSubmitTenantForm),
];
