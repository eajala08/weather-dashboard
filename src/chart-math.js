// The math behind the hourly chart, kept separate from drawing so it can be tested.

/** Build a function that maps a value from one range onto another (data → pixels). */
export function scaleLinear([d0, d1], [r0, r1]) {
  const span = d1 - d0 || 1;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

/** Lowest and highest value, with breathing room so the line never touches the edges. */
export function paddedExtent(values, padding = 0.12) {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * padding;
  return [lo - pad, hi + pad];
}

/**
 * Slopes for a smooth curve that never overshoots the data
 * (monotone cubic interpolation, the Fritsch–Carlson method).
 *
 * A naive smooth curve can bulge above a peak and suggest it hit 62° when the
 * forecast high is 60°. These slopes are flattened wherever that would happen.
 */
export function monotoneTangents(points) {
  const n = points.length;
  if (n < 2) return points.map(() => 0);

  const slopes = [];
  for (let i = 0; i < n - 1; i++) {
    slopes.push((points[i + 1].y - points[i].y) / (points[i + 1].x - points[i].x));
  }

  const tangents = [slopes[0]];
  for (let i = 1; i < n - 1; i++) {
    const turnsAround = slopes[i - 1] * slopes[i] <= 0;
    tangents.push(turnsAround ? 0 : (slopes[i - 1] + slopes[i]) / 2);
  }
  tangents.push(slopes[n - 2]);

  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / slopes[i];
    const b = tangents[i + 1] / slopes[i];
    const size = a * a + b * b;
    if (size > 9) {
      const shrink = 3 / Math.sqrt(size);
      tangents[i] = shrink * a * slopes[i];
      tangents[i + 1] = shrink * b * slopes[i];
    }
  }
  return tangents;
}

/** The control points for each curve segment between neighbouring data points. */
export function monotoneSegments(points) {
  const tangents = monotoneTangents(points);
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const third = (p1.x - p0.x) / 3;
    segments.push({
      c1: { x: p0.x + third, y: p0.y + tangents[i] * third },
      c2: { x: p1.x - third, y: p1.y - tangents[i + 1] * third },
      end: p1,
    });
  }
  return segments;
}

/** An SVG path string that draws the smooth curve through every point. */
export function monotonePath(points) {
  if (points.length === 0) return '';
  const f = (n) => Number(n.toFixed(2));
  let path = `M${f(points[0].x)},${f(points[0].y)}`;
  for (const { c1, c2, end } of monotoneSegments(points)) {
    path += ` C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(end.x)},${f(end.y)}`;
  }
  return path;
}

/** Which data point is closest to a horizontal pixel position. */
export function nearestIndex(px, start, step, count) {
  const index = Math.round((px - start) / step);
  return Math.min(count - 1, Math.max(0, index));
}
