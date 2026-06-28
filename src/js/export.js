// src/js/export.js
export function downloadLyricsLinks(baseSong, pages, analysis) {
  const lines = [
    '════════════════════════════════════════════',
    '  K-POP LYRICS AGENT — Search Export',
    '════════════════════════════════════════════',
    '',
    `Song: ${baseSong.title}`,
    `Artist: ${baseSong.primary_artist?.name || 'Unknown artist'}`,
    `Genius page: ${baseSong.url || 'N/A'}`,
    `Status: ${analysis.status}`,
    `Seems Korean workflow-compatible: ${analysis.seemsKorean ? 'Yes' : 'No / Uncertain'}`,
    '',
    'Pages:',
    `- Original Hangul: ${pages.hangul.found ? pages.hangul.url : 'Not found'}`,
    `- Romanized: ${pages.romanized.found ? pages.romanized.url : 'Not found'}`,
    `- English translation: ${pages.english.found ? pages.english.url : 'Not found'}`,
    '',
    'Positive findings:',
    ...(analysis.positives.length ? analysis.positives.map(p => `- ${p}`) : ['- None']),
    '',
    'Issues:',
    ...(analysis.issues.length ? analysis.issues.map(i => `- ${i}`) : ['- None']),
    '',
    `Generated: ${new Date().toLocaleString()}`,
    '════════════════════════════════════════════',
  ];

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safeTitle = (baseSong.title || 'song').replace(/[^a-zA-Z0-9가-힣 \-_]/g, '').trim();

  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeTitle} — Genius Pages.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}