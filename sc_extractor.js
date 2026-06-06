// sc_extractor.js — Search Console Query Extractor
// Runs on search.google.com/search-console/queries
// Reads the queries table and saves top 50 (deduped) to chrome.storage.local

(() => {
  'use strict';

  const SC_KEY = 'sc_queries';
  const MAX_QUERIES = 50;

  // ── Normalização para dedup ────────────────────────────────────────────────
  function normalize(str) {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // remove acentos
      .replace(/[^\w\s]/g, '')         // remove pontuação
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Remove queries que são substrings de outra query mais longa
  // Mantém a mais longa (mais específica) e descarta a curta
  function deduplicate(queries) {
    const norms = queries.map(q => ({ original: q, norm: normalize(q) }));

    const keep = norms.filter((a, idxA) => {
      // Se outra query mais longa contém esta como substring → descartar esta
      const absorbedByLonger = norms.some((b, idxB) => {
        if (idxA === idxB) return false;
        if (b.norm.length <= a.norm.length) return false;
        // B é mais longa e contém A
        return b.norm.includes(a.norm);
      });
      return !absorbedByLonger;
    });

    // Dedup exato por norm
    const seen = new Set();
    return keep
      .filter(item => {
        if (seen.has(item.norm)) return false;
        seen.add(item.norm);
        return true;
      })
      .map(item => item.original);
  }

  // ── Leitura do DOM do Search Console ──────────────────────────────────────
  function extractQueriesFromDOM() {
    const queries = [];

    const candidateSelectors = [
      // Seletores Angular/Material do SC (2024-2025)
      'div[data-label="Top queries"] .WpKAof',
      '.WpKAof',
      '.kHBEpb',
      '.e56Dbe',
      // Tabela padrão
      'table tbody tr td:first-child span',
      'table tbody tr td:first-child',
      'tr[jsname] td:first-child',
      'tr[data-row-id] td:first-child',
      // Linhas de dados com texto de query
      '[data-label="Query"]',
      '[aria-label="Query"]',
      '.O9dqhb',
      '.qs8mKd',
      // Fallback: células de tabela e links
      'tbody td a',
      'tbody td span',
    ];

    for (const sel of candidateSelectors) {
      const els = document.querySelectorAll(sel);
      if (els.length >= 3) {
        els.forEach(el => {
          const text = (el.innerText || el.textContent || '').trim();
          if (
            text.length > 1 &&
            text.length < 200 &&
            !/^\d[\d.,\s%]+$/.test(text) &&
            !/^(query|consulta|keyword|palavra|clicks?|impressions?|ctr|position)/i.test(text)
          ) {
            queries.push(text);
          }
        });
        if (queries.length >= 5) break;
      }
    }

    return [...new Set(queries)];
  }

  // Debug: loga no console todos os seletores e o que encontram
  function debugSelectors() {
    console.group('[SEO Ext] SC Extractor — Debug de Seletores');
    const allTrs = document.querySelectorAll('tr');
    console.log(`TRs na página: ${allTrs.length}`);
    console.log(`Primeiros 3 TRs:`, [...allTrs].slice(0, 3).map(r => r.innerText?.trim().substring(0, 80)));

    const allTds = document.querySelectorAll('td');
    console.log(`TDs na página: ${allTds.length}`);
    console.log(`Primeiros 5 TDs:`, [...allTds].slice(0, 5).map(td => ({
      text: td.innerText?.trim().substring(0, 60),
      class: td.className?.substring(0, 40),
    })));

    // Tenta achar colunas com texto de query (não número)
    const textTds = [...allTds].filter(td => {
      const t = (td.innerText || '').trim();
      return t.length > 2 && t.length < 150 && !/^\d/.test(t);
    });
    console.log(`TDs com texto (não número): ${textTds.length}`);
    console.log(`Exemplos:`, textTds.slice(0, 8).map(td => ({
      text: td.innerText?.trim().substring(0, 60),
      class: td.className?.substring(0, 40),
      parent: td.parentElement?.tagName,
    })));
    console.groupEnd();
  }

  // ── UI Flutuante ───────────────────────────────────────────────────────────
  function createPanel() {
    if (document.getElementById('seo-sc-panel')) return;

    const style = document.createElement('style');
    style.textContent = `
      #seo-sc-panel {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        background: #0f0f10;
        border: 1px solid #2a2a2e;
        border-radius: 14px;
        box-shadow: 0 8px 32px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.04);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        color: #e5e7eb;
        width: 280px;
        overflow: hidden;
        user-select: none;
      }
      #seo-sc-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 13px;
        background: #18181b;
        border-bottom: 1px solid #27272a;
        cursor: move;
        font-weight: 600;
        font-size: 12.5px;
        color: #818cf8;
      }
      #seo-sc-header .sc-badge {
        margin-left: auto;
        background: #1e1b4b;
        color: #818cf8;
        font-size: 10px;
        font-weight: 700;
        padding: 1px 7px;
        border-radius: 10px;
        font-family: 'SF Mono', monospace;
      }
      #seo-sc-body {
        padding: 12px 13px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      #seo-sc-status {
        font-size: 11px;
        color: #71717a;
        min-height: 14px;
        line-height: 1.5;
      }
      #seo-sc-status.ok    { color: #34d399; }
      #seo-sc-status.error { color: #f87171; }
      #seo-sc-status.info  { color: #818cf8; }
      #seo-sc-preview {
        display: none;
        flex-direction: column;
        gap: 3px;
        max-height: 140px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #3f3f46 transparent;
      }
      .sc-query-item {
        font-size: 11px;
        background: #18181b;
        border-left: 3px solid #312e81;
        border-radius: 5px;
        padding: 4px 8px;
        color: #a1a1aa;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #seo-sc-run {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        width: 100%;
        padding: 9px 10px;
        border: none;
        border-radius: 9px;
        background: #1e1b4b;
        color: #818cf8;
        cursor: pointer;
        font-size: 12.5px;
        font-weight: 600;
        transition: background .15s;
      }
      #seo-sc-run:hover { background: #312e81; color: #a5b4fc; }
      #seo-sc-run:disabled { opacity: .45; cursor: default; }
      #seo-sc-run.success { background: #065f46; color: #34d399; }
      #seo-sc-clear {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        width: 100%;
        padding: 7px 10px;
        border: 1px solid #3f3f46;
        border-radius: 9px;
        background: transparent;
        color: #71717a;
        cursor: pointer;
        font-size: 11.5px;
        font-weight: 600;
        transition: background .15s, color .15s;
      }
      #seo-sc-clear:hover { background: #7f1d1d22; color: #f87171; border-color: #7f1d1d; }
      #seo-sc-goto-google {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        width: 100%;
        padding: 8px 10px;
        border: 1px solid #166534;
        border-radius: 9px;
        background: transparent;
        color: #4ade80;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        text-decoration: none;
        transition: background .15s;
        box-sizing: border-box;
      }
      #seo-sc-goto-google:hover { background: #14532d; }
      .sc-spinner {
        width: 10px; height: 10px;
        border: 2px solid rgba(129,140,248,.3);
        border-top-color: #818cf8;
        border-radius: 50%;
        animation: sc-spin 1s linear infinite;
        flex-shrink: 0;
      }
      @keyframes sc-spin { to { transform: rotate(360deg); } }
      .sc-hint {
        font-size: 10px;
        color: #3f3f46;
        line-height: 1.5;
        text-align: center;
      }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'seo-sc-panel';
    panel.innerHTML = `
      <div id="seo-sc-header">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
        </svg>
        <span>SC Query Extractor</span>
        <span class="sc-badge" id="seo-sc-count">0</span>
      </div>
      <div id="seo-sc-body">
        <div id="seo-sc-status">Pronto para analisar a aba Consultas.</div>
        <div id="seo-sc-preview"></div>
        <button id="seo-sc-run">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          Executar análise
        </button>
        <button id="seo-sc-clear">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
          Limpar queries salvas
        </button>
        <a id="seo-sc-goto-google" href="https://www.google.com/" target="_blank">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Ir para o Google
        </a>
        <div class="sc-hint">Após capturar, volte ao Google e o<br>AIO Monitor usará estas queries.</div>
        <div class="sc-hint" style="margin-top:-4px">
          Problemas? Abra o Console (F12) e clique em
          <span id="seo-sc-debug" style="color:#818cf8;cursor:pointer;text-decoration:underline">Debug</span>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('seo-sc-run').addEventListener('click', runAnalysis);
    document.getElementById('seo-sc-clear').addEventListener('click', clearQueries);
    document.getElementById('seo-sc-debug').addEventListener('click', debugSelectors);

    makeDraggable(panel, document.getElementById('seo-sc-header'));
  }

  // ── Executa a análise ──────────────────────────────────────────────────────
  async function runAnalysis() {
    const btn = document.getElementById('seo-sc-run');
    const statusEl = document.getElementById('seo-sc-status');

    // Estado: carregando
    btn.disabled = true;
    btn.innerHTML = `<span class="sc-spinner"></span> Analisando...`;
    setStatus('Lendo consultas da tabela...', 'info');

    await sleep(400); // pequena pausa para feedback visual

    // Rola a tabela para carregar todas as linhas (virtual scroll do Angular)
    setStatus('Rolando tabela para carregar todas as linhas...', 'info');
    await autoScrollTable();

    // Primeira tentativa de extração
    let rawQueries = extractQueriesFromDOM();

    // Se não achou nada, aguarda um pouco (tabela pode estar carregando ainda)
    if (rawQueries.length < 3) {
      setStatus('Aguardando tabela carregar...', 'info');
      await waitForTable(6000);
      rawQueries = extractQueriesFromDOM();
    }

    if (rawQueries.length < 2) {
      debugSelectors(); // loga no console para diagnóstico
      setStatus('Nenhuma query encontrada. Abra o Console (F12) e clique em Debug para diagnóstico.', 'error');
      btn.disabled = false;
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Tentar novamente`;
      return;
    }

    // Dedup e limitar ao máximo
    const deduped = deduplicate(rawQueries).slice(0, MAX_QUERIES);
    const removed = rawQueries.length - deduped.length;

    // Salva no storage
    if (!isExtensionContextValid()) {
      setStatus('Extensão foi recarregada. Recarregue a página e tente novamente.', 'error');
      btn.disabled = false;
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Tentar novamente`;
      return;
    }
    try {
      chrome.storage.local.set({ [SC_KEY]: deduped }, () => {
        const countEl = document.getElementById('seo-sc-count');
        if (countEl) countEl.textContent = deduped.length;

        const msg = removed > 0
          ? `${deduped.length} queries salvas (${removed} duplicadas removidas).`
          : `${deduped.length} queries salvas com sucesso.`;

        setStatus(msg, 'ok');
        showPreview(deduped);

        btn.disabled = false;
        btn.classList.add('success');
        btn.innerHTML = `✓ Concluído — volte ao Google`;
      });
    } catch (e) {
      setStatus('Extensão foi recarregada. Recarregue a página e tente novamente.', 'error');
      btn.disabled = false;
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Tentar novamente`;
    }
  }

  // ── Scroll automático para carregar todas as linhas (Angular virtual scroll) ──
  // O Search Console usa virtual scroll — linhas fora da viewport são removidas do DOM.
  // Precisamos rolar até o fim da tabela para forçar o Angular a renderizar todas as linhas.
  async function autoScrollTable() {
    // Localiza o container scrollável da tabela
    const scrollSelectors = [
      '.AQyBn',           // container interno SC (2024)
      'div[role="grid"]',
      '.e56Dbe',
      '.kHBEpb',
      'table',
      '#page-content',
    ];

    let scrollEl = null;
    for (const sel of scrollSelectors) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight + 20) {
        scrollEl = el;
        break;
      }
    }

    // Fallback: scroll na janela
    const target = scrollEl || window;
    const isWindow = target === window;

    const getScrollTop = () => isWindow ? window.scrollY : target.scrollTop;
    const getScrollH   = () => isWindow ? document.body.scrollHeight : target.scrollHeight;
    const getClientH   = () => isWindow ? window.innerHeight : target.clientHeight;
    const doScroll = (y) => isWindow ? window.scrollTo(0, y) : (target.scrollTop = y);

    const step = 300;
    const delay = 200;

    let prev = -1;
    while (true) {
      const cur = getScrollTop();
      const max = getScrollH() - getClientH();

      if (cur >= max - 5 || cur === prev) break; // chegou ao fim ou não avançou

      prev = cur;
      doScroll(Math.min(cur + step, max));
      await sleep(delay);
    }

    // Volta ao topo
    doScroll(0);
    await sleep(300);
  }

  // ── Aguarda tabela aparecer no DOM ─────────────────────────────────────────
  function waitForTable(maxWait = 6000) {
    return new Promise(resolve => {
      const deadline = Date.now() + maxWait;
      const check = () => {
        const rows = extractQueriesFromDOM();
        if (rows.length >= 3 || Date.now() >= deadline) {
          resolve();
        } else {
          setTimeout(check, 400);
        }
      };
      check();
    });
  }

  // ── Limpa queries salvas ───────────────────────────────────────────────────
  function clearQueries() {
    if (!isExtensionContextValid()) {
      setStatus('Extensão foi recarregada. Recarregue a página.', 'error');
      return;
    }
    try {
      chrome.storage.local.remove(SC_KEY, () => {
        const countEl = document.getElementById('seo-sc-count');
        if (countEl) countEl.textContent = '0';
        const preview = document.getElementById('seo-sc-preview');
        if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
        const btn = document.getElementById('seo-sc-run');
        if (btn) {
          btn.classList.remove('success');
          btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Executar análise`;
        }
        setStatus('Queries apagadas.', 'error');
        setTimeout(() => setStatus('Pronto para analisar a aba Consultas.'), 2000);
      });
    } catch (e) {
      setStatus('Extensão foi recarregada. Recarregue a página.', 'error');
    }
  }

  // ── Preview das queries capturadas ─────────────────────────────────────────
  function showPreview(queries) {
    const wrap = document.getElementById('seo-sc-preview');
    if (!wrap) return;
    wrap.innerHTML = '';
    queries.slice(0, 15).forEach(q => {
      const div = document.createElement('div');
      div.className = 'sc-query-item';
      div.title = q;
      div.textContent = q;
      wrap.appendChild(div);
    });
    if (queries.length > 15) {
      const more = document.createElement('div');
      more.className = 'sc-query-item';
      more.style.color = '#52525b';
      more.textContent = `+ ${queries.length - 15} mais...`;
      wrap.appendChild(more);
    }
    wrap.style.display = 'flex';
  }

  // ── Context validity guard ─────────────────────────────────────────────────
  function isExtensionContextValid() {
    try { return !!(chrome && chrome.storage && chrome.runtime && chrome.runtime.id); }
    catch (_) { return false; }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function setStatus(msg, cls) {
    const el = document.getElementById('seo-sc-status');
    if (!el) return;
    el.textContent = msg;
    el.className = cls || '';
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function makeDraggable(el, handle) {
    let startX, startY, origX, origY;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      origX = rect.left; origY = rect.top;
      el.style.left = origX + 'px'; el.style.top = origY + 'px';
      el.style.bottom = 'auto'; el.style.right = 'auto';
      const onMove = (e) => {
        el.style.left = Math.max(0, origX + e.clientX - startX) + 'px';
        el.style.top  = Math.max(0, origY + e.clientY - startY) + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    const path = window.location.pathname;
    if (!path.includes('search-console')) return;

    // Aguarda DOM estar pronto
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createPanel);
    } else {
      createPanel();
    }

    // MutationObserver para re-detectar quando o usuário navega dentro do SC
    // (SPA — a URL muda mas a página não recarrega)
    let lastPath = path;
    const observer = new MutationObserver(() => {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        if (!document.getElementById('seo-sc-panel')) {
          createPanel();
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  init();
})();
