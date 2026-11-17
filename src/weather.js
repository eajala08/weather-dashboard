// Pure helpers for turning raw forecast numbers into things a person can read.
// Nothing in this file touches the page or the network, so all of it is unit-tested.

// WMO weather codes, the numbering Open-Meteo uses for conditions.
const CODES = {
  0: ['Clear', 'clear'],
  1: ['Mostly clear', 'clear'],
  2: ['Partly cloudy', 'partly'],
  3: ['Overcast', 'cloud'],
  45: ['Fog', 'fog'],
  48: ['Freezing fog', 'fog'],
  51: ['Light drizzle', 'drizzle'],
  53: ['Drizzle', 'drizzle'],
  55: ['Heavy drizzle', 'drizzle'],
  56: ['Freezing drizzle', 'drizzle'],
  57: ['Freezing drizzle', 'drizzle'],
  61: ['Light rain', 'rain'],
  63: ['Rain', 'rain'],
  65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'rain'],
  67: ['Freezing rain', 'rain'],
  71: ['Light snow', 'snow'],
  73: ['Snow', 'snow'],
  75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'],
  80: ['Light showers', 'rain'],
  81: ['Showers', 'rain'],
  82: ['Heavy showers', 'rain'],
  85: ['Snow showers', 'snow'],
  86: ['Heavy snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'],
  96: ['Thunderstorm with hail', 'storm'],
  99: ['Thunderstorm with hail', 'storm'],
};

/** Turn a weather code into a label and the name of the icon to draw. */
export function describeWeather(code, isDay = true) {
  const [label, kind] = CODES[code] ?? ['Unknown', 'cloud'];
  const hasNightVersion = kind === 'clear' || kind === 'partly';
  return { label, icon: hasNightVersion && !isDay ? `${kind}-night` : kind };
}

export function isSnow(code) {
  return (CODES[code]?.[1] ?? '') === 'snow';
}

export const cToF = (celsius) => (celsius * 9) / 5 + 32;
export const kmhToMph = (kmh) => kmh * 0.621371;

/** Convert a Celsius reading into the unit the person picked ("F" or "C"). */
export function toUnit(celsius, unit) {
  return unit === 'F' ? cToF(celsius) : celsius;
}

export function formatTemp(celsius, unit) {
  if (celsius == null || Number.isNaN(celsius)) return '–';
  // "+ 0" turns a rounded -0 into 0 so we never print "-0°".
  return `${Math.round(toUnit(celsius, unit)) + 0}°`;
}

export function formatWind(kmh, unit) {
  if (kmh == null || Number.isNaN(kmh)) return '–';
  if (kmh < 1) return 'Calm';
  return unit === 'F' ? `${Math.round(kmhToMph(kmh))} mph` : `${Math.round(kmh)} km/h`;
}

/** 0 → "N", 90 → "E", 225 → "SW". */
export function compass(degrees) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const turn = (((degrees % 360) + 360) % 360) / 45;
  return names[Math.round(turn) % 8];
}

export function uvLabel(uv) {
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very high';
  return 'Extreme';
}

// The API returns times already in the city's own time zone, written like
// "2026-11-17T15:00". We read the clock digits straight from the text so the
// visitor's own time zone can never shift them.

/** "2026-11-17T15:00" → "3 PM" */
export function formatHour(iso) {
  const hour = Number(iso.slice(11, 13));
  return `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** "2026-11-17T06:48" → "6:48 AM" */
export function formatClock(iso) {
  const hour = Number(iso.slice(11, 13));
  return `${hour % 12 || 12}:${iso.slice(14, 16)} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** "2026-11-17" → "Tue" (or "Tuesday" with style "long") */
export function weekdayName(iso, style = 'short') {
  const date = new Date(`${iso.slice(0, 10)}T00:00Z`);
  return date.toLocaleDateString('en-US', { weekday: style, timeZone: 'UTC' });
}

/** Milliseconds for a local timestamp, used only to measure gaps between two of them. */
export function localMs(iso) {
  return Date.parse(`${iso.slice(0, 16)}Z`);
}

/**
 * Reshape the API response into the three things the page shows:
 * conditions right now, the next 24 hours, and the next 7 days.
 */
export function shapeForecast(data) {
  const { current, hourly, daily } = data;

  // The hourly list starts at midnight; find the entry for the current hour.
  const thisHour = `${current.time.slice(0, 13)}:00`;
  const start = Math.max(0, hourly.time.indexOf(thisHour));

  const hours = hourly.time.slice(start, start + 25).map((time, offset) => {
    const i = start + offset;
    return {
      time,
      tempC: hourly.temperature_2m[i],
      precipChance: hourly.precipitation_probability?.[i] ?? 0,
      code: hourly.weather_code[i],
      isDay: hourly.is_day[i] === 1,
    };
  });

  const days = daily.time.map((date, i) => ({
    date,
    code: daily.weather_code[i],
    maxC: daily.temperature_2m_max[i],
    minC: daily.temperature_2m_min[i],
    precipChance: daily.precipitation_probability_max?.[i] ?? 0,
    sunrise: daily.sunrise[i],
    sunset: daily.sunset[i],
    uvMax: daily.uv_index_max?.[i] ?? null,
  }));

  return {
    current: {
      time: current.time,
      tempC: current.temperature_2m,
      feelsLikeC: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      windKmh: current.wind_speed_10m,
      windDeg: current.wind_direction_10m,
      code: current.weather_code,
      isDay: current.is_day === 1,
    },
    hours,
    days,
  };
}

/** One plain sentence about rain or snow in the hours ahead. */
export function precipOutlook(hours) {
  const wet = hours.findIndex((h) => h.precipChance >= 50);
  if (wet === -1) {
    const peak = Math.max(0, ...hours.map((h) => h.precipChance));
    if (peak < 20) return 'No rain or snow expected in the next 24 hours.';
    const word = hours.some((h) => isSnow(h.code)) ? 'snow' : 'rain';
    return `A slight chance of ${word}, ${peak}% at most.`;
  }
  const word = isSnow(hours[wet].code) ? 'Snow' : 'Rain';
  return wet === 0 ? `${word} likely this hour.` : `${word} likely around ${formatHour(hours[wet].time)}.`;
}

/**
 * Work out which parts of a time window are day and which are night.
 *
 * `startIso` is where the window begins, `span` is its length in hours,
 * `startsInDay` says whether the sun is up at the start, and `events` is a
 * list of { type: 'sunrise' | 'sunset', time } to flip between the two.
 * Positions are returned in hours from the start (e.g. 1.6 = 1h36m in).
 */
export function daylightSegments(startIso, span, startsInDay, events) {
  const start = localMs(startIso);
  const inWindow = events
    .map((event) => ({ ...event, offset: (localMs(event.time) - start) / 3_600_000 }))
    .filter((event) => Number.isFinite(event.offset) && event.offset > 0 && event.offset < span)
    .sort((a, b) => a.offset - b.offset);

  const segments = [];
  const marks = [];
  let from = 0;
  let isDay = startsInDay;
  for (const event of inWindow) {
    const becomesDay = event.type === 'sunrise';
    if (becomesDay === isDay) continue; // e.g. two sunrises in a row: ignore bad data
    segments.push({ from, to: event.offset, isDay });
    marks.push(event);
    from = event.offset;
    isDay = becomesDay;
  }
  segments.push({ from, to: span, isDay });
  return { segments, marks };
}
