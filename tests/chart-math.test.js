import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  monotonePath,
  monotoneSegments,
  monotoneTangents,
  nearestIndex,
  paddedExtent,
  scaleLinear,
} from '../src/chart-math.js';

test('scaleLinear maps data onto pixels, including upside-down ranges', () => {
  const x = scaleLinear([0, 24], [20, 500]);
  assert.equal(x(0), 20);
  assert.equal(x(12), 260);
  assert.equal(x(24), 500);
  const y = scaleLinear([0, 10], [200, 0]); // SVG y grows downward
  assert.equal(y(10), 0);
  assert.equal(y(2.5), 150);
});

test('paddedExtent adds room above and below', () => {
  assert.deepEqual(paddedExtent([10, 20], 0.1), [9, 21]);
});

test('paddedExtent still gives a usable range when every value is the same', () => {
  const [lo, hi] = paddedExtent([5, 5, 5]);
  assert.ok(lo < 5 && hi > 5);
});

test('the curve is flat at peaks and valleys', () => {
  const peak = [
    { x: 0, y: 0 },
    { x: 1, y: 10 },
    { x: 2, y: 0 },
  ];
  assert.equal(monotoneTangents(peak)[1], 0);
});

test('the curve never overshoots the data between two points', () => {
  // A sharp jump followed by a plateau is the classic case where smooth curves bulge.
  const points = [0, 0, 1, 30, 30, 31, 5, 4, 4].map((y, x) => ({ x: x * 20, y }));
  let previous = points[0];
  for (const { c1, c2, end } of monotoneSegments(points)) {
    const lo = Math.min(previous.y, end.y) - 1e-9;
    const hi = Math.max(previous.y, end.y) + 1e-9;
    assert.ok(c1.y >= lo && c1.y <= hi, `control point ${c1.y} outside ${lo}..${hi}`);
    assert.ok(c2.y >= lo && c2.y <= hi, `control point ${c2.y} outside ${lo}..${hi}`);
    previous = end;
  }
});

test('a straight line stays straight', () => {
  const tangents = monotoneTangents([0, 1, 2, 3].map((n) => ({ x: n, y: n * 2 })));
  assert.deepEqual(tangents, [2, 2, 2, 2]);
});

test('monotonePath produces one curve command per gap', () => {
  const path = monotonePath([
    { x: 0, y: 0 },
    { x: 10, y: 5 },
    { x: 20, y: 5 },
  ]);
  assert.ok(path.startsWith('M0,0 C'));
  assert.equal(path.split('C').length - 1, 2);
  assert.equal(monotonePath([]), '');
  assert.equal(monotonePath([{ x: 3, y: 4 }]), 'M3,4');
});

test('nearestIndex snaps a pointer position to an hour and stays in range', () => {
  assert.equal(nearestIndex(26, 26, 20, 25), 0);
  assert.equal(nearestIndex(26 + 20 * 3 + 9, 26, 20, 25), 3);
  assert.equal(nearestIndex(26 + 20 * 3 + 11, 26, 20, 25), 4);
  assert.equal(nearestIndex(-500, 26, 20, 25), 0);
  assert.equal(nearestIndex(9999, 26, 20, 25), 24);
});
