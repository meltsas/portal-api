/**
 * Shared types for the scheduled external-data-fetching subsystem.
 *
 * A `DataSourceDefinition` is the code-side half of a data source: it knows
 * how to fetch + normalize one external feed. The D1 row in
 * `external_data_sources` is the config-side half (active flag, github
 * publish settings, latest hash pointer, etc).
 *
 * The two are joined by `id`. To add a new source, write a new definition,
 * register it in `registry.ts`, and add a matching row to
 * `external_data_sources` via migration or admin tooling.
 */

export interface DataSourceFetchContext {
	env: Env;
	signal?: AbortSignal;
}

export interface DataSourceFetchResult {
	/**
	 * Normalized, JSON-serializable payload. This is what gets hashed,
	 * stored in `external_data_snapshots.normalized_json`, and (later)
	 * written to the SSG repo on the GitHub export cron.
	 */
	normalized: unknown;
	/**
	 * ISO 8601 timestamp the data was fetched at.
	 */
	fetchedAtIso: string;
}

export interface DataSourceDefinition {
	/** Matches `external_data_sources.id`. */
	id: string;
	/** Matches `external_data_sources.provider`. Used for logging. */
	provider: string;
	/** Fetch + validate + normalize. Throws on any unrecoverable failure. */
	fetchAndNormalize: (ctx: DataSourceFetchContext) => Promise<DataSourceFetchResult>;
}
