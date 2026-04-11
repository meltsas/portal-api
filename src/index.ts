import { handleHealth } from './routes/health';
import { handleGetOffers } from './routes/offers';
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

		// --- Future protected endpoints would go here ---

		return notFound();
	},
} satisfies ExportedHandler<Env>;
