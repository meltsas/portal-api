import type { TenantFormConversionBooking, TenantFormConversionCustomer } from '../types/api';
import { CUSTOMER_DOCUMENT_TYPES, CUSTOMER_SEXES } from './customerFields';
import { ageOn, daysBetween, isIsoDate } from './date';
import type { FormValues } from './formSchema';

/** Guests younger than this on the arrival day are counted as children. */
export const ADULT_AGE = 18;

/**
 * Customer fields from submitted values (see TENANT_FORM_SYSTEM_FIELDS). `enTexts` are the
 * template's English texts, used for option labels.
 */
export function toCustomerFields(values: FormValues, enTexts: Record<string, string>): TenantFormConversionCustomer {
	const sex = text(values, 'sex');
	const documentType = text(values, 'document_type');
	return {
		fullName: joinNonEmpty([text(values, 'first_name'), text(values, 'last_name')], ' '),
		email: text(values, 'contact_email').toLowerCase(),
		phone: text(values, 'phone'),
		primaryAddress: joinNonEmpty(
			[
				text(values, 'address_line1'),
				text(values, 'address_line2'),
				joinNonEmpty([text(values, 'postcode'), text(values, 'city')], ' '),
				text(values, 'region'),
				text(values, 'country'),
			],
			', '
		),
		dateOfBirth: text(values, 'date_of_birth'),
		nationality: text(values, 'citizenship'),
		sex: isOneOf(sex, CUSTOMER_SEXES) ? sex : '',
		documentType: isOneOf(documentType, CUSTOMER_DOCUMENT_TYPES) ? documentType : '',
		documentNumber: text(values, 'document_number'),
		occupation: joinNonEmpty([optionLabel(values, 'employment_type', enTexts), text(values, 'job_title')], ' – '),
		employerOrPensionInfo: text(values, 'employer'),
		familyMembersJson: JSON.stringify(guestRows(values)),
	};
}

/** Booking fields from submitted values, or null without a planned stay. Offer fields are added by the caller. */
export function toBookingFields(
	values: FormValues,
	enTexts: Record<string, string>,
	title: string
): Omit<TenantFormConversionBooking, 'offerId' | 'offerTitle'> | null {
	const dateFrom = text(values, 'planned_arrival');
	const dateTo = text(values, 'planned_departure');
	if (!isIsoDate(dateFrom) || !isIsoDate(dateTo) || dateFrom >= dateTo) return null;

	return {
		dateFrom,
		dateTo,
		nights: daysBetween(dateFrom, dateTo),
		...countGuests(values, dateFrom),
		reasonOfStay: optionLabel(values, 'stay_purpose', enTexts),
		title,
		notes: text(values, 'special_requests'),
	};
}

/** The main guest and every guest row, by age on `arrivalDate`. A guest without a valid birth date counts as an adult. */
export function countGuests(values: FormValues, arrivalDate: string): { adults: number; children: number } {
	let adults = 0;
	let children = 0;
	for (const person of [values, ...guestRows(values)]) {
		const dateOfBirth = text(person, 'date_of_birth');
		if (isIsoDate(dateOfBirth) && ageOn(dateOfBirth, arrivalDate) < ADULT_AGE) {
			children++;
		} else {
			adults++;
		}
	}
	return { adults, children };
}

// --- Helpers ---

function text(values: FormValues, key: string): string {
	const value = values[key];
	return typeof value === 'string' ? value.trim() : '';
}

/** English option text, with the free text of an "other" option: `Other: Language course`. */
function optionLabel(values: FormValues, fieldKey: string, enTexts: Record<string, string>): string {
	const optionKey = text(values, fieldKey);
	if (!optionKey) return '';
	const label = enTexts[`option.${fieldKey}.${optionKey}`] ?? optionKey;
	const freeText = text(values, `${fieldKey}_other`);
	return freeText ? `${label}: ${freeText}` : label;
}

function guestRows(values: FormValues): FormValues[] {
	const rows = values.other_guests;
	return Array.isArray(rows) ? rows.filter((row): row is FormValues => typeof row === 'object' && row !== null) : [];
}

function joinNonEmpty(parts: string[], separator: string): string {
	return parts.filter((part) => part !== '').join(separator);
}

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
	return (allowed as readonly string[]).includes(value);
}
