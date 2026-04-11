import { jsonResponse } from '../utils/response';

export async function handleGetOffers(env: Env): Promise<Response> {
	const result = await env.portal_db
		.prepare(
			`SELECT id, slug, title, location_name, summary, cover_image_url, created_at
			 FROM offers
			 WHERE status = ?`
		)
		.bind('active')
		.all();

	return jsonResponse(result.results);
}
