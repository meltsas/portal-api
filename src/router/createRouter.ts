import { compileRoute, matchPath, type CompiledRoute } from './pathMatcher';
import type { HttpMethod, Middleware, Route, RouteContext, RouteHandler } from './types';

export interface CreateRouterOptions {
	middleware?: Middleware[];
}

export interface Router {
	handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
}

export function createRouter(routes: Route[], options: CreateRouterOptions = {}): Router {
	const compiled = routes.map(compileRoute);
	const globalMiddleware = options.middleware ?? [];

	return {
		async handle(request, env, ctx) {
			const url = new URL(request.url);
			const baseContext: RouteContext = { request, env, ctx, url, params: {} };
			return runChain(globalMiddleware, baseContext, () => routeRequest(compiled, baseContext));
		},
	};
}

function routeRequest(compiled: CompiledRoute[], context: RouteContext): Promise<Response> {
	const path = context.url.pathname;
	const method = context.request.method as HttpMethod;

	let exact: { route: CompiledRoute; params: Record<string, string> } | null = null;
	const allowed = new Set<string>();

	for (const route of compiled) {
		const params = matchPath(route, path);
		if (!params) continue;
		allowed.add(route.method);
		if (!exact && route.method === method) {
			exact = { route, params };
		}
	}

	if (exact) {
		const routeContext: RouteContext = { ...context, params: exact.params };
		return runChain(exact.route.middleware, routeContext, () => Promise.resolve(exact!.route.handler(routeContext)));
	}

	if (allowed.size === 0) {
		return Promise.resolve(notFoundResponse());
	}

	return Promise.resolve(methodNotAllowedResponse([...allowed].sort()));
}

function runChain(middleware: Middleware[], context: RouteContext, terminal: () => Promise<Response>): Promise<Response> {
	let lastIndex = -1;
	const dispatch = (index: number): Promise<Response> => {
		if (index <= lastIndex) {
			throw new Error('next() called multiple times');
		}
		lastIndex = index;
		const fn = middleware[index];
		if (!fn) return terminal();
		return Promise.resolve(fn(context, () => dispatch(index + 1)));
	};
	return dispatch(0);
}

function notFoundResponse(): Response {
	return new Response(JSON.stringify({ error: 'Not found' }), {
		status: 404,
		headers: { 'Content-Type': 'application/json' },
	});
}

function methodNotAllowedResponse(allowed: string[]): Response {
	return new Response(JSON.stringify({ error: 'Method not allowed' }), {
		status: 405,
		headers: {
			'Content-Type': 'application/json',
			Allow: allowed.join(', '),
		},
	});
}

// --- Route definition helpers ---

export function route(method: HttpMethod, path: string, middleware: Middleware[], handler: RouteHandler): Route {
	return { method, path, middleware, handler };
}

export const get = (path: string, handler: RouteHandler, middleware: Middleware[] = []): Route =>
	({ method: 'GET', path, middleware, handler });

export const post = (path: string, handler: RouteHandler, middleware: Middleware[] = []): Route =>
	({ method: 'POST', path, middleware, handler });

export const put = (path: string, handler: RouteHandler, middleware: Middleware[] = []): Route =>
	({ method: 'PUT', path, middleware, handler });

export const patch = (path: string, handler: RouteHandler, middleware: Middleware[] = []): Route =>
	({ method: 'PATCH', path, middleware, handler });

export const del = (path: string, handler: RouteHandler, middleware: Middleware[] = []): Route =>
	({ method: 'DELETE', path, middleware, handler });
