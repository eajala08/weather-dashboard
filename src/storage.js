// Remembers the chosen unit and recent cities in the browser between visits.
// Storage can be blocked (private windows, strict settings), so every call is
// wrapped and the page works the same without it.
const KEY = 'daybreak:v1';

export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Nothing to do: the page simply won't remember next time.
  }
}
