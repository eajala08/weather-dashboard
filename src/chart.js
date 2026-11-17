// Draws the 24-hour chart as SVG: day and night bands, a temperature curve,
// and bars for the chance of rain. No chart library is used.
import { monotonePath, nearestIndex, paddedExtent, scaleLinear } from './chart-math.js';
import { daylightSegments, formatClock, formatHour, toUnit } from './weather.js';

const SIDE = 26; // space at the left and right so edge labels fit
const AXIS_H = 28; // hour labels along the bottom
const RAIN_H = 44; // height of the tallest possible rain bar
const SUN_H = 30; // strip at the top for sunrise and sunset labels

const round = (n) => Math.round(n * 10) / 10;

export function createChart(root, { onActiveChange }) {
  const svg = root.querySelector('svg');
  let model = null; // { hours, unit, sunEvents }
  let geometry = null; // pixel positions from the last draw
  let active = null; // index of the highlighted hour, or null

  function draw() {
    if (!model) return;
    const { hours, unit, sunEvents } = model;
    const width = Math.max(280, Math.round(root.clientWidth));
    const height = width < 560 ? 270 : 320;
    const last = hours.length - 1;

    const rainBottom = height - AXIS_H;
    const rainTop = rainBottom - RAIN_H;
    const plotBottom = rainTop - 22;
    const plotTop = SUN_H + 26;

    const x = scaleLinear([0, last], [SIDE, width - SIDE]);
    const step = (width - SIDE * 2) / last;
    const temps = hours.map((h) => toUnit(h.tempC, unit));
    const y = scaleLinear(paddedExtent(temps), [plotBottom, plotTop]);
    const points = temps.map((t, i) => ({ x: x(i), y: y(t) }));

    const labelEvery = width < 430 ? 6 : width < 700 ? 4 : 3;
    const parts = [];

    // Night bands. They run to the very edges so the chart reads as a strip of time.
    const { segments, marks } = daylightSegments(hours[0].time, last, hours[0].isDay, sunEvents);
    for (const segment of segments) {
      if (segment.isDay) continue;
      const left = segment.from === 0 ? 0 : x(segment.from);
      const right = segment.to === last ? width : x(segment.to);
      parts.push(
        `<rect class="night" x="${round(left)}" y="0" width="${round(right - left)}" height="${rainBottom}"/>`,
      );
    }
    for (const mark of marks) {
      const mx = x(mark.offset);
      const nearRightEdge = mx > width - 130;
      // On a phone the two labels can sit side by side, so use arrows instead of words.
      const word = width < 430 ? (mark.type === 'sunrise' ? '↑' : '↓') : mark.type === 'sunrise' ? 'Sunrise' : 'Sunset';
      parts.push(
        `<text class="t-sun" x="${round(mx + (nearRightEdge ? -7 : 7))}" y="20" text-anchor="${nearRightEdge ? 'end' : 'start'}">${word} ${formatClock(mark.time)}</text>`,
      );
    }

    // Temperature: a soft fill under a smooth line.
    const line = monotonePath(points);
    const floor = plotBottom + 12;
    parts.push(
      `<path class="temp-area" d="${line} L${round(points[last].x)},${floor} L${round(points[0].x)},${floor} Z"/>`,
      `<path class="temp-line" d="${line}"/>`,
    );

    // Chance of rain: one bar per hour, with the peak labelled.
    parts.push(`<line class="base" x1="0" x2="${width}" y1="${rainBottom}" y2="${rainBottom}"/>`);
    const barWidth = Math.max(3, step * 0.55);
    const peak = Math.max(...hours.map((h) => h.precipChance));
    const peakAt = hours.findIndex((h) => h.precipChance === peak);
    hours.forEach((hour, i) => {
      if (hour.precipChance <= 0) return;
      const barHeight = Math.max(2, (hour.precipChance / 100) * RAIN_H);
      parts.push(
        `<rect class="rain" x="${round(x(i) - barWidth / 2)}" y="${round(rainBottom - barHeight)}" width="${round(barWidth)}" height="${round(barHeight)}" rx="1.5"/>`,
      );
    });
    if (peak >= 20) {
      const barHeight = (peak / 100) * RAIN_H;
      parts.push(
        `<text class="t-rain" x="${round(x(peakAt))}" y="${round(rainBottom - barHeight - 6)}" text-anchor="middle">${peak}%</text>`,
      );
    }

    // Labels every few hours: the temperature above its dot, the time below.
    for (let i = 0; i <= last; i += labelEvery) {
      parts.push(
        `<circle class="dot" cx="${round(points[i].x)}" cy="${round(points[i].y)}" r="3.5"/>`,
        `<text class="t-temp" x="${round(points[i].x)}" y="${round(points[i].y - 12)}" text-anchor="middle">${Math.round(temps[i]) + 0}°</text>`,
        `<text x="${round(points[i].x)}" y="${height - 9}" text-anchor="middle">${i === 0 ? 'Now' : formatHour(hours[i].time)}</text>`,
      );
    }

    parts.push('<g class="active"></g>');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('height', height);
    svg.innerHTML = parts.join('');

    geometry = { points, step, top: plotTop - 8, bottom: rainBottom, count: hours.length };
    drawActive();
  }

  function drawActive() {
    const layer = svg.querySelector('.active');
    if (!layer || !geometry) return;
    if (active == null) {
      layer.innerHTML = '';
      return;
    }
    const point = geometry.points[active];
    layer.innerHTML =
      `<line class="guide" x1="${round(point.x)}" x2="${round(point.x)}" y1="${geometry.top}" y2="${geometry.bottom}"/>` +
      `<circle class="active-dot" cx="${round(point.x)}" cy="${round(point.y)}" r="5.5"/>`;
  }

  function setActive(index) {
    if (index === active) return;
    active = index;
    drawActive();
    onActiveChange(active);
  }

  function indexFromPointer(event) {
    const box = svg.getBoundingClientRect();
    return nearestIndex(event.clientX - box.left, SIDE, geometry.step, geometry.count);
  }

  svg.addEventListener('pointermove', (event) => geometry && setActive(indexFromPointer(event)));
  svg.addEventListener('pointerdown', (event) => geometry && setActive(indexFromPointer(event)));
  svg.addEventListener('pointerleave', (event) => {
    // A finger lifting off should leave the reading on screen; a mouse leaving clears it.
    if (event.pointerType === 'mouse') setActive(null);
  });

  root.addEventListener('keydown', (event) => {
    if (!geometry) return;
    const lastIndex = geometry.count - 1;
    const moves = {
      ArrowRight: Math.min(lastIndex, (active ?? -1) + 1),
      ArrowLeft: Math.max(0, (active ?? 1) - 1),
      Home: 0,
      End: lastIndex,
    };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]);
    } else if (event.key === 'Escape') {
      setActive(null);
    }
  });
  root.addEventListener('blur', () => setActive(null));

  new ResizeObserver(draw).observe(root);

  return {
    update(nextModel) {
      model = nextModel;
      active = null;
      draw();
      onActiveChange(null);
    },
  };
}
