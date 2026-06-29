// ─── history.js ───────────────────────────────────────────────────────────────
const MAX_HISTORY = 20;
let _history      = [];

export function addToHistory(entry) {
  _history = _history.filter(
    h => !(h.title.toLowerCase() === entry.title.toLowerCase() &&
           h.artist.toLowerCase() === entry.artist.toLowerCase())
  );
  _history.unshift({ ...entry, timestamp: Date.now() });
  if (_history.length > MAX_HISTORY) _history = _history.slice(0, MAX_HISTORY);
}

export function getHistory()  { return [..._history]; }
export function clearHistory() { _history = []; }