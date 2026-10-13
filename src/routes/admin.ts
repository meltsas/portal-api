import { del, get, post, put } from '../router/createRouter';
import type { Route } from '../router/types';
import { requireAdmin } from '../middleware/requireAdmin';
import { handleAdminGetOffers, handleAdminCreateOffer, handleAdminUpdateOffer } from '../handlers/admin/offers';
import { handleAdminGetAvailability, handleAdminUpdateAvailability } from '../handlers/admin/availability';
import {
	handleAdminGetLeads,
	handleAdminGetLead,
	handleAdminCreateLead,
	handleAdminUpdateLead,
	handleAdminRemoveLead,
} from '../handlers/admin/leads';
import {
	handleAdminGetCustomers,
	handleAdminGetCustomer,
	handleAdminCreateCustomer,
	handleAdminUpdateCustomer,
} from '../handlers/admin/customers';
import {
	handleAdminGetBookings,
	handleAdminGetBooking,
	handleAdminCreateBooking,
	handleAdminUpdateBooking,
} from '../handlers/admin/bookings';
import {
	handleAdminCleanupExternalDataSnapshots,
	handleAdminGetExternalDataSnapshot,
	handleAdminGetExternalDataSnapshots,
	handleAdminGetExternalDataSource,
	handleAdminGetExternalDataSources,
	handleAdminRunExternalDataSource,
} from '../handlers/admin/externalData';
import {
	handleAdminGetTenantFormTemplate,
	handleAdminGetTenantFormTemplates,
	handleAdminUpdateTenantFormTranslations,
} from '../handlers/admin/tenantFormTemplates';
import {
	handleAdminCreateTenantFormInvitation,
	handleAdminGetTenantFormInvitation,
	handleAdminGetTenantFormInvitations,
	handleAdminRevokeTenantFormInvitation,
} from '../handlers/admin/tenantFormInvitations';
import {
	handleAdminGetTenantFormFile,
	handleAdminGetTenantFormSubmission,
	handleAdminGetTenantFormSubmissions,
	handleAdminReviewTenantFormSubmission,
} from '../handlers/admin/tenantFormSubmissions';

const guards = [requireAdmin()];

export const adminRoutes: Route[] = [
	get('/api/admin/offers', handleAdminGetOffers, guards),
	post('/api/admin/offers', handleAdminCreateOffer, guards),
	put('/api/admin/offers/:offerId', handleAdminUpdateOffer, guards),

	get('/api/admin/offers/:offerId/availability', handleAdminGetAvailability, guards),
	put('/api/admin/offers/:offerId/availability', handleAdminUpdateAvailability, guards),

	get('/api/admin/leads', handleAdminGetLeads, guards),
	post('/api/admin/leads', handleAdminCreateLead, guards),
	get('/api/admin/leads/:leadId', handleAdminGetLead, guards),
	put('/api/admin/leads/:leadId', handleAdminUpdateLead, guards),
	del('/api/admin/leads/:leadId', handleAdminRemoveLead, guards),

	get('/api/admin/customers', handleAdminGetCustomers, guards),
	post('/api/admin/customers', handleAdminCreateCustomer, guards),
	get('/api/admin/customers/:id', handleAdminGetCustomer, guards),
	put('/api/admin/customers/:id', handleAdminUpdateCustomer, guards),

	get('/api/admin/bookings', handleAdminGetBookings, guards),
	post('/api/admin/bookings', handleAdminCreateBooking, guards),
	get('/api/admin/bookings/:id', handleAdminGetBooking, guards),
	put('/api/admin/bookings/:id', handleAdminUpdateBooking, guards),

	get('/api/admin/external-data/sources', handleAdminGetExternalDataSources, guards),
	get('/api/admin/external-data/sources/:id', handleAdminGetExternalDataSource, guards),
	get('/api/admin/external-data/sources/:id/snapshots', handleAdminGetExternalDataSnapshots, guards),
	post('/api/admin/external-data/sources/:id/run', handleAdminRunExternalDataSource, guards),
	post('/api/admin/external-data/sources/:id/cleanup', handleAdminCleanupExternalDataSnapshots, guards),
	get('/api/admin/external-data/snapshots/:id', handleAdminGetExternalDataSnapshot, guards),

	get('/api/admin/tenant-forms/templates', handleAdminGetTenantFormTemplates, guards),
	get('/api/admin/tenant-forms/templates/:id', handleAdminGetTenantFormTemplate, guards),
	put('/api/admin/tenant-forms/templates/:id/translations', handleAdminUpdateTenantFormTranslations, guards),
	get('/api/admin/tenant-forms/invitations', handleAdminGetTenantFormInvitations, guards),
	post('/api/admin/tenant-forms/invitations', handleAdminCreateTenantFormInvitation, guards),
	get('/api/admin/tenant-forms/invitations/:id', handleAdminGetTenantFormInvitation, guards),
	post('/api/admin/tenant-forms/invitations/:id/revoke', handleAdminRevokeTenantFormInvitation, guards),
	get('/api/admin/tenant-forms/submissions', handleAdminGetTenantFormSubmissions, guards),
	get('/api/admin/tenant-forms/submissions/:id', handleAdminGetTenantFormSubmission, guards),
	put('/api/admin/tenant-forms/submissions/:id/review', handleAdminReviewTenantFormSubmission, guards),
	get('/api/admin/tenant-forms/files/:fileId', handleAdminGetTenantFormFile, guards),
];
