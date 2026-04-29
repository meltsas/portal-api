import { get, post } from '../router/createRouter';
import type { Route } from '../router/types';
import { handleGoogleAuth, handleLogout, handleAuthMe } from '../handlers/auth';

export const authRoutes: Route[] = [
	post('/api/auth/google', handleGoogleAuth),
	post('/api/auth/logout', handleLogout),
	get('/api/auth/me', handleAuthMe),
];
