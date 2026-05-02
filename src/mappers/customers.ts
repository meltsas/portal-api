import type { AdminCustomerListItem, AdminCustomerDetail, CustomerStatus } from '../types/api';
import type { CustomerRow } from '../types/db';
import { toISOTimestamp } from '../utils/date';

export function toAdminCustomerListItem(row: CustomerRow): AdminCustomerListItem {
	return {
		id: row.id,
		sourceLeadId: row.source_lead_id,
		fullName: row.full_name,
		email: row.email,
		phone: row.phone,
		status: row.status as CustomerStatus,
		createdAt: toISOTimestamp(row.created_at),
		updatedAt: toISOTimestamp(row.updated_at),
	};
}

export function toAdminCustomerDetail(row: CustomerRow): AdminCustomerDetail {
	return {
		id: row.id,
		sourceLeadId: row.source_lead_id,
		fullName: row.full_name,
		email: row.email,
		phone: row.phone,
		primaryAddress: row.primary_address,
		dateOfBirth: row.date_of_birth,
		nationalIdNumber: row.national_id_number,
		documentNumber: row.document_number,
		occupation: row.occupation,
		employerOrPensionInfo: row.employer_or_pension_info,
		incomeNotes: row.income_notes,
		familyMembersJson: row.family_members_json,
		notes: row.notes,
		status: row.status as CustomerStatus,
		createdAt: toISOTimestamp(row.created_at),
		updatedAt: toISOTimestamp(row.updated_at),
	};
}
