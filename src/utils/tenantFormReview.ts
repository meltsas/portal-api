import type { TenantFormReviewStatus, TenantFormSubmissionStatus } from '../types/api';

/**
 * Review decisions allowed from the current state. Archived is final. A converted submission can only
 * be archived: its booking is cancelled in the bookings view, never as a side effect of a review.
 */
export function allowedReviewStatuses(status: TenantFormSubmissionStatus, converted: boolean): TenantFormReviewStatus[] {
	switch (status) {
		case 'submitted':
			return ['approved', 'rejected', 'archived'];
		case 'approved':
			return converted ? ['archived'] : ['rejected', 'archived'];
		case 'rejected':
			return ['approved', 'archived'];
		case 'archived':
			return [];
	}
}

export function reviewNotAllowedMessage(
	status: TenantFormSubmissionStatus,
	converted: boolean,
	requested: TenantFormReviewStatus
): string {
	if (status === 'archived') return 'Archived submissions cannot be changed';
	if (status === requested) return `Submission is already ${status}`;
	if (converted && requested === 'rejected') {
		return 'A converted submission can only be archived. Cancel its booking in Bookings if the stay will not happen';
	}
	return `A ${status} submission cannot be changed to ${requested}`;
}
