import type { Params, Route } from './types';

export interface CompiledRoute extends Route {
	pattern: RegExp;
	paramNames: string[];
}

const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;

export function compileRoute(route: Route): CompiledRoute {
	const paramNames: string[] = [];
	const segments = route.path.split('/').map((segment) => {
		if (segment.startsWith(':')) {
			paramNames.push(segment.slice(1));
			return '([^/]+)';
		}
		return segment.replace(REGEX_ESCAPE, '\\$&');
	});
	const pattern = new RegExp(`^${segments.join('/')}$`);
	return { ...route, pattern, paramNames };
}

export function matchPath(route: CompiledRoute, path: string): Params | null {
	const match = path.match(route.pattern);
	if (!match) return null;
	const params: Params = {};
	for (let i = 0; i < route.paramNames.length; i++) {
		params[route.paramNames[i]] = decodeURIComponent(match[i + 1]);
	}
	return params;
}
