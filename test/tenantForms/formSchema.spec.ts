import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
	FORM_LANGUAGES,
	findUnknownTextVariables,
	listTextKeys,
	loadFormStructure,
	loadFormTexts,
	validateFormValues,
	type FieldError,
	type FormField,
	type FormStructure,
} from '../../src/utils/formSchema';
import { MIN_STAY_NIGHTS } from '../../src/utils/stay';

const TEMPLATE_ID = 'tenant_details_v1';
const TODAY = '2026-10-13';
const FILE_ID = '3f2b8c1e-0000-4000-8000-000000000001';

let structure: FormStructure;

beforeAll(async () => {
	const loaded = await loadFormStructure(env.portal_db, TEMPLATE_ID);
	if (!loaded) throw new Error('tenant_details_v1 is not seeded');
	structure = loaded;
});

function allFields(): FormField[] {
	return structure.sections.flatMap((section) => section.fields);
}

function findField(key: string): FormField {
	const field = allFields().find((candidate) => candidate.key === key);
	if (!field) throw new Error(`No field ${key}`);
	return field;
}

function validGuest(): Record<string, unknown> {
	return {
		first_name: 'Child',
		last_name: 'Example',
		sex: 'male',
		date_of_birth: '2015-03-01',
		citizenship: 'Swedish',
		document_type: 'passport',
		document_number: 'X7654321',
		relationship: 'child',
	};
}

function validSubmission(): Record<string, unknown> {
	return {
		planned_arrival: '2026-12-01',
		planned_departure: '2027-01-15',
		first_name: '  Test ',
		last_name: 'Example',
		sex: 'female',
		date_of_birth: '1980-05-20',
		citizenship: 'Swedish',
		document_type: 'passport',
		document_number: 'X1234567',
		phone: '+46 70 123 45 67',
		contact_email: 'guest@example.com',
		address_line1: 'Testgatan 1',
		city: 'Uppsala',
		postcode: '753 10',
		country: 'Sweden',
		other_guests: [validGuest()],
		stay_purpose: 'pensioner_seasonal',
		employment_type: 'pensioner',
		id_documents: [FILE_ID],
		video_call_willing: 'no',
		privacy_consent: true,
	};
}

function errorsOf(input: unknown): FieldError[] {
	const result = validateFormValues(structure, input, TODAY);
	return result.ok ? [] : result.errors;
}

describe('tenant_details_v1 template seed', () => {
	it('has the decided sections, guest item fields and shared stay purpose keys', () => {
		expect(structure.sections.map((section) => section.key)).toEqual([
			'stay',
			'main_guest',
			'contact',
			'address',
			'guests',
			'purpose',
			'employment',
			'id_verification',
			'special_requests',
			'consent',
		]);
		expect(findField('other_guests').itemFields.map((field) => field.key)).toEqual([
			'first_name',
			'last_name',
			'sex',
			'date_of_birth',
			'citizenship',
			'document_type',
			'document_number',
			'relationship',
		]);
		expect(findField('stay_purpose').options.map((option) => option.key)).toEqual([
			'work_assignment',
			'pensioner_seasonal',
			'studies',
			'medical_treatment',
			'family_visit',
			'relocation',
			'house_renovation',
			'sports_event',
			'other',
		]);
	});

	it('uses the shared minimum stay for planned_departure', () => {
		expect(findField('planned_departure').validation).toMatchObject({
			minNightsAfter: 'planned_arrival',
			minNights: MIN_STAY_NIGHTS,
		});
	});

	it('only references existing fields and options in field rules', () => {
		for (const field of allFields()) {
			if (field.visibleIf) {
				const controller = findField(field.visibleIf.field);
				expect(controller.options.map((option) => option.key)).toContain(field.visibleIf.equals);
			}
			if (field.validation.minNightsAfter) {
				expect(findField(field.validation.minNightsAfter).type).toBe('date');
			}
		}
	});

	it('has every required text in English and every English text in Swedish', async () => {
		const { results } = await env.portal_db
			.prepare(`SELECT language, text_key, text FROM form_translations WHERE template_id = ?`)
			.bind(TEMPLATE_ID)
			.all<{ language: string; text_key: string; text: string }>();

		const validKeys = new Set(listTextKeys(structure).map((spec) => spec.key));
		const keysOf = (language: string) => results.filter((row) => row.language === language).map((row) => row.text_key).sort();
		const englishKeys = new Set(keysOf('en'));

		const missingRequired = listTextKeys(structure).filter((spec) => spec.required && !englishKeys.has(spec.key));
		expect(missingRequired).toEqual([]);
		expect(results.filter((row) => !validKeys.has(row.text_key)).map((row) => row.text_key)).toEqual([]);
		for (const language of FORM_LANGUAGES) {
			expect({ language, keys: keysOf(language) }).toEqual({ language, keys: keysOf('en') });
		}
		expect(results.filter((row) => !(FORM_LANGUAGES as readonly string[]).includes(row.language))).toEqual([]);
		expect(results.filter((row) => findUnknownTextVariables(row.text).length > 0)).toEqual([]);
		expect(results.filter((row) => row.text.trim() === '' || row.text.includes('\r'))).toEqual([]);
	});
});

describe('loadFormStructure', () => {
	it('returns null for an unknown template', async () => {
		expect(await loadFormStructure(env.portal_db, 'no_such_template')).toBeNull();
	});
});

describe('loadFormTexts', () => {
	it('returns the requested language', async () => {
		const texts = await loadFormTexts(env.portal_db, TEMPLATE_ID, 'sv');
		expect(texts['section.stay.title']).toBe('Resa & vistelse');
	});

	it('falls back to English per key', async () => {
		await env.portal_db
			.prepare(`DELETE FROM form_translations WHERE template_id = ? AND language = 'no' AND text_key = ?`)
			.bind(TEMPLATE_ID, 'section.main_guest.title')
			.run();

		const texts = await loadFormTexts(env.portal_db, TEMPLATE_ID, 'no');
		expect(texts['section.stay.title']).toBe('Reise og opphold');
		expect(texts['section.main_guest.title']).toBe('Main guest');
	});
});

describe('findUnknownTextVariables', () => {
	it('lists only variables outside the allowed set', () => {
		expect(findUnknownTextVariables('Welcome to {offerTitle}, {displayName}! {price} {price}')).toEqual(['price']);
	});
});

describe('validateFormValues', () => {
	it('accepts a complete submission, trims strings and drops hidden fields', () => {
		const result = validateFormValues(structure, { ...validSubmission(), video_call_time: 'Evenings' }, TODAY);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.values.first_name).toBe('Test');
		expect(result.values.other_guests).toEqual([validGuest()]);
		expect(result.values).not.toHaveProperty('video_call_time');
	});

	it('keeps a visible conditional field', () => {
		const result = validateFormValues(
			structure,
			{ ...validSubmission(), video_call_willing: 'yes', video_call_time: 'Evenings' },
			TODAY
		);
		expect(result.ok && result.values.video_call_time).toBe('Evenings');
	});

	it('rejects input that is not an object', () => {
		expect(errorsOf([])).toEqual([{ field: '', code: 'invalid_type' }]);
	});

	it('reports missing required fields', () => {
		const input = validSubmission();
		delete input.first_name;
		input.id_documents = [];
		input.privacy_consent = false;
		expect(errorsOf(input)).toEqual([
			{ field: 'first_name', code: 'required' },
			{ field: 'id_documents', code: 'required' },
			{ field: 'privacy_consent', code: 'required' },
		]);
	});

	it('rejects unknown keys, also inside guest rows', () => {
		const input = { ...validSubmission(), is_admin: true, other_guests: [{ ...validGuest(), nickname: 'x' }] };
		expect(errorsOf(input)).toEqual([
			{ field: 'is_admin', code: 'unknown_field' },
			{ field: 'other_guests[0].nickname', code: 'unknown_field' },
		]);
	});

	it('requires document type, sex and relationship on every guest row', () => {
		const guest = validGuest();
		delete guest.document_type;
		delete guest.sex;
		delete guest.relationship;
		expect(errorsOf({ ...validSubmission(), other_guests: [validGuest(), guest] })).toEqual([
			{ field: 'other_guests[1].sex', code: 'required' },
			{ field: 'other_guests[1].document_type', code: 'required' },
			{ field: 'other_guests[1].relationship', code: 'required' },
		]);
	});

	it('limits the number of guest rows', () => {
		const guests = Array.from({ length: 11 }, () => validGuest());
		expect(errorsOf({ ...validSubmission(), other_guests: guests })).toEqual([
			{ field: 'other_guests', code: 'too_many_items' },
		]);
	});

	it('rejects options that are not in the template', () => {
		expect(errorsOf({ ...validSubmission(), stay_purpose: 'winter_escape' })).toEqual([
			{ field: 'stay_purpose', code: 'invalid_option' },
		]);
	});

	it('requires the free text for an "other" option and drops it otherwise', () => {
		expect(errorsOf({ ...validSubmission(), stay_purpose: 'other' })).toEqual([
			{ field: 'stay_purpose_other', code: 'required' },
		]);

		const withText = validateFormValues(
			structure,
			{ ...validSubmission(), stay_purpose: 'other', stay_purpose_other: ' Language course ' },
			TODAY
		);
		expect(withText.ok && withText.values.stay_purpose_other).toBe('Language course');

		const notOther = validateFormValues(structure, { ...validSubmission(), stay_purpose_other: 'x' }, TODAY);
		expect(notOther.ok && notOther.values).not.toHaveProperty('stay_purpose_other');
	});

	it(`enforces the ${MIN_STAY_NIGHTS}-night minimum stay`, () => {
		const stay = (arrival: string, departure: string) =>
			errorsOf({ ...validSubmission(), planned_arrival: arrival, planned_departure: departure });

		expect(stay('2026-12-01', '2026-12-14')).toEqual([{ field: 'planned_departure', code: 'stay_too_short' }]);
		expect(stay('2026-12-01', '2026-12-15')).toEqual([]);
		expect(stay('2026-12-15', '2026-12-01')).toEqual([{ field: 'planned_departure', code: 'date_order' }]);
	});

	it('validates dates', () => {
		expect(errorsOf({ ...validSubmission(), date_of_birth: '2026-10-14' })).toEqual([
			{ field: 'date_of_birth', code: 'date_in_future' },
		]);
		expect(errorsOf({ ...validSubmission(), date_of_birth: '1980-02-30' })).toEqual([
			{ field: 'date_of_birth', code: 'invalid_date' },
		]);
	});

	it('validates text length, email, phone and checkbox type', () => {
		expect(
			errorsOf({
				...validSubmission(),
				document_number: 'x'.repeat(51),
				contact_email: 'not-an-email',
				phone: '12-34',
				privacy_consent: 'yes',
			})
		).toEqual([
			{ field: 'document_number', code: 'too_long' },
			{ field: 'phone', code: 'too_short' },
			{ field: 'contact_email', code: 'invalid_email' },
			{ field: 'privacy_consent', code: 'invalid_type' },
		]);
		expect(errorsOf({ ...validSubmission(), phone: 'call me maybe' })).toEqual([
			{ field: 'phone', code: 'invalid_phone' },
		]);
	});

	it('validates file id lists', () => {
		expect(errorsOf({ ...validSubmission(), id_documents: [FILE_ID, FILE_ID] })).toEqual([
			{ field: 'id_documents', code: 'duplicate_file' },
		]);
		expect(errorsOf({ ...validSubmission(), id_documents: ['../../etc/passwd'] })).toEqual([
			{ field: 'id_documents', code: 'invalid_type' },
		]);
		const tooMany = Array.from({ length: 11 }, (_, index) => `file-${index}`);
		expect(errorsOf({ ...validSubmission(), id_documents: tooMany })).toEqual([
			{ field: 'id_documents', code: 'too_many_files' },
		]);
	});
});
