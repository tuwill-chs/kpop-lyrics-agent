// ─── genius.js ────────────────────────────────────────────────────────────────
const GENIUS_TOKEN = 'tDqL-5fU9oQPuYT1bxWmTeIok-6-Hg0rLcaG2BvXU50E4NBUDrzGfx_ak_807wif';
const PROXY        = 'https://corsproxy.io/?url=';
const GENIUS_API   = 'https://api.genius.com';


const PROXIES = [
  'https://corsproxy.io/?url=',
  'https://api.allorigins.win/raw?url=',
  'https://thingproxy.freeboard.io/fetch/',
];

async function fetchWithFallback(url) {
  for (const proxy of PROXIES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout
      const res = await fetch(`${proxy}${encodeURIComponent(url)}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.ok) return res;
    } catch {
      continue; // try next proxy
    }
  }
  throw new Error('All proxies failed. Try again in a moment.');
}

export async function searchGenius(query) {
  const endpoint = `${GENIUS_API}/search?q=${encodeURIComponent(query)}&access_token=${GENIUS_TOKEN}`;
  const res  = await fetchWithFallback(endpoint);
  const data = await res.json();
  if (data.meta?.status !== 200) throw new Error(`Genius returned status ${data.meta.status}`);
  return data.response.hits;
}


export function extractVariants(hits, songTitle, artistName) {
  const songs       = hits.filter(h => h.type === 'song').map(h => h.result);
  const fullTitle   = t => t.full_title.toLowerCase();
  const artistLower = artistName.toLowerCase();
  const titleLower  = songTitle.toLowerCase();

  const score = song => {
    let s = 0;
    if (fullTitle(song).includes(artistLower)) s += 2;
    if (fullTitle(song).includes(titleLower))  s += 2;
    return s;
  };

  const hangulCandidates    = songs.filter(s =>
    !fullTitle(s).includes('romanized') &&
    !fullTitle(s).includes('romanisation') &&
    !fullTitle(s).includes('english translation') &&
    !fullTitle(s).includes('english version') &&
    !fullTitle(s).includes('translation')
  );
  const romanizedCandidates = songs.filter(s =>
    fullTitle(s).includes('romanized') || fullTitle(s).includes('romanisation')
  );
  const englishCandidates   = songs.filter(s =>
    fullTitle(s).includes('english translation') ||
    fullTitle(s).includes('english version') ||
    (fullTitle(s).includes('translation') && !fullTitle(s).includes('romanized'))
  );

  const best = arr =>
    arr.length === 0 ? null : arr.sort((a, b) => score(b) - score(a))[0];

  return {
    hangul:    best(hangulCandidates),
    romanized: best(romanizedCandidates),
    english:   best(englishCandidates),
  };
}


export async function suggestArtists(titleQuery) {
  if (!titleQuery || titleQuery.trim().length < 2) return [];
  const hits    = await searchGenius(titleQuery.trim());
  const seen    = new Set();
  const artists = [];
  for (const hit of hits) {
    if (hit.type !== 'song') continue;
    const name = hit.result.primary_artist.name;
    if (!seen.has(name)) {
      seen.add(name);
      artists.push({ name, thumbnail: hit.result.primary_artist.image_url });
    }
    if (artists.length >= 6) break;
  }
  return artists;
}

export async function fetchLyrics(geniusPageUrl) {
  const res  = await fetchWithFallback(geniusPageUrl);
  const html = await res.text();
  const parser     = new DOMParser();
  const doc        = parser.parseFromString(html, 'text/html');
  const containers = doc.querySelectorAll('[data-lyrics-container="true"]');
  if (!containers.length) return null;
  let lyrics = '';
  containers.forEach(container => {
    container.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    container.querySelectorAll('h2, h3').forEach(h => h.replaceWith(`\n${h.textContent}\n`));
    lyrics += container.textContent + '\n\n';
  });
  return lyrics.trim();
}