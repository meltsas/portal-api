import type { RouteHandler } from '../router/types';
import type { OfferRow, OfferAvailabilityRow } from '../types/db';
import { toPublicOfferSummary, toPublicOfferDetail } from '../mappers/offers';
import { toPublicAvailabilityPeriod } from '../mappers/availability';
import { jsonResponse, notFound } from '../utils/response';

export const handleGetOffers: RouteHandler = async ({ env }) => {
	const result = await env.portal_db
		.prepare(
			`SELECT id, slug, title, location_name, summary, cover_image_url, created_at, updated_at
			 FROM offers
			 WHERE status = ?`
		)
		.bind('active')
		.all<OfferRow>();

	const data = result.results.map(toPublicOfferSummary);

	return jsonResponse({ data });
};

export const handleGetOfferBySlug: RouteHandler = async ({ env, params }) => {
	const slug = params.slug;

	const offer = await env.portal_db
		.prepare(
			`SELECT id, slug, title, location_name, summary, cover_image_url, created_at, updated_at
			 FROM offers
			 WHERE slug = ? AND status = ?`
		)
		.bind(slug, 'active')
		.first<OfferRow>();

	if (!offer) {
		return notFound();
	}

	const availabilityResult = await env.portal_db
		.prepare(
			`SELECT id, offer_id, date_from, date_to, status, note, created_at, updated_at
			 FROM offer_availability
			 WHERE offer_id = ? AND status IN (?, ?)
			 ORDER BY date_from`
		)
		.bind(offer.id, 'available', 'tentative')
		.all<OfferAvailabilityRow>();

	const availability = availabilityResult.results.map(toPublicAvailabilityPeriod);

	return jsonResponse(toPublicOfferDetail(offer, availability));
};
