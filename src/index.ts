import { handleHealth } from './routes/health';
import { handleGetOffers, handleGetOfferBySlug } from './routes/offers';
import { handleSubmitLead } from './routes/leads';
import { handleAdminGetOffers, handleAdminCreateOffer, handleAdminUpdateOffer } from './routes/admin/offers';
import { handleAdminGetAvailability, handleAdminUpdateAvailability } from './routes/admin/availability';
import { handleAdminGetLeads, handleAdminGetLead, handleAdminUpdateLead } from './routes/admin/leads';
import { methodNotAllowed, notFound } from './utils/response';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
		const method = request.method;

		// --- Public endpoints ---

		if (path === '/api/health') {
			if (method !== 'GET') return methodNotAllowed();
			return handleHealth();
		}

		if (path === '/api/offers') {
			if (method !== 'GET') return methodNotAllowed();
			return handleGetOffers(env);
		}

		if (path.startsWith('/api/offers/')) {
			const slug = path.slice('/api/offers/'.length);
			if (!slug || slug.includes('/')) return notFound();
			if (method !== 'GET') return methodNotAllowed();
			return handleGetOfferBySlug(env, slug);
		}

		if (path === '/api/leads') {
			if (method !== 'POST') return methodNotAllowed();
			return handleSubmitLead(env, request);
		}

		// --- Admin endpoints (auth will be added here later) ---

		if (path === '/api/admin/offers') {
			if (method === 'GET') return handleAdminGetOffers(env, url);
			if (method === 'POST') return handleAdminCreateOffer(env, request);
			return methodNotAllowed();
		}

		if (path === '/api/admin/leads') {
			if (method !== 'GET') return methodNotAllowed();
			return handleAdminGetLeads(env, url);
		}

		// Admin routes with path parameters — match most specific paths first

		const adminOfferAvailabilityMatch = path.match(/^\/api\/admin\/offers\/([^/]+)\/availability$/);
		if (adminOfferAvailabilityMatch) {
			const offerId = adminOfferAvailabilityMatch[1];
			if (method === 'GET') return handleAdminGetAvailability(env, offerId);
			if (method === 'PUT') return handleAdminUpdateAvailability(env, request, offerId);
			return methodNotAllowed();
		}

		const adminOfferMatch = path.match(/^\/api\/admin\/offers\/([^/]+)$/);
		if (adminOfferMatch) {
			const offerId = adminOfferMatch[1];
			if (method === 'PUT') return handleAdminUpdateOffer(env, request, offerId);
			return methodNotAllowed();
		}

		const adminLeadMatch = path.match(/^\/api\/admin\/leads\/([^/]+)$/);
		if (adminLeadMatch) {
			const leadId = adminLeadMatch[1];
			if (method === 'GET') return handleAdminGetLead(env, leadId);
			if (method === 'PUT') return handleAdminUpdateLead(env, request, leadId);
			return methodNotAllowed();
		}

		return notFound();
	},
} satisfies ExportedHandler<Env>;
