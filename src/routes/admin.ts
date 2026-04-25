import { get, post, put } from '../router/createRouter';
import type { Route } from '../router/types';
import { requireAdmin } from '../middleware/requireAdmin';
import { handleAdminGetOffers, handleAdminCreateOffer, handleAdminUpdateOffer } from '../handlers/admin/offers';
import { handleAdminGetAvailability, handleAdminUpdateAvailability } from '../handlers/admin/availability';
import { handleAdminGetLeads, handleAdminGetLead, handleAdminUpdateLead } from '../handlers/admin/leads';

// `requireAdmin()` is currently a pass-through stub — see middleware/requireAdmin.ts.
// Wiring it up here so real authentication only requires editing the middleware itself.
const guards = [requireAdmin()];

export const adminRoutes: Route[] = [
	get('/api/admin/offers', handleAdminGetOffers, guards),
	post('/api/admin/offers', handleAdminCreateOffer, guards),
	put('/api/admin/offers/:offerId', handleAdminUpdateOffer, guards),

	get('/api/admin/offers/:offerId/availability', handleAdminGetAvailability, guards),
	put('/api/admin/offers/:offerId/availability', handleAdminUpdateAvailability, guards),

	get('/api/admin/leads', handleAdminGetLeads, guards),
	get('/api/admin/leads/:leadId', handleAdminGetLead, guards),
	put('/api/admin/leads/:leadId', handleAdminUpdateLead, guards),
];
