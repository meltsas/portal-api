const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/**
 * Converts a SQLite datetime string ("YYYY-MM-DD HH:MM:SS") to ISO 8601 ("YYYY-MM-DDTHH:MM:SSZ").
 * Returns the input unchanged if it does not match the expected format.
 */
export function toISOTimestamp(sqliteDate: string): string {
	if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(sqliteDate)) {
		return sqliteDate.replace(' ', 'T') + 'Z';
	}
	return sqliteDate;
}

/** True for a real calendar date in `YYYY-MM-DD` form (rejects e.g. 2026-02-30). */
export function isIsoDate(value: string): boolean {
	if (!ISO_DATE_PATTERN.test(value)) return false;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

export function todayIsoDate(): string {
	return new Date().toISOString().slice(0, 10);
}
