import type { DataSourceDefinition, DataSourceFetchResult } from '../types';

/**
 * Open-Meteo current-weather fetcher for the Costa Blanca / nearby locations.
 *
 * The normalized shape mirrors `WeatherInfoLocation` from
 * `non-touristic-rentals/shared/types/weather.ts` so the SSG site can consume
 * the JSON produced by this Worker without a second mapping step. The type is
 * duplicated locally rather than imported across project boundaries to keep
 * the Worker self-contained and its build simple. If/when a shared package
 * is introduced, switch this to an import.
 */

const FETCH_TIMEOUT_MS = 12000;
const TIMEZONE = 'Europe/Madrid';
// Hourly cron + a 30-minute grace window. Tells consumers when this data is
// considered "expected to be refreshed by".
const EXPIRES_IN_MS = (60 + 30) * 60 * 1000;

interface WeatherLocationConfig {
	locationName: string;
	latitude: number;
	longitude: number;
	yrDailyTableLink: string;
}

const LOCATIONS: WeatherLocationConfig[] = [
	{
		locationName: 'Cartagena',
		latitude: 37.6257,
		longitude: -0.9966,
		yrDailyTableLink: 'https://www.yr.no/en/forecast/daily-table/2-2520058/Spain/Murcia/Murcia/Cartagena',
	},
	{
		locationName: 'Playa Flamenca',
		latitude: 37.9431,
		longitude: -0.7217,
		yrDailyTableLink: 'https://www.yr.no/en/forecast/daily-table/2-7115309/Spain/Valencia/Alicante/Playa%20Flamenca',
	},
	{
		locationName: 'Alicante',
		latitude: 38.3452,
		longitude: -0.481,
		yrDailyTableLink: 'https://www.yr.no/en/forecast/daily-table/2-2521978/Spain/Valencia/Alicante/Alicante',
	},
	{
		locationName: 'Calpe',
		latitude: 38.6446,
		longitude: 0.0457,
		yrDailyTableLink: 'https://www.yr.no/en/forecast/daily-table/2-2520496/Spain/Valencia/Alicante/Calpe',
	},
];

/** Mirrors `WeatherInfoLocation` from the shared site types. */
export interface WorkerWeatherLocation {
	locationName: string;
	latitude: number;
	longitude: number;
	observedAtIso: string;
	intervalSeconds: number;
	temperatureC: number;
	apparentTemperatureC?: number;
	windSpeedMs?: number;
	windGustsMs?: number;
	windDirectionDeg?: number;
	precipitationMm?: number;
	cloudCoverPct?: number;
	humidityPct?: number;
	uvIndex?: number;
	weatherCode?: number;
	source: 'open-meteo';
	timezone?: string;
	gridLatitude?: number;
	gridLongitude?: number;
	elevationM?: number;
	isDay: boolean;
	yrDailyTableLink?: string;
}

export interface WorkerWeatherSnapshot {
	sourceId: string;
	fetchedAtIso: string;
	expiresAtIso: string;
	timezone: string;
	locations: WorkerWeatherLocation[];
}

interface OpenMeteoCurrentResponse {
	latitude?: number;
	longitude?: number;
	timezone?: string;
	elevation?: number;
	current?: {
		time?: string;
		interval?: number;
		temperature_2m?: number;
		apparent_temperature?: number;
		relative_humidity_2m?: number;
		wind_speed_10m?: number;
		wind_gusts_10m?: number;
		wind_direction_10m?: number;
		precipitation?: number;
		cloud_cover?: number;
		weather_code?: number;
		uv_index?: number;
		is_day?: number | boolean;
	};
}

export const openMeteoWeatherDataSource: DataSourceDefinition = {
	id: 'weather_current_costa_blanca',
	provider: 'open-meteo',
	fetchAndNormalize: async ({ signal }): Promise<DataSourceFetchResult> => {
		const fetchedAtIso = new Date().toISOString();
		const expiresAtIso = new Date(Date.now() + EXPIRES_IN_MS).toISOString();

		const locations = await Promise.all(
			LOCATIONS.map((cfg) => fetchOpenMeteoForLocation(cfg, signal)),
		);

		const payload: WorkerWeatherSnapshot = {
			sourceId: 'weather_current_costa_blanca',
			fetchedAtIso,
			expiresAtIso,
			timezone: TIMEZONE,
			locations,
		};

		return { normalized: payload, fetchedAtIso };
	},
};

async function fetchOpenMeteoForLocation(
	cfg: WeatherLocationConfig,
	parentSignal?: AbortSignal,
): Promise<WorkerWeatherLocation> {
	const url = new URL('https://api.open-meteo.com/v1/forecast');
	url.searchParams.set('latitude', String(cfg.latitude));
	url.searchParams.set('longitude', String(cfg.longitude));
	url.searchParams.set(
		'current',
		[
			'temperature_2m',
			'apparent_temperature',
			'relative_humidity_2m',
			'wind_speed_10m',
			'wind_gusts_10m',
			'wind_direction_10m',
			'precipitation',
			'cloud_cover',
			'weather_code',
			'uv_index',
			'is_day',
		].join(','),
	);
	url.searchParams.set('timezone', TIMEZONE);
	url.searchParams.set('windspeed_unit', 'ms');

	const signal = combineSignals(parentSignal, AbortSignal.timeout(FETCH_TIMEOUT_MS));

	const res = await fetch(url.toString(), { signal });
	if (!res.ok) {
		throw new Error(`Open-Meteo request for ${cfg.locationName} failed: ${res.status} ${res.statusText}`);
	}

	const data = (await res.json()) as OpenMeteoCurrentResponse;

	// Minimal shape validation. Open-Meteo occasionally returns partials when
	// the upstream weather model is updating — we'd rather record a `failed`
	// snapshot than persist a broken payload that the SSG would render.
	if (!data.current || typeof data.current.time !== 'string' || typeof data.current.interval !== 'number') {
		throw new Error(`Open-Meteo response missing "current" data for ${cfg.locationName}`);
	}
	if (typeof data.current.temperature_2m !== 'number' || !Number.isFinite(data.current.temperature_2m)) {
		throw new Error(`Open-Meteo missing numeric temperature_2m for ${cfg.locationName}`);
	}

	return {
		locationName: cfg.locationName,
		latitude: cfg.latitude,
		longitude: cfg.longitude,

		observedAtIso: data.current.time,
		intervalSeconds: data.current.interval,

		temperatureC: data.current.temperature_2m,
		apparentTemperatureC: numOrUndefined(data.current.apparent_temperature),

		humidityPct: numOrUndefined(data.current.relative_humidity_2m),
		windSpeedMs: numOrUndefined(data.current.wind_speed_10m),
		windGustsMs: numOrUndefined(data.current.wind_gusts_10m),
		windDirectionDeg: numOrUndefined(data.current.wind_direction_10m),

		precipitationMm: numOrUndefined(data.current.precipitation),
		cloudCoverPct: numOrUndefined(data.current.cloud_cover),

		uvIndex: numOrUndefined(data.current.uv_index),
		weatherCode: numOrUndefined(data.current.weather_code),

		source: 'open-meteo',
		timezone: typeof data.timezone === 'string' ? data.timezone : TIMEZONE,
		gridLatitude: numOrUndefined(data.latitude),
		gridLongitude: numOrUndefined(data.longitude),
		elevationM: numOrUndefined(data.elevation),
		isDay: Boolean(data.current.is_day),

		yrDailyTableLink: cfg.yrDailyTableLink,
	};
}

function numOrUndefined(v: unknown): number | undefined {
	return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function combineSignals(a: AbortSignal | undefined, b: AbortSignal): AbortSignal {
	if (!a) return b;
	// AbortSignal.any is available in modern Workers runtimes.
	if (typeof AbortSignal.any === 'function') {
		return AbortSignal.any([a, b]);
	}
	return b;
}
