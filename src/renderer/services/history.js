/**
 * History Service
 * Provides a localStorage-backed persistence layer for browsing history.
 * The Vuex store is the primary source of truth; this handles durable storage
 * across app restarts before state is fully hydrated.
 */

const HISTORY_KEY = 'prime_browser_history';
const MAX_HISTORY_ENTRIES = 200;

/**
 * List of URL prefixes/patterns to exclude from history.
 */
function isInternalUrl(url) {
  if (!url || typeof url !== 'string') return true;
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (trimmed === 'about:blank') return true;
  if (trimmed.startsWith('lulumi://')) return true;
  if (trimmed.startsWith('lulumi-extension://')) return true;
  if (trimmed.startsWith('chrome://')) return true;
  if (trimmed.includes('/error/index.html')) return true;
  if (trimmed.startsWith('lulumi:blank')) return true;
  return false;
}

/**
 * Safely read and parse history from localStorage.
 * @returns {Array} Array of history entries.
 */
function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    return [];
  }
}

/**
 * Add a new history entry.
 * Skips internal/blank URLs, avoids consecutive duplicate entries,
 * and keeps the list capped at MAX_HISTORY_ENTRIES.
 *
 * @param {{ url: string, title: string, timestamp: number }} entry
 */
function addHistory(entry) {
  if (!entry || !entry.url) return;
  if (isInternalUrl(entry.url)) return;

  const history = getHistory();

  // Avoid duplicate consecutive entries (same URL)
  if (history.length > 0 && history[0].url === entry.url) {
    // Update title and timestamp instead
    history[0].title = entry.title || history[0].title;
    history[0].timestamp = entry.timestamp || Date.now();
  } else {
    history.unshift({
      url: entry.url,
      title: entry.title || entry.url,
      timestamp: entry.timestamp || Date.now(),
    });
  }

  // Enforce max limit
  if (history.length > MAX_HISTORY_ENTRIES) {
    history.length = MAX_HISTORY_ENTRIES;
  }

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    // Storage quota exceeded or unavailable — silently fail
  }
}

/**
 * Clear all history from localStorage.
 */
function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch (e) {
    // Silently fail
  }
}

module.exports = { getHistory, addHistory, clearHistory };
