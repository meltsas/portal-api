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
