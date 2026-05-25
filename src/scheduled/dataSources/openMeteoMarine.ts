// openMeteoMarine.ts
import type { DataSourceDefinition, DataSourceFetchResult } from '../types';

/**
 * Open-Meteo current marine + forecast fetcher for the four landing-page beaches.
 *
 * Mirrors the public SSG implementation in
 * `non-touristic-rentals/shared/marine-info/` so the JSON this worker emits
 * can be consumed by the SSG without an extra mapping step. Types and the
 * degrees→cardinal helper are duplicated locally rather than imported across
 * project boundaries, matching the convention used by `openMeteo.ts`.
 *
 * Failure model (intentional divergence from the weather worker):
 *   - Marine API is primary. If it fails or returns missing required fields
 *     for any beach, fetchAndNormalize throws → runFetch records `failed`.
 *   - Forecast API is secondary. If it fails entirely, every beach is emitted
 *     with `weather: null`, `wind: null`, `isPartial: true`, and the snapshot
 *     is still recorded as `success`. This matches the SSG's per-beach
 *     `isPartial` semantics in `shared/marine-info/normalizeMarineInfo.ts`.
 */

const FETCH_TIMEOUT_MS = 15000;
const TIMEZONE = 'Europe/Madrid';

interface MarineBeachConfig {
	name: string;
	latitude: number;
	longitude: number;
}

const BEACHES: MarineBeachConfig[] = [
	{ name: 'Playa de la Zenia',   latitude: 37.9235,   longitude: -0.7225 },
	{ name: 'Playa del Postiguet', latitude: 38.343825, longitude: -0.476578 },
	{ name: 'Arenal-Bol',          latitude: 38.609722, longitude: -0.036111 },
	{ name: 'Cala Cortina',        latitude: 37.581111, longitude: -0.974444 },
];

const MARINE_CURRENT_VARIABLES = [
	'sea_surface_temperature',
	'wave_height',
	'wave_direction',
	'wave_period',
];

const FORECAST_CURRENT_VARIABLES = [
	'temperature_2m',
	'apparent_temperature',
	'precipitation',
	'rain',
	'showers',
	'weather_code',
	'cloud_cover',
	'visibility',
	'wind_speed_10m',
	'wind_direction_10m',
	'wind_gusts_10m',
];

// ─── Local copies of the SSG normalized types ────────────────────────────────
// Keep these in sync with `non-touristic-rentals/shared/marine-info/types.ts`.

type CardinalDirection =
	| 'N' | 'NNE' | 'NE' | 'ENE'
	| 'E' | 'ESE' | 'SE' | 'SSE'
	| 'S' | 'SSW' | 'SW' | 'WSW'
	| 'W' | 'WNW' | 'NW' | 'NNW';

interface NormalizedSeaConditions {
	waterTempC: number;
	waveHeightM: number;
	waveDirectionDeg: number;
	wavePeriodSec: number;
	waveDirectionCardinal: CardinalDirection | null;
	updatedAt: string;
}

interface NormalizedWeatherConditions {
	airTempC: number | null;
	apparentTempC: number | null;
	precipitationMm: number | null;
	rainMm: number | null;
	showersMm: number | null;
	weatherCode: number | null;
	cloudCoverPct: number | null;
	visibilityM: number | null;
	updatedAt: string | null;
}

interface NormalizedWindConditions {
	windKph: number | null;
	windDirectionDeg: number | null;
	windDirectionCardinal: CardinalDirection | null;
	windGustKph: number | null;
	updatedAt: string | null;
}

interface NormalizedMarineInfoSource {
	provider: 'Open-Meteo';
	marineApi: { available: boolean; updatedAt: string | null };
	forecastApi: { available: boolean; updatedAt: string | null };
}

export interface NormalizedMarineInfo {
	beach: string;
	sea: NormalizedSeaConditions;
	weather: NormalizedWeatherConditions | null;
	wind: NormalizedWindConditions | null;
	source: NormalizedMarineInfoSource;
	updatedAt: string;
	isPartial: boolean;
}

// ─── Raw Open-Meteo response shapes ──────────────────────────────────────────

interface MarineApiCurrent {
	time?: string;
	interval?: number;
	sea_surface_temperature?: number;
	wave_height?: number;
	wave_direction?: number;
	wave_period?: number;
}

interface MarineApiResponseItem {
	latitude?: number;
	longitude?: number;
	timezone?: string;
	current?: MarineApiCurrent;
}

interface ForecastApiCurrent {
	time?: string;
	interval?: number;
	temperature_2m?: number;
	apparent_temperature?: number;
	precipitation?: number;
	rain?: number;
	showers?: number;
	weather_code?: number;
	cloud_cover?: number;
	visibility?: number;
	wind_speed_10m?: number;
	wind_direction_10m?: number;
	wind_gusts_10m?: number;
}

interface ForecastApiResponseItem {
	latitude?: number;
	longitude?: number;
	timezone?: string;
	current?: ForecastApiCurrent;
}

type MarineApiResponse   = MarineApiResponseItem   | MarineApiResponseItem[];
type ForecastApiResponse = ForecastApiResponseItem | ForecastApiResponseItem[];

// ─── DataSourceDefinition ────────────────────────────────────────────────────

export const openMeteoMarineDataSource: DataSourceDefinition = {
	id: 'marine_current_costa_blanca',
	provider: 'open-meteo',
	fetchAndNormalize: async ({ signal }): Promise<DataSourceFetchResult> => {
		const fetchedAtIso = new Date().toISOString();

		const [marineSettled, forecastSettled] = await Promise.allSettled([
			fetchMarineBatch(BEACHES, signal),
			fetchForecastBatch(BEACHES, signal),
		]);

		// Marine is primary — failure aborts the whole snapshot.
		if (marineSettled.status === 'rejected') {
			throw marineSettled.reason instanceof Error
				? marineSettled.reason
				: new Error(String(marineSettled.reason));
		}

		const marineItems = marineSettled.value;
		const forecastItems =
			forecastSettled.status === 'fulfilled' ? forecastSettled.value : null;

		const normalized: NormalizedMarineInfo[] = BEACHES.map((beach, idx) =>
			normalizeBeach(beach, marineItems[idx]!, forecastItems?.[idx] ?? null),
		);

		return { normalized, fetchedAtIso };
	},
};

// ─── Fetchers ────────────────────────────────────────────────────────────────

async function fetchMarineBatch(
	beaches: MarineBeachConfig[],
	parentSignal?: AbortSignal,
): Promise<MarineApiResponseItem[]> {
	if (beaches.length === 0) return [];

	const url = buildMarineUrl(beaches);
	const signal = combineSignals(parentSignal, AbortSignal.timeout(FETCH_TIMEOUT_MS));

	const res = await fetch(url.toString(), { signal });

	if (!res.ok) {
		throw new Error(`Open-Meteo Marine request failed: ${res.status} ${res.statusText}`);
	}

	const data = (await res.json()) as MarineApiResponse;
	const items = Array.isArray(data) ? data : [data];

	if (items.length !== beaches.length) {
		throw new Error(
			`Open-Meteo Marine response location count mismatch: expected ${beaches.length}, got ${items.length}`,
		);
	}

	return items;
}

async function fetchForecastBatch(
	beaches: MarineBeachConfig[],
	parentSignal?: AbortSignal,
): Promise<ForecastApiResponseItem[]> {
	if (beaches.length === 0) return [];

	const url = buildForecastUrl(beaches);
	const signal = combineSignals(parentSignal, AbortSignal.timeout(FETCH_TIMEOUT_MS));

	const res = await fetch(url.toString(), { signal });

	if (!res.ok) {
		throw new Error(`Open-Meteo Forecast request failed: ${res.status} ${res.statusText}`);
	}

	const data = (await res.json()) as ForecastApiResponse;
	const items = Array.isArray(data) ? data : [data];

	if (items.length !== beaches.length) {
		throw new Error(
			`Open-Meteo Forecast response location count mismatch: expected ${beaches.length}, got ${items.length}`,
		);
	}

	return items;
}

function buildMarineUrl(beaches: MarineBeachConfig[]): URL {
	const url = new URL('https://marine-api.open-meteo.com/v1/marine');
	url.searchParams.set('latitude',  beaches.map((b) => String(b.latitude)).join(','));
	url.searchParams.set('longitude', beaches.map((b) => String(b.longitude)).join(','));
	url.searchParams.set('current', MARINE_CURRENT_VARIABLES.join(','));
	url.searchParams.set('timezone', TIMEZONE);
	url.searchParams.set('cell_selection', 'sea');
	return url;
}

function buildForecastUrl(beaches: MarineBeachConfig[]): URL {
	const url = new URL('https://api.open-meteo.com/v1/forecast');
	url.searchParams.set('latitude',  beaches.map((b) => String(b.latitude)).join(','));
	url.searchParams.set('longitude', beaches.map((b) => String(b.longitude)).join(','));
	url.searchParams.set('current', FORECAST_CURRENT_VARIABLES.join(','));
	url.searchParams.set('timezone', TIMEZONE);
	url.searchParams.set('wind_speed_unit', 'kmh');
	return url;
}

// ─── Normalization ───────────────────────────────────────────────────────────

function normalizeBeach(
	beach: MarineBeachConfig,
	marine: MarineApiResponseItem,
	forecast: ForecastApiResponseItem | null,
): NormalizedMarineInfo {
	const sea = normalizeSea(beach, marine);

	const fc = forecast?.current ?? null;
	const weather = fc ? normalizeWeather(fc) : null;
	const wind = fc ? normalizeWind(fc) : null;

	const forecastAvailable = fc != null;
	const weatherIncomplete =
		weather != null && (weather.airTempC == null || weather.weatherCode == null);
	const windIncomplete =
		wind != null && (wind.windKph == null || wind.windDirectionDeg == null);

	const isPartial = !forecastAvailable || weatherIncomplete || windIncomplete;

	return {
		beach: beach.name,
		sea,
		weather,
		wind,
		source: {
			provider: 'Open-Meteo',
			marineApi:   { available: true,             updatedAt: sea.updatedAt },
			forecastApi: { available: forecastAvailable, updatedAt: fc?.time ?? null },
		},
		updatedAt: sea.updatedAt,
		isPartial,
	};
}

function normalizeSea(
	beach: MarineBeachConfig,
	marine: MarineApiResponseItem,
): NormalizedSeaConditions {
	const mc = marine.current;
	if (!mc || typeof mc.time !== 'string') {
		throw new Error(`Open-Meteo Marine response missing "current" data for ${beach.name}`);
	}

	const waterTempC       = numOrUndefined(mc.sea_surface_temperature);
	const waveHeightM      = numOrUndefined(mc.wave_height);
	const waveDirectionDeg = numOrUndefined(mc.wave_direction);
	const wavePeriodSec    = numOrUndefined(mc.wave_period);

	if (
		waterTempC === undefined ||
		waveHeightM === undefined ||
		waveDirectionDeg === undefined ||
		wavePeriodSec === undefined
	) {
		throw new Error(`Open-Meteo Marine response missing required fields for ${beach.name}`);
	}

	return {
		waterTempC,
		waveHeightM,
		waveDirectionDeg,
		wavePeriodSec,
		waveDirectionCardinal: degreesToCompass(waveDirectionDeg),
		updatedAt: mc.time,
	};
}

function normalizeWeather(fc: ForecastApiCurrent): NormalizedWeatherConditions {
	return {
		airTempC:        numOrNull(fc.temperature_2m),
		apparentTempC:   numOrNull(fc.apparent_temperature),
		precipitationMm: numOrNull(fc.precipitation),
		rainMm:          numOrNull(fc.rain),
		showersMm:       numOrNull(fc.showers),
		weatherCode:     numOrNull(fc.weather_code),
		cloudCoverPct:   numOrNull(fc.cloud_cover),
		visibilityM:     numOrNull(fc.visibility),
		updatedAt:       typeof fc.time === 'string' ? fc.time : null,
	};
}

function normalizeWind(fc: ForecastApiCurrent): NormalizedWindConditions {
	const windDirectionDeg = numOrNull(fc.wind_direction_10m);
	return {
		windKph: numOrNull(fc.wind_speed_10m),
		windDirectionDeg,
		windDirectionCardinal: windDirectionDeg != null ? degreesToCompass(windDirectionDeg) : null,
		windGustKph: numOrNull(fc.wind_gusts_10m),
		updatedAt: typeof fc.time === 'string' ? fc.time : null,
	};
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const COMPASS_LABELS: readonly CardinalDirection[] = [
	'N', 'NNE', 'NE', 'ENE',
	'E', 'ESE', 'SE', 'SSE',
	'S', 'SSW', 'SW', 'WSW',
	'W', 'WNW', 'NW', 'NNW',
];

function degreesToCompass(deg: number): CardinalDirection {
	const index = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
	return COMPASS_LABELS[index]!;
}

function numOrUndefined(v: unknown): number | undefined {
	return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function numOrNull(v: unknown): number | null {
	return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function combineSignals(a: AbortSignal | undefined, b: AbortSignal): AbortSignal {
	if (!a) return b;
	if (typeof AbortSignal.any === 'function') {
		return AbortSignal.any([a, b]);
	}
	return b;
}
