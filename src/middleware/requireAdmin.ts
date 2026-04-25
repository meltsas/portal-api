import type { Middleware } from '../router/types';

// Placeholder admin guard — pass-through stub.
// Replace this body with real Google-based authentication before relying on it
// in production. See AGENTS.md ("Authentication Expectations").
export function requireAdmin(): Middleware {
	return (_context, next) => next();
}
