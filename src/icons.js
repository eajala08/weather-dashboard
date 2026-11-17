// Small line icons for each kind of weather, drawn as inline SVG so they
// take on the text color and need no image files.
const CLOUD = '<path d="M7 18h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 9.1 4.5 4.5 0 0 0 7 18z"/>';
const HIGH_CLOUD = '<path d="M7 15h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 6.1 4.5 4.5 0 0 0 7 15z"/>';
const SMALL_CLOUD =
  '<path d="M10 19.5h7.5a3.25 3.25 0 0 0 .5-6.46 4.5 4.5 0 0 0-8.56-.72A3.6 3.6 0 0 0 10 19.5z"/>';

const SHAPES = {
  clear:
    '<circle cx="12" cy="12" r="4.25"/><path d="M12 2.5v2.25M12 19.25v2.25M2.5 12h2.25M19.25 12h2.25M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  'clear-night': '<path d="M20 14.2A8 8 0 1 1 9.8 4a6.4 6.4 0 0 0 10.2 10.2z"/>',
  partly: `<path d="M8 2.75v1.5M2.75 8h1.5M4.3 4.3l1.05 1.05M11.7 4.3l-1.05 1.05M5.3 9.6a3 3 0 1 1 5.3-2.7"/>${SMALL_CLOUD}`,
  'partly-night': `<path d="M12.6 7.2A4.6 4.6 0 0 1 7 2.75a4.6 4.6 0 1 0 1 8.9"/>${SMALL_CLOUD}`,
  cloud: CLOUD,
  fog: `${HIGH_CLOUD}<path d="M5 18.5h14M8 21.5h8"/>`,
  drizzle: `${HIGH_CLOUD}<path d="M8.5 18.5v.5M12 18.5v.5M15.5 18.5v.5M10.25 21.5v.5M13.75 21.5v.5"/>`,
  rain: `${HIGH_CLOUD}<path d="M9 18l-1.25 3.5M12.75 18l-1.25 3.5M16.5 18l-1.25 3.5"/>`,
  snow: `${HIGH_CLOUD}<path d="M8.5 19.25h.01M12 19.25h.01M15.5 19.25h.01M10.25 22h.01M13.75 22h.01" stroke-width="2.4"/>`,
  storm: `${HIGH_CLOUD}<path d="M12.75 16.5l-2.5 3.25h3l-2 3.25"/>`,
};

export function icon(name, size = 24) {
  const shape = SHAPES[name] ?? SHAPES.cloud;
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shape}</svg>`;
}
