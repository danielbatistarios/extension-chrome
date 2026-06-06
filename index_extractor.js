// index_extractor.js — lê URLs de uma busca site: e salva para o background
// Sem overlay (CSP do Google bloqueia). Feedback visual fica no popup.

(() => {
  'use strict';

  const PAGE_KEY = 'seo_index_page';

  const params = new URLSearchParams(window.location.search);
  const q      = params.get('q') || '';
  const start  = parseInt(params.get('start') || '0', 10);

  if (!q.toLowerCase().startsWith('site:')) return;

  const domain = q.replace(/^site:/i, '').split('/')[0].trim();
  const page   = Math.round(start / 10);

  function extractUrls() {
    const urls = [];
    const seen = new Set();

    const items = document.querySelectorAll(
      '#search .g, #rso .g, [data-sokoban-container] .g, #search [data-hveid] h3'
    );

    items.forEach(item => {
      // Navega para o ancestral .g se veio pelo h3
      const container = item.closest('.g') || item;
      const link    = container.querySelector('a[href]');
      const titleEl = container.querySelector('h3');
      if (!link || !titleEl) return;

      let url;
      try {
        const u = new URL(link.href);
        if (u.hostname.includes('google.')) return;
        url = u.origin + u.pathname;
      } catch (_) { return; }

      if (seen.has(url)) return;
      seen.add(url);
      urls.push({ url, title: titleEl.textContent.trim() });
    });

    return urls;
  }

  let attempts = 0;
  const MIN_ATTEMPTS = 8; // espera mínima antes de aceitar "sem resultados"

  const iv = setInterval(() => {
    attempts++;

    const resultEls = document.querySelectorAll('#search .g, #rso .g');
    const hasResults = resultEls.length > 0;
    const confirmedEmpty = attempts >= MIN_ATTEMPTS && !hasResults;
    const timedOut = attempts > 35;

    if (hasResults || confirmedEmpty || timedOut) {
      clearInterval(iv);

      const urls = hasResults ? extractUrls() : [];

      chrome.storage.local.set({
        [PAGE_KEY]: {
          domain,
          query: q,
          page,
          start,
          urls,
          confirmedEmpty: !hasResults,
          ts: Date.now(),
        }
      });
    }
  }, 300);

})();
