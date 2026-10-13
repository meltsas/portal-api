import { get, post } from '../router/createRouter';
import type { Route } from '../router/types';
import { handleResolveTenantFormInvitation } from '../handlers/tenantForms/resolve';
import { handleTenantFormGoogleAuth } from '../handlers/tenantForms/auth';
import { handleGetTenantForm } from '../handlers/tenantForms/form';

// Public tenant form routes. Handlers past auth/google call requireTenantFormAccess() first.
export const tenantFormRoutes: Route[] = [
	post('/api/tenant-forms/invitations/resolve', handleResolveTenantFormInvitation),
	post('/api/tenant-forms/auth/google', handleTenantFormGoogleAuth),
	get('/api/tenant-forms/form', handleGetTenantForm),
];
