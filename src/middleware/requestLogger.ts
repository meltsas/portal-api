import type { Middleware } from '../router/types';

export function requestLogger(): Middleware {
	return async (context, next) => {
		if (context.env.ENVIRONMENT !== 'development') {
			return next();
		}

		const { request, url } = context;
		const method = request.method;
		const path = url.pathname;
		const prefix = path.startsWith('/api/admin') ? 'admin' : 'public';

		const query: Record<string, string> = {};
		for (const [key, value] of url.searchParams) {
			query[key] = value;
		}

		let body: unknown;
		if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
			try {
				const text = await request.clone().text();
				if (text.length > 0) {
					try {
						body = JSON.parse(text);
					} catch {
						body = text;
					}
				}
			} catch {
				body = '<unreadable body>';
			}
		}

		const extras: Record<string, unknown> = {};
		if (Object.keys(query).length > 0) extras.query = query;
		if (body !== undefined) extras.body = body;

		if (Object.keys(extras).length > 0) {
			console.log(`[${prefix}] ${method} ${path}`, extras);
		} else {
			console.log(`[${prefix}] ${method} ${path}`);
		}

		return next();
	};
}
