import type { Middleware } from '../router/types';
import { jsonResponse } from '../utils/response';
import { requireAuth } from './requireAuth';

// Admin guard: rejects with 401 unless the request carries a valid
// signed session cookie. The allowlist check happens at login time
// (handlers/auth.ts) — by the time a session exists, the email is trusted.
export function requireAdmin(): Middleware {
	return async (context, next) => {
		const session = await requireAuth(context.request, context.env);
		if (!session) {
			return jsonResponse({ error: 'Unauthorized' }, 401);
		}
		return next();
	};
}
