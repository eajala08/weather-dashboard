import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  compass,
  daylightSegments,
  describeWeather,
  formatClock,
  formatHour,
  formatTemp,
  formatWind,
  precipOutlook,
  shapeForecast,
  uvLabel,
  weekdayName,
} from '../src/weather.js';

test('weather codes become labels and icons', () => {
  assert.deepEqual(describeWeather(0), { label: 'Clear', icon: 'clear' });
  assert.deepEqual(describeWeather(63), { label: 'Rain', icon: 'rain' });
  assert.deepEqual(describeWeather(95), { label: 'Thunderstorm', icon: 'storm' });
});

test('clear and partly cloudy skies get a moon at night', () => {
  assert.equal(describeWeather(0, false).icon, 'clear-night');
  assert.equal(describeWeather(2, false).icon, 'partly-night');
  assert.equal(describeWeather(63, false).icon, 'rain');
});

test('an unknown weather code does not break the page', () => {
  assert.deepEqual(describeWeather(1234), { label: 'Unknown', icon: 'cloud' });
});

test('temperatures convert, round, and never show "-0"', () => {
  assert.equal(formatTemp(20, 'C'), '20°');
  assert.equal(formatTemp(20, 'F'), '68°');
  assert.equal(formatTemp(-40, 'F'), '-40°');
  assert.equal(formatTemp(-0.3, 'C'), '0°');
  assert.equal(formatTemp(null, 'C'), '–');
});

test('wind follows the chosen unit system', () => {
  assert.equal(formatWind(20, 'C'), '20 km/h');
  assert.equal(formatWind(20, 'F'), '12 mph');
  assert.equal(formatWind(0.4, 'F'), 'Calm');
});

test('compass directions wrap around north', () => {
  assert.equal(compass(0), 'N');
  assert.equal(compass(90), 'E');
  assert.equal(compass(225), 'SW');
  assert.equal(compass(350), 'N');
  assert.equal(compass(-45), 'NW');
});

test('UV index bands', () => {
  assert.deepEqual([0, 3, 6, 8, 11].map(uvLabel), ['Low', 'Moderate', 'High', 'Very high', 'Extreme']);
});

test('times are read from the text, on a 12-hour clock', () => {
  assert.equal(formatHour('2026-11-17T00:00'), '12 AM');
  assert.equal(formatHour('2026-11-17T12:00'), '12 PM');
  assert.equal(formatHour('2026-11-17T15:00'), '3 PM');
  assert.equal(formatClock('2026-11-17T06:48'), '6:48 AM');
  assert.equal(formatClock('2026-11-17T16:05'), '4:05 PM');
});

test('weekday names', () => {
  assert.equal(weekdayName('2026-11-17'), 'Tue');
  assert.equal(weekdayName('2026-11-17T23:30', 'long'), 'Tuesday');
});

/** A fake API response: two days of hourly readings where the temperature equals the hour index. */
function fakeResponse() {
  const stamp = (day, hour) => `2026-11-${day}T${String(hour).padStart(2, '0')}:00`;
  const time = [17, 18].flatMap((day) => Array.from({ length: 24 }, (_, hour) => stamp(day, hour)));
  return {
    current: {
      time: '2026-11-17T15:45',
      temperature_2m: 14.2,
      apparent_temperature: 12.9,
      relative_humidity_2m: 64,
      wind_speed_10m: 18,
      wind_direction_10m: 310,
      weather_code: 2,
      is_day: 1,
    },
    hourly: {
      time,
      temperature_2m: time.map((_, i) => i),
      precipitation_probability: time.map((_, i) => (i === 20 ? 70 : 0)),
      weather_code: time.map(() => 3),
      is_day: time.map((_, i) => (i % 24 >= 7 && i % 24 < 17 ? 1 : 0)),
    },
    daily: {
      time: ['2026-11-17', '2026-11-18'],
      weather_code: [2, 61],
      temperature_2m_max: [16, 12],
      temperature_2m_min: [8, 6],
      precipitation_probability_max: [70, 40],
      sunrise: ['2026-11-17T06:48', '2026-11-18T06:49'],
      sunset: ['2026-11-17T16:36', '2026-11-18T16:35'],
      uv_index_max: [2.6, 1.9],
    },
  };
}

test('the hourly list starts at the current hour and covers 24 hours', () => {
  const { hours } = shapeForecast(fakeResponse());
  assert.equal(hours.length, 25);
  assert.equal(hours[0].time, '2026-11-17T15:00');
  assert.equal(hours[0].tempC, 15);
  assert.equal(hours[0].isDay, true);
  assert.equal(hours[24].time, '2026-11-18T15:00');
  assert.equal(hours[5].precipChance, 70);
});

test('current conditions and days are reshaped with friendly names', () => {
  const { current, days } = shapeForecast(fakeResponse());
  assert.equal(current.tempC, 14.2);
  assert.equal(current.isDay, true);
  assert.equal(current.windDeg, 310);
  assert.deepEqual(days[1], {
    date: '2026-11-18',
    code: 61,
    maxC: 12,
    minC: 6,
    precipChance: 40,
    sunrise: '2026-11-18T06:49',
    sunset: '2026-11-18T16:35',
    uvMax: 1.9,
  });
});

test('missing rain data is treated as 0% instead of crashing', () => {
  const response = fakeResponse();
  delete response.hourly.precipitation_probability;
  delete response.daily.precipitation_probability_max;
  const { hours, days } = shapeForecast(response);
  assert.equal(hours[0].precipChance, 0);
  assert.equal(days[0].precipChance, 0);
});

test('the outlook sentence names the first likely hour of rain', () => {
  const { hours } = shapeForecast(fakeResponse());
  assert.equal(precipOutlook(hours), 'Rain likely around 8 PM.');
});

test('the outlook sentence covers dry, slight-chance, snow and right-now cases', () => {
  const hour = (precipChance, code = 3) => ({ time: '2026-11-17T09:00', precipChance, code });
  assert.equal(precipOutlook([hour(0), hour(10)]), 'No rain or snow expected in the next 24 hours.');
  assert.equal(precipOutlook([hour(0), hour(35)]), 'A slight chance of rain, 35% at most.');
  assert.equal(precipOutlook([hour(0), hour(80, 73)]), 'Snow likely around 9 AM.');
  assert.equal(precipOutlook([hour(90, 63)]), 'Rain likely this hour.');
});

test('day and night are split at sunset and sunrise', () => {
  const events = [
    { type: 'sunrise', time: '2026-11-17T06:48' }, // before the window: ignored
    { type: 'sunset', time: '2026-11-17T16:30' },
    { type: 'sunrise', time: '2026-11-18T06:45' },
    { type: 'sunset', time: '2026-11-18T16:35' }, // after the window: ignored
  ];
  const { segments, marks } = daylightSegments('2026-11-17T15:00', 24, true, events);
  assert.deepEqual(segments, [
    { from: 0, to: 1.5, isDay: true },
    { from: 1.5, to: 15.75, isDay: false },
    { from: 15.75, to: 24, isDay: true },
  ]);
  assert.deepEqual(marks.map((m) => m.type), ['sunset', 'sunrise']);
});

test('with no sunrise or sunset in the window, the whole strip is one segment', () => {
  const { segments } = daylightSegments('2026-06-21T00:00', 24, true, []);
  assert.deepEqual(segments, [{ from: 0, to: 24, isDay: true }]);
});
