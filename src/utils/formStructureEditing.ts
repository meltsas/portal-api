import {
	BASE_LANGUAGE,
	DEFAULT_MAX_LENGTH,
	FIELD_TYPES,
	FORM_LANGUAGES,
	listTextKeys,
	type FieldType,
	type FieldValidation,
	type FormField,
	type FormOption,
	type FormSection,
	type FormStructure,
	type VisibleIf,
} from './formSchema';
import type { StoredTexts } from './formTextChanges';
import { findSystemFieldProblems } from './tenantFormSystemFields';

// Ids, text keys and stored answers are built from keys, so a key never contains `.` or `:`.
const KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
// `<field>_other` holds the free text of an "other" option (formSchema.ts).
const FREE_TEXT_SUFFIX = '_other';

export const MAX_SECTIONS = 30;
export const MAX_FIELDS = 100;
export const MAX_OPTIONS = 50;
const MIN_OPTIONS = 2;
const MAX_GUEST_ROWS = 20;
const MAX_MIN_NIGHTS = 365;
const MAX_FILES_LIMIT = 100;

const SECTION_PROPS = ['key', 'fields'];
const FIELD_PROPS = ['key', 'type', 'required', 'validation', 'visibleIf', 'options', 'itemFields'];
const OPTION_PROPS = ['key', 'allowsFreeText'];

const ITEM_FIELD_TYPES: readonly FieldType[] = ['text', 'textarea', 'email', 'tel', 'url', 'date', 'number', 'single_choice', 'checkbox'];
/** The code handles these types specially: a draft may keep such a field from its base version, but not add one. */
const BASE_ONLY_TYPES: readonly FieldType[] = ['file', 'guest_list'];

const TEXT_RULES = ['minLength', 'maxLength'];
const VALIDATION_RULES: Record<FieldType, readonly string[]> = {
	text: TEXT_RULES,
	textarea: TEXT_RULES,
	email: TEXT_RULES,
	tel: TEXT_RULES,
	url: TEXT_RULES,
	number: ['min', 'max'],
	date: ['notInFuture', 'minNightsAfter', 'minNights'],
	single_choice: [],
	checkbox: [],
	info: [],
	guest_list: ['maxItems'],
	file: ['minFiles', 'maxFiles', 'maxFileBytes', 'accept'],
};

export type StructureProblemCode =
	| 'invalid_shape'
	| 'invalid_key'
	| 'reserved_key'
	| 'duplicate_key'
	| 'unsupported_type'
	| 'invalid_validation'
	| 'too_many'
	| 'type_changed'
	| 'new_field_not_allowed'
	| 'locked_validation'
	| 'file_required_mismatch'
	| 'too_few_options'
	| 'invalid_visible_if'
	| 'empty_section'
	| 'system_field'
	| 'missing_text'
	| 'orphan_text';

export interface StructureProblem {
	/** Position in the structure, e.g. `sections[2].fields[0].options[1]`; empty for the form as a whole. */
	path: string;
	code: StructureProblemCode;
	/** The text key, the broken system field rule or the orphan `language:textKey`. */
	detail?: string;
}

export type StructureParseResult = { ok: true; sections: FormSection[] } | { ok: false; errors: StructureProblem[] };

// --- Parsing (blocks saving) ---

/**
 * Checks a structure sent by the editor for everything needed to store and load it safely: shape,
 * valid unique keys, known types, rules that fit the type and the limits. What only has to hold before
 * publishing is checked by findStructureProblems and findTextProblems.
 */
export function parseStructureInput(input: unknown): StructureParseResult {
	if (!Array.isArray(input) || input.length === 0) return { ok: false, errors: [{ path: 'sections', code: 'invalid_shape' }] };

	const errors: StructureProblem[] = [];
	if (input.length > MAX_SECTIONS) errors.push({ path: 'sections', code: 'too_many' });

	const sectionKeys = new Set<string>();
	const fieldKeys = new Set<string>();
	const sections: FormSection[] = [];
	let fieldCount = 0;

	input.forEach((raw: unknown, index) => {
		const path = `sections[${index}]`;
		if (!isPlainObject(raw) || !hasOnlyProps(raw, SECTION_PROPS) || !Array.isArray(raw.fields)) {
			errors.push({ path, code: 'invalid_shape' });
			return;
		}
		const key = parseKey(raw.key, `${path}.key`, sectionKeys, errors);
		const fields: FormField[] = [];
		raw.fields.forEach((rawField: unknown, fieldIndex) => {
			const field = parseField(rawField, `${path}.fields[${fieldIndex}]`, fieldKeys, false, errors);
			if (!field) return;
			fields.push(field);
			fieldCount += 1 + field.itemFields.length;
		});
		sections.push({ key: key ?? '', fields });
	});

	if (fieldCount > MAX_FIELDS) errors.push({ path: 'sections', code: 'too_many' });
	return errors.length > 0 ? { ok: false, errors } : { ok: true, sections };
}

function parseKey(raw: unknown, path: string, seen: Set<string>, errors: StructureProblem[], isFieldKey = false): string | null {
	if (typeof raw !== 'string' || !KEY_PATTERN.test(raw)) {
		errors.push({ path, code: 'invalid_key' });
		return null;
	}
	if (isFieldKey && raw.endsWith(FREE_TEXT_SUFFIX)) errors.push({ path, code: 'reserved_key' });
	if (seen.has(raw)) errors.push({ path, code: 'duplicate_key' });
	seen.add(raw);
	return raw;
}

function parseField(
	raw: unknown,
	path: string,
	siblingKeys: Set<string>,
	isItem: boolean,
	errors: StructureProblem[]
): FormField | null {
	if (!isPlainObject(raw) || !hasOnlyProps(raw, FIELD_PROPS) || typeof raw.required !== 'boolean') {
		errors.push({ path, code: 'invalid_shape' });
		return null;
	}
	const key = parseKey(raw.key, `${path}.key`, siblingKeys, errors, true);
	const type = parseType(raw.type, `${path}.type`, isItem, errors);
	if (!key || !type) return null;

	return {
		key,
		type,
		required: raw.required,
		validation: parseValidation(type, raw.validation ?? {}, `${path}.validation`, errors),
		visibleIf: parseVisibleIf(raw.visibleIf ?? null, `${path}.visibleIf`, errors),
		options: parseOptions(type, raw.options ?? [], `${path}.options`, errors),
		itemFields: parseItemFields(type, raw.itemFields ?? [], `${path}.itemFields`, errors),
	};
}

function parseType(raw: unknown, path: string, isItem: boolean, errors: StructureProblem[]): FieldType | null {
	const allowed: readonly unknown[] = isItem ? ITEM_FIELD_TYPES : FIELD_TYPES;
	if (!allowed.includes(raw)) {
		errors.push({ path, code: 'unsupported_type' });
		return null;
	}
	return raw as FieldType;
}

function parseValidation(type: FieldType, raw: unknown, path: string, errors: StructureProblem[]): FieldValidation {
	if (!isPlainObject(raw)) {
		errors.push({ path, code: 'invalid_validation' });
		return {};
	}

	const validation: Record<string, unknown> = {};
	for (const [rule, value] of Object.entries(raw)) {
		if (!VALIDATION_RULES[type].includes(rule) || !isValidRuleValue(type, rule, value)) {
			errors.push({ path: `${path}.${rule}`, code: 'invalid_validation' });
			continue;
		}
		validation[rule] = value;
	}

	const { minLength, maxLength, min, max, minFiles, maxFiles } = validation as FieldValidation;
	if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
		errors.push({ path: `${path}.minLength`, code: 'invalid_validation' });
	}
	if (min !== undefined && max !== undefined && min > max) errors.push({ path: `${path}.min`, code: 'invalid_validation' });
	if (minFiles !== undefined && maxFiles !== undefined && minFiles > maxFiles) {
		errors.push({ path: `${path}.minFiles`, code: 'invalid_validation' });
	}
	return validation as FieldValidation;
}

function isValidRuleValue(type: FieldType, rule: string, value: unknown): boolean {
	switch (rule) {
		case 'minLength':
		case 'maxLength':
			return isIntegerInRange(value, 1, DEFAULT_MAX_LENGTH[type] ?? 0);
		case 'min':
		case 'max':
			return typeof value === 'number' && Number.isFinite(value);
		case 'notInFuture':
			return typeof value === 'boolean';
		case 'minNightsAfter':
			return typeof value === 'string' && KEY_PATTERN.test(value);
		case 'minNights':
			return isIntegerInRange(value, 1, MAX_MIN_NIGHTS);
		case 'maxItems':
			return isIntegerInRange(value, 1, MAX_GUEST_ROWS);
		case 'minFiles':
			return isIntegerInRange(value, 0, MAX_FILES_LIMIT);
		case 'maxFiles':
			return isIntegerInRange(value, 1, MAX_FILES_LIMIT);
		case 'maxFileBytes':
			return isIntegerInRange(value, 1, Number.MAX_SAFE_INTEGER);
		case 'accept':
			return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string');
		default:
			return false;
	}
}

function parseVisibleIf(raw: unknown, path: string, errors: StructureProblem[]): VisibleIf | null {
	if (raw === null) return null;
	if (!isPlainObject(raw) || !hasOnlyProps(raw, ['field', 'equals']) || typeof raw.field !== 'string' || typeof raw.equals !== 'string') {
		errors.push({ path, code: 'invalid_shape' });
		return null;
	}
	return { field: raw.field, equals: raw.equals };
}

function parseOptions(type: FieldType, raw: unknown, path: string, errors: StructureProblem[]): FormOption[] {
	if (!Array.isArray(raw)) {
		errors.push({ path, code: 'invalid_shape' });
		return [];
	}
	if (raw.length === 0) return [];
	if (type !== 'single_choice') {
		errors.push({ path, code: 'invalid_shape' });
		return [];
	}
	if (raw.length > MAX_OPTIONS) errors.push({ path, code: 'too_many' });

	const keys = new Set<string>();
	const options: FormOption[] = [];
	raw.forEach((rawOption: unknown, index) => {
		const optionPath = `${path}[${index}]`;
		if (
			!isPlainObject(rawOption) ||
			!hasOnlyProps(rawOption, OPTION_PROPS) ||
			(rawOption.allowsFreeText !== undefined && typeof rawOption.allowsFreeText !== 'boolean')
		) {
			errors.push({ path: optionPath, code: 'invalid_shape' });
			return;
		}
		const key = parseKey(rawOption.key, `${optionPath}.key`, keys, errors);
		if (key) options.push({ key, allowsFreeText: rawOption.allowsFreeText === true });
	});
	return options;
}

function parseItemFields(type: FieldType, raw: unknown, path: string, errors: StructureProblem[]): FormField[] {
	if (!Array.isArray(raw)) {
		errors.push({ path, code: 'invalid_shape' });
		return [];
	}
	if (raw.length === 0) return [];
	if (type !== 'guest_list') {
		errors.push({ path, code: 'invalid_shape' });
		return [];
	}
	const keys = new Set<string>();
	return raw.flatMap((rawItem: unknown, index) => parseField(rawItem, `${path}[${index}]`, keys, true, errors) ?? []);
}

// --- Problems (block publishing) ---

/**
 * What a parsed draft still breaks: system fields the code relies on, changes the editor does not allow
 * compared with `base` (the version the draft was copied from) and references between fields.
 */
export function findStructureProblems(structure: FormStructure, base: FormStructure): StructureProblem[] {
	const problems: StructureProblem[] = [];
	const baseFields = new Map(base.sections.flatMap((section) => section.fields).map((field) => [field.key, field]));
	const earlierChoices = new Map<string, FormField>();

	structure.sections.forEach((section, sectionIndex) => {
		const sectionPath = `sections[${sectionIndex}]`;
		if (section.fields.length === 0) problems.push({ path: sectionPath, code: 'empty_section' });

		section.fields.forEach((field, fieldIndex) => {
			const path = `${sectionPath}.fields[${fieldIndex}]`;
			const baseField = baseFields.get(field.key);
			problems.push(...compareWithBase(field, baseField, path));
			problems.push(...checkVisibleIf(field, earlierChoices, path));

			field.itemFields.forEach((item, itemIndex) => {
				const itemPath = `${path}.itemFields[${itemIndex}]`;
				const baseItem = baseField?.itemFields.find((candidate) => candidate.key === item.key);
				problems.push(...compareWithBase(item, baseItem, itemPath));
				// Values of guest rows are validated without visibleIf (formSchema.ts).
				if (item.visibleIf) problems.push({ path: `${itemPath}.visibleIf`, code: 'invalid_visible_if' });
			});

			if (field.type === 'single_choice') earlierChoices.set(field.key, field);
		});
	});

	problems.push(...systemFieldProblems(structure));
	return problems;
}

function compareWithBase(field: FormField, baseField: FormField | undefined, path: string): StructureProblem[] {
	const problems: StructureProblem[] = [];
	if (baseField && baseField.type !== field.type) problems.push({ path: `${path}.type`, code: 'type_changed' });
	if (BASE_ONLY_TYPES.includes(field.type) && baseField?.type !== field.type) {
		problems.push({ path, code: 'new_field_not_allowed' });
	}
	if (field.type === 'single_choice' && field.options.length < MIN_OPTIONS) {
		problems.push({ path: `${path}.options`, code: 'too_few_options' });
	}

	const { validation } = field;
	const baseValidation = baseField?.validation ?? {};
	if (validation.minNightsAfter !== baseValidation.minNightsAfter || validation.minNights !== baseValidation.minNights) {
		problems.push({ path: `${path}.validation`, code: 'locked_validation' });
	}
	if (field.type === 'file') {
		if (baseField?.type === 'file' && !sameFileLimits(validation, baseValidation)) {
			problems.push({ path: `${path}.validation`, code: 'locked_validation' });
		}
		// The public form asks for minFiles even when the field is optional, the server would not.
		if (!field.required && (validation.minFiles ?? 0) > 0) problems.push({ path, code: 'file_required_mismatch' });
	}
	return problems;
}

function sameFileLimits(a: FieldValidation, b: FieldValidation): boolean {
	return a.maxFiles === b.maxFiles && a.maxFileBytes === b.maxFileBytes && JSON.stringify(a.accept) === JSON.stringify(b.accept);
}

function checkVisibleIf(field: FormField, earlierChoices: Map<string, FormField>, path: string): StructureProblem[] {
	const rule = field.visibleIf;
	if (!rule) return [];
	const target = earlierChoices.get(rule.field);
	if (target?.options.some((option) => option.key === rule.equals)) return [];
	return [{ path: `${path}.visibleIf`, code: 'invalid_visible_if' }];
}

function systemFieldProblems(structure: FormStructure): StructureProblem[] {
	const paths = new Map<string, string>();
	structure.sections.forEach((section, sectionIndex) => {
		section.fields.forEach((field, fieldIndex) => {
			const path = `sections[${sectionIndex}].fields[${fieldIndex}]`;
			paths.set(field.key, path);
			field.itemFields.forEach((item, itemIndex) => paths.set(`${field.key}.${item.key}`, `${path}.itemFields[${itemIndex}]`));
		});
	});

	// Messages look like `other_guests.date_of_birth: type is text, expected date`.
	return findSystemFieldProblems(structure).map((message) => ({
		path: paths.get(message.slice(0, message.indexOf(':'))) ?? '',
		code: 'system_field' as const,
		detail: message,
	}));
}

/** Required base-language texts that are missing, and stored texts whose key the structure no longer has. */
export function findTextProblems(structure: FormStructure, texts: StoredTexts): StructureProblem[] {
	const problems: StructureProblem[] = [];
	const specs = listTextKeys(structure);
	const knownKeys = new Set(specs.map((spec) => spec.key));
	const elementPaths = textElementPaths(structure);
	const baseTexts = texts[BASE_LANGUAGE] ?? {};

	for (const spec of specs) {
		if (spec.required && !baseTexts[spec.key]?.trim()) {
			problems.push({ path: elementPaths.get(textElement(spec.key)) ?? '', code: 'missing_text', detail: spec.key });
		}
	}
	for (const language of FORM_LANGUAGES) {
		for (const textKey of Object.keys(texts[language] ?? {})) {
			if (!knownKeys.has(textKey)) problems.push({ path: '', code: 'orphan_text', detail: `${language}:${textKey}` });
		}
	}
	return problems;
}

/** `section.stay.title` → `section.stay`; an option text key names its option as a whole. */
function textElement(textKey: string): string {
	return textKey.startsWith('option.') ? textKey : textKey.slice(0, textKey.lastIndexOf('.'));
}

function textElementPaths(structure: FormStructure): Map<string, string> {
	const paths = new Map<string, string>([['template', '']]);
	const addField = (field: FormField, keyPath: string, path: string) => {
		paths.set(`field.${keyPath}`, path);
		field.options.forEach((option, index) => paths.set(`option.${keyPath}.${option.key}`, `${path}.options[${index}]`));
		field.itemFields.forEach((item, index) => addField(item, `${keyPath}.item.${item.key}`, `${path}.itemFields[${index}]`));
	};
	structure.sections.forEach((section, sectionIndex) => {
		paths.set(`section.${section.key}`, `sections[${sectionIndex}]`);
		section.fields.forEach((field, fieldIndex) => addField(field, field.key, `sections[${sectionIndex}].fields[${fieldIndex}]`));
	});
	return paths;
}

// --- Rows ---

// Row ids are built from keys, so saving an unchanged draft writes the same ids. The version copy in
// handlers/admin/tenantFormTemplateVersions.ts builds them the same way in SQL.
export function sectionRowId(templateId: string, sectionKey: string): string {
	return `${templateId}:s:${sectionKey}`;
}

export function fieldRowId(templateId: string, fieldKey: string, parentKey: string | null = null): string {
	return `${templateId}:f:${parentKey ? `${parentKey}.` : ''}${fieldKey}`;
}

export function optionRowId(fieldId: string, optionKey: string): string {
	return `${fieldId}:o:${optionKey}`;
}

export interface StructureRows {
	sections: { id: string; key: string; sortOrder: number }[];
	fields: {
		id: string;
		sectionId: string;
		parentId: string | null;
		key: string;
		type: FieldType;
		required: 0 | 1;
		sortOrder: number;
		validation: string;
		visibleIf: string | null;
	}[];
	options: { id: string; fieldId: string; key: string; sortOrder: number; allowsFreeText: 0 | 1 }[];
}

/** Table rows of a structure, parents before their item fields. Sort orders start at 1 within their parent. */
export function buildStructureRows(templateId: string, sections: FormSection[]): StructureRows {
	const rows: StructureRows = { sections: [], fields: [], options: [] };

	const addField = (field: FormField, index: number, sectionId: string, parentKey: string | null) => {
		const id = fieldRowId(templateId, field.key, parentKey);
		rows.fields.push({
			id,
			sectionId,
			parentId: parentKey ? fieldRowId(templateId, parentKey) : null,
			key: field.key,
			type: field.type,
			required: field.required ? 1 : 0,
			sortOrder: index + 1,
			validation: JSON.stringify(field.validation),
			visibleIf: field.visibleIf ? JSON.stringify(field.visibleIf) : null,
		});
		field.options.forEach((option, optionIndex) =>
			rows.options.push({
				id: optionRowId(id, option.key),
				fieldId: id,
				key: option.key,
				sortOrder: optionIndex + 1,
				allowsFreeText: option.allowsFreeText ? 1 : 0,
			})
		);
		field.itemFields.forEach((item, itemIndex) => addField(item, itemIndex, sectionId, field.key));
	};

	sections.forEach((section, sectionIndex) => {
		const sectionId = sectionRowId(templateId, section.key);
		rows.sections.push({ id: sectionId, key: section.key, sortOrder: sectionIndex + 1 });
		section.fields.forEach((field, fieldIndex) => addField(field, fieldIndex, sectionId, null));
	});
	return rows;
}

// --- Helpers ---

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyProps(value: Record<string, unknown>, allowed: string[]): boolean {
	return Object.keys(value).every((key) => allowed.includes(key));
}

function isIntegerInRange(value: unknown, min: number, max: number): boolean {
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}
