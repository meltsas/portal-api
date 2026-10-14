import type { Middleware } from '../router/types';
import { jsonResponse } from '../utils/response';

/** Both tenant form limiters count per 60 s window (`wrangler.jsonc` → `ratelimits`). */
const RETRY_AFTER_SECONDS = '60';

/**
 * Limits the tenant form endpoints that run before sign-in, per client IP. CF-Connecting-IP is
 * always set by Cloudflare; only local requests lack it and share one counter.
 */
export function limitTenantFormClientIp(): Middleware {
	return async ({ request, env }, next) => {
		const clientIp = request.headers.get('CF-Connecting-IP') ?? 'unknown';
		const { success } = await env.TENANT_FORM_IP_LIMITER.limit({ key: clientIp });
		return success ? next() : tooManyRequests();
	};
}

export function tooManyRequests(): Response {
	const response = jsonResponse({ error: 'Too many requests' }, 429);
	response.headers.set('Retry-After', RETRY_AFTER_SECONDS);
	return response;
}
