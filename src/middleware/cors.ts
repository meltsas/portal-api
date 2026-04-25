import type { Middleware } from '../router/types';

export interface CorsOptions {
	allowOrigin?: string;
	allowMethods?: string;
	allowHeaders?: string;
	maxAgeSeconds?: number;
}

const DEFAULTS = {
	allowOrigin: '*',
	allowMethods: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
	allowHeaders: 'Content-Type, Authorization',
	maxAgeSeconds: 86400,
};

export function cors(options: CorsOptions = {}): Middleware {
	const corsHeaders: Record<string, string> = {
		'Access-Control-Allow-Origin': options.allowOrigin ?? DEFAULTS.allowOrigin,
		'Access-Control-Allow-Methods': options.allowMethods ?? DEFAULTS.allowMethods,
		'Access-Control-Allow-Headers': options.allowHeaders ?? DEFAULTS.allowHeaders,
		'Access-Control-Max-Age': String(options.maxAgeSeconds ?? DEFAULTS.maxAgeSeconds),
	};

	return async (context, next) => {
		if (context.request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: corsHeaders });
		}

		const response = await next();
		const headers = new Headers(response.headers);
		for (const [key, value] of Object.entries(corsHeaders)) {
			headers.set(key, value);
		}
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	};
}
