import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
	FORM_LANGUAGES,
	listTextKeys,
	loadFormStructure,
	validateFormValues,
	type FormField,
	type FormStructure,
} from '../../src/utils/formSchema';
import {
	buildStructureRows,
	findStructureProblems,
	findTextProblems,
	parseStructureInput,
	type StructureProblem,
} from '../../src/utils/formStructureEditing';
import { propagateTextOperations, type StoredTexts } from '../../src/utils/formTextChanges';
import { loadTemplateTexts, type TemplateTexts } from '../../src/utils/tenantFormTemplates';

let v1: FormStructure;
let v1Texts: TemplateTexts;

beforeAll(async () => {
	v1 = (await loadFormStructure(env.portal_db, 'tenant_details_v1'))!;
	v1Texts = await loadTemplateTexts(env.portal_db, 'tenant_details_v1');
});

/** A deep copy of template v1 to change in a test. */
function draft(): FormStructure {
	return structuredClone(v1);
}

function sectionOf(structure: FormStructure, key: string) {
	return structure.sections.find((section) => section.key === key)!;
}

function fieldOf(structure: FormStructure, key: string): FormField {
	return structure.sections.flatMap((section) => section.fields).find((field) => field.key === key)!;
}

function textField(key: string, extra: Partial<FormField> = {}): FormField {
	return { key, type: 'text', required: false, validation: {}, visibleIf: null, options: [], itemFields: [], ...extra };
}

function parseErrors(sections: unknown): StructureProblem[] {
	const result = parseStructureInput(sections);
	return result.ok ? [] : result.errors;
}

function codes(problems: StructureProblem[]): string[] {
	return problems.map((problem) => problem.code);
}

describe('parseStructureInput', () => {
	it('accepts template v1 as the editor sends it back', () => {
		const result = parseStructureInput(JSON.parse(JSON.stringify(v1.sections)));
		expect(result).toEqual({ ok: true, sections: v1.sections });
	});

	it('fills in optional field properties', () => {
		const result = parseStructureInput([{ key: 'extra', fields: [{ key: 'linkedin', type: 'url', required: false }] }]);
		expect(result).toEqual({ ok: true, sections: [{ key: 'extra', fields: [textField('linkedin', { type: 'url' })] }] });
	});

	it.each([
		['not an array', { key: 'stay' }],
		['empty', []],
	])('rejects sections that are %s', (_label, sections) => {
		expect(parseErrors(sections)).toEqual([{ path: 'sections', code: 'invalid_shape' }]);
	});

	it('rejects invalid, reserved and duplicate keys', () => {
		const sections = draft().sections;
		sections[0].fields.push(textField('Bad-Key'), textField('stay_purpose_other'), textField('first_name'));
		sections[0].key = sections[1].key;
		// A duplicate is reported where it occurs the second time.
		expect(parseErrors(sections)).toEqual([
			{ path: 'sections[0].fields[2].key', code: 'invalid_key' },
			{ path: 'sections[0].fields[3].key', code: 'reserved_key' },
			{ path: 'sections[1].key', code: 'duplicate_key' },
			{ path: 'sections[1].fields[0].key', code: 'duplicate_key' },
		]);
	});

	it('allows the same key for a guest row field and a top-level field, not twice in one row', () => {
		const structure = draft();
		const guests = fieldOf(structure, 'other_guests');
		expect(parseErrors(structure.sections)).toEqual([]);
		guests.itemFields.push(textField('first_name'));
		expect(parseErrors(structure.sections)).toEqual([
			{ path: 'sections[4].fields[0].itemFields[8].key', code: 'duplicate_key' },
		]);
	});

	it('rejects unknown types and guest row fields of a type rows do not support', () => {
		const structure = draft();
		sectionOf(structure, 'stay').fields.push(textField('rating', { type: 'stars' as FormField['type'] }));
		fieldOf(structure, 'other_guests').itemFields.push(textField('passport_photo', { type: 'file' }));
		expect(parseErrors(structure.sections)).toEqual([
			{ path: 'sections[0].fields[2].type', code: 'unsupported_type' },
			{ path: 'sections[4].fields[0].itemFields[8].type', code: 'unsupported_type' },
		]);
	});

	it('rejects options and guest row fields on types that have none', () => {
		const sections = [
			{
				key: 'extra',
				fields: [
					textField('nickname', { options: [{ key: 'a', allowsFreeText: false }] }),
					textField('pets', { itemFields: [textField('name')] }),
				],
			},
		];
		expect(parseErrors(sections)).toEqual([
			{ path: 'sections[0].fields[0].options', code: 'invalid_shape' },
			{ path: 'sections[0].fields[1].itemFields', code: 'invalid_shape' },
		]);
	});

	it('rejects validation rules the type does not have or values out of range', () => {
		const sections = [
			{
				key: 'extra',
				fields: [
					textField('nickname', { validation: { maxLength: 501 } }),
					textField('bio', { type: 'textarea', validation: { minLength: 10, maxLength: 5 } }),
					textField('age', { type: 'number', validation: { maxLength: 3 } }),
				],
			},
		];
		expect(parseErrors(sections)).toEqual([
			{ path: 'sections[0].fields[0].validation.maxLength', code: 'invalid_validation' },
			{ path: 'sections[0].fields[1].validation.minLength', code: 'invalid_validation' },
			{ path: 'sections[0].fields[2].validation.maxLength', code: 'invalid_validation' },
		]);
	});

	it('rejects unknown properties and a required flag that is not a boolean', () => {
		const sections = [{ key: 'extra', fields: [{ ...textField('a'), hidden: true }, { ...textField('b'), required: 'yes' }] }];
		expect(parseErrors(sections)).toEqual([
			{ path: 'sections[0].fields[0]', code: 'invalid_shape' },
			{ path: 'sections[0].fields[1]', code: 'invalid_shape' },
		]);
	});

	it('limits the number of sections, fields and options', () => {
		const manySections = Array.from({ length: 31 }, (_, index) => ({ key: `s${index}`, fields: [textField(`f${index}`)] }));
		expect(codes(parseErrors(manySections))).toEqual(['too_many']);

		const manyFields = [{ key: 'extra', fields: Array.from({ length: 101 }, (_, index) => textField(`f${index}`)) }];
		expect(codes(parseErrors(manyFields))).toEqual(['too_many']);

		const options = Array.from({ length: 51 }, (_, index) => ({ key: `o${index}`, allowsFreeText: false }));
		expect(parseErrors([{ key: 'extra', fields: [textField('pick', { type: 'single_choice', options })] }])).toEqual([
			{ path: 'sections[0].fields[0].options', code: 'too_many' },
		]);
	});
});

describe('findStructureProblems', () => {
	it('finds nothing in template v1', () => {
		expect(findStructureProblems(v1, v1)).toEqual([]);
	});

	it('allows the changes the editor supports', () => {
		const structure = draft();
		sectionOf(structure, 'main_guest').fields.push(textField('linkedin', { type: 'url', validation: { maxLength: 300 } }));
		fieldOf(structure, 'employer').required = true;
		const purpose = fieldOf(structure, 'stay_purpose');
		purpose.options.unshift(purpose.options.pop()!, { key: 'digital_nomad', allowsFreeText: false });
		const verification = sectionOf(structure, 'id_verification');
		verification.fields = verification.fields.filter((field) => field.key !== 'video_call_time');
		structure.sections.push({ key: 'references', fields: [textField('reference_name')] });
		fieldOf(structure, 'id_documents').required = false;
		delete fieldOf(structure, 'id_documents').validation.minFiles;

		expect(findStructureProblems(structure, v1)).toEqual([]);
	});

	it('reports broken system fields at their position', () => {
		const structure = draft();
		fieldOf(structure, 'phone').required = false;
		fieldOf(structure, 'sex').options.push({ key: 'unknown', allowsFreeText: false });
		sectionOf(structure, 'stay').fields = sectionOf(structure, 'stay').fields.filter((field) => field.key !== 'planned_arrival');

		expect(findStructureProblems(structure, v1)).toEqual([
			{ path: '', code: 'system_field', detail: 'planned_arrival: missing' },
			{ path: 'sections[1].fields[2]', code: 'system_field', detail: 'sex: option "unknown" is not allowed' },
			{ path: 'sections[2].fields[0]', code: 'system_field', detail: 'phone: must be required' },
		]);
	});

	it('does not allow new file or guest list fields or a changed field type', () => {
		const structure = draft();
		sectionOf(structure, 'id_verification').fields.push(textField('selfie', { type: 'file', validation: { maxFiles: 1 } }));
		fieldOf(structure, 'video_call_time').type = 'textarea';

		expect(findStructureProblems(structure, v1)).toEqual([
			{ path: 'sections[7].fields[2].type', code: 'type_changed' },
			{ path: 'sections[7].fields[3]', code: 'new_field_not_allowed' },
		]);
	});

	it('locks the file limits and the minimum stay, and keeps an optional file field consistent', () => {
		const structure = draft();
		fieldOf(structure, 'id_documents').validation.maxFiles = 20;
		fieldOf(structure, 'id_documents').required = false;
		fieldOf(structure, 'planned_departure').validation.minNights = 7;

		expect(findStructureProblems(structure, v1)).toEqual([
			{ path: 'sections[0].fields[1].validation', code: 'locked_validation' },
			{ path: 'sections[7].fields[0].validation', code: 'locked_validation' },
			{ path: 'sections[7].fields[0]', code: 'file_required_mismatch' },
		]);
	});

	it('checks options, conditions and empty sections', () => {
		const structure = draft();
		fieldOf(structure, 'video_call_willing').options = [{ key: 'no', allowsFreeText: false }];
		structure.sections.push({ key: 'empty', fields: [] });
		sectionOf(structure, 'stay').fields.unshift(
			textField('early_note', { visibleIf: { field: 'video_call_willing', equals: 'no' } })
		);

		expect(codes(findStructureProblems(structure, v1))).toEqual([
			'invalid_visible_if',
			'too_few_options',
			'invalid_visible_if',
			'empty_section',
		]);
	});
});

describe('findTextProblems', () => {
	it('finds nothing in template v1', () => {
		expect(findTextProblems(v1, v1Texts)).toEqual([]);
	});

	it('reports a missing English text at its element and texts of removed keys', () => {
		const structure = draft();
		sectionOf(structure, 'main_guest').fields.push(textField('linkedin', { type: 'url' }));
		fieldOf(structure, 'stay_purpose').options.push({ key: 'digital_nomad', allowsFreeText: false });
		sectionOf(structure, 'employment').fields.pop();

		const problems = findTextProblems(structure, v1Texts);
		expect(problems.filter((problem) => problem.code === 'missing_text')).toEqual([
			{ path: 'sections[1].fields[7]', code: 'missing_text', detail: 'field.linkedin.label' },
			{ path: 'sections[5].fields[0].options[9]', code: 'missing_text', detail: 'option.stay_purpose.digital_nomad' },
		]);

		const orphans = problems.filter((problem) => problem.code === 'orphan_text');
		const jobTitleTexts = FORM_LANGUAGES.flatMap((language) =>
			Object.keys(v1Texts[language])
				.filter((key) => key.startsWith('field.job_title.'))
				.map((key) => `${language}:${key}`)
		);
		expect(jobTitleTexts.length).toBeGreaterThan(0);
		expect(orphans.map((problem) => problem.detail).sort()).toEqual(jobTitleTexts.sort());
		expect(orphans.every((problem) => problem.path === '')).toBe(true);
	});
});

describe('buildStructureRows', () => {
	it('builds ids from keys and puts guest row fields after their parent', () => {
		const rows = buildStructureRows('tenant_details_v2', v1.sections);
		expect(rows.sections[0]).toEqual({ id: 'tenant_details_v2:s:stay', key: 'stay', sortOrder: 1 });

		const guestsIndex = rows.fields.findIndex((row) => row.key === 'other_guests');
		expect(rows.fields[guestsIndex + 1]).toMatchObject({
			id: 'tenant_details_v2:f:other_guests.first_name',
			parentId: 'tenant_details_v2:f:other_guests',
			sectionId: 'tenant_details_v2:s:guests',
			sortOrder: 1,
		});
		expect(rows.fields.find((row) => row.key === 'video_call_time')).toMatchObject({
			visibleIf: '{"field":"video_call_willing","equals":"yes"}',
			required: 0,
		});
		expect(rows.options.find((row) => row.key === 'other' && row.fieldId.endsWith(':f:stay_purpose'))).toEqual({
			id: 'tenant_details_v2:f:stay_purpose:o:other',
			fieldId: 'tenant_details_v2:f:stay_purpose',
			key: 'other',
			sortOrder: 9,
			allowsFreeText: 1,
		});
		expect(new Set(rows.fields.map((row) => row.id)).size).toBe(rows.fields.length);
	});
});

describe('propagateTextOperations', () => {
	const specs = [
		{ key: 'section.stay.title', required: true },
		{ key: 'field.first_name.help', required: false },
		{ key: 'field.city.help', required: false },
	];
	const active: StoredTexts = {
		en: { 'section.stay.title': 'Stay', 'field.first_name.help': 'As in passport' },
		sv: { 'section.stay.title': 'Vistelse', 'field.first_name.help': 'Som i passet' },
	};

	it('applies an edit where the draft still has the old text', () => {
		const draftTexts: StoredTexts = structuredClone(active);
		const operations = [
			{ kind: 'upsert' as const, language: 'sv' as const, textKey: 'section.stay.title', text: 'Resa' },
			{ kind: 'delete' as const, language: 'sv' as const, textKey: 'field.first_name.help' },
		];
		expect(propagateTextOperations(operations, active, draftTexts, specs)).toEqual(operations);
	});

	it('keeps a text the admin already changed in the draft', () => {
		const draftTexts: StoredTexts = { ...structuredClone(active), sv: { 'section.stay.title': 'Resa och vistelse' } };
		const operations = [{ kind: 'upsert' as const, language: 'sv' as const, textKey: 'section.stay.title', text: 'Resa' }];
		expect(propagateTextOperations(operations, active, draftTexts, specs)).toEqual([]);
	});

	it('skips keys the draft no longer has and translations without an English text in the draft', () => {
		const operations = [
			{ kind: 'upsert' as const, language: 'sv' as const, textKey: 'field.city.help', text: 'Ort' },
			{ kind: 'delete_all_languages' as const, textKey: 'field.first_name.help' },
		];
		const draftTexts: StoredTexts = { en: { 'section.stay.title': 'Stay' } };
		expect(propagateTextOperations(operations, active, draftTexts, specs.slice(0, 1).concat(specs[2]))).toEqual([]);
	});

	it('adds a new English text and its translation together', () => {
		const operations = [
			{ kind: 'upsert' as const, language: 'sv' as const, textKey: 'field.city.help', text: 'Ort' },
			{ kind: 'upsert' as const, language: 'en' as const, textKey: 'field.city.help', text: 'Town' },
		];
		expect(propagateTextOperations(operations, active, structuredClone(active), specs)).toEqual([operations[1], operations[0]]);
	});
});

describe('url fields', () => {
	const structure = (): FormStructure => ({
		templateId: 't',
		sections: [{ key: 'extra', fields: [textField('linkedin', { type: 'url' })] }],
	});

	it.each(['https://www.linkedin.com/in/example', 'https://example.com/a b'.replace(' ', '%20')])('accepts %s', (value) => {
		expect(validateFormValues(structure(), { linkedin: value }, '2026-10-17')).toEqual({ ok: true, values: { linkedin: value } });
	});

	it.each(['http://www.linkedin.com/in/example', 'linkedin.com/in/example', 'https://localhost', 'https://exa mple.com', `https://example.com/${'a'.repeat(500)}`])(
		'rejects %s',
		(value) => {
			const result = validateFormValues(structure(), { linkedin: value }, '2026-10-17');
			expect(result.ok).toBe(false);
		}
	);

	it('has label, help and placeholder texts', () => {
		expect(listTextKeys(structure()).map((spec) => spec.key)).toContain('field.linkedin.placeholder');
	});
});
