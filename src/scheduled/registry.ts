import type { DataSourceDefinition } from './types';
import { openMeteoWeatherDataSource } from './dataSources/openMeteo';

/**
 * Code-side registry of all known scheduled data sources.
 *
 * Adding a new source: implement its `DataSourceDefinition` in a sibling file
 * under `dataSources/`, then append it here AND add a matching row in
 * `external_data_sources` (via a migration or admin endpoint). The hourly
 * fetch cron iterates over this list and only runs sources whose D1 row
 * has `is_active = 1`.
 */
export const DATA_SOURCES: DataSourceDefinition[] = [openMeteoWeatherDataSource];
