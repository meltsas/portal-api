import type { RouteHandler } from '../../router/types';
import type { CustomerStatus, CreateCustomerPayload, UpdateCustomerPayload } from '../../types/api';
import type { CustomerRow } from '../../types/db';
import { toAdminCustomerListItem, toAdminCustomerDetail } from '../../mappers/customers';
import { jsonResponse, notFound, badRequest, parseJsonBody } from '../../utils/response';

const VALID_STATUSES: CustomerStatus[] = ['active', 'inactive', 'archived'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 30;
const MAX_ADDRESS_LENGTH = 500;
const MAX_SHORT_LENGTH = 100;
const MAX_DOC_LENGTH = 100;
const MAX_OCCUPATION_LENGTH = 200;
const MAX_LONG_LENGTH = 2000;
const MAX_NOTES_LENGTH = 5000;
const MAX_FAMILY_JSON_LENGTH = 10000;

const CUSTOMER_COLUMNS =
	`id, source_lead_id, full_name, email, phone, primary_address, date_of_birth,
	 national_id_number, document_number, occupation, employer_or_pension_info,
	 income_notes, family_members_json, notes, status, created_at, updated_at`;

function validateFamilyMembersJson(raw: string): string | null {
	if (raw.length > MAX_FAMILY_JSON_LENGTH) {
		return `familyMembersJson must be at most ${MAX_FAMILY_JSON_LENGTH} characters`;
	}
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return 'familyMembersJson must encode a JSON array';
		}
	} catch {
		return 'familyMembersJson must be valid JSON';
	}
	return null;
}

export const handleAdminGetCustomers: RouteHandler = async ({ env, url }) => {
	const statusFilter = url.searchParams.get('status');
	const search = url.searchParams.get('search');

	if (statusFilter && !VALID_STATUSES.includes(statusFilter as CustomerStatus)) {
		return badRequest(`Invalid status filter. Must be one of: ${VALID_STATUSES.join(', ')}`);
	}

	const conditions: string[] = [];
	const bindings: string[] = [];

	if (statusFilter) {
		conditions.push('status = ?');
		bindings.push(statusFilter);
	}
	if (search && search.trim() !== '') {
		const like = `%${search.trim()}%`;
		conditions.push('(full_name LIKE ? OR email LIKE ?)');
		bindings.push(like, like);
	}

	let sql = `SELECT ${CUSTOMER_COLUMNS} FROM customers`;
	if (conditions.length > 0) {
		sql += ` WHERE ${conditions.join(' AND ')}`;
	}
	sql += ` ORDER BY created_at DESC`;

	const result = await env.portal_db
		.prepare(sql)
		.bind(...bindings)
		.all<CustomerRow>();

	const data = result.results.map(toAdminCustomerListItem);

	return jsonResponse({ data });
};

export const handleAdminGetCustomer: RouteHandler = async ({ env, params }) => {
	const id = params.id;

	const row = await env.portal_db
		.prepare(`SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = ?`)
		.bind(id)
		.first<CustomerRow>();

	if (!row) {
		return notFound();
	}

	return jsonResponse(toAdminCustomerDetail(row));
};

export const handleAdminCreateCustomer: RouteHandler = async ({ env, request }) => {
	const body = await parseJsonBody<CreateCustomerPayload>(request);
	if (!body) {
		return badRequest('Invalid or missing JSON body');
	}

	if (typeof body.fullName !== 'string' || body.fullName.trim() === '') {
		return badRequest('fullName is required');
	}
	if (typeof body.email !== 'string' || body.email.trim() === '') {
		return badRequest('email is required');
	}

	const fullName = body.fullName.trim();
	const email = body.email.trim().toLowerCase();

	if (fullName.length > MAX_NAME_LENGTH) {
		return badRequest(`fullName must be at most ${MAX_NAME_LENGTH} characters`);
	}
	if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
		return badRequest('Invalid email format');
	}

	const phone = readOptionalString(body.phone, MAX_PHONE_LENGTH, 'phone');
	if (phone instanceof Response) return phone;

	const primaryAddress = readOptionalString(body.primaryAddress, MAX_ADDRESS_LENGTH, 'primaryAddress');
	if (primaryAddress instanceof Response) return primaryAddress;

	const dateOfBirth = readOptionalString(body.dateOfBirth, MAX_SHORT_LENGTH, 'dateOfBirth');
	if (dateOfBirth instanceof Response) return dateOfBirth;

	const nationalIdNumber = readOptionalString(body.nationalIdNumber, MAX_DOC_LENGTH, 'nationalIdNumber');
	if (nationalIdNumber instanceof Response) return nationalIdNumber;

	const documentNumber = readOptionalString(body.documentNumber, MAX_DOC_LENGTH, 'documentNumber');
	if (documentNumber instanceof Response) return documentNumber;

	const occupation = readOptionalString(body.occupation, MAX_OCCUPATION_LENGTH, 'occupation');
	if (occupation instanceof Response) return occupation;

	const employerOrPensionInfo = readOptionalString(body.employerOrPensionInfo, MAX_LONG_LENGTH, 'employerOrPensionInfo');
	if (employerOrPensionInfo instanceof Response) return employerOrPensionInfo;

	const incomeNotes = readOptionalString(body.incomeNotes, MAX_LONG_LENGTH, 'incomeNotes');
	if (incomeNotes instanceof Response) return incomeNotes;

	const notes = readOptionalString(body.notes, MAX_NOTES_LENGTH, 'notes');
	if (notes instanceof Response) return notes;

	let familyMembersJson = '[]';
	if (body.familyMembersJson !== undefined && body.familyMembersJson !== null) {
		if (typeof body.familyMembersJson !== 'string') {
			return badRequest('familyMembersJson must be a string');
		}
		const candidate = body.familyMembersJson.trim() === '' ? '[]' : body.familyMembersJson;
		const err = validateFamilyMembersJson(candidate);
		if (err) return badRequest(err);
		familyMembersJson = candidate;
	}

	const status: CustomerStatus = body.status ?? 'active';
	if (!VALID_STATUSES.includes(status)) {
		return badRequest(`status must be one of: ${VALID_STATUSES.join(', ')}`);
	}

	const sourceLeadId = body.sourceLeadId ?? null;

	const id = crypto.randomUUID();

	await env.portal_db
		.prepare(
			`INSERT INTO customers
			 (id, source_lead_id, full_name, email, phone, primary_address, date_of_birth,
			  national_id_number, document_number, occupation, employer_or_pension_info,
			  income_notes, family_members_json, notes, status)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id, sourceLeadId, fullName, email, phone, primaryAddress, dateOfBirth,
			nationalIdNumber, documentNumber, occupation, employerOrPensionInfo,
			incomeNotes, familyMembersJson, notes, status,
		)
		.run();

	return jsonResponse({ id }, 201);
};

export const handleAdminUpdateCustomer: RouteHandler = async ({ env, request, params }) => {
	const id = params.id;

	const body = await parseJsonBody<UpdateCustomerPayload>(request);
	if (!body) {
		return badRequest('Invalid or missing JSON body');
	}

	const existing = await env.portal_db
		.prepare(`SELECT id FROM customers WHERE id = ?`)
		.bind(id)
		.first<Pick<CustomerRow, 'id'>>();

	if (!existing) {
		return notFound();
	}

	const fields: string[] = [];
	const values: unknown[] = [];

	if (body.fullName !== undefined) {
		if (typeof body.fullName !== 'string' || body.fullName.trim() === '') {
			return badRequest('fullName must be a non-empty string');
		}
		const v = body.fullName.trim();
		if (v.length > MAX_NAME_LENGTH) {
			return badRequest(`fullName must be at most ${MAX_NAME_LENGTH} characters`);
		}
		fields.push('full_name = ?');
		values.push(v);
	}

	if (body.email !== undefined) {
		if (typeof body.email !== 'string' || body.email.trim() === '') {
			return badRequest('email must be a non-empty string');
		}
		const v = body.email.trim().toLowerCase();
		if (v.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(v)) {
			return badRequest('Invalid email format');
		}
		fields.push('email = ?');
		values.push(v);
	}

	const stringFieldUpdates: Array<[string, keyof UpdateCustomerPayload, number, string]> = [
		['phone', 'phone', MAX_PHONE_LENGTH, 'phone'],
		['primary_address', 'primaryAddress', MAX_ADDRESS_LENGTH, 'primaryAddress'],
		['date_of_birth', 'dateOfBirth', MAX_SHORT_LENGTH, 'dateOfBirth'],
		['national_id_number', 'nationalIdNumber', MAX_DOC_LENGTH, 'nationalIdNumber'],
		['document_number', 'documentNumber', MAX_DOC_LENGTH, 'documentNumber'],
		['occupation', 'occupation', MAX_OCCUPATION_LENGTH, 'occupation'],
		['employer_or_pension_info', 'employerOrPensionInfo', MAX_LONG_LENGTH, 'employerOrPensionInfo'],
		['income_notes', 'incomeNotes', MAX_LONG_LENGTH, 'incomeNotes'],
		['notes', 'notes', MAX_NOTES_LENGTH, 'notes'],
	];

	for (const [column, key, max, label] of stringFieldUpdates) {
		const incoming = body[key];
		if (incoming === undefined) continue;
		if (typeof incoming !== 'string') {
			return badRequest(`${label} must be a string`);
		}
		const trimmed = incoming.trim();
		if (trimmed.length > max) {
			return badRequest(`${label} must be at most ${max} characters`);
		}
		fields.push(`${column} = ?`);
		values.push(trimmed);
	}

	if (body.familyMembersJson !== undefined) {
		if (typeof body.familyMembersJson !== 'string') {
			return badRequest('familyMembersJson must be a string');
		}
		const candidate = body.familyMembersJson.trim() === '' ? '[]' : body.familyMembersJson;
		const err = validateFamilyMembersJson(candidate);
		if (err) return badRequest(err);
		fields.push('family_members_json = ?');
		values.push(candidate);
	}

	if (body.status !== undefined) {
		if (!VALID_STATUSES.includes(body.status)) {
			return badRequest(`status must be one of: ${VALID_STATUSES.join(', ')}`);
		}
		fields.push('status = ?');
		values.push(body.status);
	}

	if (body.sourceLeadId !== undefined) {
		if (body.sourceLeadId !== null && typeof body.sourceLeadId !== 'string') {
			return badRequest('sourceLeadId must be a string or null');
		}
		fields.push('source_lead_id = ?');
		values.push(body.sourceLeadId);
	}

	if (fields.length === 0) {
		return badRequest('No fields to update');
	}

	fields.push('updated_at = CURRENT_TIMESTAMP');
	values.push(id);

	await env.portal_db
		.prepare(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`)
		.bind(...values)
		.run();

	return jsonResponse({ id });
};

// --- Helpers ---

function readOptionalString(value: unknown, max: number, label: string): string | Response {
	if (value === undefined || value === null) return '';
	if (typeof value !== 'string') {
		return badRequest(`${label} must be a string`);
	}
	const trimmed = value.trim();
	if (trimmed.length > max) {
		return badRequest(`${label} must be at most ${max} characters`);
	}
	return trimmed;
}
