// paa_extractor.js — PAA Extractor (Auto Mode, Level 1-5)
// Injected on google.com/search pages via content_scripts

(() => {
  'use strict';

  const STORAGE_KEY = 'seo_paa_data';

  let captured = [];
  let isRunning = false;
  let abortRequested = false;
  let floatingUI = null;
  let totalExpected = 0;
  let totalDone = 0;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getQuery() {
    return new URLSearchParams(window.location.search).get('q') || '';
  }

  function cleanText(el) {
    if (!el) return '';
    return (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
  }

  function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  async function scrollToEl(el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(350);
  }

  // Click a PAA question button safely — does NOT use el.click() which can trigger
  // Google's page-level handlers (opening pages, activating toolbars, etc.).
  // Instead dispatches a targeted click event that JsAction picks up locally.
  function paaClick(el) {
    const rect = el.getBoundingClientRect();
    // If element is off-screen or zero-size, skip
    if (rect.width === 0 || rect.height === 0) return;

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const shared = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: cx,
      clientY: cy,
      screenX: Math.round(cx + window.screenX),
      screenY: Math.round(cy + window.screenY),
    };
    el.dispatchEvent(new MouseEvent('pointerover', shared));
    el.dispatchEvent(new MouseEvent('mouseover', shared));
    el.dispatchEvent(new MouseEvent('mousedown', { ...shared, button: 0, buttons: 1 }));
    el.dispatchEvent(new MouseEvent('mouseup',   { ...shared, button: 0, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click',     { ...shared, button: 0, buttons: 0 }));
  }

  // Guard: verify element is still inside the known PAA container before clicking
  let _paaRoot = null;
  function safeClick(el) {
    // Re-locate container if needed (DOM may have changed)
    if (!_paaRoot || !document.contains(_paaRoot)) _paaRoot = findPAAContainer();
    if (_paaRoot && !_paaRoot.contains(el)) return false; // element is outside PAA — skip
    paaClick(el);
    return true;
  }

  // ── PAA DOM Queries ────────────────────────────────────────────────────────

  // Texts that identify the PAA section heading (PT-BR and EN)
  const PAA_HEADING_TEXTS = [
    'as pessoas também perguntam',
    'people also ask',
    'perguntas relacionadas',
    'outras perguntas frequentes',
  ];

  // Texts that are definitely NOT PAA questions — Google toolbar / UI labels
  const BLOCKED_TEXTS = new Set([
    'em qualquer idioma', 'em qualquer data', 'todos os resultados',
    'acrescentar outras informações', 'mostrar mais', 'mostrar menos',
    'ferramentas', 'configurações', 'mais', 'anterior', 'próximo',
    'in any language', 'any time', 'all results', 'tools', 'settings',
    'more', 'previous', 'next', 'show more', 'show less',
    'verbatim', 'clear', 'feedback',
  ]);

  // Find the PAA section container element.
  // Tries multiple strategies from most to least reliable.
  function findPAAContainer() {
    // Strategy A: walk ALL text nodes looking for PAA heading — most reliable
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      { acceptNode: n => (n.children.length === 0 || n.tagName === 'SPAN' || n.tagName === 'DIV')
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP }
    );
    let node;
    while ((node = walker.nextNode())) {
      const txt = (node.innerText || node.textContent || '').trim().toLowerCase();
      if (txt.length < 5 || txt.length > 60) continue;
      if (!PAA_HEADING_TEXTS.some(pat => txt === pat || txt.startsWith(pat))) continue;

      // Found heading — walk UP to find the section that contains multiple questions
      let cur = node.parentElement;
      for (let i = 0; i < 10 && cur && cur !== document.body; i++) {
        // A real PAA container has ≥2 expandable items with question text
        const expandables = [...cur.querySelectorAll('[aria-expanded]')].filter(el => {
          const t = (el.innerText || '').trim();
          return t.length > 15 && t.length < 300 && (t.includes('?') || t.split(' ').length > 3);
        });
        if (expandables.length >= 2) return cur;
        cur = cur.parentElement;
      }
    }

    // Strategy B: find elements with aria-expanded that look like questions,
    // group them and return their common ancestor
    const questionBtns = [...document.querySelectorAll('[aria-expanded]')].filter(el => {
      const t = (el.innerText || '').trim();
      return t.length > 15 && t.length < 300 && t.includes('?');
    });
    if (questionBtns.length >= 2) {
      // Walk up from first until ancestor contains all
      let cur = questionBtns[0].parentElement;
      for (let i = 0; i < 12 && cur && cur !== document.body; i++) {
        if (questionBtns.every(b => cur.contains(b))) return cur;
        cur = cur.parentElement;
      }
    }

    return null;
  }

  // Validate that a button is a genuine PAA question (not a toolbar item, video, etc.)
  function isValidPAAButton(el, root) {
    const txt = (el.innerText || el.textContent || '').trim();

    // Block known UI labels exactly
    if (BLOCKED_TEXTS.has(txt.toLowerCase())) return false;

    // Must have meaningful length
    if (txt.length < 12 || txt.length > 320) return false;

    // Must contain at least 3 words
    if (txt.split(/\s+/).length < 3) return false;

    // Must look like a question or topic sentence
    const lower = txt.toLowerCase();
    const isQuestion = txt.includes('?')
      || /^(o que|como|por que|qual|quais|quando|onde|quem|quanto|para que|por quanto|what|how|why|which|when|where|who|is |are |can |should |does |do |will |has |have )/i.test(txt);
    if (!isQuestion) return false;

    // Must NOT be inside search toolbar (div#hdtb, div.sfbg, div[role="toolbar"])
    if (el.closest('#hdtb, #appbar, .sfbg, [role="toolbar"], #tophf, #tsf')) return false;

    // Must NOT be a video / reel / shorts control
    if (el.closest('[data-docid], .X5OiLe, .rrecc, .g-blk, [aria-label*="video" i], [aria-label*="short" i]')) return false;

    // If we found a root, element must be inside it
    if (root && !root.contains(el)) return false;

    return true;
  }

  function getPAAButtons() {
    const seen = new WeakSet();
    const out = [];
    const add = (el) => { if (el && !seen.has(el)) { seen.add(el); out.push(el); } };

    const root = findPAAContainer();

    // Search scope: inside PAA container if found, otherwise entire #rso results block
    const scope = root || document.querySelector('#rso') || document.body;

    // Primary: all elements with aria-expanded inside scope
    scope.querySelectorAll('[aria-expanded]').forEach(el => {
      if (isValidPAAButton(el, root)) add(el);
    });

    // Secondary: [data-q] role=button (classic PAA layout, no aria-expanded)
    scope.querySelectorAll('[data-q]').forEach(el => {
      const btn = el.getAttribute('role') === 'button' ? el : el.querySelector('[role="button"]');
      if (btn && isValidPAAButton(btn, root)) add(btn);
    });

    // Tertiary: .related-question-pair (older layout)
    scope.querySelectorAll('.related-question-pair [role="button"]').forEach(el => {
      if (isValidPAAButton(el, root)) add(el);
    });

    return out;
  }

  function isExpanded(btn) {
    if (btn.hasAttribute('aria-expanded')) {
      return btn.getAttribute('aria-expanded') === 'true';
    }
    // Fallback: look for visible answer content in the card
    const card = btn.closest('[data-sgrd]') || btn.closest('[data-q]')?.parentElement || btn.parentElement;
    const answer = card?.querySelector('[data-attrid] span, div[jsname="dk1K"], .wDYxhc, .LGOjhe, .ifM9O');
    return !!(answer && answer.offsetParent !== null && (answer.innerText || '').trim().length > 10);
  }

  // Answer selectors tried in priority order — broad to specific
  const ANSWER_SELECTORS = [
    // Modern layouts (2024-2025)
    '[data-attrid="wa:/description"] span[lang]',
    '[data-attrid="wa:/description"] span',
    '[data-attrid] span[lang]',
    'div[jsname="dk1K"]',
    '.wDYxhc',
    '.LGOjhe',
    '.ymu51e',
    '.ifM9O',
    // Fallback: any block-level element with substantial text inside expanded area
    '[data-sncf]',
    '[data-hveid] span',
    'div[role="list"] span',
  ];

  // Find the expanded card container for a given button.
  // The card is the element that collapses/expands and contains the answer.
  function findCardContainer(btn) {
    // Walk up looking for [data-sgrd] or [data-q] wrapper — most reliable
    let cur = btn;
    for (let i = 0; i < 8; i++) {
      cur = cur.parentElement;
      if (!cur || cur === document.body) break;
      if (cur.hasAttribute('data-sgrd')) return cur;
      if (cur.hasAttribute('data-q')) return cur;
      if (cur.classList.contains('related-question-pair')) return cur;
    }
    // Fallback: use btn.parentElement — at least scoped to the direct parent
    return btn.parentElement;
  }

  // Wait for answer text to appear inside a container (up to maxWait ms)
  async function waitForAnswer(card, maxWait = 3000) {
    const step = 120;
    const deadline = Date.now() + maxWait;
    while (Date.now() < deadline) {
      for (const sel of ANSWER_SELECTORS) {
        const el = card.querySelector(sel);
        if (el) {
          const txt = (el.innerText || el.textContent || '').trim();
          if (txt.length > 20) return { el, txt };
        }
      }
      await sleep(step);
    }
    return null;
  }

  // Extract answer text by taking ALL visible text in the card and subtracting the question
  function extractAnswerBySubtraction(card, questionText) {
    const fullText = (card.innerText || '').trim();
    const q = questionText.trim();
    // Remove the question itself from the top of the full text
    let answer = fullText.startsWith(q) ? fullText.slice(q.length).trim() : fullText;
    // Also strip trailing "Mostrar mais" / "Feedback" style UI text
    answer = answer.replace(/\n*(Mostrar mais|Mostrar menos|Feedback|Denunciar|Sobre este resultado)[^\n]*/gi, '').trim();
    return answer;
  }

  function extractFromButton(btn) {
    // Question text: read from the button itself, stripping any nested answer text
    const clone = btn.cloneNode(true);
    clone.querySelectorAll('[data-attrid], [jsname="dk1K"], .wDYxhc, .LGOjhe, .ifM9O, [data-sncf], [data-hveid]')
      .forEach(el => el.remove());
    const question = (clone.innerText || clone.textContent || '').trim().replace(/\s+/g, ' ');

    if (!question || question.length < 12 || question.length > 320) return null;
    if (question.split(/\s+/).length < 3) return null;
    if (BLOCKED_TEXTS.has(question.toLowerCase())) return null;

    const card = findCardContainer(btn);

    // Answer: try all selectors in priority order
    let answer = '';
    if (card) {
      for (const sel of ANSWER_SELECTORS) {
        const el = card.querySelector(sel);
        if (el) {
          const txt = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
          if (txt.length > 20) { answer = txt; break; }
        }
      }
      // If no selector worked but card has substantial text, use subtraction method
      if (!answer) {
        const fallback = extractAnswerBySubtraction(card, question);
        if (fallback.length > 20) answer = fallback.replace(/\s+/g, ' ');
      }
    }

    // Source URL: first non-Google link inside the card
    const linkEl = card?.querySelector(
      'a[href]:not([href^="#"]):not([href*="google.com/search"]):not([href*="google.com.br/search"]):not([href*="policies.google"])'
    );
    const sourceUrl = linkEl?.href || '';

    return {
      question,
      answer: answer.substring(0, 800),
      sourceUrl,
      query: getQuery(),
      capturedAt: new Date().toISOString(),
    };
  }

  // extractFromButtonAsync: clicks, waits for DOM to settle, then extracts
  async function extractFromButtonAsync(btn, delayMs) {
    // Question text first (before click, DOM is stable)
    const clone = btn.cloneNode(true);
    clone.querySelectorAll('[data-attrid], [jsname="dk1K"], .wDYxhc, .LGOjhe, .ifM9O, [data-sncf], [data-hveid]')
      .forEach(el => el.remove());
    const question = (clone.innerText || clone.textContent || '').trim().replace(/\s+/g, ' ');

    if (!question || question.length < 12 || question.length > 320) return null;
    if (question.split(/\s+/).length < 3) return null;
    if (BLOCKED_TEXTS.has(question.toLowerCase())) return null;

    const card = findCardContainer(btn);

    // Wait for answer content in card (it may load lazily after click)
    let answer = '';
    let sourceUrl = '';
    if (card) {
      const found = await waitForAnswer(card, Math.max(delayMs, 2000));
      if (found) {
        answer = found.txt.replace(/\s+/g, ' ');
      } else {
        // Last resort: subtraction method on full card text
        const fallback = extractAnswerBySubtraction(card, question);
        if (fallback.length > 20) answer = fallback.replace(/\s+/g, ' ');
      }

      const linkEl = card.querySelector(
        'a[href]:not([href^="#"]):not([href*="google.com/search"]):not([href*="google.com.br/search"]):not([href*="policies.google"])'
      );
      sourceUrl = linkEl?.href || '';
    }

    return {
      question,
      answer: answer.substring(0, 800),
      sourceUrl,
      query: getQuery(),
      capturedAt: new Date().toISOString(),
    };
  }

  function isNewItem(item) {
    return !captured.find(c => c.question.toLowerCase().trim() === item.question.toLowerCase().trim());
  }

  function dedup(arr) {
    const seen = new Set();
    return arr.filter(item => {
      const k = item.question.toLowerCase().trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function saveItems(items) {
    return new Promise(resolve => {
      chrome.storage.local.get(STORAGE_KEY, (data) => {
        const existing = data[STORAGE_KEY] || [];
        const merged = dedup([...existing, ...items]);
        chrome.storage.local.set({ [STORAGE_KEY]: merged }, () => {
          captured = merged;
          updateCounter();
          resolve(merged.length);
        });
      });
    });
  }

  function loadFromStorage() {
    return new Promise(resolve => {
      chrome.storage.local.get(STORAGE_KEY, (data) => {
        captured = data[STORAGE_KEY] || [];
        resolve(captured);
      });
    });
  }

  // ── Interaction Lock Overlay ───────────────────────────────────────────────
  // Covers the full page with a transparent-ish overlay while extraction runs,
  // so the user can't accidentally click on videos, toolbars, or other elements.
  function showOverlay(levelText) {
    let ov = document.getElementById('seo-paa-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'seo-paa-overlay';
      ov.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:2147483640',
        'cursor:not-allowed',
        'background:rgba(0,0,0,0.18)',
        'display:flex', 'flex-direction:column',
        'align-items:center', 'justify-content:center',
        'gap:10px',
        'pointer-events:all',
        'user-select:none',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      ].join(';');
      ov.innerHTML = `
        <div style="background:#0f0f10;border:1px solid #3f3f46;border-radius:14px;
                    padding:20px 28px;max-width:340px;text-align:center;
                    box-shadow:0 12px 40px rgba(0,0,0,.6);">
          <div style="font-size:22px;margin-bottom:8px;">🔒</div>
          <div style="color:#e5e7eb;font-size:14px;font-weight:600;margin-bottom:6px;">
            Extração em andamento
          </div>
          <div id="seo-paa-overlay-level" style="color:#a78bfa;font-size:12px;margin-bottom:10px;"></div>
          <div style="color:#71717a;font-size:11.5px;line-height:1.6;">
            Não mexa na tela.<br>
            O extrator está clicando nas perguntas automaticamente.<br>
            Interações manuais podem causar erros.
          </div>
          <div style="margin-top:14px;">
            <button id="seo-paa-overlay-stop"
              style="padding:7px 18px;border-radius:8px;border:none;
                     background:#b91c1c;color:#fff;font-size:12px;
                     font-weight:600;cursor:pointer;">
              Parar extração
            </button>
          </div>
        </div>`;
      document.body.appendChild(ov);
      document.getElementById('seo-paa-overlay-stop').addEventListener('click', () => {
        abortRequested = true;
      });
    }
    ov.style.display = 'flex';
    const lbl = document.getElementById('seo-paa-overlay-level');
    if (lbl) lbl.textContent = levelText || '';
  }

  function hideOverlay() {
    const ov = document.getElementById('seo-paa-overlay');
    if (ov) ov.style.display = 'none';
  }

  function updateOverlay(text) {
    const lbl = document.getElementById('seo-paa-overlay-level');
    if (lbl) lbl.textContent = text;
  }

  // ── Auto Extractor ─────────────────────────────────────────────────────────
  async function runAutoExtract(maxLevel, delayMs) {
    isRunning = true;
    abortRequested = false;
    _paaRoot = null;
    totalDone = 0;
    totalExpected = 0;

    clearLog();
    updateProgress(0);
    updateStatus(`Buscando perguntas...`, 'running');
    showOverlay(`Iniciando — nível 1 de ${maxLevel}`);

    // Track which questions existed before each level to detect new ones (children)
    // Map: questionText → level at which it was first captured
    const questionLevel = new Map();
    // Questions captured at the PREVIOUS level (potential parents for current level)
    let prevLevelQuestions = [];

    try {
      for (let level = 1; level <= maxLevel; level++) {
        if (abortRequested) break;

        updateOverlay(`Nível ${level} de ${maxLevel} — expandindo perguntas...`);
        updateStatus(`Nível ${level}/${maxLevel} — escaneando...`, 'running');
        const buttons = getPAAButtons();

        if (level === 1 && buttons.length === 0) {
          updateStatus('Bloco PAA não encontrado nesta página.', 'error');
          updateOverlay('Nenhuma pergunta PAA encontrada.');
          break;
        }

        totalExpected = Math.max(totalExpected, buttons.length);
        updateProgress(Math.round((totalDone / Math.max(totalExpected, 1)) * 100));

        let levelNew = 0;
        const thisLevelQuestions = [];

        for (let i = 0; i < buttons.length; i++) {
          if (abortRequested) break;

          const btn = buttons[i];
          await scrollToEl(btn);

          const pct = Math.round(((totalDone + i + 1) / Math.max(totalExpected, buttons.length)) * 100);
          updateProgress(Math.min(pct, 99));
          updateStatus(`Nível ${level}/${maxLevel} — ${i + 1}/${buttons.length}...`, 'running');
          updateOverlay(`Nível ${level}/${maxLevel} — pergunta ${i + 1} de ${buttons.length}`);

          let item = null;

          if (isExpanded(btn)) {
            const card = findCardContainer(btn);
            if (card) await waitForAnswer(card, 1500);
            item = extractFromButton(btn);
          } else {
            const clicked = safeClick(btn);
            if (!clicked) { totalDone++; continue; }
            item = await extractFromButtonAsync(btn, delayMs);
            await sleep(300);
          }

          if (item) {
            // Determine level and parent
            item.level = level;
            if (!questionLevel.has(item.question)) {
              // Find parent: the last prev-level question before this button in DOM order
              if (level > 1 && prevLevelQuestions.length > 0) {
                // Pick the nearest prev-level question that appears before this button
                item.parentQuestion = prevLevelQuestions[prevLevelQuestions.length - 1] || '';
              } else {
                item.parentQuestion = '';
              }
              questionLevel.set(item.question, level);
              thisLevelQuestions.push(item.question);

              if (isNewItem(item)) {
                await saveItems([item]);
                addLogItem(item.question);
                pulseIndicator();
                levelNew++;
              }
            }
          }
          totalDone++;
        }

        updateStatus(`Nível ${level} concluído — ${levelNew} novas`, 'running');
        prevLevelQuestions = thisLevelQuestions;

        if (level < maxLevel && !abortRequested) {
          updateOverlay(`Aguardando novas perguntas aparecerem (nível ${level + 1})...`);
          updateStatus(`Aguardando nível ${level + 1}...`, 'running');
          await sleep(1800);
          _paaRoot = null;
          const newButtons = getPAAButtons();
          totalExpected = Math.max(totalExpected, newButtons.length);
        }
      }

      updateProgress(100);
      const msg = abortRequested
        ? `Parado. ${captured.length} capturadas`
        : `Concluído! ${captured.length} capturadas`;
      updateStatus(msg, abortRequested ? '' : 'done');

    } catch (err) {
      updateStatus('Erro: ' + err.message, 'error');
    } finally {
      isRunning = false;
      abortRequested = false;
      hideOverlay();
      updateRunButton(false);
    }
  }

  // ── CSV Export ─────────────────────────────────────────────────────────────
  function exportCSV() {
    if (!captured.length) {
      alert('Nenhuma pergunta PAA capturada ainda.');
      return;
    }

    const header = ['query', 'nivel', 'pergunta_pai', 'pergunta', 'resposta', 'url_fonte', 'capturado_em'];
    const rows = captured.map(item =>
      [item.query, item.level || 1, item.parentQuestion || '', item.question, item.answer, item.sourceUrl, item.capturedAt]
        .map(v => `"${String(v || '').replace(/"/g, '""')}"`)
    );

    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `paa_${getQuery().replace(/\s+/g, '_').substring(0, 40)}_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Mindmap Viewer ──────────────────────────────────────────────────────────
  function openMindmap() {
    if (!captured.length) {
      alert('Nenhuma pergunta PAA capturada ainda.');
      return;
    }
    // Ask background to open the mindmap page as a proper extension tab
    // (extension pages opened by background have full chrome.storage access)
    chrome.runtime.sendMessage({ type: 'openMindmap' });
  }

  // ── Floating UI ────────────────────────────────────────────────────────────
  function createFloatingUI() {
    if (document.getElementById('seo-paa-panel')) return;

    const style = document.createElement('style');
    style.textContent = `
      #seo-paa-panel {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647; /* above overlay (2147483640) */
        background: #0f0f10;
        border: 1px solid #2a2a2e;
        border-radius: 14px;
        box-shadow: 0 8px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        color: #e5e7eb;
        width: 240px;
        overflow: hidden;
        user-select: none;
        transition: box-shadow .3s;
      }
      #seo-paa-header {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 10px 12px;
        background: #18181b;
        border-bottom: 1px solid #27272a;
        cursor: move;
        font-weight: 600;
        font-size: 12.5px;
        color: #a78bfa;
      }
      #seo-paa-count {
        margin-left: auto;
        background: #7c3aed;
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        padding: 1px 7px;
        border-radius: 10px;
        min-width: 22px;
        text-align: center;
        font-family: 'SF Mono', 'Fira Code', monospace;
        transition: background .2s;
      }
      #seo-paa-body {
        padding: 11px 12px;
        display: flex;
        flex-direction: column;
        gap: 9px;
      }
      .paa-label {
        font-size: 10.5px;
        color: #71717a;
        font-weight: 500;
        margin-bottom: 3px;
      }
      #seo-paa-level-select {
        width: 100%;
        padding: 7px 28px 7px 10px;
        border: 1px solid #3f3f46;
        border-radius: 8px;
        background: #18181b;
        color: #e5e7eb;
        font-size: 12px;
        cursor: pointer;
        outline: none;
        appearance: none;
        -webkit-appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 10px center;
      }
      #seo-paa-level-select:focus { border-color: #7c3aed; }
      #seo-paa-run {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        width: 100%;
        padding: 8px 10px;
        border: none;
        border-radius: 9px;
        background: #7c3aed;
        color: #fff;
        cursor: pointer;
        font-size: 12.5px;
        font-weight: 600;
        transition: background .15s;
        letter-spacing: .01em;
      }
      #seo-paa-run:hover:not(:disabled) { background: #6d28d9; }
      #seo-paa-run.running { background: #b91c1c; }
      #seo-paa-run.running:hover { background: #991b1b; }

      /* Progress bar */
      #seo-paa-progress-wrap {
        display: none;
        flex-direction: column;
        gap: 4px;
      }
      #seo-paa-progress-wrap.visible { display: flex; }
      #seo-paa-progress-bar-bg {
        height: 5px;
        background: #27272a;
        border-radius: 99px;
        overflow: hidden;
      }
      #seo-paa-progress-bar {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #7c3aed, #a78bfa);
        border-radius: 99px;
        transition: width .3s ease;
      }
      #seo-paa-progress-label {
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        color: #52525b;
      }
      #seo-paa-progress-pct { color: #a78bfa; font-weight: 600; font-family: 'SF Mono', monospace; }

      #seo-paa-status {
        font-size: 10.5px;
        color: #71717a;
        text-align: center;
        min-height: 14px;
        line-height: 1.4;
      }
      #seo-paa-status.running { color: #a78bfa; }
      #seo-paa-status.done { color: #4ade80; }
      #seo-paa-status.error { color: #f87171; }

      /* Live log */
      #seo-paa-log-wrap {
        display: none;
        flex-direction: column;
        gap: 3px;
        max-height: 0;
        overflow: hidden;
        transition: max-height .3s ease;
      }
      #seo-paa-log-wrap.visible {
        display: flex;
        max-height: 180px;
      }
      .paa-log-label {
        font-size: 10px;
        color: #52525b;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: .06em;
      }
      #seo-paa-log {
        display: flex;
        flex-direction: column;
        gap: 2px;
        max-height: 150px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #3f3f46 transparent;
      }
      #seo-paa-log::-webkit-scrollbar { width: 3px; }
      #seo-paa-log::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 2px; }
      .paa-log-item {
        font-size: 10.5px;
        color: #a1a1aa;
        background: #18181b;
        border-radius: 5px;
        padding: 3px 7px;
        line-height: 1.35;
        border-left: 2px solid #7c3aed;
        animation: paa-log-in .2s ease;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      @keyframes paa-log-in {
        from { opacity: 0; transform: translateX(4px); }
        to   { opacity: 1; transform: translateX(0); }
      }

      .paa-divider {
        height: 1px;
        background: #27272a;
      }
      #seo-paa-actions {
        display: flex;
        gap: 6px;
      }
      #seo-paa-actions button {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 6px 6px;
        border: 1px solid #3f3f46;
        border-radius: 7px;
        background: #27272a;
        color: #a1a1aa;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        transition: all .15s;
      }
      #seo-paa-actions button:hover { background: #3f3f46; color: #e5e7eb; }
      #seo-paa-export:hover { border-color: #4ade80 !important; color: #4ade80 !important; }
      #seo-paa-clear:hover { border-color: #f87171 !important; color: #f87171 !important; }
      #seo-paa-mindmap:hover { border-color: #38bdf8 !important; color: #38bdf8 !important; }

      .paa-spinner {
        width: 10px; height: 10px;
        border: 2px solid rgba(255,255,255,.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: paa-spin 1s linear infinite;
        flex-shrink: 0;
      }
      @keyframes paa-spin { to { transform: rotate(360deg); } }

      .paa-flash-border {
        animation: paa-flash-border .4s ease;
      }
      @keyframes paa-flash-border {
        0%   { box-shadow: 0 8px 32px rgba(0,0,0,.5), 0 0 0 2px #7c3aed; }
        100% { box-shadow: 0 8px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.04); }
      }
    `;
    document.head.appendChild(style);

    const ui = document.createElement('div');
    ui.id = 'seo-paa-panel';
    ui.innerHTML = `
      <div id="seo-paa-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span>PAA Extractor</span>
        <span id="seo-paa-count">0</span>
      </div>
      <div id="seo-paa-body">

        <div>
          <div class="paa-label">Nível de extração</div>
          <select id="seo-paa-level-select">
            <option value="1">1º Nível</option>
            <option value="2">2º Nível</option>
            <option value="3" selected>3º Nível</option>
            <option value="4">4º Nível (~1 minuto)</option>
            <option value="5">5º Nível (vários minutos)</option>
          </select>
        </div>

        <button id="seo-paa-run">
          Iniciar extração
        </button>

        <div id="seo-paa-progress-wrap">
          <div id="seo-paa-progress-bar-bg">
            <div id="seo-paa-progress-bar"></div>
          </div>
          <div id="seo-paa-progress-label">
            <span id="seo-paa-status"></span>
            <span id="seo-paa-progress-pct">0%</span>
          </div>
        </div>

        <div id="seo-paa-log-wrap">
          <div class="paa-log-label">Capturadas</div>
          <div id="seo-paa-log"></div>
        </div>

        <div class="paa-divider"></div>

        <div id="seo-paa-actions" style="flex-wrap:wrap;">
          <button id="seo-paa-mindmap" style="flex:1 1 100%;margin-bottom:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
              <line x1="12" y1="7" x2="5" y2="17"/><line x1="12" y1="7" x2="19" y2="17"/>
            </svg>
            Ver Mapa Mental
          </button>
          <button id="seo-paa-export">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Exportar CSV
          </button>
          <button id="seo-paa-clear">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
            Limpar
          </button>
        </div>

      </div>
    `;
    document.body.appendChild(ui);
    floatingUI = ui;

    document.getElementById('seo-paa-run').addEventListener('click', onRunClick);
    document.getElementById('seo-paa-export').addEventListener('click', exportCSV);
    document.getElementById('seo-paa-clear').addEventListener('click', onClearClick);
    document.getElementById('seo-paa-mindmap').addEventListener('click', openMindmap);

    makeDraggable(ui, document.getElementById('seo-paa-header'));
    loadFromStorage().then(() => { updateCounter(); restoreLog(); });
  }

  async function onRunClick() {
    if (isRunning) {
      abortRequested = true;
      updateStatus('Parando...', 'running');
      return;
    }
    const level = parseInt(document.getElementById('seo-paa-level-select')?.value || '1', 10);
    updateRunButton(true);
    showProgressArea(true);
    await runAutoExtract(level, getDelayForLevel(level));
  }

  function onClearClick() {
    if (!confirm('Limpar todos os dados PAA capturados?')) return;
    chrome.storage.local.remove(STORAGE_KEY, () => {
      captured = [];
      updateCounter();
      clearLog();
      showProgressArea(false);
      updateStatus('', '');
      updateProgress(0);
    });
  }

  function updateRunButton(running) {
    const btn = document.getElementById('seo-paa-run');
    if (!btn) return;
    if (running) {
      btn.classList.add('running');
      btn.innerHTML = `<span class="paa-spinner"></span> Parar extração`;
    } else {
      btn.classList.remove('running');
      btn.innerHTML = `Iniciar extração`;
    }
  }

  function showProgressArea(visible) {
    const pw = document.getElementById('seo-paa-progress-wrap');
    const lw = document.getElementById('seo-paa-log-wrap');
    if (pw) pw.classList.toggle('visible', visible);
    if (lw) lw.classList.toggle('visible', visible);
  }

  function updateProgress(pct) {
    const bar = document.getElementById('seo-paa-progress-bar');
    const label = document.getElementById('seo-paa-progress-pct');
    if (bar) bar.style.width = pct + '%';
    if (label) label.textContent = pct + '%';
  }

  function updateStatus(msg, state) {
    const el = document.getElementById('seo-paa-status');
    if (!el) return;
    el.textContent = msg;
    el.className = state || '';
  }

  function updateCounter() {
    const counter = document.getElementById('seo-paa-count');
    if (counter) counter.textContent = captured.length;
  }

  function addLogItem(question) {
    const log = document.getElementById('seo-paa-log');
    if (!log) return;
    const item = document.createElement('div');
    item.className = 'paa-log-item';
    item.title = question;
    item.textContent = question;
    log.appendChild(item);
    log.scrollTop = log.scrollHeight;
  }

  function clearLog() {
    const log = document.getElementById('seo-paa-log');
    if (log) log.innerHTML = '';
  }

  function restoreLog() {
    if (!captured.length) return;
    showProgressArea(true);
    captured.forEach(item => addLogItem(item.question));
  }

  function pulseIndicator() {
    const panel = document.getElementById('seo-paa-panel');
    if (!panel) return;
    panel.classList.remove('paa-flash-border');
    void panel.offsetWidth;
    panel.classList.add('paa-flash-border');
    updateCounter();
  }

  function getDelayForLevel(level) {
    const delays = [0, 700, 900, 1200, 1600, 2200];
    return delays[level] || 1200;
  }

  // ── Draggable ──────────────────────────────────────────────────────────────
  function makeDraggable(el, handle) {
    let startX, startY, origX, origY;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      origX = rect.left; origY = rect.top;
      el.style.right = 'auto'; el.style.bottom = 'auto';
      el.style.left = origX + 'px'; el.style.top = origY + 'px';

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

  // ── Init — só ativa se o toggle estiver ligado ─────────────────────────────
  function init() {
    if (!window.location.hostname.includes('google.')) return;
    if (!window.location.pathname.startsWith('/search')) return;
    chrome.storage.local.get('seo_tools_enabled', data => {
      if (data.seo_tools_enabled?.paa) createFloatingUI();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (location.pathname.startsWith('/search') && !document.getElementById('seo-paa-panel')) {
        chrome.storage.local.get('seo_tools_enabled', data => {
          if (data.seo_tools_enabled?.paa) createFloatingUI();
        });
      }
    }
  }).observe(document, { subtree: true, childList: true });

})();
