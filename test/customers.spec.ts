import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { AdminCustomerDetail, CreateCustomerResponse } from '../src/types/api';
import { adminSessionCookie } from './helpers';

const CUSTOMERS_API = 'https://example.com/api/admin/customers';

async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
	return SELF.fetch(`${CUSTOMERS_API}${path}`, {
		...init,
		headers: { 'Content-Type': 'application/json', Cookie: await adminSessionCookie() },
	});
}

async function createCustomer(body: Record<string, unknown>): Promise<Response> {
	return adminFetch('', { method: 'POST', body: JSON.stringify({ fullName: 'Lars Nielsen', email: 'lars@example.com', ...body }) });
}

async function getCustomer(id: string): Promise<AdminCustomerDetail> {
	return (await (await adminFetch(`/${id}`)).json()) as AdminCustomerDetail;
}

describe('customer identity fields', () => {
	it('stores nationality, sex and document type on create', async () => {
		const response = await createCustomer({ nationality: ' Danish ', sex: 'male', documentType: 'id_card' });
		expect(response.status).toBe(201);
		const { id } = (await response.json()) as CreateCustomerResponse;

		expect(await getCustomer(id)).toMatchObject({ nationality: 'Danish', sex: 'male', documentType: 'id_card' });
	});

	it('defaults them to empty strings', async () => {
		const { id } = (await (await createCustomer({})).json()) as CreateCustomerResponse;
		expect(await getCustomer(id)).toMatchObject({ nationality: '', sex: '', documentType: '' });
	});

	it('updates and clears them', async () => {
		const { id } = (await (await createCustomer({ sex: 'female', documentType: 'passport' })).json()) as CreateCustomerResponse;

		const update = await adminFetch(`/${id}`, {
			method: 'PUT',
			body: JSON.stringify({ nationality: 'Swedish', sex: '', documentType: 'residence_permit' }),
		});
		expect(update.status).toBe(200);
		expect(await getCustomer(id)).toMatchObject({ nationality: 'Swedish', sex: '', documentType: 'residence_permit' });
	});

	it.each([
		['sex', 'f'],
		['sex', 1],
		['documentType', 'driving_licence'],
	])('rejects %s %j on create and update', async (key, value) => {
		expect((await createCustomer({ [key]: value })).status).toBe(400);

		const { id } = (await (await createCustomer({})).json()) as CreateCustomerResponse;
		const update = await adminFetch(`/${id}`, { method: 'PUT', body: JSON.stringify({ [key]: value }) });
		expect(update.status).toBe(400);
	});
});

describe('customer length limits', () => {
	it('accepts an 800 character address and a 600 character occupation', async () => {
		const response = await createCustomer({ primaryAddress: 'a'.repeat(800), occupation: 'o'.repeat(600) });
		expect(response.status).toBe(201);
	});

	it('rejects longer values', async () => {
		expect((await createCustomer({ primaryAddress: 'a'.repeat(801) })).status).toBe(400);
		expect((await createCustomer({ occupation: 'o'.repeat(601) })).status).toBe(400);
	});
});
