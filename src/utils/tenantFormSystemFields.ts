import { CUSTOMER_DOCUMENT_TYPES, CUSTOMER_SEXES } from './customerFields';
import type { FieldType, FormField, FormStructure } from './formSchema';

export interface SystemFieldSpec {
	type: FieldType;
	/** The code relies on a value being present. */
	required: boolean;
	/** Every option key of the field must be one of these. */
	options?: readonly string[];
	itemFields?: Record<string, SystemFieldSpec>;
}

/**
 * Tenant form fields the code reads by key: the submit handler copies some of them into columns,
 * the conversion maps them to a customer and a booking. Other fields only live in the submission.
 * A structure editor (roadmap phase 12) must not remove these, change their type or make a
 * required one optional.
 */
export const TENANT_FORM_SYSTEM_FIELDS: Record<string, SystemFieldSpec> = {
	planned_arrival: { type: 'date', required: true },
	planned_departure: { type: 'date', required: true },
	first_name: { type: 'text', required: true },
	last_name: { type: 'text', required: true },
	sex: { type: 'single_choice', required: false, options: CUSTOMER_SEXES },
	date_of_birth: { type: 'date', required: false },
	citizenship: { type: 'text', required: false },
	document_type: { type: 'single_choice', required: false, options: CUSTOMER_DOCUMENT_TYPES },
	document_number: { type: 'text', required: false },
	phone: { type: 'tel', required: true },
	contact_email: { type: 'email', required: true },
	address_line1: { type: 'text', required: false },
	address_line2: { type: 'text', required: false },
	city: { type: 'text', required: false },
	region: { type: 'text', required: false },
	postcode: { type: 'text', required: false },
	country: { type: 'text', required: false },
	other_guests: {
		type: 'guest_list',
		required: false,
		itemFields: { date_of_birth: { type: 'date', required: false } },
	},
	stay_purpose: { type: 'single_choice', required: false },
	employment_type: { type: 'single_choice', required: false },
	employer: { type: 'text', required: false },
	job_title: { type: 'text', required: false },
	special_requests: { type: 'textarea', required: false },
};

/** Ways the structure breaks TENANT_FORM_SYSTEM_FIELDS, e.g. `sex: option "x" is not allowed`. */
export function findSystemFieldProblems(structure: FormStructure): string[] {
	const fields = structure.sections.flatMap((section) => section.fields);
	return checkFields(TENANT_FORM_SYSTEM_FIELDS, fields, '');
}

function checkFields(specs: Record<string, SystemFieldSpec>, fields: FormField[], pathPrefix: string): string[] {
	const problems: string[] = [];
	for (const [key, spec] of Object.entries(specs)) {
		const path = pathPrefix + key;
		const field = fields.find((candidate) => candidate.key === key);
		if (!field) {
			problems.push(`${path}: missing`);
			continue;
		}
		if (field.type !== spec.type) problems.push(`${path}: type is ${field.type}, expected ${spec.type}`);
		if (spec.required && !field.required) problems.push(`${path}: must be required`);
		for (const option of field.options) {
			if (spec.options && !spec.options.includes(option.key)) problems.push(`${path}: option "${option.key}" is not allowed`);
		}
		if (spec.itemFields) problems.push(...checkFields(spec.itemFields, field.itemFields, `${path}.`));
	}
	return problems;
}
