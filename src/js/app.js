// src/js/app.js
import {
  searchGenius,
  rankCandidates,
  shouldAskForClarification,
  pickBaseSong,
  findRelatedPages,
  analyzeSupport,
} from './genius.js';
import { downloadLyricsLinks } from './export.js';

const form = document.getElementById('searchForm');
const titleInput = document.getElementById('titleInput');
const artistInput = document.getElementById('artistInput');
const searchBtn = document.getElementById('searchBtn');
const errorMsg = document.getElementById('errorMsg');
const feedbackCard = document.getElementById('feedbackCard');
const candidateSection = document.getElementById('candidateSection');
const candidateList = document.getElementById('candidateList');
const songInfo = document.getElementById('songInfo');
const songArt = document.getElementById('songArt');
const songTitle = document.getElementById('songTitle');
const songArtist = document.getElementById('songArtist');
const lyricsGrid = document.getElementById('lyricsGrid');
const downloadBtn = document.getElementById('downloadBtn');

let currentState = null;

(function () {
  const toggle = document.querySelector('[data-theme-toggle]');
  const root = document.documentElement;
  let dark = matchMedia('(prefers-color-scheme: dark)').matches;
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  if (toggle) {
    toggle.addEventListener('click', () => {
      dark = !dark;
      root.setAttribute('data-theme', dark ? 'dark' : 'light');
    });
  }
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await runSearch({ title: titleInput.value.trim(), artist: artistInput.value.trim() });
});

async function runSearch({ title, artist }) {
  resetUI();

  if (!title) {
    showError('Please enter a song title.');
    return;
  }

  if (title.length < 2) {
    showError('Enter at least 2 characters for a useful search.');
    return;
  }

  try {
    setBusy(true);

    const query = artist ? `${title} ${artist}` : title;
    const results = await searchGenius(query);

    if (!results.length) {
      showFeedback('error', 'No matching Genius results found.', [
        'Check the spelling of the title or artist.',
        'Try removing punctuation or featured artists.',
        'Try the song title by itself if the artist spelling is uncertain.',
      ]);
      return;
    }

    const ranked = rankCandidates(results, title, artist);

    if (shouldAskForClarification(ranked, artist)) {
      renderCandidates(ranked.slice(0, 6), title);
      showFeedback('warning', 'Multiple possible matches found.', [
        'Choose the correct song and artist from the list below.',
      ]);
      return;
    }

    const baseSong = pickBaseSong(ranked);
    await finalizeSelection(baseSong);
  } catch (err) {
    showError(err.message || 'Something went wrong while searching Genius.');
  } finally {
    setBusy(false);
  }
}

async function finalizeSelection(baseSong) {
  if (!baseSong) {
    showFeedback('error', 'A base Genius song page could not be determined.', [
      'Try entering both the exact title and artist.',
    ]);
    return;
  }

  const pages = await findRelatedPages(baseSong);
  const analysis = analyzeSupport(baseSong, pages);

  currentState = { baseSong, pages, analysis };
  renderSongInfo(baseSong, analysis);
  renderFeedbackFromAnalysis(analysis);
  renderLyricPanels(pages);

  downloadBtn.onclick = () => downloadLyricsLinks(baseSong, pages, analysis);
}

function renderCandidates(rankedItems) {
  candidateList.innerHTML = rankedItems.map(({ result, score }) => `
    <button class="candidate-item" data-song-id="${result.id}">
      <div class="candidate-song">${escapeHtml(result.title)}</div>
      <div class="candidate-artist">${escapeHtml(result.primary_artist?.name || 'Unknown artist')}</div>
      <div class="candidate-meta">Score: ${score} · ${escapeHtml(result.full_title || '')}</div>
    </button>
  `).join('');

  candidateSection.hidden = false;

  const buttons = candidateList.querySelectorAll('.candidate-item');
  buttons.forEach((button, index) => {
    button.addEventListener('click', async () => {
      const ranked = rankedItems[index];
      await finalizeSelection(ranked.result);
      candidateSection.hidden = true;
    });
  });
}

function renderSongInfo(baseSong, analysis) {
  songArt.src = baseSong.song_art_image_thumbnail_url || baseSong.header_image_thumbnail_url || '';
  songArt.alt = `${baseSong.title} cover art`;
  songTitle.textContent = baseSong.title;
  songArtist.textContent = `${baseSong.primary_artist?.name || 'Unknown artist'} · ${analysis.seemsKorean ? 'Likely Korean-support workflow' : 'Compatibility uncertain'}`;
  songInfo.hidden = false;
}

function renderFeedbackFromAnalysis(analysis) {
  const title = analysis.status === 'success'
    ? 'All required Genius pages were found.'
    : analysis.status === 'warning'
      ? 'The song is only partially supported.'
      : 'This song is not currently compatible.';

  const items = [...analysis.positives, ...analysis.issues];
  showFeedback(analysis.status, title, items);
}

function renderLyricPanels({ hangul, romanized, english }) {
  const panels = [
    { label: 'Original', lang: '한국어 (Hangul)', data: hangul },
    { label: 'Romanized', lang: 'Romanized Korean', data: romanized },
    { label: 'Translation', lang: 'English Translation', data: english },
  ];

  lyricsGrid.innerHTML = panels.map(({ label, lang, data }) => `
    <article class="lyric-panel">
      <div class="panel-header">
        <div>
          <div class="panel-label">${label}</div>
          <div class="panel-lang">${lang}</div>
        </div>
        ${data.found ? `<a class="genius-link" href="${data.url}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ''}
      </div>
      <div class="panel-body" ${data.found ? 'style="padding:0"' : ''}>
        ${data.found
          ? `<iframe class="genius-embed" src="${data.url}" title="${escapeHtml(data.title)}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>`
          : `<p class="panel-not-found">No Genius page found for ${lang}. This usually means the song is too obscure, too new, or not fully documented yet.</p>`}
      </div>
    </article>
  `).join('');

  lyricsGrid.hidden = false;
}

function showFeedback(type, title, items = []) {
  feedbackCard.className = `feedback-card ${type}`;
  feedbackCard.innerHTML = `
    <strong>${escapeHtml(title)}</strong>
    ${items.length ? `<ul style="margin-top:12px; padding-left:18px; display:grid; gap:8px;">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
  `;
  feedbackCard.hidden = false;
}

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.hidden = false;
}

function resetUI() {
  errorMsg.hidden = true;
  errorMsg.textContent = '';
  feedbackCard.hidden = true;
  feedbackCard.innerHTML = '';
  candidateSection.hidden = true;
  candidateList.innerHTML = '';
  songInfo.hidden = true;
  lyricsGrid.hidden = true;
  lyricsGrid.innerHTML = '';
}

function setBusy(isBusy) {
  searchBtn.disabled = isBusy;
  searchBtn.textContent = isBusy ? 'Searching…' : 'Find Lyrics';
}

function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}