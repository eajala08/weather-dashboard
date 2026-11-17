import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fetchJson, forecastUrl, geocodeUrl, placeKey, placeLabel, searchPlaces } from '../src/api.js';

/** A stand-in for the browser's fetch that returns a canned answer and records the URL. */
function fakeFetch(body, { ok = true, status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok, status, json: async () => body };
  };
  return { fetchImpl, calls };
}

test('the forecast URL asks for metric data in the city’s own time zone', () => {
  const url = new URL(forecastUrl(42.44, -76.5));
  assert.equal(url.origin + url.pathname, 'https://api.open-meteo.com/v1/forecast');
  assert.equal(url.searchParams.get('latitude'), '42.44');
  assert.equal(url.searchParams.get('longitude'), '-76.5');
  assert.equal(url.searchParams.get('timezone'), 'auto');
  assert.equal(url.searchParams.get('forecast_days'), '7');
  assert.ok(url.searchParams.get('hourly').includes('precipitation_probability'));
  assert.equal(url.searchParams.get('temperature_unit'), null);
});

test('coordinates are rounded to about 100 m before they leave the browser', () => {
  const url = new URL(forecastUrl(42.4439614, -76.5018807));
  assert.equal(url.searchParams.get('latitude'), '42.444');
  assert.equal(url.searchParams.get('longitude'), '-76.502');
});

test('the search URL safely encodes what was typed', () => {
  const url = new URL(geocodeUrl('São Paulo & co'));
  assert.equal(url.searchParams.get('name'), 'São Paulo & co');
  assert.equal(url.searchParams.get('count'), '6');
});

test('searchPlaces reshapes results', async () => {
  const { fetchImpl, calls } = fakeFetch({
    results: [{ name: 'Ithaca', admin1: 'New York', country: 'United States', latitude: 42.44063, longitude: -76.49661 }],
  });
  const places = await searchPlaces('ithaca', { fetchImpl });
  assert.deepEqual(places, [
    { name: 'Ithaca', region: 'New York', country: 'United States', lat: 42.441, lon: -76.497 },
  ]);
  assert.ok(calls[0].includes('name=ithaca'));
});

test('searchPlaces returns an empty list when nothing matches', async () => {
  const { fetchImpl } = fakeFetch({ generationtime_ms: 0.4 });
  assert.deepEqual(await searchPlaces('qqqqqq', { fetchImpl }), []);
});

test('a failed response becomes an error the page can show', async () => {
  const { fetchImpl } = fakeFetch({}, { ok: false, status: 503 });
  await assert.rejects(fetchJson('https://example.test', { fetchImpl }), /503/);
});

test('place labels skip blanks and repeats', () => {
  assert.equal(placeLabel({ name: 'Ithaca', region: 'New York', country: 'United States' }), 'Ithaca, New York, United States');
  assert.equal(placeLabel({ name: 'Singapore', region: '', country: 'Singapore' }), 'Singapore');
  assert.equal(placeLabel({ name: 'Your location' }), 'Your location');
});

test('places are identified by their coordinates', () => {
  assert.equal(placeKey({ lat: 1.5, lon: -2 }), '1.5,-2');
});
