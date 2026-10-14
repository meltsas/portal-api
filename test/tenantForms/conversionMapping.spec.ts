import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { ageOn } from '../../src/utils/date';
import { loadFormStructure, type FormStructure, type FormValues } from '../../src/utils/formSchema';
import { countGuests, toBookingFields, toCustomerFields } from '../../src/utils/tenantFormConversion';
import { findSystemFieldProblems } from '../../src/utils/tenantFormSystemFields';

const EN_TEXTS: Record<string, string> = {
	'option.employment_type.employee': 'Employee',
	'option.employment_type.other': 'Other (please specify)',
	'option.stay_purpose.work_assignment': 'Work assignment / remote work',
	'option.stay_purpose.other': 'Other non-tourist reason (please specify)',
};

function guest(dateOfBirth: string): FormValues {
	return {
		first_name: 'Guest',
		last_name: 'Example',
		sex: 'male',
		date_of_birth: dateOfBirth,
		citizenship: 'Danish',
		document_type: 'id_card',
		document_number: 'D123',
		relationship: 'child',
	};
}

function values(overrides: FormValues = {}): FormValues {
	return {
		planned_arrival: '2026-12-01',
		planned_departure: '2027-01-15',
		first_name: 'Lars',
		last_name: 'Nielsen Holm',
		sex: 'male',
		date_of_birth: '1975-04-02',
		citizenship: 'Danish',
		document_type: 'passport',
		document_number: 'P1234567',
		phone: '+45 12 34 56 78',
		contact_email: 'Lars@Example.com',
		address_line1: 'Nørregade 1',
		address_line2: '2. tv',
		city: 'København',
		region: 'Hovedstaden',
		postcode: '1165',
		country: 'Denmark',
		other_guests: [guest('2015-03-01')],
		stay_purpose: 'work_assignment',
		employment_type: 'employee',
		employer: 'Example A/S',
		job_title: 'Engineer',
		special_requests: 'Late arrival',
		...overrides,
	};
}

describe('toCustomerFields', () => {
	it('maps the main guest to customer fields', () => {
		expect(toCustomerFields(values(), EN_TEXTS)).toEqual({
			fullName: 'Lars Nielsen Holm',
			email: 'lars@example.com',
			phone: '+45 12 34 56 78',
			primaryAddress: 'Nørregade 1, 2. tv, 1165 København, Hovedstaden, Denmark',
			dateOfBirth: '1975-04-02',
			nationality: 'Danish',
			sex: 'male',
			documentType: 'passport',
			documentNumber: 'P1234567',
			occupation: 'Employee – Engineer',
			employerOrPensionInfo: 'Example A/S',
			familyMembersJson: JSON.stringify([guest('2015-03-01')]),
		});
	});

	it('leaves out empty address parts', () => {
		const { address_line2, region, postcode, ...rest } = values();
		expect(toCustomerFields(rest, EN_TEXTS).primaryAddress).toBe('Nørregade 1, København, Denmark');
	});

	it('adds the free text of an "other" option', () => {
		const customer = toCustomerFields(
			values({ employment_type: 'other', employment_type_other: 'Freelance translator', job_title: '' }),
			EN_TEXTS
		);
		expect(customer.occupation).toBe('Other (please specify): Freelance translator');
	});

	it('uses the option key when the template has no English text', () => {
		expect(toCustomerFields(values({ employment_type: 'pensioner', job_title: '' }), EN_TEXTS).occupation).toBe('pensioner');
	});

	it('drops sex and document type values a customer cannot store', () => {
		const customer = toCustomerFields(values({ sex: 'x', document_type: 'driving_licence' }), EN_TEXTS);
		expect(customer.sex).toBe('');
		expect(customer.documentType).toBe('');
	});

	it('gives empty values for missing optional fields', () => {
		const { other_guests, employer, job_title, employment_type, ...rest } = values();
		const customer = toCustomerFields(rest, EN_TEXTS);
		expect(customer.familyMembersJson).toBe('[]');
		expect(customer.employerOrPensionInfo).toBe('');
		expect(customer.occupation).toBe('');
	});
});

describe('toBookingFields', () => {
	it('maps the stay', () => {
		expect(toBookingFields(values(), EN_TEXTS, 'Lars Nielsen Holm')).toEqual({
			dateFrom: '2026-12-01',
			dateTo: '2027-01-15',
			nights: 45,
			adults: 1,
			children: 1,
			reasonOfStay: 'Work assignment / remote work',
			title: 'Lars Nielsen Holm',
			notes: 'Late arrival',
		});
	});

	it('adds the free text of an "other" stay purpose', () => {
		const booking = toBookingFields(values({ stay_purpose: 'other', stay_purpose_other: 'Language course' }), EN_TEXTS, '');
		expect(booking?.reasonOfStay).toBe('Other non-tourist reason (please specify): Language course');
	});

	it('returns null without a valid planned stay', () => {
		expect(toBookingFields(values({ planned_arrival: '' }), EN_TEXTS, '')).toBeNull();
		expect(toBookingFields(values({ planned_departure: '2026-11-30' }), EN_TEXTS, '')).toBeNull();
	});
});

describe('countGuests', () => {
	const arrival = '2026-12-01';

	it('counts a guest who turns 18 on the arrival day as an adult', () => {
		expect(countGuests(values({ other_guests: [guest('2008-12-01')] }), arrival)).toEqual({ adults: 2, children: 0 });
	});

	it('counts a guest who turns 18 the day after arrival as a child', () => {
		expect(countGuests(values({ other_guests: [guest('2008-12-02')] }), arrival)).toEqual({ adults: 1, children: 1 });
	});

	it('counts the main guest by age too', () => {
		expect(countGuests(values({ date_of_birth: '2010-01-01', other_guests: [] }), arrival)).toEqual({ adults: 0, children: 1 });
	});

	it('counts a guest without a valid birth date as an adult', () => {
		const { date_of_birth, ...rowWithoutBirthDate } = guest('2015-03-01');
		expect(countGuests(values({ other_guests: [rowWithoutBirthDate] }), arrival)).toEqual({ adults: 2, children: 0 });
	});
});

describe('ageOn', () => {
	it('counts whole years', () => {
		expect(ageOn('1980-05-20', '2026-05-19')).toBe(45);
		expect(ageOn('1980-05-20', '2026-05-20')).toBe(46);
	});

	it('makes someone born on 29 February a year older on 1 March', () => {
		expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
		expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
	});
});

describe('tenant form system fields', () => {
	async function v1(): Promise<FormStructure> {
		const structure = await loadFormStructure(env.portal_db, 'tenant_details_v1');
		if (!structure) throw new Error('tenant_details_v1 is not seeded');
		return structure;
	}

	function withoutField(structure: FormStructure, key: string): FormStructure {
		return {
			...structure,
			sections: structure.sections.map((section) => ({ ...section, fields: section.fields.filter((field) => field.key !== key) })),
		};
	}

	function changeField(structure: FormStructure, key: string, change: (field: FormStructure['sections'][number]['fields'][number]) => void): FormStructure {
		const copy = structuredClone(structure);
		const field = copy.sections.flatMap((section) => section.fields).find((candidate) => candidate.key === key);
		if (!field) throw new Error(`No field ${key}`);
		change(field);
		return copy;
	}

	it('are all in tenant_details_v1', async () => {
		expect(findSystemFieldProblems(await v1())).toEqual([]);
	});

	it('reports a missing field, a changed type, an optional required field and an unknown option', async () => {
		const structure = await v1();
		expect(findSystemFieldProblems(withoutField(structure, 'phone'))).toEqual(['phone: missing']);
		expect(findSystemFieldProblems(changeField(structure, 'city', (field) => (field.type = 'textarea')))).toEqual([
			'city: type is textarea, expected text',
		]);
		expect(findSystemFieldProblems(changeField(structure, 'planned_arrival', (field) => (field.required = false)))).toEqual([
			'planned_arrival: must be required',
		]);
		expect(
			findSystemFieldProblems(changeField(structure, 'document_type', (field) => field.options.push({ key: 'driving_licence', allowsFreeText: false })))
		).toEqual(['document_type: option "driving_licence" is not allowed']);
	});

	it('checks guest list item fields', async () => {
		const structure = changeField(await v1(), 'other_guests', (field) => {
			field.itemFields = field.itemFields.filter((itemField) => itemField.key !== 'date_of_birth');
		});
		expect(findSystemFieldProblems(structure)).toEqual(['other_guests.date_of_birth: missing']);
	});
});
