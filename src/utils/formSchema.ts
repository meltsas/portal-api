import type { FormFieldOptionRow, FormFieldRow, FormSectionRow, FormTranslationRow } from '../types/db';
import { daysBetween, isIsoDate } from './date';

export const FORM_LANGUAGES = ['en', 'sv', 'fi', 'no'] as const;
export type FormLanguage = (typeof FORM_LANGUAGES)[number];
export const BASE_LANGUAGE: FormLanguage = 'en';

export const TEXT_VARIABLES = ['offerTitle', 'displayName', 'maxFileSizeMb', 'maxFiles'] as const;
export type TextVariable = (typeof TEXT_VARIABLES)[number];

const FIELD_TYPES = [
	'text',
	'textarea',
	'email',
	'tel',
	'date',
	'number',
	'single_choice',
	'checkbox',
	'file',
	'info',
	'guest_list',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldValidation {
	minLength?: number;
	maxLength?: number;
	min?: number;
	max?: number;
	notInFuture?: boolean;
	minNightsAfter?: string;
	minNights?: number;
	maxItems?: number;
	minFiles?: number;
	maxFiles?: number;
	maxFileBytes?: number;
	accept?: string[];
}

export interface VisibleIf {
	field: string;
	equals: string;
}

export interface FormOption {
	key: string;
	allowsFreeText: boolean;
}

export interface FormField {
	key: string;
	type: FieldType;
	required: boolean;
	validation: FieldValidation;
	visibleIf: VisibleIf | null;
	options: FormOption[];
	itemFields: FormField[];
}

export interface FormSection {
	key: string;
	fields: FormField[];
}

export interface FormStructure {
	templateId: string;
	sections: FormSection[];
}

export function isFormLanguage(value: unknown): value is FormLanguage {
	return typeof value === 'string' && (FORM_LANGUAGES as readonly string[]).includes(value);
}

// --- Loading ---

type SectionQueryRow = Pick<FormSectionRow, 'id' | 'section_key'>;
type FieldQueryRow = Omit<FormFieldRow, 'template_id'>;
type OptionQueryRow = Pick<FormFieldOptionRow, 'field_id' | 'option_key' | 'allows_free_text'>;

/** Returns null when the template has no sections (unknown template id). */
export async function loadFormStructure(db: D1Database, templateId: string): Promise<FormStructure | null> {
	const [sections, fields, options] = await db.batch<Record<string, unknown>>([
		db
			.prepare(`SELECT id, section_key FROM form_sections WHERE template_id = ? ORDER BY sort_order`)
			.bind(templateId),
		db
			.prepare(
				`SELECT id, section_id, parent_field_id, field_key, field_type, is_required, sort_order,
				        validation_json, visible_if_json
				 FROM form_fields WHERE template_id = ? ORDER BY sort_order`
			)
			.bind(templateId),
		db
			.prepare(
				`SELECT o.field_id, o.option_key, o.allows_free_text
				 FROM form_field_options o JOIN form_fields f ON f.id = o.field_id
				 WHERE f.template_id = ? ORDER BY o.sort_order`
			)
			.bind(templateId),
	]);

	if (sections.results.length === 0) return null;

	return buildFormStructure(
		templateId,
		sections.results as unknown as SectionQueryRow[],
		fields.results as unknown as FieldQueryRow[],
		options.results as unknown as OptionQueryRow[]
	);
}

/** Expects rows ordered by sort_order. Throws on a malformed template, which is a seed/migration bug. */
export function buildFormStructure(
	templateId: string,
	sectionRows: SectionQueryRow[],
	fieldRows: FieldQueryRow[],
	optionRows: OptionQueryRow[]
): FormStructure {
	const fieldsById = new Map<string, FormField>();
	for (const row of fieldRows) {
		fieldsById.set(row.id, {
			key: row.field_key,
			type: parseFieldType(row.field_type),
			required: row.is_required === 1,
			validation: JSON.parse(row.validation_json) as FieldValidation,
			visibleIf: row.visible_if_json ? (JSON.parse(row.visible_if_json) as VisibleIf) : null,
			options: [],
			itemFields: [],
		});
	}

	for (const row of optionRows) {
		fieldsById.get(row.field_id)?.options.push({ key: row.option_key, allowsFreeText: row.allows_free_text === 1 });
	}

	for (const row of fieldRows) {
		if (!row.parent_field_id) continue;
		const parent = fieldsById.get(row.parent_field_id);
		if (!parent) throw new Error(`Form field ${row.id} has an unknown parent`);
		parent.itemFields.push(fieldsById.get(row.id)!);
	}

	return {
		templateId,
		sections: sectionRows.map((section) => ({
			key: section.section_key,
			fields: fieldRows
				.filter((row) => row.section_id === section.id && !row.parent_field_id)
				.map((row) => fieldsById.get(row.id)!),
		})),
	};
}

function parseFieldType(value: string): FieldType {
	if ((FIELD_TYPES as readonly string[]).includes(value)) return value as FieldType;
	throw new Error(`Unknown form field type: ${value}`);
}

/** Texts in `language`, with any missing key taken from the base language. */
export async function loadFormTexts(
	db: D1Database,
	templateId: string,
	language: FormLanguage
): Promise<Record<string, string>> {
	const { results } = await db
		.prepare(`SELECT language, text_key, text FROM form_translations WHERE template_id = ? AND language IN (?, ?)`)
		.bind(templateId, BASE_LANGUAGE, language)
		.all<Pick<FormTranslationRow, 'language' | 'text_key' | 'text'>>();
	return mergeTexts(results, language);
}

export function mergeTexts(
	rows: Pick<FormTranslationRow, 'language' | 'text_key' | 'text'>[],
	language: FormLanguage
): Record<string, string> {
	const texts: Record<string, string> = {};
	for (const row of rows) {
		if (row.language === BASE_LANGUAGE) texts[row.text_key] = row.text;
	}
	for (const row of rows) {
		if (row.language === language) texts[row.text_key] = row.text;
	}
	return texts;
}

// --- Text keys ---

export interface TextKeySpec {
	key: string;
	/** Must exist in the base language. */
	required: boolean;
}

/** Every text key the structure can use. Item fields use the path `<field>.item.<itemField>`. */
export function listTextKeys(structure: FormStructure): TextKeySpec[] {
	const keys: TextKeySpec[] = [
		{ key: 'template.title', required: true },
		{ key: 'template.intro', required: false },
		{ key: 'template.success_message', required: true },
	];
	for (const section of structure.sections) {
		keys.push(
			{ key: `section.${section.key}.title`, required: true },
			{ key: `section.${section.key}.description`, required: false }
		);
		for (const field of section.fields) {
			addFieldTextKeys(keys, field.key, field);
		}
	}
	return keys;
}

function addFieldTextKeys(keys: TextKeySpec[], path: string, field: FormField): void {
	if (field.type === 'info') {
		keys.push({ key: `field.${path}.label`, required: false }, { key: `field.${path}.body`, required: true });
		return;
	}
	keys.push(
		{ key: `field.${path}.label`, required: true },
		{ key: `field.${path}.help`, required: false },
		{ key: `field.${path}.placeholder`, required: false }
	);
	for (const option of field.options) {
		keys.push({ key: `option.${path}.${option.key}`, required: true });
	}
	for (const itemField of field.itemFields) {
		addFieldTextKeys(keys, `${path}.item.${itemField.key}`, itemField);
	}
}

/** Names of `{variables}` in the text that are not in TEXT_VARIABLES. */
export function findUnknownTextVariables(text: string): string[] {
	const unknown: string[] = [];
	for (const match of text.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
		const name = match[1];
		if (!(TEXT_VARIABLES as readonly string[]).includes(name) && !unknown.includes(name)) unknown.push(name);
	}
	return unknown;
}

/** Replaces `{variable}` with its value. Variables without a value stay visible as written. */
export function fillTextVariables(text: string, values: Partial<Record<TextVariable, string>>): string {
	return text.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) =>
		Object.hasOwn(values, name) ? (values[name as TextVariable] ?? match) : match
	);
}

// --- Value validation ---

export type FormValue = string | number | boolean | string[] | FormValues[];
export interface FormValues {
	[key: string]: FormValue;
}

export type FieldErrorCode =
	| 'unknown_field'
	| 'required'
	| 'invalid_type'
	| 'too_short'
	| 'too_long'
	| 'invalid_email'
	| 'invalid_phone'
	| 'invalid_date'
	| 'date_in_future'
	| 'date_order'
	| 'stay_too_short'
	| 'out_of_range'
	| 'invalid_option'
	| 'too_many_items'
	| 'too_few_files'
	| 'too_many_files'
	| 'duplicate_file';

export interface FieldError {
	/** Value path, e.g. `phone`, `stay_purpose_other`, `other_guests[1].sex`. */
	field: string;
	code: FieldErrorCode;
}

export type FormValidationResult = { ok: true; values: FormValues } | { ok: false; errors: FieldError[] };

const DEFAULT_MAX_LENGTH: Partial<Record<FieldType, number>> = { text: 500, textarea: 5000, email: 254, tel: 30 };
const FREE_TEXT_MAX_LENGTH = 300;
const DEFAULT_MAX_ITEMS = 20;
const DEFAULT_MAX_FILES = 10;
const FILE_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[\d\s()-]+$/;
const MIN_PHONE_DIGITS = 6;

/**
 * Validates submitted values against the template structure. Unknown keys are rejected,
 * values of hidden fields (`visibleIf`) are dropped, strings are trimmed.
 * File values are only checked for shape and count here, ownership is checked on submit.
 */
export function validateFormValues(structure: FormStructure, input: unknown, today: string): FormValidationResult {
	if (!isPlainObject(input)) return { ok: false, errors: [{ field: '', code: 'invalid_type' }] };

	const fields = structure.sections.flatMap((section) => section.fields);
	const errors: FieldError[] = [];
	const values: FormValues = {};

	collectUnknownKeys(fields, input, '', errors);

	for (const field of fields) {
		if (field.type === 'info') continue;
		if (field.visibleIf && !isVisible(field.visibleIf, input)) continue;
		validateField(field, field.key, input, values, errors, today);
	}

	for (const field of fields) {
		checkMinNights(field, values, errors);
	}

	return errors.length > 0 ? { ok: false, errors } : { ok: true, values };
}

function collectUnknownKeys(fields: FormField[], input: Record<string, unknown>, pathPrefix: string, errors: FieldError[]): void {
	const allowed = new Set<string>();
	for (const field of fields) {
		if (field.type === 'info') continue;
		allowed.add(field.key);
		if (field.options.some((option) => option.allowsFreeText)) allowed.add(freeTextKey(field.key));
	}
	for (const key of Object.keys(input)) {
		if (!allowed.has(key)) errors.push({ field: pathPrefix + key, code: 'unknown_field' });
	}
}

function isVisible(rule: VisibleIf, input: Record<string, unknown>): boolean {
	const value = input[rule.field];
	return typeof value === 'string' && value.trim() === rule.equals;
}

function freeTextKey(fieldKey: string): string {
	return `${fieldKey}_other`;
}

type CheckResult = { value: FormValue } | { error: FieldErrorCode };

function validateField(
	field: FormField,
	path: string,
	source: Record<string, unknown>,
	target: FormValues,
	errors: FieldError[],
	today: string
): void {
	const raw = source[field.key];

	if (isEmptyValue(field, raw)) {
		if (field.required) errors.push({ field: path, code: 'required' });
		return;
	}

	if (field.type === 'guest_list') {
		validateGuestList(field, path, raw, target, errors, today);
		return;
	}

	const result = checkValue(field, raw, today);
	if ('error' in result) {
		errors.push({ field: path, code: result.error });
		return;
	}
	target[field.key] = result.value;

	const option = field.options.find((candidate) => candidate.key === result.value);
	if (option?.allowsFreeText) {
		validateFreeText(field, path, source, target, errors);
	}
}

function isEmptyValue(field: FormField, raw: unknown): boolean {
	if (raw === undefined || raw === null) return true;
	if (typeof raw === 'string') return raw.trim() === '';
	if (Array.isArray(raw)) return raw.length === 0;
	return field.type === 'checkbox' && raw === false;
}

function checkValue(field: FormField, raw: unknown, today: string): CheckResult {
	switch (field.type) {
		case 'text':
		case 'textarea':
		case 'email':
		case 'tel':
		case 'date':
			return checkString(field, raw, today);
		case 'number':
			return checkNumber(field, raw);
		case 'single_choice':
			return checkOption(field, raw);
		case 'checkbox':
			return raw === true ? { value: true } : { error: 'invalid_type' };
		case 'file':
			return checkFileIds(field, raw);
		case 'info':
		case 'guest_list':
			return { error: 'invalid_type' };
	}
}

function checkString(field: FormField, raw: unknown, today: string): CheckResult {
	if (typeof raw !== 'string') return { error: 'invalid_type' };
	const value = raw.trim();

	const maxLength = field.validation.maxLength ?? DEFAULT_MAX_LENGTH[field.type];
	if (maxLength !== undefined && value.length > maxLength) return { error: 'too_long' };
	if (field.validation.minLength !== undefined && value.length < field.validation.minLength) return { error: 'too_short' };

	if (field.type === 'email' && !EMAIL_PATTERN.test(value)) return { error: 'invalid_email' };
	if (field.type === 'tel' && !isPhoneNumber(value)) return { error: 'invalid_phone' };
	if (field.type === 'date') {
		if (!isIsoDate(value)) return { error: 'invalid_date' };
		if (field.validation.notInFuture && value > today) return { error: 'date_in_future' };
	}
	return { value };
}

function isPhoneNumber(value: string): boolean {
	return PHONE_PATTERN.test(value) && value.replace(/\D/g, '').length >= MIN_PHONE_DIGITS;
}

function checkNumber(field: FormField, raw: unknown): CheckResult {
	if (typeof raw !== 'number' || !Number.isFinite(raw)) return { error: 'invalid_type' };
	const { min, max } = field.validation;
	if ((min !== undefined && raw < min) || (max !== undefined && raw > max)) return { error: 'out_of_range' };
	return { value: raw };
}

function checkOption(field: FormField, raw: unknown): CheckResult {
	if (typeof raw !== 'string') return { error: 'invalid_type' };
	const option = field.options.find((candidate) => candidate.key === raw.trim());
	return option ? { value: option.key } : { error: 'invalid_option' };
}

function checkFileIds(field: FormField, raw: unknown): CheckResult {
	if (!Array.isArray(raw) || !raw.every((id) => typeof id === 'string' && FILE_ID_PATTERN.test(id))) {
		return { error: 'invalid_type' };
	}
	const ids = raw as string[];
	if (new Set(ids).size !== ids.length) return { error: 'duplicate_file' };
	if (field.validation.minFiles !== undefined && ids.length < field.validation.minFiles) return { error: 'too_few_files' };
	if (ids.length > (field.validation.maxFiles ?? DEFAULT_MAX_FILES)) return { error: 'too_many_files' };
	return { value: ids };
}

function validateFreeText(
	field: FormField,
	path: string,
	source: Record<string, unknown>,
	target: FormValues,
	errors: FieldError[]
): void {
	const key = freeTextKey(field.key);
	const errorPath = freeTextKey(path);
	const raw = source[key];

	if (isEmptyValue(field, raw)) {
		errors.push({ field: errorPath, code: 'required' });
		return;
	}
	if (typeof raw !== 'string') {
		errors.push({ field: errorPath, code: 'invalid_type' });
		return;
	}
	const text = raw.trim();
	if (text.length > FREE_TEXT_MAX_LENGTH) {
		errors.push({ field: errorPath, code: 'too_long' });
		return;
	}
	target[key] = text;
}

function validateGuestList(
	field: FormField,
	path: string,
	raw: unknown,
	target: FormValues,
	errors: FieldError[],
	today: string
): void {
	if (!Array.isArray(raw)) {
		errors.push({ field: path, code: 'invalid_type' });
		return;
	}
	if (raw.length > (field.validation.maxItems ?? DEFAULT_MAX_ITEMS)) {
		errors.push({ field: path, code: 'too_many_items' });
		return;
	}

	const items: FormValues[] = [];
	raw.forEach((rawItem: unknown, index) => {
		const itemPath = `${path}[${index}]`;
		if (!isPlainObject(rawItem)) {
			errors.push({ field: itemPath, code: 'invalid_type' });
			return;
		}
		collectUnknownKeys(field.itemFields, rawItem, `${itemPath}.`, errors);
		const item: FormValues = {};
		for (const itemField of field.itemFields) {
			validateField(itemField, `${itemPath}.${itemField.key}`, rawItem, item, errors, today);
		}
		items.push(item);
	});
	target[field.key] = items;
}

function checkMinNights(field: FormField, values: FormValues, errors: FieldError[]): void {
	const { minNightsAfter, minNights } = field.validation;
	if (!minNightsAfter) return;
	const start = values[minNightsAfter];
	const end = values[field.key];
	if (typeof start !== 'string' || typeof end !== 'string') return;

	const nights = daysBetween(start, end);
	if (nights <= 0) errors.push({ field: field.key, code: 'date_order' });
	else if (minNights !== undefined && nights < minNights) errors.push({ field: field.key, code: 'stay_too_short' });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
