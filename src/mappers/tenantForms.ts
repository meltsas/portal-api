import type {
	AdminTenantFormAnswer,
	AdminTenantFormConversionSummary,
	AdminTenantFormAnswerSection,
	AdminTenantFormEvent,
	AdminTenantFormInvitation,
	AdminTenantFormSubmissionFile,
	AdminTenantFormSubmissionListItem,
	BookingStatus,
	TenantFormFieldView,
	TenantFormSchemaResponse,
	TenantFormSubmissionStatus,
	TenantFormUploadedFile,
} from '../types/api';
import type {
	FormDraftRow,
	FormEventRow,
	FormInvitationWithJoinsRow,
	FormSubmissionFileRow,
	FormSubmissionWithJoinsRow,
	TenantFormInvitationAccessRow,
} from '../types/db';
import {
	fillTextVariables,
	type FormField,
	type FormLanguage,
	type FormStructure,
	type FormValues,
	type TextVariable,
} from '../utils/formSchema';
import { toISOTimestamp } from '../utils/date';
import { deriveInvitationStatus } from '../utils/tenantFormInvitations';

export function toAdminTenantFormInvitation(row: FormInvitationWithJoinsRow, now: string): AdminTenantFormInvitation {
	return {
		id: row.id,
		templateId: row.template_id,
		displayName: row.display_name,
		offerId: row.offer_id,
		offerTitle: row.offer_title,
		language: row.language,
		status: deriveInvitationStatus(row.status, row.expires_at, now),
		expiresAt: row.expires_at,
		googleEmail: row.google_email,
		leadId: row.lead_id,
		submissionId: row.submission_id,
		submissionStatus: row.submission_status as TenantFormSubmissionStatus | null,
		converted: row.submission_customer_id !== null,
		createdByEmail: row.created_by_email,
		openedAt: row.opened_at,
		authenticatedAt: row.authenticated_at,
		submittedAt: row.submitted_at,
		revokedAt: row.revoked_at,
		createdAt: toISOTimestamp(row.created_at),
		updatedAt: toISOTimestamp(row.updated_at),
	};
}

export function toAdminTenantFormEvent(row: FormEventRow): AdminTenantFormEvent {
	return {
		id: row.id,
		eventType: row.event_type,
		actorType: row.actor_type,
		actorRef: row.actor_ref,
		submissionId: row.submission_id,
		fileId: row.file_id,
		metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : null,
		createdAt: toISOTimestamp(row.created_at),
	};
}

const BYTES_PER_MB = 1_048_576;

export function toTenantFormUploadedFile(row: FormSubmissionFileRow): TenantFormUploadedFile {
	return {
		id: row.id,
		fieldKey: row.field_key,
		originalFilename: row.original_filename,
		mimeType: row.mime_type,
		sizeBytes: row.size_bytes,
		uploadedAt: row.uploaded_at,
	};
}

export interface TenantFormProgress {
	draft: FormDraftRow | null;
	uploadedFiles: FormSubmissionFileRow[];
}

export function toTenantFormSchema(
	invitation: TenantFormInvitationAccessRow,
	language: FormLanguage,
	structure: FormStructure,
	texts: Record<string, string>,
	progress: TenantFormProgress
): TenantFormSchemaResponse {
	const invitationVariables = { offerTitle: invitation.offer_title, displayName: invitation.display_name };

	const text = (key: string, variables: Partial<Record<TextVariable, string>> = invitationVariables): string | null => {
		const value = texts[key];
		return value === undefined ? null : fillTextVariables(value, variables);
	};

	const toField = (field: FormField, path: string): TenantFormFieldView => {
		const variables = { ...invitationVariables, ...fileLimitVariables(field) };
		return {
			key: field.key,
			type: field.type,
			required: field.required,
			validation: field.validation,
			visibleIf: field.visibleIf,
			label: text(`field.${path}.label`, variables),
			help: text(`field.${path}.help`, variables),
			placeholder: text(`field.${path}.placeholder`, variables),
			body: text(`field.${path}.body`, variables),
			options: field.options.map((option) => ({
				key: option.key,
				label: text(`option.${path}.${option.key}`) ?? option.key,
				allowsFreeText: option.allowsFreeText,
			})),
			itemFields: field.itemFields.map((itemField) => toField(itemField, `${path}.item.${itemField.key}`)),
		};
	};

	return {
		invitation: {
			displayName: invitation.display_name,
			language,
			expiresAt: invitation.expires_at,
			offer: { title: invitation.offer_title, slug: invitation.offer_slug },
		},
		prefill: { contactEmail: invitation.google_email },
		template: {
			id: structure.templateId,
			title: text('template.title'),
			intro: text('template.intro'),
			successMessage: text('template.success_message'),
		},
		sections: structure.sections.map((section) => ({
			key: section.key,
			title: text(`section.${section.key}.title`),
			description: text(`section.${section.key}.description`),
			fields: section.fields.map((field) => toField(field, field.key)),
		})),
		draft: progress.draft
			? { values: JSON.parse(progress.draft.values_json) as FormValues, savedAt: progress.draft.updated_at }
			: null,
		uploadedFiles: progress.uploadedFiles.map(toTenantFormUploadedFile),
	};
}

function fileLimitVariables(field: FormField): Partial<Record<TextVariable, string>> {
	const variables: Partial<Record<TextVariable, string>> = {};
	if (field.validation.maxFiles !== undefined) variables.maxFiles = String(field.validation.maxFiles);
	if (field.validation.maxFileBytes !== undefined) {
		variables.maxFileSizeMb = String(Math.round(field.validation.maxFileBytes / BYTES_PER_MB));
	}
	return variables;
}

export function toAdminTenantFormSubmissionListItem(row: FormSubmissionWithJoinsRow): AdminTenantFormSubmissionListItem {
	return {
		id: row.id,
		invitationId: row.invitation_id,
		displayName: row.display_name,
		offerId: row.offer_id,
		offerTitle: row.offer_title,
		fullName: row.full_name,
		contactEmail: row.contact_email,
		phone: row.phone,
		plannedArrival: row.planned_arrival,
		plannedDeparture: row.planned_departure,
		language: row.language,
		status: row.status as TenantFormSubmissionStatus,
		fileCount: row.file_count,
		submittedAt: row.submitted_at,
		reviewedAt: row.reviewed_at,
		remoteIp: row.remote_ip,
		userAgent: row.user_agent,
		customerId: row.customer_id,
		bookingId: row.booking_id,
	};
}

export function toAdminTenantFormConversionSummary(row: FormSubmissionWithJoinsRow): AdminTenantFormConversionSummary | null {
	if (!row.customer_id && !row.booking_id) return null;
	return {
		customerId: row.customer_id,
		customerName: row.customer_full_name,
		bookingId: row.booking_id,
		bookingStatus: row.booking_status as BookingStatus | null,
		bookingDateFrom: row.booking_date_from,
		bookingDateTo: row.booking_date_to,
	};
}

export function toAdminTenantFormSubmissionFile(row: FormSubmissionFileRow): AdminTenantFormSubmissionFile {
	return {
		id: row.id,
		fieldKey: row.field_key,
		originalFilename: row.original_filename,
		mimeType: row.mime_type,
		sizeBytes: row.size_bytes,
		status: row.status,
		uploadedAt: row.uploaded_at,
	};
}

/** Every section and field of the template in order, labelled with the given (English) texts. */
export function toAdminTenantFormAnswers(
	structure: FormStructure,
	texts: Record<string, string>,
	values: FormValues
): AdminTenantFormAnswerSection[] {
	return structure.sections.map((section) => ({
		key: section.key,
		title: texts[`section.${section.key}.title`] ?? section.key,
		answers: section.fields
			.filter((field) => field.type !== 'info')
			.map((field) => toAnswer(field, field.key, values, texts)),
	}));
}

function toAnswer(field: FormField, path: string, values: FormValues, texts: Record<string, string>): AdminTenantFormAnswer {
	const value = values[field.key] ?? null;
	const answer: AdminTenantFormAnswer = {
		key: field.key,
		type: field.type,
		label: texts[`field.${path}.label`] ?? field.key,
		value,
		displayValue: null,
		items: null,
	};
	if (value === null) return answer;

	switch (field.type) {
		case 'single_choice': {
			const optionLabel = texts[`option.${path}.${String(value)}`] ?? String(value);
			const freeText = values[`${field.key}_other`];
			answer.displayValue = typeof freeText === 'string' ? `${optionLabel}: ${freeText}` : optionLabel;
			break;
		}
		case 'checkbox':
			answer.displayValue = value === true ? 'Yes' : 'No';
			break;
		case 'file': {
			const count = Array.isArray(value) ? value.length : 0;
			answer.displayValue = count === 1 ? '1 file' : `${count} files`;
			break;
		}
		case 'guest_list': {
			const rows = Array.isArray(value) ? (value as FormValues[]) : [];
			answer.items = rows.map((row) =>
				field.itemFields.map((itemField) => toAnswer(itemField, `${path}.item.${itemField.key}`, row, texts))
			);
			answer.displayValue = rows.length === 1 ? '1 guest' : `${rows.length} guests`;
			break;
		}
		default:
			answer.displayValue = String(value);
	}
	return answer;
}
