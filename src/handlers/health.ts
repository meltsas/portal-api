import type { RouteHandler } from '../router/types';
import { jsonResponse } from '../utils/response';

export const handleHealth: RouteHandler = () => {
	return jsonResponse({ status: 'ok' });
};
