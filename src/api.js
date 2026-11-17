// Talks to Open-Meteo, a free weather service that needs no account or key.
import { shapeForecast } from './weather.js';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

// Three decimals is about 100 m: plenty for weather, and it avoids sending
// someone's exact position when they use "Use my location".
const roundCoord = (value) => Math.round(value * 1000) / 1000;

export function forecastUrl(lat, lon) {
  const params = new URLSearchParams({
    latitude: roundCoord(lat),
    longitude: roundCoord(lon),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m',
    hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: 7,
  });
  return `${FORECAST_URL}?${params}`;
}

export function geocodeUrl(query, count = 6) {
  const params = new URLSearchParams({ name: query, count, language: 'en', format: 'json' });
  return `${GEOCODE_URL}?${params}`;
}

export async function fetchJson(url, { signal, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, { signal });
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
}

/** Look up cities by name. Returns [] when nothing matches. */
export async function searchPlaces(query, options) {
  const data = await fetchJson(geocodeUrl(query), options);
  return (data.results ?? []).map((result) => ({
    name: result.name,
    region: result.admin1 ?? '',
    country: result.country ?? '',
    lat: roundCoord(result.latitude),
    lon: roundCoord(result.longitude),
  }));
}

export async function getForecast(place, options) {
  return shapeForecast(await fetchJson(forecastUrl(place.lat, place.lon), options));
}

/** "Ithaca, New York, United States" — skipping blanks and repeats like "Singapore, Singapore". */
export function placeLabel(place) {
  const parts = [place.name, place.region, place.country].filter(Boolean);
  return parts.filter((part, i) => parts.indexOf(part) === i).join(', ');
}

export const placeKey = (place) => `${place.lat},${place.lon}`;
