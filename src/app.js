// Wires the page together: search, units, recent cities, and drawing each section.
import { getForecast, placeKey, placeLabel, searchPlaces } from './api.js';
import { createChart } from './chart.js';
import { icon } from './icons.js';
import { loadSettings, saveSettings } from './storage.js';
import {
  compass,
  describeWeather,
  formatClock,
  formatHour,
  formatTemp,
  formatWind,
  isSnow,
  precipOutlook,
  uvLabel,
  weekdayName,
} from './weather.js';

const DEFAULT_PLACE = { name: 'New York', region: 'New York', country: 'United States', lat: 40.714, lon: -74.006 };
const MAX_RECENT = 5;
const SEARCH_DELAY_MS = 250;

const $ = (id) => document.getElementById(id);
const els = {
  form: $('search'),
  input: $('city'),
  list: $('suggestions'),
  locate: $('locate'),
  units: $('units'),
  recent: $('recent'),
  notice: $('notice'),
  main: $('main'),
  status: $('status'),
  error: $('error'),
  errorText: $('error-text'),
  retry: $('retry'),
  content: $('content'),
  place: $('place'),
  localTime: $('local-time'),
  temp: $('temp'),
  condition: $('condition'),
  summary: $('summary'),
  readout: $('readout'),
  chart: $('chart'),
  days: $('days'),
  facts: $('facts'),
};

const saved = loadSettings();
const state = {
  unit: saved.unit ?? (navigator.language?.endsWith('-US') ? 'F' : 'C'),
  place: saved.place ?? DEFAULT_PLACE, // the city being asked for
  recent: saved.recent ?? [],
  forecast: null, // the last forecast that loaded
  forecastPlace: null, // the city that forecast belongs to
  status: 'loading', // 'loading' | 'ready' | 'error'
  error: '',
};

const chart = createChart(els.chart, { onActiveChange: renderReadout });

function persist() {
  // A "my location" lookup is never written to storage.
  const place = state.place.here ? (state.recent[0] ?? DEFAULT_PLACE) : state.place;
  saveSettings({ unit: state.unit, place, recent: state.recent });
}

/* ---------- Loading a forecast ---------- */

let forecastRequest = null;

async function loadForecast(place) {
  // If an earlier request is still running, cancel it so a slow old answer
  // can never overwrite a newer one.
  forecastRequest?.abort();
  const request = (forecastRequest = new AbortController());

  state.place = place;
  state.status = 'loading';
  els.notice.textContent = '';
  render();

  try {
    const forecast = await getForecast(place, { signal: request.signal });
    state.forecast = forecast;
    state.forecastPlace = place;
    state.status = 'ready';
    if (!place.here) {
      state.recent = [place, ...state.recent.filter((p) => placeKey(p) !== placeKey(place))].slice(0, MAX_RECENT);
    }
    persist();
  } catch (error) {
    if (error.name === 'AbortError') return;
    state.status = 'error';
    state.error =
      navigator.onLine === false
        ? 'You are offline. Reconnect, then try again.'
        : 'The forecast did not load. The weather service may be busy, so try again in a moment.';
  }
  render();
}

/* ---------- Drawing the page ---------- */

function render() {
  const { status, forecast } = state;
  els.main.dataset.state = status;
  els.status.textContent = status === 'loading' ? `Loading the forecast for ${state.place.name}…` : '';
  els.error.hidden = status !== 'error';
  els.errorText.textContent = state.error;
  els.content.hidden = !forecast || status === 'error';

  renderUnits();
  renderRecent();
  if (!forecast || status === 'error') return;

  document.documentElement.dataset.sky = forecast.current.isDay ? 'day' : 'night';
  document.title = `${formatTemp(forecast.current.tempC, state.unit)} in ${state.forecastPlace.name} | Daybreak`;
  renderNow();
  renderWeek();
  renderFacts();
  chart.update({
    hours: forecast.hours,
    unit: state.unit,
    sunEvents: forecast.days.flatMap((day) => [
      { type: 'sunrise', time: day.sunrise },
      { type: 'sunset', time: day.sunset },
    ]),
  });
}

function renderUnits() {
  for (const button of els.units.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.unit === state.unit));
  }
}

function renderRecent() {
  els.recent.hidden = state.recent.length === 0;
  const list = els.recent.querySelector('ul');
  list.replaceChildren(
    ...state.recent.map((place, index) => {
      const item = document.createElement('li');
      const isCurrent = !state.place.here && placeKey(place) === placeKey(state.place);
      item.dataset.current = String(isCurrent);

      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'pick';
      pick.dataset.pick = index;
      pick.textContent = place.name;
      if (isCurrent) pick.setAttribute('aria-current', 'true');

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove';
      remove.dataset.remove = index;
      remove.setAttribute('aria-label', `Remove ${place.name}`);
      remove.textContent = '×';

      item.append(pick, remove);
      return item;
    }),
  );
}

function renderNow() {
  const { current, days } = state.forecast;
  const weather = describeWeather(current.code, current.isDay);
  els.place.textContent = placeLabel(state.forecastPlace);
  els.localTime.textContent = `${weekdayName(current.time, 'long')}, ${formatClock(current.time)} local time`;
  els.temp.textContent = formatTemp(current.tempC, state.unit);
  els.condition.innerHTML = `${icon(weather.icon, 34)}<span>${weather.label}</span>`;
  els.summary.textContent =
    `Feels like ${formatTemp(current.feelsLikeC, state.unit)}. ` +
    `Today's high is ${formatTemp(days[0].maxC, state.unit)} and the low is ${formatTemp(days[0].minC, state.unit)}.`;
}

function renderReadout(activeIndex) {
  if (!state.forecast) return;
  const { hours } = state.forecast;
  if (activeIndex == null) {
    els.readout.textContent = precipOutlook(hours);
    return;
  }
  const hour = hours[activeIndex];
  const when = activeIndex === 0 ? 'Now' : formatHour(hour.time);
  const label = describeWeather(hour.code, hour.isDay).label.toLowerCase();
  const wet = isSnow(hour.code) ? 'snow' : 'rain';
  els.readout.textContent = `${when}: ${formatTemp(hour.tempC, state.unit)}, ${label}, ${hour.precipChance}% chance of ${wet}`;
}

function renderWeek() {
  const { days } = state.forecast;
  // Every bar sits on one shared scale, from the week's coldest low to its warmest high.
  const coldest = Math.min(...days.map((d) => d.minC));
  const warmest = Math.max(...days.map((d) => d.maxC));
  const span = warmest - coldest || 1;

  els.days.innerHTML = days
    .map((day, i) => {
      const weather = describeWeather(day.code);
      const width = Math.max(((day.maxC - day.minC) / span) * 100, 5);
      const left = Math.min(((day.minC - coldest) / span) * 100, 100 - width);
      const rain =
        day.precipChance >= 10
          ? `${day.precipChance}%<span class="visually-hidden"> chance of rain or snow</span>`
          : '';
      return `<li>
        <span class="day-name">${i === 0 ? 'Today' : weekdayName(day.date)}</span>
        <span class="day-icon">${icon(weather.icon, 22)}</span>
        <span class="day-label">${weather.label}</span>
        <span class="day-rain">${rain}</span>
        <span class="day-low"><span class="visually-hidden">Low </span>${formatTemp(day.minC, state.unit)}</span>
        <span class="range" aria-hidden="true"><span style="left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></span></span>
        <span class="day-high"><span class="visually-hidden">High </span>${formatTemp(day.maxC, state.unit)}</span>
      </li>`;
    })
    .join('');
}

function renderFacts() {
  const { current, days } = state.forecast;
  const today = days[0];
  const wind = formatWind(current.windKmh, state.unit);
  const facts = [
    ['Wind', wind === 'Calm' ? wind : `${wind} from the ${compass(current.windDeg)}`],
    ['Humidity', `${Math.round(current.humidity)}%`],
    ['UV index today', today.uvMax == null ? '–' : `${Math.round(today.uvMax)}, ${uvLabel(today.uvMax).toLowerCase()}`],
    ['Sunrise', formatClock(today.sunrise)],
    ['Sunset', formatClock(today.sunset)],
  ];
  els.facts.innerHTML = facts.map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join('');
}

/* ---------- City search ---------- */

let searchRequest = null;
let searchTimer = 0;
let suggestions = [];
let suggestionsFor = '';
let activeOption = -1;

async function runSearch(query) {
  searchRequest?.abort();
  const request = (searchRequest = new AbortController());
  try {
    suggestions = await searchPlaces(query, { signal: request.signal });
    suggestionsFor = query;
    showSuggestions(suggestions.length ? '' : `No cities match “${query}”. Check the spelling.`);
  } catch (error) {
    if (error.name === 'AbortError') return [];
    suggestions = [];
    suggestionsFor = '';
    showSuggestions('City search is not responding. Try again in a moment.');
  }
  return suggestions;
}

function showSuggestions(message) {
  activeOption = -1;
  els.input.removeAttribute('aria-activedescendant');
  const items = message
    ? [Object.assign(document.createElement('li'), { className: 'empty', textContent: message })]
    : suggestions.map((place, index) => {
        const item = document.createElement('li');
        item.id = `option-${index}`;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', 'false');
        item.dataset.index = index;
        const detail = document.createElement('small');
        detail.textContent = [place.region, place.country].filter(Boolean).join(', ');
        item.append(place.name, detail);
        return item;
      });
  els.list.replaceChildren(...items);
  els.list.hidden = false;
  els.input.setAttribute('aria-expanded', 'true');
}

function hideSuggestions() {
  els.list.hidden = true;
  els.input.setAttribute('aria-expanded', 'false');
  els.input.removeAttribute('aria-activedescendant');
  activeOption = -1;
}

function moveActiveOption(direction) {
  if (els.list.hidden || suggestions.length === 0) return;
  activeOption = (activeOption + direction + suggestions.length) % suggestions.length;
  els.list.querySelectorAll('[role="option"]').forEach((item, index) => {
    item.setAttribute('aria-selected', String(index === activeOption));
  });
  els.input.setAttribute('aria-activedescendant', `option-${activeOption}`);
}

function choosePlace(place) {
  clearTimeout(searchTimer);
  searchRequest?.abort();
  els.input.value = '';
  suggestions = [];
  suggestionsFor = '';
  hideSuggestions();
  els.input.blur();
  loadForecast(place);
}

els.input.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const query = els.input.value.trim();
  if (query.length < 2) {
    searchRequest?.abort();
    hideSuggestions();
    return;
  }
  // Wait until typing pauses so we don't send a request for every keystroke.
  searchTimer = setTimeout(() => runSearch(query), SEARCH_DELAY_MS);
});

els.input.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveActiveOption(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveActiveOption(-1);
  } else if (event.key === 'Escape') {
    hideSuggestions();
  }
});

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = els.input.value.trim();
  if (query.length < 2) return;
  if (activeOption >= 0) return choosePlace(suggestions[activeOption]);
  // Enter pressed before the suggestions caught up with the typing: search now.
  clearTimeout(searchTimer);
  const results = suggestionsFor === query ? suggestions : await runSearch(query);
  if (results.length) choosePlace(results[0]);
});

// pointerdown would normally move focus out of the search box and close the
// list before the click lands, so keep focus where it is.
els.list.addEventListener('pointerdown', (event) => event.preventDefault());
els.list.addEventListener('click', (event) => {
  const item = event.target.closest('[role="option"]');
  if (item) choosePlace(suggestions[Number(item.dataset.index)]);
});
els.form.addEventListener('focusout', (event) => {
  if (!els.form.contains(event.relatedTarget)) hideSuggestions();
});

/* ---------- Other controls ---------- */

els.units.addEventListener('click', (event) => {
  const unit = event.target.closest('button')?.dataset.unit;
  if (!unit || unit === state.unit) return;
  state.unit = unit;
  persist();
  render(); // readings are stored in Celsius, so switching needs no new request
});

els.recent.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.pick != null) {
    loadForecast(state.recent[Number(button.dataset.pick)]);
  } else if (button.dataset.remove != null) {
    state.recent.splice(Number(button.dataset.remove), 1);
    persist();
    renderRecent();
  }
});

els.locate.addEventListener('click', () => {
  if (!navigator.geolocation) {
    els.notice.textContent = 'This browser cannot share a location. Search for a city instead.';
    return;
  }
  els.locate.disabled = true;
  els.locate.textContent = 'Finding you…';
  const done = () => {
    els.locate.disabled = false;
    els.locate.textContent = 'Use my location';
  };
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      done();
      loadForecast({ name: 'Your location', lat: coords.latitude, lon: coords.longitude, here: true });
    },
    () => {
      done();
      els.notice.textContent = 'Location access is blocked for this page. Search for a city instead.';
    },
    { timeout: 10_000, maximumAge: 600_000 },
  );
});

els.retry.addEventListener('click', () => loadForecast(state.place));

loadForecast(state.place);
