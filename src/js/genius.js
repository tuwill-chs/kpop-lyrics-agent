// src/js/genius.js
const GENIUS_ACCESS_TOKEN = 'tDqL-5fU9oQPuYT1bxWmTeIok-6-Hg0rLcaG2BvXU50E4NBUDrzGfx_ak_807wif';
const GENIUS_API_BASE = 'https://api.genius.com';

export async function searchGenius(query) {
  const url = `${GENIUS_API_BASE}/search?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${GENIUS_ACCESS_TOKEN}` },
  });

  if (!response.ok) {
    throw new Error('Genius API error. Check your token or try again later.');
  }

  const data = await response.json();
  return data.response.hits.filter(hit => hit.type === 'song').map(hit => hit.result);
}

function normalize(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
}

function includesHangul(text = '') {
  return /[가-힣]/.test(text);
}

export function scoreCandidate(result, title, artist = '') {
  const resultTitle = normalize(result.title);
  const resultArtist = normalize(result.primary_artist?.name || '');
  const inputTitle = normalize(title);
  const inputArtist = normalize(artist);

  let score = 0;

  if (resultTitle === inputTitle) score += 60;
  else if (resultTitle.includes(inputTitle) || inputTitle.includes(resultTitle)) score += 35;

  if (inputArtist) {
    if (resultArtist === inputArtist) score += 40;
    else if (resultArtist.includes(inputArtist) || inputArtist.includes(resultArtist)) score += 20;
  }

  if (includesHangul(result.title)) score += 8;
  if (/romanized|translation|english translation/i.test(result.title)) score -= 12;

  return score;
}

export function rankCandidates(results, title, artist = '') {
  return [...results]
    .map(result => ({ result, score: scoreCandidate(result, title, artist) }))
    .sort((a, b) => b.score - a.score);
}

export function shouldAskForClarification(ranked, artist = '') {
  if (ranked.length === 0) return false;
  if (!artist.trim()) return true;
  if (ranked.length === 1) return false;

  const top = ranked[0]?.score ?? 0;
  const second = ranked[1]?.score ?? 0;

  return top - second < 18;
}

export function pickBaseSong(ranked) {
  return ranked.find(item => !/romanized|translation|english translation/i.test(item.result.title))?.result || null;
}

export async function findRelatedPages(baseSong) {
  if (!baseSong) return { hangul: { found: false }, romanized: { found: false }, english: { found: false } };

  const baseTitle = baseSong.title.replace(/\s*\(.*?\)\s*/g, '').trim();
  const artistName = baseSong.primary_artist?.name || '';
  const related = await searchGenius(`${baseTitle} ${artistName}`);

  const normalizedArtist = normalize(artistName);
  const sameArtist = song => {
    const a = normalize(song.primary_artist?.name || '');
    return a.includes(normalizedArtist) || normalizedArtist.includes(a);
  };
  const titleHas = (song, ...keywords) => keywords.some(k => song.title.toLowerCase().includes(k));

  const hangul = related.find(song =>
    sameArtist(song) && !titleHas(song, 'romanized', 'translation', 'english translation')
  );

  const romanized = related.find(song =>
    sameArtist(song) && titleHas(song, 'romanized')
  );

  const english = related.find(song =>
    sameArtist(song) && titleHas(song, 'english translation', '(translation)', 'translation')
  );

  const format = song => song ? {
    found: true,
    title: song.title,
    url: song.url,
    thumbnailUrl: song.song_art_image_thumbnail_url || song.header_image_thumbnail_url || '',
    artist: song.primary_artist?.name || '',
  } : { found: false };

  return {
    hangul: format(hangul),
    romanized: format(romanized),
    english: format(english),
  };
}

export function analyzeSupport(baseSong, pages) {
  const issues = [];
  const positives = [];

  if (!baseSong) {
    issues.push('No base Genius song page could be identified.');
    return { status: 'error', issues, positives, seemsKorean: false };
  }

  if (pages.hangul.found) positives.push('Original lyrics page found.');
  else issues.push('Original Hangul lyrics page not found.');

  if (pages.romanized.found) positives.push('Romanized lyrics page found.');
  else issues.push('Romanized lyrics page not found.');

  if (pages.english.found) positives.push('English translation page found.');
  else issues.push('English translation page not found.');

  const seemsKorean = Boolean(
    pages.romanized.found ||
    pages.english.found ||
    includesHangul(baseSong.title) ||
    includesHangul(pages.hangul.title || '')
  );

  if (!seemsKorean) {
    issues.push('This result does not strongly appear to be a Korean or K-pop lyrics set.');
  }

  const foundCount = [pages.hangul, pages.romanized, pages.english].filter(p => p.found).length;

  if (foundCount === 3 && seemsKorean) {
    return { status: 'success', issues, positives, seemsKorean };
  }

  if (foundCount >= 1) {
    return { status: 'warning', issues, positives, seemsKorean };
  }

  return { status: 'error', issues, positives, seemsKorean };
}