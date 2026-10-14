// Option keys of the tenant form's `sex` and `document_type` fields, stored as-is on customers.
// The tenant form template must keep exactly these keys, see tenantFormSystemFields.ts.
export const CUSTOMER_SEXES = ['female', 'male', 'other'] as const;
export const CUSTOMER_DOCUMENT_TYPES = ['passport', 'id_card', 'residence_permit'] as const;

export type CustomerSex = (typeof CUSTOMER_SEXES)[number];
export type CustomerDocumentType = (typeof CUSTOMER_DOCUMENT_TYPES)[number];
