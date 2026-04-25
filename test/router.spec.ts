import { createExecutionContext } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { createRouter, get, post, put, route } from '../src/router/createRouter';
import type { Middleware, Route } from '../src/router/types';
import { cors } from '../src/middleware/cors';

const fakeEnv = {} as Env;

function call(routes: Route[], method: string, path: string, init: RequestInit = {}, middleware: Middleware[] = []) {
	const router = createRouter(routes, { middleware });
	const request = new Request(`https://example.com${path}`, { method, ...init });
	const ctx = createExecutionContext();
	return router.handle(request, fakeEnv, ctx);
}

describe('router', () => {
	it('matches exact paths', async () => {
		const routes: Route[] = [
			get('/api/health', () => new Response('ok')),
			get('/api/other', () => new Response('other')),
		];
		const response = await call(routes, 'GET', '/api/health');
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('ok');
	});

	it('extracts path params', async () => {
		const routes: Route[] = [
			get('/api/offers/:slug', ({ params }) => Response.json({ slug: params.slug })),
		];
		const response = await call(routes, 'GET', '/api/offers/sunny-villa');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ slug: 'sunny-villa' });
	});

	it('extracts multiple path params', async () => {
		const routes: Route[] = [
			get('/api/admin/offers/:offerId/availability', ({ params }) =>
				Response.json({ offerId: params.offerId })
			),
		];
		const response = await call(routes, 'GET', '/api/admin/offers/abc-123/availability');
		expect(await response.json()).toEqual({ offerId: 'abc-123' });
	});

	it('decodes URL-encoded params', async () => {
		const routes: Route[] = [
			get('/api/offers/:slug', ({ params }) => Response.json({ slug: params.slug })),
		];
		const response = await call(routes, 'GET', '/api/offers/hello%20world');
		expect(await response.json()).toEqual({ slug: 'hello world' });
	});

	it('returns 404 when no route matches', async () => {
		const routes: Route[] = [get('/api/health', () => new Response('ok'))];
		const response = await call(routes, 'GET', '/api/nope');
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'Not found' });
	});

	it('returns 405 with Allow header when path matches but method does not', async () => {
		const routes: Route[] = [
			get('/api/leads', () => new Response('list')),
			post('/api/leads', () => new Response('create')),
		];
		const response = await call(routes, 'DELETE', '/api/leads');
		expect(response.status).toBe(405);
		expect(response.headers.get('Allow')).toBe('GET, POST');
		expect(await response.json()).toEqual({ error: 'Method not allowed' });
	});

	it('runs route-specific middleware before the handler', async () => {
		const order: string[] = [];
		const tap = (label: string): Middleware => async (_ctx, next) => {
			order.push(`before ${label}`);
			const response = await next();
			order.push(`after ${label}`);
			return response;
		};
		const routes: Route[] = [
			route('GET', '/api/x', [tap('a'), tap('b')], () => {
				order.push('handler');
				return new Response('done');
			}),
		];
		await call(routes, 'GET', '/api/x');
		expect(order).toEqual(['before a', 'before b', 'handler', 'after b', 'after a']);
	});

	it('short-circuits when middleware returns a Response without calling next', async () => {
		let handlerRan = false;
		const deny: Middleware = () => new Response('forbidden', { status: 403 });
		const routes: Route[] = [
			route('GET', '/api/secret', [deny], () => {
				handlerRan = true;
				return new Response('secret');
			}),
		];
		const response = await call(routes, 'GET', '/api/secret');
		expect(response.status).toBe(403);
		expect(await response.text()).toBe('forbidden');
		expect(handlerRan).toBe(false);
	});

	it('handles CORS preflight via global middleware', async () => {
		const routes: Route[] = [get('/api/health', () => new Response('ok'))];
		const response = await call(routes, 'OPTIONS', '/api/health', {}, [cors()]);
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
		expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
	});

	it('appends CORS headers to non-preflight responses', async () => {
		const routes: Route[] = [get('/api/health', () => new Response('ok'))];
		const response = await call(routes, 'GET', '/api/health', {}, [cors()]);
		expect(response.status).toBe(200);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(await response.text()).toBe('ok');
	});

	it('appends CORS headers to 404 responses too', async () => {
		const routes: Route[] = [get('/api/health', () => new Response('ok'))];
		const response = await call(routes, 'GET', '/api/missing', {}, [cors()]);
		expect(response.status).toBe(404);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});

	it('supports the put helper', async () => {
		const routes: Route[] = [put('/api/x', () => new Response('updated'))];
		const response = await call(routes, 'PUT', '/api/x');
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('updated');
	});
});
