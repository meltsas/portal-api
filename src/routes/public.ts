import { get, post } from '../router/createRouter';
import type { Route } from '../router/types';
import { handleHealth } from '../handlers/health';
import { handleGetOffers, handleGetOfferBySlug } from '../handlers/offers';
import { handleSubmitLead } from '../handlers/leads';

export const publicRoutes: Route[] = [
	get('/api/health', handleHealth),
	get('/api/offers', handleGetOffers),
	get('/api/offers/:slug', handleGetOfferBySlug),
	post('/api/leads', handleSubmitLead),
];
