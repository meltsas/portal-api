import type { Middleware } from '../router/types';
import { jsonResponse } from '../utils/response';
import { requireAuth } from './requireAuth';

// Admin guard: rejects with 401 unless the request carries a valid admin
// session cookie for an email that is still on the allowlist (see requireAuth).
export function requireAdmin(): Middleware {
	return async (context, next) => {
		const session = await requireAuth(context.request, context.env);
		if (!session) {
			return jsonResponse({ error: 'Unauthorized' }, 401);
		}
		return next();
	};
}
