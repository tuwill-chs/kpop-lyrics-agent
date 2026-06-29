// ─── app.js ───────────────────────────────────────────────────────────────────
import { searchGenius, extractVariants, suggestArtists, fetchLyrics } from './genius.js';
import { addToHistory, getHistory, clearHistory }                      from './history.js';

const titleInput      = document.getElementById('title-input');
const artistInput     = document.getElementById('artist-input');
const suggestBox      = document.getElementById('artist-suggestions');
const searchBtn       = document.getElementById('search-btn');
const feedbackEl      = document.getElementById('feedback');
const resultsSection  = document.getElementById('results-section');
const songMeta        = document.getElementById('song-meta');
const tabs            = document.querySelectorAll('.tab-btn');
const panels          = document.querySelectorAll('.tab-panel');
const historyPanel    = document.getElementById('history-panel');
const historyList     = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const downloadBtn     = document.getElementById('download-btn');
const themeToggle     = document.querySelector('[data-theme-toggle]');

// ── Theme toggle ──────────────────────────────────────────────────────────────
(function () {
  const root = document.documentElement;
  let dark   = matchMedia('(prefers-color-scheme:dark)').matches;
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  updateThemeIcon();
  themeToggle.addEventListener('click', () => {
    dark = !dark;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    updateThemeIcon();
  });
  function updateThemeIcon() {
    themeToggle.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
    themeToggle.innerHTML = dark
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  }
})();

// ── State ─────────────────────────────────────────────────────────────────────
let currentVariants  = null;
let currentMeta      = null;
let currentLyrics    = { hangul: null, romanized: null, english: null };

// ── Autosuggest ───────────────────────────────────────────────────────────────
let suggestTimer = null;

titleInput.addEventListener('input', () => {
  clearTimeout(suggestTimer);
  const val = titleInput.value.trim();
  if (val.length < 2) { hideSuggest(); return; }
  suggestTimer = setTimeout(() => runAutosuggest(val), 400);
});
titleInput.addEventListener('keydown', e => { if (e.key === 'Escape') hideSuggest(); });
document.addEventListener('click', e => {
  if (!suggestBox.contains(e.target) && e.target !== titleInput) hideSuggest();
});

async function runAutosuggest(query) {
  let artists;
  try { artists = await suggestArtists(query); }
  catch { hideSuggest(); return; }
  if (!artists.length) { hideSuggest(); return; }
  renderSuggest(artists);
}

function renderSuggest(artists) {
  suggestBox.innerHTML = '';
  artists.forEach(a => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.tabIndex = 0;
    if (a.thumbnail) {
      const img   = document.createElement('img');
      img.src     = a.thumbnail;
      img.alt     = a.name;
      img.width   = 24;
      img.height  = 24;
      img.loading = 'lazy';
      li.appendChild(img);
    }
    const span       = document.createElement('span');
    span.textContent = a.name;
    li.appendChild(span);
    const pick = () => { artistInput.value = a.name; hideSuggest(); artistInput.focus(); };
    li.addEventListener('click', pick);
    li.addEventListener('keydown', e => { if (e.key === 'Enter') pick(); });
    suggestBox.appendChild(li);
  });
  suggestBox.hidden = false;
}

function hideSuggest() { suggestBox.hidden = true; suggestBox.innerHTML = ''; }

// ── Tabs ──────────────────────────────────────────────────────────────────────
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    panels.forEach(p => p.hidden = true);
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    document.getElementById(tab.dataset.panel).hidden = false;
  });
});

// ── Search ────────────────────────────────────────────────────────────────────
searchBtn.addEventListener('click', runSearch);
[titleInput, artistInput].forEach(el =>
  el.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); })
);

async function runSearch() {
  const title  = titleInput.value.trim();
  const artist = artistInput.value.trim();
  if (!title) { showFeedback('Please enter a song title.', 'warning'); titleInput.focus(); return; }

  hideSuggest();
  setLoading(true);
  showFeedback('Searching Genius…', 'info');
  resultsSection.hidden = true;
  currentLyrics = { hangul: null, romanized: null, english: null };

  try {
    const query    = artist ? `${title} ${artist}` : title;
    const hits     = await searchGenius(query);

    if (!hits.length) {
      setLoading(false);
      showFeedback('No results found on Genius. Try a different spelling or artist name.', 'error');
      return;
    }

    const variants = extractVariants(hits, title, artist || '');

    if (!variants.hangul && !variants.romanized && !variants.english) {
      setLoading(false);
      showFeedback("Genius returned results but none matched this song's lyric pages. Try adding the artist name.", 'warning');
      return;
    }

    currentVariants = variants;
    currentMeta     = {
      title:  variants.hangul?.title || variants.romanized?.title || variants.english?.title || title,
      artist: variants.hangul?.primary_artist?.name || variants.romanized?.primary_artist?.name || variants.english?.primary_artist?.name || artist,
    };

    const coverUrl = variants.hangul?.header_image_thumbnail_url
                  || variants.romanized?.header_image_thumbnail_url
                  || variants.english?.header_image_thumbnail_url || '';

    songMeta.innerHTML = `
      ${coverUrl ? `<img src="${coverUrl}" alt="Cover art for ${currentMeta.title}" width="56" height="56" loading="lazy" class="song-cover">` : ''}
      <div class="song-meta-text">
        <h2 class="song-title">${currentMeta.title}</h2>
        <p class="song-artist">${currentMeta.artist}</p>
      </div>`;

    // Build panels with loading skeletons first, then fetch lyrics in parallel
    populatePanel('panel-hangul',    variants.hangul);
    populatePanel('panel-romanized', variants.romanized);
    populatePanel('panel-english',   variants.english);

    // Reset to first tab
    tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
    panels.forEach(p => p.hidden = true);
    tabs[0].classList.add('active');
    tabs[0].setAttribute('aria-selected', 'true');
    document.getElementById(tabs[0].dataset.panel).hidden = false;

    setLoading(false);
    resultsSection.hidden = false;

    const missing = ['hangul', 'romanized', 'english'].filter(k => !variants[k]);
    if (missing.length) {
      const labels = { hangul: 'Hangul', romanized: 'Romanized', english: 'English' };
      showFeedback(`Found the song but Genius doesn't have a ${missing.map(k => labels[k]).join(', ')} page for it yet.`, 'warning');
    } else {
      showFeedback('', '');
    }

    // Fetch all three lyric bodies in parallel — panels update as each resolves
    const keys = ['hangul', 'romanized', 'english'];
    await Promise.allSettled(keys.map(async key => {
      const song = variants[key];
      if (!song) return;
      const text = await fetchLyrics(song.url);
      currentLyrics[key] = text;
      setLyricsInPanel(`panel-${key}`, song, text);
    }));

    // Now safe to save to history (lyrics may be attached for download)
    addToHistory({ ...currentMeta, variants });
    renderHistory();

  } catch (err) {
    setLoading(false);
    showFeedback(`Something went wrong: ${err.message}`, 'error');
  }
}

// ── Panel population ──────────────────────────────────────────────────────────
// Called immediately — renders the link bar + a loading skeleton
function populatePanel(panelId, song) {
  const panel = document.getElementById(panelId);
  if (!song) {
    panel.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
        </svg>
        <p>No page found on Genius for this variant.</p>
        <p class="hint">The Genius community may not have added it yet.</p>
      </div>`;
    return;
  }
  panel.innerHTML = `
    <div class="genius-link-bar">
      <a href="${song.url}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm">
        Open on Genius
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
      <span class="genius-title">${song.full_title}</span>
    </div>
    <div class="lyrics-loading" aria-live="polite">
      <div class="skeleton skeleton-text" style="width:60%;margin-bottom:var(--space-3)"></div>
      <div class="skeleton skeleton-text" style="width:80%"></div>
      <div class="skeleton skeleton-text" style="width:70%"></div>
      <div class="skeleton skeleton-text" style="width:75%"></div>
      <div class="skeleton skeleton-text" style="width:55%"></div>
    </div>
    <pre class="lyrics-text" hidden aria-label="Lyrics"></pre>`;
}

// Called after fetchLyrics resolves — swaps skeleton for real text
function setLyricsInPanel(panelId, song, text) {
  const panel    = document.getElementById(panelId);
  const loading  = panel.querySelector('.lyrics-loading');
  const lyricsEl = panel.querySelector('.lyrics-text');
  if (!loading || !lyricsEl) return;

  loading.hidden = true;
  if (!text) {
    lyricsEl.textContent = 'Lyrics could not be extracted. Open on Genius to read them.';
  } else {
    const lines = text.split('\n');
    const firstContentLine = lines.findIndex(l => l.trim() !== '');
    lyricsEl.textContent = lines.slice(firstContentLine + 1).join('\n').trimStart();
  }
  lyricsEl.hidden = false;
}

// ── Download ──────────────────────────────────────────────────────────────────
downloadBtn.addEventListener('click', () => {
  if (!currentVariants || !currentMeta) return;
  const lines = [
    `K-pop Lyrics: ${currentMeta.title} — ${currentMeta.artist}`,
    `Generated by K-pop Lyrics Agent`,
    `${'─'.repeat(60)}`, '',
  ];
  [
    { key: 'hangul',    label: 'HANGUL (한국어)' },
    { key: 'romanized', label: 'ROMANIZED'       },
    { key: 'english',   label: 'ENGLISH'          },
  ].forEach(({ key, label }) => {
    lines.push(`## ${label}`);
    const song   = currentVariants[key];
    const lyrics = currentLyrics[key];
    if (!song) {
      lines.push('(Not available on Genius)');
    } else if (lyrics) {
      // Include actual lyrics text in the download
      lines.push(lyrics);
    } else {
      lines.push(`Genius page: ${song.url}`);
      lines.push('(Lyrics could not be extracted — visit page above)');
    }
    lines.push('');
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `${currentMeta.title} - ${currentMeta.artist} lyrics.txt`.replace(/[/\\?%*:|"<>]/g, '-');
  a.click();
  URL.revokeObjectURL(a.href);
});

// ── History ───────────────────────────────────────────────────────────────────
function renderHistory() {
  const items = getHistory();
  if (!items.length) { historyPanel.hidden = true; return; }
  historyPanel.hidden = false;
  historyList.innerHTML = '';
  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'history-item';
    const badge = v => v
      ? `<span class="variant-badge found"  title="Found">✓</span>`
      : `<span class="variant-badge missing" title="Not found">—</span>`;
    li.innerHTML = `
      <button class="history-entry" aria-label="Re-search ${item.title} by ${item.artist}">
        <span class="history-song">
          <span class="history-title">${item.title}</span>
          <span class="history-artist">${item.artist}</span>
        </span>
        <span class="history-badges">
          <span class="badge-label">한</span>${badge(item.variants?.hangul)}
          <span class="badge-label">Rom</span>${badge(item.variants?.romanized)}
          <span class="badge-label">En</span>${badge(item.variants?.english)}
        </span>
      </button>`;
    li.querySelector('.history-entry').addEventListener('click', () => {
      titleInput.value  = item.title;
      artistInput.value = item.artist;
      runSearch();
    });
    historyList.appendChild(li);
  });
}

clearHistoryBtn.addEventListener('click', () => { clearHistory(); renderHistory(); });

// ── Feedback ──────────────────────────────────────────────────────────────────
function showFeedback(message, type) {
  if (!message) { feedbackEl.hidden = true; feedbackEl.textContent = ''; feedbackEl.className = 'feedback'; return; }
  feedbackEl.textContent = message;
  feedbackEl.className   = `feedback feedback--${type}`;
  feedbackEl.hidden      = false;
}

// ── Loading ───────────────────────────────────────────────────────────────────
function setLoading(on) {
  searchBtn.disabled    = on;
  searchBtn.setAttribute('aria-busy', String(on));
  searchBtn.textContent = on ? 'Searching…' : 'Search';
  on ? titleInput.setAttribute('aria-busy', 'true') : titleInput.removeAttribute('aria-busy');
}