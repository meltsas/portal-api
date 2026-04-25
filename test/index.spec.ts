import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('worker entry', () => {
	it('returns ok on /api/health (unit style)', async () => {
		const request = new IncomingRequest('https://example.com/api/health');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok' });
	});

	it('returns 404 for unknown paths (integration style)', async () => {
		const response = await SELF.fetch('https://example.com/api/does-not-exist');
		expect(response.status).toBe(404);
	});

	it('responds to CORS preflight on any path', async () => {
		const response = await SELF.fetch('https://example.com/api/health', { method: 'OPTIONS' });
		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});

	it('returns 405 when method is not allowed for an existing path', async () => {
		const response = await SELF.fetch('https://example.com/api/health', { method: 'DELETE' });
		expect(response.status).toBe(405);
		expect(response.headers.get('Allow')).toContain('GET');
	});
});
