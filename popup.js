// Substituição de onerror inline (proibido por CSP em extensões MV3)
document.querySelectorAll('img[data-fallback-hide]').forEach(img => {
  img.addEventListener('error', () => { img.style.display = 'none'; });
});

// ── Fechar side panel ────────────────────────────────────────────
function closeSidePanel() {
  if (chrome?.sidePanel?.close) {
    chrome.sidePanel.close().catch(() => window.close());
  } else {
    window.close();
  }
}
document.addEventListener('DOMContentLoaded', async () => {
  // ── i18n: inicializar idioma antes de qualquer render ──────────────────────
  await i18nInit();

  // Traduzir labels das abas dinamicamente (preserva SVGs)
  const TAB_I18N = {
    '360': 'tab_360', overview: 'tab_overview', headings: 'tab_headings',
    links: 'tab_links', images: 'tab_images', schema: 'tab_schema',
    checks: 'tab_checks', graph: 'tab_graph', speed: 'tab_speed',
    semantic: 'tab_semantic', chunks: 'tab_chunks', index: 'tab_index',
    config: 'tab_config',
  };
  document.querySelectorAll('.tab[data-tab]').forEach(btn => {
    const key = TAB_I18N[btn.dataset.tab];
    if (!key) return;
    const svgEl = btn.querySelector('svg');
    btn.textContent = t(key);
    if (svgEl) btn.insertBefore(svgEl, btn.firstChild);
  });

  // ── Seletor de idioma — bandeira no topbar ─────────────────────────────────
  const LANG_FLAGS = {
    pt: '🇧🇷', en: '🇺🇸', es: '🇪🇸', de: '🇩🇪', fr: '🇫🇷',
    zh: '🇨🇳', ja: '🇯🇵', ko: '🇰🇷', th: '🇹🇭', vi: '🇻🇳',
    id: '🇮🇩', ms: '🇲🇾',
  };

  function _applyTabLabels() {
    document.querySelectorAll('.tab[data-tab]').forEach(tabBtn => {
      const key = TAB_I18N[tabBtn.dataset.tab];
      if (!key) return;
      const svgEl = tabBtn.querySelector('svg');
      tabBtn.textContent = t(key);
      if (svgEl) tabBtn.insertBefore(svgEl, tabBtn.firstChild);
    });
  }

  function _initTopbarLang() {
    const btn      = document.getElementById('topbar-lang-btn');
    const dropdown = document.getElementById('topbar-lang-dropdown');
    const flagEl   = document.getElementById('topbar-lang-flag');
    if (!btn || !dropdown || !flagEl) return;

    // Atualizar bandeira e item ativo
    function _refreshFlag() {
      const cur = getCurrentLang();
      flagEl.textContent = LANG_FLAGS[cur] || '🌐';
      dropdown.querySelectorAll('.tlang-opt').forEach(o => {
        o.classList.toggle('active', o.dataset.lang === cur);
      });
    }
    _refreshFlag();

    // Toggle dropdown
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });

    // Fechar ao clicar fora
    document.addEventListener('click', () => dropdown.classList.remove('open'));

    // Selecionar idioma
    dropdown.querySelectorAll('.tlang-opt').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.remove('open');
        setLanguage(opt.dataset.lang, () => {
          _refreshFlag();
          _applyTabLabels();
        });
      });
    });
  }
  _initTopbarLang();

  // ── Tour guiado: rodar na primeira abertura após onboarding ────────────────
  chrome.storage.sync.get(['seo_tour_done', 'seo_onboarding_done'], result => {
    if (result.seo_onboarding_done && !result.seo_tour_done) {
      // Aguardar o popup estabilizar antes de iniciar o tour
      setTimeout(tourStart, 600);
    }
  });

  document.getElementById('nav-close-btn')?.addEventListener('click', closeSidePanel);

  // Bob — abre a aba dedicada tab-bob
  document.getElementById('topbar-bob-btn')?.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const bobNavTab = document.querySelector('.tab[data-tab="bob"]');
    const bobContent = document.getElementById('tab-bob');
    if (bobNavTab) bobNavTab.classList.add('active');
    if (bobContent) bobContent.classList.add('active');
    setTimeout(() => {
      document.getElementById('bob-input')?.focus();
      document.getElementById('topbar-bob-btn')?.classList.add('bob-visited');
      document.querySelector('.tab-bob-nav')?.classList.add('bob-visited');
      ctxTipShow('bob');
    }, 800);
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSidePanel();
});

// Tab switching
let graphRendered = false;
let graphData = null;
let _analyzedPageUrl = ''; // URL da página analisada — salva no momento do render
let _linksGraph = null; // instância do grafo de links (movido para cima — usado no tab click handler)

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + target).classList.add('active');

    // Expande largura do popup conforme aba
    document.body.classList.toggle('tab-headings-active', target === 'headings');
    document.body.classList.toggle('tab-semantic-active', target === 'semantic');
    document.body.classList.toggle('tab-graph-active', target === 'graph');
    document.body.classList.toggle('tab-links-active', target === 'links');
    document.body.classList.toggle('tab-images-active', target === 'images');
    document.body.classList.toggle('tab-speed-active', target === 'speed');
    document.body.classList.toggle('tab-360-active', target === '360');
    document.body.classList.toggle('tab-chunks-active', target === 'chunks');

    if (target === 'index')  initIndexTab();
    if (target === 'images') initImagesTab();
    if (target === 'learn')  initLearnTab();
    if (target === 'guide')  initGuideTab();
    document.body.classList.toggle('tab-guide-active', target === 'guide');

    // Tooltip contextual — dispara 800ms após mudar de aba (aguarda render)
    if (CTX_TIPS[target]) setTimeout(() => ctxTipShow(target), 800);

    // Visual de link juice: renderiza ao entrar na aba
    if (target === 'links' && graphData?.linkNodes) {
      renderLinksGraph(graphData.linkNodes, graphData.url);
    }

    if (target === 'graph' && graphData) {
      if (!graphRendered) {
        graphRendered = true;
        // Mostra prévia no popup com botão para abrir em tela cheia
        showGraphPreview();
      }
    }
  });
});

// Badge helper
function badge(text, type) {
  // type: 'green' | 'orange' | 'red' | 'gray'
  const b = document.createElement('span');
  b.className = `badge badge-${type}`;
  if (type === 'green') b.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> `;
  b.appendChild(document.createTextNode(text));
  return b;
}

function setBadge(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '';
  el.className = `badge badge-${type}`;
  if (type === 'green') el.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ${text}`;
  else el.textContent = text;
}

function setText(id, text, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text || '—';
  if (cls) el.className = 'card-value ' + cls;
}

// Animated score ring
function renderScoreRing(score) {
  const CIRCUMFERENCE = 276.46; // 2π × 44
  const ring = document.getElementById('score-ring');
  const numEl = document.getElementById('score-number');
  const gradeEl = document.getElementById('score-grade');
  const titleEl = document.getElementById('score-title');
  const barsEl = document.getElementById('score-bars');

  if (score == null) return;

  // Determine grade + color
  let grade, color, title;
  if (score >= 90)      { grade = 'A+'; color = '#34d399'; title = 'Excelente'; }
  else if (score >= 80) { grade = 'A';  color = '#34d399'; title = 'Ótimo'; }
  else if (score >= 70) { grade = 'B';  color = '#7c74ff'; title = 'Bom'; }
  else if (score >= 55) { grade = 'C';  color = '#fbbf24'; title = 'Regular'; }
  else if (score >= 40) { grade = 'D';  color = '#f87171'; title = 'Fraco'; }
  else                  { grade = 'F';  color = '#f87171'; title = 'Crítico'; }

  // Animate ring
  ring.style.stroke = color;
  const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
  requestAnimationFrame(() => {
    ring.style.strokeDashoffset = offset;
  });

  // Animate number counter
  numEl.textContent = '0';
  let current = 0;
  const step = Math.ceil(score / 30);
  const timer = setInterval(() => {
    current = Math.min(current + step, score);
    numEl.textContent = current;
    if (current >= score) clearInterval(timer);
  }, 28);

  gradeEl.textContent = grade;
  gradeEl.className = 'score-grade grade-' + grade[0].toLowerCase();
  titleEl.textContent = title;

  // Mini bar breakdown (visual only)
  const bars = [
    { label: 'Title',    val: score >= 70 ? 100 : score >= 50 ? 65 : 20, color },
    { label: 'Meta',     val: score >= 75 ? 100 : score >= 55 ? 55 : 15, color },
    { label: 'Headings', val: score >= 65 ? 100 : score >= 45 ? 50 : 20, color },
  ];
  barsEl.innerHTML = bars.map(b => `
    <div class="score-bar-item">
      <span>${b.label}</span>
      <div class="score-bar-track">
        <div class="score-bar-fill" style="width:${b.val}%; background:${b.color}"></div>
      </div>
    </div>
  `).join('');
}

// Render results into the UI
function render(data) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'block';
  _imgScanDone = false; // nova página = novo scan

  // Salva URL da página analisada para uso no PSI
  if (data.url) {
    try {
      const u = new URL(data.url);
      u.hash = '';
      _analyzedPageUrl = u.toString();
    } catch (_) {
      _analyzedPageUrl = data.url;
    }
  }

  // Score ring hero — prefer overallScore from 16-category engine
  const displayScore = data.overallScore ?? data.score;
  renderScoreRing(displayScore);

  // ── OVERVIEW ──

  // Title
  if (!data.title) {
    setBadge('badge-title', 'Missing', 'red');
    setText('val-title', 'Ausente', 'missing-val');
  } else {
    const len = data.titleLen;
    const ok = len >= 40 && len <= 60;
    const warn = len > 60 || (len > 0 && len < 40);
    setBadge('badge-title', `${len} characters`, ok ? 'green' : 'orange');
    setText('val-title', data.title);
  }

  // Description
  if (!data.description) {
    setBadge('badge-desc', 'Missing', 'red');
    setText('val-desc', 'Ausente', 'missing-val');
  } else {
    const len = data.descLen;
    const ok = len >= 100 && len <= 160;
    setBadge('badge-desc', `${len} characters`, ok ? 'green' : 'orange');
    setText('val-desc', data.description);
  }

  // URL / indexability
  const indexable = !data.isNoindex;
  setBadge('badge-url', indexable ? 'Indexable' : 'Noindex', indexable ? 'green' : 'red');
  setText('val-url', data.url, 'url-val');

  // Canonical
  if (!data.canonical) {
    setText('val-canonical', 'Missing', 'missing-val');
  } else {
    setText('val-canonical', data.canonical, 'url-val');
  }

  // Robots
  setText('val-robots', data.robots || 'Missing', data.robots ? 'card-value' : 'missing-val');
  // X-Robots-Tag from HTTP header (fetched server-side)
  setText('val-xrobots', data.xRobotsTag || 'Missing', data.xRobotsTag ? 'card-value' : 'missing-val');

  // Keywords
  setText('val-keywords', data.keywords || 'Missing', data.keywords ? 'card-value' : 'missing-val');

  // Publisher
  setText('val-publisher', data.publisher || 'Missing', data.publisher ? 'card-value' : 'missing-val');

  // Word Count
  if (data.wordCount != null) {
    const wc = data.wordCount;
    const wcOk = wc >= 300 && wc <= 2000;
    const wcLow = wc < 300;
    setBadge('badge-wordcount', `${wc} words`, wcLow ? 'red' : wcOk ? 'green' : 'orange');
    setText('val-wordcount', `${wc} palavras`);
  }

  // Lang
  if (data.htmlLang) {
    setBadge('badge-lang', data.htmlLang, 'green');
    setText('val-lang', data.htmlLang, 'card-value');
  } else {
    setBadge('badge-lang', 'Missing', 'red');
    setText('val-lang', 'Missing', 'missing-val');
  }

  // Headings mini grid
  const hMap = { h1: data.h1Count, h2: data.h2Count, h3: data.h3Count, h4: data.h4Count, h5: data.h5Count, h6: data.h6Count };
  Object.entries(hMap).forEach(([tag, count]) => {
    const el = document.getElementById(`ovh-${tag}`);
    if (el) {
      el.textContent = count ?? 0;
      if (tag === 'h1') el.className = `ovh-val${count === 1 ? ' ovh-good' : count === 0 ? ' ovh-bad' : ' ovh-warn'}`;
    }
  });

  // Images + Links
  setText('val-images', data.imgTotal != null ? `${data.imgTotal} (${data.imgNoAlt ?? 0} sem alt)` : '—');
  setText('val-links-count', data.totalLinks != null ? `${data.totalLinks} (${data.internalLinks ?? 0} int · ${data.externalLinks ?? 0} ext)` : '—');

  // Robots.txt + Sitemap.xml — preenchidos após o fetch assíncrono
  // (data.robotsTxt é injetado em scriptResult.robotsTxt — linha ~1798)
  {
    const origin = (() => { try { return new URL(data.url).origin; } catch { return ''; } })();

    // Robots.txt
    if (data.robotsTxt) {
      const rb = data.robotsTxt;
      const blocked = rb.disallowAll || rb.disallowPath;
      setBadge('badge-robotstxt', blocked ? 'Bloqueado' : 'OK', blocked ? 'red' : 'green');
      const rbEl = document.getElementById('val-robotstxt');
      if (rbEl) {
        rbEl.innerHTML = origin
          ? `<a href="${origin}/robots.txt" target="_blank" rel="noopener" class="overview-link">${blocked ? 'Bloqueia esta página' : 'Encontrado'}</a>`
          : (blocked ? 'Bloqueia esta página' : 'Encontrado');
        rbEl.className = `card-value ${blocked ? 'missing-val' : ''}`;
      }
    } else {
      setBadge('badge-robotstxt', 'Missing', 'orange');
      setText('val-robotstxt', 'Não encontrado', 'missing-val');
    }

    // Sitemap.xml
    if (origin) {
      const sitemapUrl = `${origin}/sitemap.xml`;
      fetch(sitemapUrl, { method: 'HEAD', cache: 'no-store' })
        .then(r => {
          const found = r.ok;
          setBadge('badge-sitemapxml', found ? 'Encontrado' : 'Missing', found ? 'green' : 'red');
          const smEl = document.getElementById('val-sitemapxml');
          if (smEl) {
            smEl.innerHTML = found
              ? `<a href="${sitemapUrl}" target="_blank" rel="noopener" class="overview-link">${sitemapUrl}</a>`
              : 'Não encontrado em /sitemap.xml';
            smEl.className = `card-value ${found ? 'url-val' : 'missing-val'}`;
          }
        })
        .catch(() => {
          setBadge('badge-sitemapxml', 'Erro', 'orange');
          setText('val-sitemapxml', 'Não verificável', 'missing-val');
        });

      // Função helper para cards de arquivo discoverable
      function checkFile(badgeId, valId, urls, label) {
        const tryNext = (list) => {
          if (!list.length) {
            setBadge(badgeId, 'Missing', 'red');
            setText(valId, 'Não encontrado', 'missing-val');
            return;
          }
          const [url, ...rest] = list;
          fetch(url, { method: 'HEAD', cache: 'no-store' })
            .then(r => {
              if (r.ok) {
                setBadge(badgeId, 'Encontrado', 'green');
                const el = document.getElementById(valId);
                if (el) {
                  el.innerHTML = `<a href="${url}" target="_blank" rel="noopener" class="overview-link">${url}</a>`;
                  el.className = 'card-value url-val';
                }
              } else {
                tryNext(rest);
              }
            })
            .catch(() => tryNext(rest));
        };
        tryNext(urls);
      }

      // llms.txt
      checkFile('badge-llmstxt', 'val-llmstxt', [`${origin}/llms.txt`], 'llms.txt');

      // security.txt (well-known primeiro, depois raiz)
      checkFile('badge-securitytxt', 'val-securitytxt',
        [`${origin}/.well-known/security.txt`, `${origin}/security.txt`], 'security.txt');

      // RSS / Feed (tenta vários caminhos comuns)
      checkFile('badge-rssfeed', 'val-rssfeed',
        [`${origin}/feed`, `${origin}/feed.xml`, `${origin}/rss.xml`, `${origin}/atom.xml`, `${origin}/blog/feed`], 'RSS');

      // manifest.json — usa URL do data se disponível, senão tenta caminhos comuns
      const manifestUrl = data.manifestUrl || null;
      if (manifestUrl) {
        setBadge('badge-manifest', 'Encontrado', 'green');
        const mEl = document.getElementById('val-manifest');
        if (mEl) {
          mEl.innerHTML = `<a href="${manifestUrl}" target="_blank" rel="noopener" class="overview-link">${manifestUrl}</a>`;
          mEl.className = 'card-value url-val';
        }
      } else {
        checkFile('badge-manifest', 'val-manifest', [`${origin}/manifest.json`, `${origin}/manifest.webmanifest`], 'manifest');
      }

      // Security Headers — link para securityheaders.com com domínio preenchido
      const secLink = document.getElementById('sec-headers-link');
      if (secLink && origin) {
        const domain = origin.replace(/^https?:\/\//, '');
        secLink.href = `https://securityheaders.com/?q=${encodeURIComponent(origin)}&followRedirects=on`;
        secLink.textContent = '';
        secLink.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Testar security headers de ${domain}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        `;
      }
    }
  }

  // ── HEADINGS ──
  const headingsList = document.getElementById('headings-list');
  const allHeadings = [];

  // Collect headings from DOM via data passed
  // We receive flat counts; for display we need the actual texts — already in data
  const levels = ['h1','h2','h3','h4','h5','h6'];

  // Build heading items from data structure
  // data.headingNodes is the ordered list if available, otherwise use h1Text + counts
  if (data.headingNodes && data.headingNodes.length > 0) {
    data.headingNodes.forEach(node => {
      const item = buildHeadingItem(node.level, node.text);
      headingsList.appendChild(item);
      allHeadings.push(node.text);
    });

    // Desenha linhas via background-image em cada item
    // Vantagem: não usa position:absolute, sem problemas de overflow/gap
    const items = Array.from(headingsList.querySelectorAll('.heading-item'));
    const getL  = el => parseInt(el.className.match(/level-h(\d)/)?.[1] || '1');
    const TX    = { 1: 8, 2: 32, 3: 56, 4: 80, 5: 104 };
    const C     = 'rgba(124,116,255,0.65)'; // cor da linha

    // Para nível anc, verifica se após o item i ainda há filhos diretos (nível anc+1)
    // dentro do escopo do ancestral de nível anc
    function trunkContinues(i, anc) {
      for (let j = i + 1; j < items.length; j++) {
        const jL = getL(items[j]);
        if (jL <= anc) return false;       // saiu do escopo do ancestral
        if (jL === anc + 1) return true;   // há mais filhos diretos
      }
      return false;
    }

    items.forEach((item, i) => {
      const myL  = getL(item);
      const next = items[i + 1];
      const imgs = [], pos = [], size = [];

      // 1. Linhas verticais dos ANCESTRAIS passando por este item
      //    (uma por cada nível de ancestral que ainda tem filhos abaixo)
      for (let anc = 1; anc < myL; anc++) {
        const x         = TX[anc];
        const continues = trunkContinues(i, anc);
        // Se continua: linha de cima a baixo (100%)
        // Se termina aqui (este item é o último descendente deste ancestral):
        //   linha só de cima até o meio (50%) — fecha o galho
        const h = continues ? '100%' : '50%';
        imgs.push(`linear-gradient(${C},${C})`);
        pos.push(`${x}px 0`);
        size.push(`2px ${h}`);
      }

      // 2. Linha vertical DESCENDENTE: do centro deste item para baixo
      //    (só se o próximo item é filho deste)
      if (next && getL(next) > myL) {
        const x = TX[myL];
        imgs.push(`linear-gradient(${C},${C})`);
        pos.push(`${x}px 50%`);
        size.push(`2px 50%`);
      }

      // 3. Linha HORIZONTAL: do tronco do pai até o tag deste item
      //    (só para filhos, não para H1)
      if (myL > 1) {
        const xS = TX[myL - 1] || TX[1];
        const xE = TX[myL]     || xS + 24;
        imgs.push(`linear-gradient(to right,${C},${C})`);
        pos.push(`${xS}px 50%`);
        size.push(`${xE - xS}px 2px`);
      }

      if (imgs.length) {
        item.style.backgroundImage    = imgs.join(',');
        item.style.backgroundPosition = pos.join(',');
        item.style.backgroundSize     = size.join(',');
        item.style.backgroundRepeat   = 'no-repeat';
      }
    });
  } else {
    // Fallback: show H1 texts + summaries for other levels
    if (data.h1Text && data.h1Text.length > 0) {
      data.h1Text.forEach(t => {
        headingsList.appendChild(buildHeadingItem('H1', t));
        allHeadings.push('H1: ' + t);
      });
    }
    const fakeLevels = [
      { key: 'h2Count', tag: 'H2' },
      { key: 'h3Count', tag: 'H3' },
      { key: 'h4Count', tag: 'H4' },
    ];
    fakeLevels.forEach(({ key, tag }) => {
      if (data[key] > 0) {
        const item = buildHeadingItem(tag, `${data[key]} elemento(s) ${tag}`);
        item.querySelector('.heading-text').style.color = '#9ca3af';
        item.querySelector('.heading-text').style.fontStyle = 'italic';
        headingsList.appendChild(item);
      }
    });
  }

  const total = (data.h1Count || 0) + (data.h2Count || 0) + (data.h3Count || 0) +
                (data.h4Count || 0) + (data.h5Count || 0) + (data.h6Count || 0);
  { const _el = document.getElementById('headings-count'); if (_el) _el.textContent = `${total} heading${total !== 1 ? 's' : ''}`; }

  // Mini-painel de resumo
  const hCounts = { h1: data.h1Count||0, h2: data.h2Count||0, h3: data.h3Count||0,
                    h4: data.h4Count||0, h5: data.h5Count||0, h6: data.h6Count||0 };
  ['h1','h2','h3','h4','h5','h6'].forEach(h => {
    const el = document.getElementById(`hdgs-${h}`);
    if (el) {
      el.textContent = hCounts[h];
      el.classList.toggle('hdg-summary-val--warn', h === 'h1' && hCounts[h] !== 1);
      el.classList.toggle('hdg-summary-val--ok',   h === 'h1' && hCounts[h] === 1);
    }
  });
  const imgEl = document.getElementById('hdgs-images');
  if (imgEl) imgEl.textContent = data.imgCount ?? data.imgTotal ?? '—';
  const lnkEl = document.getElementById('hdgs-links');
  if (lnkEl) lnkEl.textContent = data.internalLinks ?? '—';

  // Robots e Sitemap — copia status do Overview
  const robotsSrc = document.getElementById('badge-robotstxt');
  const sitemapSrc = document.getElementById('badge-sitemapxml');
  const robotsDst  = document.getElementById('hdgs-robots');
  const sitemapDst = document.getElementById('hdgs-sitemap');
  if (robotsDst && robotsSrc) {
    const ok = robotsSrc.classList.contains('badge-ok') || robotsSrc.textContent.includes('✓');
    robotsDst.classList.toggle('hdg-summary-badge--ok',  ok);
    robotsDst.classList.toggle('hdg-summary-badge--bad', !ok);
  }
  if (sitemapDst && sitemapSrc) {
    const ok = sitemapSrc.classList.contains('badge-ok') || sitemapSrc.textContent.includes('✓');
    sitemapDst.classList.toggle('hdg-summary-badge--ok',  ok);
    sitemapDst.classList.toggle('hdg-summary-badge--bad', !ok);
  }

  // Guarda headings para o botão de envio à IA
  _headingNodesForAI = data.headingNodes || [];

  // Entity salience analysis
  renderEntitySalience(data.headingNodes || []);

  // Copy button
  document.getElementById('copy-headings').addEventListener('click', () => {
    const text = (data.headingNodes || []).map(n => `${n.level}: ${n.text}`).join('\n') ||
                 allHeadings.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copy-headings');
      btn.textContent = 'Copiado!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
        btn.classList.remove('copied');
      }, 1800);
    });
  });

  // ── LINKS ──
  { const _el = document.getElementById('stat-internal'); if (_el) _el.textContent = data.internalLinks ?? '—'; }
  { const _el = document.getElementById('stat-external'); if (_el) _el.textContent = data.externalLinks ?? '—'; }
  { const _el = document.getElementById('stat-nofollow'); if (_el) _el.textContent = data.nofollowLinks ?? '—'; }
  { const _el = document.getElementById('stat-total-links'); if (_el) _el.textContent = data.totalLinks ?? '—'; }
  if (data.linkNodes) renderLinksTab(data.linkNodes, data.url);

  // ── IMAGES ──
  { const _el = document.getElementById('stat-img-total'); if (_el) _el.textContent = data.imgTotal ?? '—'; }
  { const _el = document.getElementById('stat-img-noalt'); if (_el) _el.textContent = data.imgNoAlt ?? '—'; }
  { const _el = document.getElementById('stat-img-ok'); if (_el) _el.textContent = ((data.imgTotal ?? 0) - (data.imgNoAlt ?? 0)); }
  if (data.imgNodes) {
    const modernCount = data.imgNodes.filter(i => i.isModernFormat).length;
    { const _el = document.getElementById('stat-img-modern'); if (_el) _el.textContent = modernCount; }
  }
  if (data.imgNoAlt === 0) {
    document.getElementById('stat-noalt-card')?.classList.remove('stat-card-warn');
  }
  if (data.imgNodes) renderImagesTab(data.imgNodes, data.imgTotal);

  // ── SCHEMA ──
  renderSchemaTab(data);
  _afterRenderSchemaTab();

  // ── CHECKS TAB ──
  renderCategories(data.categories || []);

  // Store for lazy graph render
  graphData = data;

  // Notifica o chat NIM que a página foi atualizada
  if (typeof nimOnPageUpdate === 'function') nimOnPageUpdate(data.url);

  // ── SEMANTIC TAB ──
  renderSemantic(data.semantic || null);

  // ── CHUNKS AEO TAB ──
  renderChunks(data.chunks || null);

  // Init AI send button (headings)
  initAISend();

  // Toolbar de links
  if (data.linkNodes) {
    initLinksToolbar(data.linkNodes, data.url);
  }

  // Botão fullscreen de links — listener adicionado após renderLinksTab para garantir que o botão existe
  setTimeout(() => {
    const juiceFullBtn = document.getElementById('juice-fullscreen-btn');
    if (juiceFullBtn) {
      juiceFullBtn.replaceWith(juiceFullBtn.cloneNode(true)); // remove listeners antigos
      document.getElementById('juice-fullscreen-btn')
        .addEventListener('click', () => openLinksFullscreen(data.linkNodes, data.url));
    }

    // Botão "Ver mapa do site" (crawl multi-nível)
    const crawlBtn = document.getElementById('links-crawl-btn');
    if (crawlBtn) {
      crawlBtn.replaceWith(crawlBtn.cloneNode(true));
      document.getElementById('links-crawl-btn')
        .addEventListener('click', () => openCrawlFullscreen(data.linkNodes, data.url));
    }
  }, 0);
}

async function openLinksFullscreen(linkNodes, pageUrl) {
  try {
    await chrome.storage.local.set({
      seo_links_fullscreen: { linkNodes, pageUrl, timestamp: Date.now() }
    });
    // Abre diretamente sem depender do background service worker
    chrome.tabs.create({ url: chrome.runtime.getURL('links_fullscreen.html') });
  } catch (err) {
    console.error('openLinksFullscreen error:', err);
  }
}

async function openCrawlFullscreen(linkNodes, pageUrl) {
  try {
    await chrome.storage.local.set({
      seo_crawl_start: { startUrl: pageUrl, linkNodes, timestamp: Date.now() }
    });
    chrome.tabs.create({ url: chrome.runtime.getURL('crawl_fullscreen.html') });
  } catch (err) {
    console.error('openCrawlFullscreen error:', err);
  }
}

// ── Links toolbar: copy + AI ─────────────────────────────────────────────────
let _linksDataForAI = null;

function initLinksToolbar(linkNodes, pageUrl) {
  _linksDataForAI = { linkNodes, pageUrl };

  // Contagem na toolbar
  const internal = linkNodes.filter(l => l.isInternal);
  const countEl  = document.getElementById('links-toolbar-count');
  if (countEl) countEl.textContent = `${internal.length} internos · ${linkNodes.length - internal.length} externos`;

  // Copy links
  const copyBtn = document.getElementById('copy-links');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const text = buildLinksCopyText(linkNodes);
      navigator.clipboard.writeText(text).then(() => {
        const orig = copyBtn.innerHTML;
        copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Copiado!`;
        copyBtn.classList.add('copied');
        setTimeout(() => { copyBtn.innerHTML = orig; copyBtn.classList.remove('copied'); }, 2000);
      });
    });
  }

  // Dropdown IA
  const aiBtn  = document.getElementById('links-ai-send-btn');
  const aiDrop = document.getElementById('links-ai-dropdown');
  if (aiBtn && aiDrop) {
    aiBtn.addEventListener('click', e => { e.stopPropagation(); aiDrop.classList.toggle('open'); });
    document.addEventListener('click', () => aiDrop.classList.remove('open'));
    aiDrop.querySelectorAll('[data-links-ai]').forEach(opt => {
      opt.addEventListener('click', () => {
        aiDrop.classList.remove('open');
        sendLinksToAI(opt.dataset.linksAi);
      });
    });
  }

  // Card educativo — toggle
  const eduToggle = document.getElementById('links-edu-toggle');
  const eduBody   = document.getElementById('links-edu-body');
  const eduChevron = eduToggle?.querySelector('.links-edu-chevron');
  if (eduToggle && eduBody) {
    eduToggle.addEventListener('click', () => {
      const open = eduBody.style.display !== 'none';
      eduBody.style.display = open ? 'none' : 'flex';
      if (eduChevron) eduChevron.classList.toggle('open', !open);
    });
  }
}

function buildLinksCopyText(linkNodes) {
  const internal = linkNodes.filter(l => l.isInternal);
  const external = linkNodes.filter(l => !l.isInternal);

  const rows = (list, label) => list.length
    ? `## ${label}\n` + list.map(l =>
        `- [${l.anchor || '(sem texto)'}](${l.href})${l.nofollow ? ' [nofollow]' : ''}`
      ).join('\n')
    : '';

  return [rows(internal, 'Links Internos'), rows(external, 'Links Externos')]
    .filter(Boolean).join('\n\n');
}

function buildLinksPrompt(linkNodes, pageUrl) {
  const internal = linkNodes.filter(l => l.isInternal);
  const GENERIC  = new Set(['clique aqui','aqui','saiba mais','leia mais','ver mais','acesse','more','here']);

  // Monta mapa de destinos com âncoras
  const destMap = new Map();
  internal.forEach(l => {
    let p = l.href;
    try { p = new URL(l.href.startsWith('http') ? l.href : 'http://x' + l.href).pathname; } catch {}
    if (!destMap.has(p)) destMap.set(p, { anchors: [], nofollow: true });
    const d = destMap.get(p);
    if (l.anchor && !d.anchors.includes(l.anchor)) d.anchors.push(l.anchor);
    if (!l.nofollow) d.nofollow = false;
  });

  const destLines = [...destMap.entries()].map(([path, d]) => {
    const anchorStr = d.anchors.length ? d.anchors.map(a => `"${a}"`).join(', ') : '(sem âncora)';
    const nfTag = d.nofollow ? ' [nofollow]' : '';
    const genericCount = d.anchors.filter(a => GENERIC.has(a.toLowerCase())).length;
    const warn = genericCount > 0 ? ` ⚠ ${genericCount} âncora(s) genérica(s)` : '';
    return `- ${path}${nfTag}${warn}\n  Âncoras: ${anchorStr}`;
  }).join('\n');

  const genericTotal = internal.filter(l => GENERIC.has((l.anchor || '').toLowerCase().trim())).length;
  const nofollowInt  = internal.filter(l => l.nofollow).length;

  return `Você é um especialista em SEO técnico e linkagem interna. Analise a estrutura de links internos da página abaixo e forneça uma auditoria completa.

**URL da página:** ${pageUrl}
**Total de links internos:** ${internal.length}
**Âncoras genéricas:** ${genericTotal} (${internal.length > 0 ? Math.round(genericTotal/internal.length*100) : 0}%)
**Links nofollow internos:** ${nofollowInt}

## Destinos internos e âncoras utilizadas
${destLines || '(nenhum link interno encontrado)'}

## O que analisar:
1. **Âncoras genéricas** — "clique aqui", "saiba mais" etc. não passam contexto ao Google. Sugira textos descritivos com keywords para cada caso
2. **Distribuição de link juice** — Alguma página estratégica está recebendo poucos links? Alguma recebe links demais sem necessidade?
3. **Nofollow interno** — Há links internos com rel=nofollow que estão bloqueando PageRank desnecessariamente?
4. **Oportunidades perdidas** — Baseado nas páginas destino, quais âncoras com keywords de negócio deveriam ser usadas mas não estão?
5. **Páginas que deveriam receber mais links** — Baseado nas URLs, identifique as páginas comerciais/estratégicas e verifique se estão bem linkadas

Seja específico: para cada problema, mostre a âncora atual e sugira a âncora ideal com a keyword.`;
}

function sendLinksToAI(ai) {
  if (!_linksDataForAI) return;
  const { linkNodes, pageUrl } = _linksDataForAI;

  const btn = document.getElementById('links-ai-send-btn');
  const orig = btn.innerHTML;
  btn.innerHTML = `<span style="font-size:11px;opacity:.7">Preparando...</span>`;
  btn.disabled = true;

  const prompt  = buildLinksPrompt(linkNodes, pageUrl);
  const encoded = encodeURIComponent(prompt);
  const urls = {
    claude:     `https://claude.ai/new?q=${encoded}`,
    chatgpt:    `https://chatgpt.com/?q=${encoded}`,
    gemini:     `https://gemini.google.com/app?q=${encoded}`,
    perplexity: `https://www.perplexity.ai/?q=${encoded}`,
  };

  if (urls[ai]) chrome.tabs.create({ url: urls[ai] });
  btn.innerHTML = orig;
  btn.disabled  = false;
}

// ─────────────────────────────────────────────
// Render 16-category accordion in Checks tab
// ─────────────────────────────────────────────
function renderCategories(categories) {
  const container = document.getElementById('checks-list');
  if (!container) return;
  container.innerHTML = '';

  if (!categories.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:20px;text-align:center;">Sem dados de análise disponíveis.</p>';
    return;
  }

  // Summary counts
  let totalPass = 0, totalWarn = 0, totalFail = 0;
  categories.forEach(cat => {
    (cat.checks || []).forEach(c => {
      if (c.status === 'pass') totalPass++;
      else if (c.status === 'warn') totalWarn++;
      else if (c.status === 'fail') totalFail++;
    });
  });

  const summary = document.createElement('div');
  summary.className = 'checks-summary';
  summary.innerHTML = `
    <div class="checks-summary-stat">
      <div class="checks-summary-dot" style="background:var(--green)"></div>
      ${totalPass} pass
    </div>
    <div class="checks-summary-stat">
      <div class="checks-summary-dot" style="background:var(--yellow)"></div>
      ${totalWarn} warn
    </div>
    <div class="checks-summary-stat">
      <div class="checks-summary-dot" style="background:var(--red)"></div>
      ${totalFail} fail
    </div>
    <div class="checks-summary-stat" style="margin-left:auto;font-family:'Space Mono',monospace;font-size:11px;color:var(--text-muted);">
      ${categories.length} categories
    </div>
  `;
  container.appendChild(summary);

  // Category cards
  categories.forEach(cat => {
    const score = cat.score ?? 0;
    const scoreColor = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--accent)' : score >= 40 ? 'var(--yellow)' : 'var(--red)';
    const scoreClass = score >= 80 ? 'score-green' : score >= 60 ? 'score-purple' : score >= 40 ? 'score-yellow' : 'score-red';

    const card = document.createElement('div');
    card.className = 'cat-card';

    const header = document.createElement('div');
    header.className = 'cat-header';
    header.innerHTML = `
      <div class="cat-header-left">
        <span class="cat-name">${escHtml(cat.category)}</span>
        <div class="cat-mini-bar">
          <div class="cat-mini-fill" style="width:${score}%;background:${scoreColor}"></div>
        </div>
      </div>
      <span class="cat-score ${scoreClass}">${score}</span>
      <svg class="cat-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
    `;

    const body = document.createElement('div');
    body.className = 'cat-body';

    const checksDiv = document.createElement('div');
    checksDiv.className = 'cat-checks';

    (cat.checks || []).forEach(chk => {
      const item = document.createElement('div');
      item.className = 'check-item';
      item.innerHTML = `
        <div class="check-dot ${chk.status}"></div>
        <div class="check-text">
          <div class="check-label">${escHtml(chk.label || '')}</div>
          ${chk.detail ? `<div class="check-detail">${escHtml(chk.detail)}</div>` : ''}
        </div>
        <span class="check-status-tag ${chk.status}">${chk.status.toUpperCase()}</span>
      `;
      checksDiv.appendChild(item);
    });

    body.appendChild(checksDiv);

    header.addEventListener('click', () => {
      const isOpen = body.classList.toggle('open');
      header.querySelector('.cat-chevron').style.transform = isOpen ? 'rotate(180deg)' : '';
    });

    card.appendChild(header);
    card.appendChild(body);
    container.appendChild(card);
  });
}

// ══════════════════════════════════════════════════════════════
// SCHEMA KNOWLEDGE BASE v1.0
// 30 experts em dados estruturados — jun/2025
// Fonte: Google Search Central + schema.org + dados empíricos CTR
// ══════════════════════════════════════════════════════════════
const SCHEMA_KNOWLEDGE_BASE = {
  LocalBusiness: {
    googleDocsUrl: 'https://developers.google.com/search/docs/appearance/local-business',
    lastVerified: '2025-06',
    richResultFeatures: [
      { feature: 'Local Pack (3-pack)', ctrBoostPct: 35, requires: ['name','address','geo','openingHoursSpecification'] },
      { feature: 'Knowledge Panel', ctrBoostPct: 15, requires: ['name','address','telephone','aggregateRating'] },
      { feature: 'Rating Stars (SERP)', ctrBoostPct: 18, requires: ['aggregateRating'] },
      { feature: 'Aberto Agora Badge', ctrBoostPct: 8, requires: ['openingHoursSpecification'] },
      { feature: 'Google Maps Integration', ctrBoostPct: 12, requires: ['geo','address','telephone'] },
    ],
    requiredForRichResult: ['name','address','telephone','geo'],
    criticalFields: {
      aggregateRating: { impact: 'Crítico', ctrBoost: '+18%', example: '{"@type":"AggregateRating","ratingValue":"4.8","ratingCount":"2547"}' },
      openingHoursSpecification: { impact: 'Crítico', ctrBoost: '+8%', example: '[{"@type":"OpeningHoursSpecification","dayOfWeek":["Monday"],"opens":"08:00","closes":"18:00"}]' },
      geo: { impact: 'Crítico', ctrBoost: '+12%', example: '{"@type":"GeoCoordinates","latitude":"-16.6869","longitude":"-49.2648"}' },
      '@id': { impact: 'Alto', ctrBoost: '+8%', example: '"https://seusite.com.br/#empresa"' },
    },
    deprecations: [
      { field: 'geo como string', since: '2020', reason: 'Google exige GeoCoordinates object', alternative: '{"@type":"GeoCoordinates","latitude":"...","longitude":"..."}' },
    ],
    commonMistakes: [
      'Latitude/longitude errados — verificar no Google Maps',
      'openingHoursSpecification sem dayOfWeek como array',
      'aggregateRating.ratingValue como string em vez de número',
      'address sem postalCode',
      'telephone sem código de país +55',
    ],
    brazilSpecific: [
      'telephone: "+55 62 99999-9999" (E.164)',
      'postalCode: CEP "74000-070"',
      'addressCountry: "BR"',
      'addressRegion: sigla do estado (GO, SP, MG)',
    ],
    eeaSignals: ['aggregateRating com ratingCount >100','sameAs com Wikipedia/Wikidata','legalName + taxID (CNPJ)'],
    contentSignals: ['Endereço visível no HTML','Horário no HTML','Fotos reais da fachada','Reviews visíveis'],
  },
  Organization: {
    googleDocsUrl: 'https://developers.google.com/search/docs/appearance/structured-data/organization',
    lastVerified: '2025-06',
    richResultFeatures: [
      { feature: 'Knowledge Panel', ctrBoostPct: 12, requires: ['name','logo','sameAs'] },
      { feature: 'Knowledge Graph Entity', ctrBoostPct: 8, requires: ['@id','sameAs','url'] },
    ],
    requiredForRichResult: ['name','url','logo'],
    criticalFields: {
      '@id': { impact: 'Crítico', ctrBoost: '+8%', example: '"https://seusite.com.br/#org"' },
      logo: { impact: 'Crítico', ctrBoost: '+5%', example: '{"@type":"ImageObject","url":"https://...","width":600,"height":60}' },
      sameAs: { impact: 'Crítico', ctrBoost: '+8%', example: '["https://pt.wikipedia.org/wiki/...","https://www.wikidata.org/wiki/Q123456"]' },
    },
    deprecations: [
      { field: 'contact (antigo)', since: '2017', reason: 'Deprecado', alternative: 'contactPoint com telephone + contactType' },
    ],
    commonMistakes: [
      'logo <600px ou proporção errada',
      '@id diferente entre páginas',
      'sameAs com URL LinkedIn errada',
      'foundingDate como "2010" em vez de ISO 8601',
    ],
    brazilSpecific: [
      'legalName: Razão Social exata do CNPJ',
      'taxID: CNPJ "12.345.678/0001-90"',
      'areaServed: ["Brasil","Goiás"] para multi-região',
    ],
    eeaSignals: ['sameAs Wikipedia + Wikidata','legalName + taxID','foundingDate + numberOfEmployees'],
    contentSignals: ['Página Sobre >300 chars','Equipe com fotos e bio','Certificações','Endereço + Maps'],
  },
  Article: {
    googleDocsUrl: 'https://developers.google.com/search/docs/appearance/structured-data/article',
    lastVerified: '2025-06',
    richResultFeatures: [
      { feature: 'Google Discover', ctrBoostPct: 45, requires: ['image','datePublished','author'] },
      { feature: 'Top Stories Carousel', ctrBoostPct: 30, requires: ['datePublished','image','isAccessibleForFree'] },
      { feature: 'News Rich Results', ctrBoostPct: 25, requires: ['datePublished','author','publisher'] },
    ],
    requiredForRichResult: ['headline','datePublished','author','image'],
    criticalFields: {
      image: { impact: 'Crítico', ctrBoost: '+45%', example: '{"@type":"ImageObject","url":"https://...","width":1200,"height":630}' },
      datePublished: { impact: 'Crítico', ctrBoost: '+25%', example: '"2025-06-06T14:30:00-03:00"' },
      dateModified: { impact: 'Crítico', ctrBoost: '+12%', example: 'Sempre >= datePublished (freshness)' },
      author: { impact: 'Alto', ctrBoost: '+15%', example: '{"@type":"Person","name":"Nome Autor","sameAs":"https://linkedin.com/in/..."}' },
    },
    deprecations: [],
    commonMistakes: [
      'headline >110 chars (Google trunca)',
      'image <1200px — rejeitado pelo Discover',
      'datePublished sem hora e timezone',
      'author sem name',
    ],
    brazilSpecific: ['inLanguage: "pt-BR"','datePublished: timezone -03:00'],
    eeaSignals: ['author com bio completa (jobTitle, worksFor, sameAs)','dateModified <30 dias','citations para fontes oficiais'],
    contentSignals: ['Headline 55-70 chars','Lead 150-200 chars','H2→H3 progressivo','Mínimo 2 imagens'],
  },
  Product: {
    googleDocsUrl: 'https://developers.google.com/search/docs/appearance/structured-data/product',
    lastVerified: '2025-06',
    richResultFeatures: [
      { feature: 'Google Shopping Card', ctrBoostPct: 50, requires: ['name','image','offers','aggregateRating'] },
      { feature: 'Rating Stars (SERP)', ctrBoostPct: 28, requires: ['aggregateRating'] },
      { feature: 'Product Knowledge Panel', ctrBoostPct: 15, requires: ['brand','image','description'] },
    ],
    requiredForRichResult: ['name','image','offers'],
    criticalFields: {
      offers: { impact: 'Crítico', ctrBoost: '+50%', example: '{"@type":"Offer","price":"199.90","priceCurrency":"BRL","availability":"https://schema.org/InStock"}' },
      aggregateRating: { impact: 'Crítico', ctrBoost: '+28%', example: '{"@type":"AggregateRating","ratingValue":"4.7","ratingCount":"1523"}' },
      image: { impact: 'Crítico', ctrBoost: '+35%', example: 'Array de URLs — mínimo 1200px' },
    },
    deprecations: [
      { field: 'price sem currency', since: '2018', reason: 'Google ignora sem moeda', alternative: 'Sempre usar priceCurrency: "BRL"' },
    ],
    commonMistakes: [
      'offers como objeto único em vez de array',
      'availability como string em vez de URI schema.org',
      'aggregateRating sem ratingCount',
      'price com símbolo R$ em vez de número puro',
    ],
    brazilSpecific: ['priceCurrency: "BRL"','price: "199.90" (ponto decimal)','gtin13: EAN-13 com 13 dígitos'],
    eeaSignals: ['aggregateRating.ratingCount >500','reviews de clientes reais','brand com sameAs'],
    contentSignals: ['Descrição >300 chars','3+ imagens de ângulos','Tabela de specs','Reviews visíveis'],
  },
  FAQPage: {
    googleDocsUrl: 'https://developers.google.com/search/docs/appearance/faq-page',
    lastVerified: '2025-06',
    richResultFeatures: [
      { feature: 'FAQ Accordion (SERP)', ctrBoostPct: 0, requires: [], note: 'APENAS governo + saúde desde ago/2023' },
      { feature: 'Indexação semântica', ctrBoostPct: 5, requires: ['mainEntity'] },
    ],
    requiredForRichResult: ['mainEntity'],
    criticalFields: {
      mainEntity: { impact: 'Crítico', ctrBoost: '+5%', example: '[{"@type":"Question","name":"Pergunta?","acceptedAnswer":{"@type":"Answer","text":"Resposta..."}}]' },
    },
    deprecations: [
      { field: 'FAQPage rich results (geral)', since: '2023-08', reason: 'Limitado a governo/saúde', alternative: 'Manter para indexação semântica' },
    ],
    commonMistakes: ['Esperar accordion em site não-gov/saúde','mainEntity como objeto único','acceptedAnswer.text vazio'],
    brazilSpecific: ['Perguntas em português natural'],
    eeaSignals: ['FAQ com dados do Search Console (perguntas reais)'],
    contentSignals: ['Mínimo 10 pares','Respostas 150-300 chars','HTML estruturado'],
  },
  Person: {
    googleDocsUrl: 'https://developers.google.com/search/docs/appearance/structured-data/person',
    lastVerified: '2025-06',
    richResultFeatures: [
      { feature: 'Author Knowledge Panel', ctrBoostPct: 12, requires: ['name','image','sameAs'] },
    ],
    requiredForRichResult: ['name','image','sameAs'],
    criticalFields: {
      sameAs: { impact: 'Crítico', ctrBoost: '+12%', example: '["https://linkedin.com/in/...","https://twitter.com/..."]' },
      '@id': { impact: 'Crítico', ctrBoost: '+8%', example: '"https://seusite.com.br/#autor"' },
      jobTitle: { impact: 'Alto', ctrBoost: '+5%', example: '"Especialista em SEO CRM 12345/SP"' },
    },
    deprecations: [],
    commonMistakes: ['sameAs com perfil LinkedIn errado','image genérica','jobTitle vago','@id inconsistente'],
    brazilSpecific: ['jobTitle: incluir credenciais (CRM, OAB, CREA)','sameAs: LinkedIn + Lattes'],
    eeaSignals: ['sameAs com 3+ perfis verificados','jobTitle com credenciais','alumniOf + award'],
    contentSignals: ['Bio 300-500 chars','Foto profissional','Links para perfis','Credenciais com logos'],
  },
  WebSite: {
    googleDocsUrl: 'https://developers.google.com/search/docs/appearance/structured-data/website',
    lastVerified: '2025-06',
    richResultFeatures: [
      { feature: 'Sitelinks Search Box', ctrBoostPct: 8, requires: ['potentialAction'] },
    ],
    requiredForRichResult: ['name','url'],
    criticalFields: {
      potentialAction: { impact: 'Crítico', ctrBoost: '+8%', example: '{"@type":"SearchAction","target":{"@type":"EntryPoint","urlTemplate":"https://site.com/?s={search_term_string}"},"query-input":"required name=search_term_string"}' },
    },
    deprecations: [],
    commonMistakes: ['URL template errado','URL relativa','inLanguage omitido'],
    brazilSpecific: ['inLanguage: "pt-BR"'],
    eeaSignals: [],
    contentSignals: ['Navegação clara','Busca funcional'],
  },
  Event: {
    googleDocsUrl: 'https://developers.google.com/search/docs/appearance/structured-data/event',
    lastVerified: '2025-06',
    richResultFeatures: [
      { feature: 'Event Rich Card', ctrBoostPct: 35, requires: ['name','image','startDate','offers'] },
      { feature: 'Google Events Carousel', ctrBoostPct: 25, requires: ['eventAttendanceMode'] },
    ],
    requiredForRichResult: ['name','startDate','location','eventAttendanceMode'],
    criticalFields: {
      eventAttendanceMode: { impact: 'Crítico', ctrBoost: '+25%', example: '"OfflineEventAttendanceMode"' },
      offers: { impact: 'Crítico', ctrBoost: '+30%', example: '{"@type":"Offer","url":"...","price":"50.00","priceCurrency":"BRL"}' },
    },
    deprecations: [
      { field: 'startDate sem hora', since: '2021', reason: 'Ambiguidade de timezone', alternative: '"2025-06-15T18:00:00-03:00"' },
    ],
    commonMistakes: ['eventAttendanceMode omitido','startDate no passado','location sem streetAddress'],
    brazilSpecific: ['startDate: timezone -03:00','priceCurrency: "BRL"'],
    eeaSignals: ['organizer com sameAs','offers com validFrom/validThrough'],
    contentSignals: ['Descrição >300 chars','Local com endereço','Botão de inscrição visível'],
  },
  VideoObject: {
    googleDocsUrl: 'https://developers.google.com/search/docs/appearance/structured-data/video',
    lastVerified: '2025-06',
    richResultFeatures: [
      { feature: 'Video Rich Result', ctrBoostPct: 50, requires: ['name','thumbnailUrl','uploadDate','contentUrl'] },
      { feature: 'Key Moments', ctrBoostPct: 15, requires: ['hasPart'] },
    ],
    requiredForRichResult: ['name','description','thumbnailUrl','uploadDate'],
    criticalFields: {
      contentUrl: { impact: 'Crítico', ctrBoost: '+50%', example: 'URL direta do .mp4' },
      duration: { impact: 'Crítico', ctrBoost: '+25%', example: '"PT1H30M45S"' },
      thumbnailUrl: { impact: 'Crítico', ctrBoost: '+30%', example: 'Mínimo 1200×720px' },
    },
    deprecations: [{ field: 'videoUrl', since: '2018', reason: 'Deprecado', alternative: 'contentUrl' }],
    commonMistakes: ['thumbnailUrl <1000px','duration inválido','uploadDate >1 ano','description <100 chars'],
    brazilSpecific: ['inLanguage: "pt-BR"'],
    eeaSignals: ['publisher com logo','interactionStatistic'],
    contentSignals: ['Vídeo >2 min','Título 55-70 chars','Descrição >300 chars'],
  },
  BreadcrumbList: {
    googleDocsUrl: 'https://developers.google.com/search/docs/appearance/structured-data/breadcrumb',
    lastVerified: '2025-06',
    richResultFeatures: [
      { feature: 'Breadcrumb Path (SERP)', ctrBoostPct: 3, requires: ['itemListElement'] },
    ],
    requiredForRichResult: ['itemListElement'],
    criticalFields: {
      'itemListElement[].position': { impact: 'Crítico', ctrBoost: '+3%', example: 'Inteiro começando em 1' },
    },
    deprecations: [],
    commonMistakes: ['position começando em 0','item com URL relativa','name >60 chars'],
    brazilSpecific: [],
    eeaSignals: ['Breadcrumb >4 níveis'],
    contentSignals: ['Breadcrumb visível no HTML'],
  },
  Course: {
    googleDocsUrl: 'https://developers.google.com/search/docs/appearance/structured-data/course',
    lastVerified: '2025-06',
    richResultFeatures: [
      { feature: 'Course Rich Result', ctrBoostPct: 25, requires: ['name','description','provider'] },
    ],
    requiredForRichResult: ['name','description','provider'],
    criticalFields: {
      hasCourseInstance: { impact: 'Crítico', ctrBoost: '+20%', example: '[{"@type":"CourseInstance","courseMode":"Online","startDate":"2025-03-01"}]' },
    },
    deprecations: [],
    commonMistakes: ['hasCourseInstance vazio','courseMode inválido','provider sem name'],
    brazilSpecific: ['inLanguage: "pt-BR"','occupationalCredentialAwarded: credencial MEC/ABNT'],
    eeaSignals: ['provider com sameAs','aggregateRating.ratingCount >200'],
    contentSignals: ['Descrição >300 chars','Módulos listados','Currículo do instrutor'],
  },
  HowTo: {
    googleDocsUrl: 'https://developers.google.com/search/docs/appearance/structured-data/how-to',
    lastVerified: '2025-06',
    richResultFeatures: [
      { feature: 'How-To Mobile', ctrBoostPct: 25, requires: ['name','step'] },
      { feature: 'How-To Desktop', ctrBoostPct: 0, requires: [], note: 'DESCONTINUADO set/2023' },
    ],
    requiredForRichResult: ['name','step'],
    criticalFields: {
      step: { impact: 'Crítico', ctrBoost: '+25%', example: '[{"@type":"HowToStep","name":"Passo","text":"Instrução...","image":"..."}]' },
      totalTime: { impact: 'Alto', ctrBoost: '+8%', example: '"PT30M"' },
    },
    deprecations: [{ field: 'HowTo desktop', since: '2023-09', reason: 'Descontinuado', alternative: 'Manter para mobile' }],
    commonMistakes: ['Esperar no desktop','step sem image','totalTime como string'],
    brazilSpecific: ['Instruções em português'],
    eeaSignals: ['image por passo'],
    contentSignals: ['Mínimo 3 passos','Imagem por passo'],
  },
  Service: {
    googleDocsUrl: 'https://developers.google.com/search/docs/appearance/structured-data/service',
    lastVerified: '2025-06',
    richResultFeatures: [
      { feature: 'Service Rich Result', ctrBoostPct: 18, requires: ['name','provider','aggregateRating'] },
    ],
    requiredForRichResult: ['name','provider','description'],
    criticalFields: {
      areaServed: { impact: 'Crítico', ctrBoost: '+15%', example: '[{"@type":"City","name":"Goiânia"}]' },
      aggregateRating: { impact: 'Alto', ctrBoost: '+18%', example: '{"ratingValue":"4.8","ratingCount":"1523"}' },
    },
    deprecations: [],
    commonMistakes: ['areaServed como string','aggregateRating.ratingValue >5'],
    brazilSpecific: ['areaServed: nomes completos PT-BR','serviceType em português'],
    eeaSignals: ['aggregateRating.ratingCount >500','provider com sameAs'],
    contentSignals: ['Descrição >200 chars','Portfolio/cases','Precificação clara'],
  },
};

// ══════════════════════════════════════════════════════════════
// SCHEMA VALIDATION ENGINE
// Baseado em: Google Rich Results requirements + schema.org docs
// ══════════════════════════════════════════════════════════════

// ── SCHEMA RULES v2.0 — baseado em Google Search Central + Schema.org ─────────
// Fonte: https://developers.google.com/search/docs/appearance/structured-data
// Atualizado: junho 2025. Cobre 30 tipos, validação de formato aninhado,
// regras de negócio específicas por tipo e alertas de deprecação.
const SCHEMA_RULES = {

  // ── NEGÓCIOS E LOCAIS ────────────────────────────────────────────
  LocalBusiness: {
    required:    ['name', 'address'],
    recommended: ['telephone', 'url', 'openingHoursSpecification', 'priceRange', 'image', 'geo', 'aggregateRating', 'sameAs', '@id', 'description', 'currenciesAccepted', 'paymentAccepted', 'hasMap'],
    richResult: true,
    nestedRequired: {
      address: ['streetAddress', 'addressLocality', 'addressCountry'],
      geo:     ['latitude', 'longitude'],
    },
    suggestions: {
      address:                   'PostalAddress com streetAddress, addressLocality, addressRegion, postalCode, addressCountry.',
      telephone:                 'Formato E.164 recomendado: "+55 62 99999-9999". Aparece no painel de conhecimento e Google Maps.',
      openingHoursSpecification: 'Array com dayOfWeek, opens e closes. Habilita "Aberto agora" na SERP.',
      priceRange:                '"$", "$$", "$$$" ou faixa "R$ 50–200". Aparece nos rich results.',
      image:                     'URL absoluta, mínimo 1200×630px. Essencial para Knowledge Panel.',
      geo:                       'GeoCoordinates com latitude e longitude. Melhora precisão no Google Maps.',
      aggregateRating:           'ratingValue + ratingCount. Exibe estrelas na SERP — alto impacto CTR.',
      sameAs:                    'URLs oficiais: site, redes sociais, Wikidata, Google Maps. Conecta ao Knowledge Graph.',
      '@id':                     'URL canônica da entidade. Ex: "https://seusite.com.br/#empresa". Âncora do Knowledge Graph.',
      hasMap:                    'Link para o Google Maps. Melhora descoberta local.',
    },
  },

  Organization: {
    required:    ['name'],
    recommended: ['url', 'logo', 'sameAs', 'contactPoint', 'address', 'description', '@id', 'foundingDate', 'numberOfEmployees', 'legalName', 'taxID', 'telephone', 'email', 'areaServed'],
    richResult: true,
    nestedRequired: {
      logo:         ['url'],
      contactPoint: ['telephone', 'contactType'],
    },
    suggestions: {
      logo:           'ImageObject com url. Dimensão recomendada: 600×60px. Aparece no painel de conhecimento.',
      sameAs:         'LinkedIn, Instagram, Facebook, Twitter/X, YouTube, Wikipedia, Wikidata. Consolida autoridade de entidade.',
      contactPoint:   'telephone + contactType ("customer service", "sales", "technical support").',
      '@id':          'URL canônica da organização. Ex: "https://seusite.com.br/#org". Âncora global para todos os outros schemas.',
      foundingDate:   'ISO 8601 (YYYY). Fortalece confiança e E-E-A-T.',
      legalName:      'Razão social. Importante para E-E-A-T e Knowledge Panel.',
      taxID:          'CNPJ/CPF. Sinal de entidade verificável.',
      areaServed:     'País, estado ou cidade. Ex: "Goiás", "Brasil".',
    },
  },

  ProfessionalService: {
    required:    ['name', 'address'],
    recommended: ['telephone', 'url', 'image', 'priceRange', 'openingHoursSpecification', 'sameAs', '@id', 'aggregateRating', 'hasOfferCatalog', 'serviceArea'],
    richResult: true,
    nestedRequired: {
      address: ['streetAddress', 'addressLocality', 'addressCountry'],
    },
    suggestions: {
      hasOfferCatalog: 'Catálogo de serviços com OfferCatalog. Melhora visibilidade de cada serviço.',
      serviceArea:     'GeoCircle ou GeoShape definindo área de atuação.',
      aggregateRating: 'ratingValue + ratingCount. Estrelas na SERP para serviços profissionais.',
    },
  },

  // ── CONTEÚDO EDITORIAL ───────────────────────────────────────────
  Article: {
    required:    ['headline', 'datePublished', 'author'],
    recommended: ['dateModified', 'description', 'publisher', 'image', 'articleBody', 'keywords', 'wordCount', 'inLanguage', 'mainEntityOfPage', '@id', 'isAccessibleForFree', 'speakable'],
    richResult: true,
    nestedRequired: {
      author:    ['name'],
      publisher: ['name', 'logo'],
      image:     ['url'],
    },
    suggestions: {
      headline:          'Máximo 110 caracteres. O Google trunca acima disso nos rich results.',
      dateModified:      'ISO 8601. Indica freshness — o Google prioriza conteúdo atualizado.',
      publisher:         'Organization com name e logo. Obrigatório para Google News e Discover.',
      image:             'ImageObject com url, width, height. Mínimo 1200×630px para rich results no Discover.',
      author:            'Person ou Organization com name. Para E-E-A-T, adicione sameAs com perfil do autor.',
      mainEntityOfPage:  'WebPage com @id apontando para URL canônica do artigo.',
      speakable:         'CSS selectors para Google Assistant. Habilita leitura de notícias por voz.',
      isAccessibleForFree: '"True" se o conteúdo é gratuito. Sinal importante para Google News.',
    },
  },

  NewsArticle: {
    required:    ['headline', 'datePublished', 'author', 'image'],
    recommended: ['dateModified', 'publisher', 'description', 'articleBody', 'keywords', 'inLanguage', 'mainEntityOfPage', 'isAccessibleForFree', 'speakable'],
    richResult: true,
    nestedRequired: {
      author:    ['name'],
      publisher: ['name', 'logo'],
    },
    note: 'Para Google News: publisher.logo deve ter máximo 600×60px e ser em fundo branco. Formato AMP recomendado para cobertura no Top Stories.',
    suggestions: {
      speakable:         'Essencial para Google Assistente e rádio de notícias por IA.',
      isAccessibleForFree: '"True" para conteúdo gratuito. Evita penalidade de paywall.',
    },
  },

  BlogPosting: {
    required:    ['headline', 'datePublished', 'author'],
    recommended: ['dateModified', 'description', 'publisher', 'image', 'keywords', 'mainEntityOfPage', 'wordCount', 'inLanguage'],
    richResult: true,
    nestedRequired: {
      author:    ['name'],
      publisher: ['name'],
    },
    suggestions: {
      keywords:   'Palavras-chave separadas por vírgula. Ajuda na associação semântica.',
      wordCount:  'Número de palavras. Sinal de profundidade de conteúdo.',
    },
  },

  // ── E-COMMERCE ───────────────────────────────────────────────────
  Product: {
    required:    ['name'],
    recommended: ['offers', 'description', 'image', 'aggregateRating', 'brand', 'sku', 'gtin', 'gtin13', 'gtin8', 'mpn', 'color', 'material', 'weight', 'review', '@id', 'category'],
    richResult: true,
    nestedRequired: {
      offers:          ['price', 'priceCurrency', 'availability'],
      aggregateRating: ['ratingValue', 'ratingCount'],
      brand:           ['name'],
    },
    note: 'Google exige offers.price + offers.priceCurrency + offers.availability para rich results de Produto. Sem isso, o schema é válido mas não gera snippet de produto na SERP.',
    suggestions: {
      offers:          'Offer com price, priceCurrency ("BRL"), availability ("InStock"), url, priceValidUntil.',
      aggregateRating: 'ratingValue (0–5) + ratingCount. Estrelas na SERP — impacto direto em CTR.',
      sku:             'Código único do produto. Melhora correspondência no Google Shopping.',
      gtin13:          'EAN-13 (código de barras). Conecta ao catálogo global do Google.',
      brand:           'Organization ou Brand com name. Fortalece entidade no Knowledge Graph.',
      category:        'Categoria do produto. Ex: "Eletrodomésticos > Geladeiras".',
    },
  },

  Offer: {
    required:    ['price', 'priceCurrency'],
    recommended: ['availability', 'priceValidUntil', 'url', 'seller', 'shippingDetails', 'hasMerchantReturnPolicy'],
    richResult: false,
    suggestions: {
      availability:    '"https://schema.org/InStock", "OutOfStock", "PreOrder".',
      priceValidUntil: 'ISO 8601. O Google pode ignorar preços sem data de validade.',
      shippingDetails: 'OfferShippingDetails — habilita rich result de frete estimado.',
    },
  },

  // ── PERGUNTAS E RESPOSTAS ────────────────────────────────────────
  FAQPage: {
    required:    ['mainEntity'],
    recommended: [],
    richResult: true,
    nestedRequired: {
      mainEntity: ['name', 'acceptedAnswer'],
    },
    note: 'ATENÇÃO: Desde agosto de 2023, FAQPage rich results são exibidos apenas para sites governamentais e de saúde. Para outros sites, o schema é válido e indexado mas NÃO gera o accordion na SERP.',
    suggestions: {
      mainEntity: 'Array de Question. Cada Question precisa de "name" (pergunta) e "acceptedAnswer" com "text" (resposta em HTML ou texto). Máximo recomendado: 10 pares.',
    },
  },

  QAPage: {
    required:    ['mainEntity'],
    recommended: [],
    richResult: true,
    suggestions: {
      mainEntity: 'Question com upvoteCount, answerCount e acceptedAnswer. Para páginas de Q&A tipo Stack Overflow.',
    },
  },

  HowTo: {
    required:    ['name', 'step'],
    recommended: ['description', 'image', 'totalTime', 'estimatedCost', 'supply', 'tool'],
    richResult: true,
    note: 'HowTo rich results foram descontinuados no desktop em setembro de 2023. Ainda funcionam no mobile.',
    nestedRequired: {
      step: ['name', 'text'],
    },
    suggestions: {
      step:          'Array de HowToStep com name, text e image. Aparece como lista numerada na SERP mobile.',
      totalTime:     'ISO 8601 Duration (ex: PT30M = 30 minutos).',
      estimatedCost: 'MonetaryAmount com value e currency.',
      image:         'Imagem principal do resultado. Mínimo 1200×630px.',
    },
  },

  // ── AVALIAÇÕES ───────────────────────────────────────────────────
  Review: {
    required:    ['itemReviewed', 'reviewRating', 'author'],
    recommended: ['datePublished', 'reviewBody', 'publisher', 'name'],
    richResult: true,
    nestedRequired: {
      reviewRating:  ['ratingValue'],
      itemReviewed:  ['name'],
      author:        ['name'],
    },
    note: 'Google não aceita review de negócios sobre si mesmos. O autor deve ser uma pessoa ou publicação independente.',
    suggestions: {
      reviewRating: 'Rating com ratingValue (número) e bestRating (default 5). Ex: {"@type":"Rating","ratingValue":"4.5","bestRating":"5"}.',
      itemReviewed: 'O item avaliado — pode ser Product, Book, Movie, LocalBusiness etc.',
    },
  },

  AggregateRating: {
    required:    ['ratingValue', 'ratingCount'],
    recommended: ['bestRating', 'worstRating', 'reviewCount', 'itemReviewed'],
    richResult: true,
    suggestions: {
      ratingValue:  'Número decimal (ex: 4.5). Deve estar entre worstRating e bestRating.',
      ratingCount:  'Total de avaliações. Quanto mais, maior a confiança do Google.',
      bestRating:   'Valor máximo da escala. Default: 5.',
      worstRating:  'Valor mínimo da escala. Default: 1.',
    },
  },

  // ── PESSOAS E AUTORES ────────────────────────────────────────────
  Person: {
    required:    ['name'],
    recommended: ['url', 'sameAs', 'jobTitle', 'image', 'worksFor', 'description', 'email', 'telephone', 'address', 'birthDate', 'nationality', 'knowsAbout', 'alumniOf', 'award', '@id'],
    richResult: false,
    nestedRequired: {
      worksFor: ['name'],
    },
    suggestions: {
      sameAs:      'LinkedIn, Twitter/X, Wikipedia, Lattes (Brasil), Google Scholar. Essencial para E-E-A-T de autores.',
      '@id':       'URL canônica da pessoa. Ex: "https://seusite.com.br/#autor". Permite reuso em schemas de Article.',
      knowsAbout:  'Tópicos de especialidade. Reforça autoridade temática (E-E-A-T).',
      jobTitle:    'Cargo profissional. Ex: "Médico Cardiologista CRM 12345".',
      alumniOf:    'Instituição de formação. Fortalece E-E-A-T profissional.',
      award:       'Prêmios e certificações. Sinal adicional de expertise.',
    },
  },

  // ── ESTRUTURA DE SITE ────────────────────────────────────────────
  WebSite: {
    required:    ['name', 'url'],
    recommended: ['potentialAction', 'description', 'inLanguage', 'publisher', 'sameAs'],
    richResult: false,
    suggestions: {
      potentialAction: 'SearchAction com target e query-input. Habilita a caixa de busca Sitelinks na SERP.',
      inLanguage:      'Código BCP 47 (ex: "pt-BR"). Importante para sites multilíngues.',
      publisher:       'Organization que publica o site.',
    },
  },

  WebPage: {
    required:    ['name'],
    recommended: ['url', 'description', 'breadcrumb', 'lastReviewed', 'datePublished', 'dateModified', 'inLanguage', 'author', 'publisher', 'primaryImageOfPage', 'speakable', 'isPartOf'],
    richResult: false,
    suggestions: {
      lastReviewed:      'Data da última revisão do conteúdo. Sinal de freshness.',
      breadcrumb:        'BreadcrumbList associado. Essencial para hierarquia de site.',
      primaryImageOfPage: 'ImageObject com a imagem principal. Influencia thumbnail no Discover.',
      speakable:         'Marcação para Google Assistant. Define trechos legíveis por voz.',
    },
  },

  BreadcrumbList: {
    required:    ['itemListElement'],
    recommended: [],
    richResult: true,
    nestedRequired: {
      itemListElement: ['position', 'name'],
    },
    note: 'Cada ListItem deve ter "position" (inteiro, começa em 1), "name" (texto do breadcrumb) e "item" (URL). O item final (página atual) pode omitir "item".',
    suggestions: {
      itemListElement: 'Array de ListItem ordenados por position. Ex: Home (1) > Categoria (2) > Produto (3).',
    },
  },

  SiteNavigationElement: {
    required:    ['name'],
    recommended: ['url', 'description'],
    richResult: false,
    suggestions: {
      name: 'Nome do item de navegação. Deve corresponder ao texto visível do link.',
      url:  'URL de destino. Deve ser URL absoluta.',
    },
  },

  // ── EVENTOS ──────────────────────────────────────────────────────
  Event: {
    required:    ['name', 'startDate', 'location'],
    recommended: ['endDate', 'description', 'image', 'offers', 'organizer', 'eventStatus', 'eventAttendanceMode', 'performer', 'url', 'inLanguage'],
    richResult: true,
    nestedRequired: {
      location: ['name', 'address'],
      offers:   ['price', 'priceCurrency', 'url', 'availability'],
    },
    note: 'Desde 2021, o Google exige eventAttendanceMode (Online/Offline/Mixed) e, para eventos virtuais, virtualLocation com url.',
    suggestions: {
      eventStatus:          '"EventScheduled" (padrão), "EventCancelled", "EventPostponed", "EventRescheduled".',
      eventAttendanceMode:  '"OfflineEventAttendanceMode", "OnlineEventAttendanceMode", "MixedEventAttendanceMode".',
      offers:               'Offer com price, priceCurrency, availability e url de compra.',
      performer:            'Person ou PerformingGroup. Aparece no rich result de evento.',
    },
  },

  // ── VÍDEO ────────────────────────────────────────────────────────
  VideoObject: {
    required:    ['name', 'description', 'thumbnailUrl', 'uploadDate'],
    recommended: ['contentUrl', 'embedUrl', 'duration', 'publisher', 'expires', 'regionsAllowed', 'interactionStatistic', 'hasPart'],
    richResult: true,
    nestedRequired: {
      publisher: ['name', 'logo'],
    },
    note: 'Google exige thumbnailUrl como URL absoluta. duration em ISO 8601 (PT1H2M3S). O snippet de vídeo aparece na SERP se contentUrl ou embedUrl estiver presente.',
    suggestions: {
      duration:             'ISO 8601 (ex: PT1H30M = 1h30min). Aparece na SERP.',
      contentUrl:           'URL direta do arquivo de vídeo (.mp4). Melhor para indexação.',
      embedUrl:             'URL do player embed. Alternativa ao contentUrl.',
      expires:              'ISO 8601. Se passada, o Google remove o rich result automaticamente.',
      interactionStatistic: 'WatchAction com userInteractionCount (views). Sinal de popularidade.',
      hasPart:              'Clip com startOffset/endOffset. Habilita key moments na SERP.',
    },
  },

  // ── EDUCAÇÃO ─────────────────────────────────────────────────────
  Course: {
    required:    ['name', 'description', 'provider'],
    recommended: ['url', 'hasCourseInstance', 'offers', 'courseCode', 'coursePrerequisites', 'educationalLevel', 'numberOfCredits', 'occupationalCredentialAwarded', 'timeRequired', 'inLanguage'],
    richResult: true,
    nestedRequired: {
      provider:          ['name'],
      hasCourseInstance: ['courseMode', 'courseSchedule'],
      offers:            ['price', 'priceCurrency'],
    },
    suggestions: {
      hasCourseInstance:             'CourseInstance com courseMode ("online", "onsite"), startDate, endDate.',
      occupationalCredentialAwarded: 'Certificado emitido. Ex: "Certificado de Operador de Empilhadeira NR-11".',
      educationalLevel:              '"Beginner", "Intermediate", "Advanced". Ajuda na segmentação.',
      timeRequired:                  'ISO 8601 Duration. Ex: PT40H = 40 horas.',
    },
  },

  // ── LISTAS ───────────────────────────────────────────────────────
  ItemList: {
    required:    ['itemListElement'],
    recommended: ['name', 'description', 'numberOfItems', 'itemListOrder'],
    richResult: true,
    nestedRequired: {
      itemListElement: ['position'],
    },
    note: 'Para Carousel rich results, cada ListItem.item deve ser um schema de Article, Product, Recipe ou Event completo.',
    suggestions: {
      itemListElement: 'Array de ListItem com position (inteiro), name e url ou item (schema completo).',
      itemListOrder:   '"ItemListOrderAscending", "ItemListOrderDescending", "ItemListUnordered".',
      numberOfItems:   'Número total de itens da lista.',
    },
  },

  // ── RECEITAS ─────────────────────────────────────────────────────
  Recipe: {
    required:    ['name', 'image', 'author'],
    recommended: ['description', 'datePublished', 'prepTime', 'cookTime', 'totalTime', 'recipeYield', 'recipeIngredient', 'recipeInstructions', 'recipeCategory', 'recipeCuisine', 'nutrition', 'aggregateRating', 'keywords', 'video'],
    richResult: true,
    nestedRequired: {
      author:              ['name'],
      recipeInstructions:  ['text'],
      nutrition:           ['calories'],
    },
    suggestions: {
      prepTime:            'ISO 8601 Duration (ex: PT15M = 15 minutos).',
      recipeInstructions:  'Array de HowToStep com name e text. Habilita rich result com passos.',
      nutrition:           'NutritionInformation com calories, fatContent, etc.',
      aggregateRating:     'Estrelas na SERP para receitas — impacto alto em CTR.',
    },
  },

  // ── SOFTWARE ─────────────────────────────────────────────────────
  SoftwareApplication: {
    required:    ['name', 'applicationCategory', 'operatingSystem'],
    recommended: ['offers', 'aggregateRating', 'description', 'url', 'screenshot', 'softwareVersion', 'downloadUrl', 'featureList'],
    richResult: true,
    nestedRequired: {
      offers:          ['price', 'priceCurrency'],
      aggregateRating: ['ratingValue', 'ratingCount'],
    },
    suggestions: {
      applicationCategory: '"GameApplication", "BusinessApplication", "EducationalApplication" etc.',
      operatingSystem:     '"Windows", "macOS", "Android", "iOS".',
      offers:              'Preço com Free ("0") ou pago. "priceCurrency": "BRL".',
    },
  },

  // ── SAÚDE ────────────────────────────────────────────────────────
  MedicalWebPage: {
    required:    ['name', 'lastReviewed', 'reviewedBy'],
    recommended: ['url', 'description', 'medicalAudience', 'aspect', 'mainContentOfPage'],
    richResult: false,
    note: 'Sinal forte de E-E-A-T médico. reviewedBy deve ser Person com credenciais (sameAs para CRM/CFM).',
    suggestions: {
      reviewedBy:      'Person ou Organization médica com name e sameAs (CRM/CFM).',
      medicalAudience: '"Patient", "MedicalResearcher", "Physician".',
      lastReviewed:    'ISO 8601. Google prioriza páginas médicas com revisão recente.',
    },
  },

  // ── OUTROS ───────────────────────────────────────────────────────
  CreativeWork: {
    required:    ['name'],
    recommended: ['author', 'datePublished', 'description', 'url', 'inLanguage', 'keywords', 'license', 'publisher', 'thumbnailUrl'],
    richResult: false,
    suggestions: {
      license:   'URL da licença de uso. Ex: Creative Commons.',
      keywords:  'Palavras-chave separadas por vírgula.',
    },
  },

  Blog: {
    required:    ['name'],
    recommended: ['url', 'description', 'author', 'publisher', 'inLanguage', 'blogPost'],
    richResult: false,
    suggestions: {
      blogPost:   'Array de BlogPosting. Conecta o schema do blog aos artigos individuais.',
      publisher:  'Organization com name e logo.',
    },
  },

  PrivacyStatement: {
    required:    ['name'],
    recommended: ['url', 'datePublished', 'dateModified', 'description', 'publisher', 'inLanguage'],
    richResult: false,
    suggestions: {
      dateModified: 'ISO 8601. Importante para compliance — mostra quando a política foi atualizada.',
      publisher:    'Organization responsável pela política de privacidade.',
    },
  },

  Service: {
    required:    ['name', 'provider'],
    recommended: ['description', 'url', 'areaServed', 'serviceType', 'offers', 'aggregateRating', 'image', 'hasOfferCatalog'],
    richResult: false,
    nestedRequired: {
      provider: ['name'],
    },
    suggestions: {
      areaServed:       'País, estado ou cidade. Define área de atuação.',
      serviceType:      'Tipo do serviço. Ex: "Aluguel de Empilhadeira", "Manutenção Industrial".',
      hasOfferCatalog:  'OfferCatalog listando os serviços específicos.',
      aggregateRating:  'ratingValue + ratingCount. Estrelas para serviços na SERP.',
    },
  },

  JobPosting: {
    required:    ['title', 'datePosted', 'description', 'hiringOrganization', 'jobLocation'],
    recommended: ['validThrough', 'employmentType', 'baseSalary', 'skills', 'qualifications', 'responsibilities', 'industry', 'workHours', 'url'],
    richResult: true,
    nestedRequired: {
      hiringOrganization: ['name', 'sameAs'],
      jobLocation:        ['address'],
      baseSalary:         ['value', 'currency'],
    },
    note: 'Google exige validThrough para jobs que expiram. Sem ele, o job pode aparecer expirado.',
    suggestions: {
      employmentType:  '"FULL_TIME", "PART_TIME", "CONTRACTOR", "TEMPORARY", "INTERN", "VOLUNTEER".',
      baseSalary:      'MonetaryAmountDistribution com value (unitText: "MONTH" ou "YEAR") e currency.',
      validThrough:    'ISO 8601. Data de expiração da vaga.',
    },
  },

  // ── SPECIAL: Speakable ───────────────────────────────────────────
  Speakable: {
    required:    ['cssSelector'],
    recommended: ['xpath'],
    richResult: false,
    note: 'Usado dentro de Article/NewsArticle para Google Assistant. cssSelector deve apontar para os blocos de texto mais importantes.',
    suggestions: {
      cssSelector: 'Array de seletores CSS. Ex: [".article-headline", ".article-summary"].',
    },
  },
};

function validateSchema(rawObj, types) {
  if (!rawObj || typeof rawObj !== 'object') {
    return { errors: [{ field: '@type', message: 'Schema inválido ou vazio', suggestion: '' }], warnings: [], valid: [], score: 0, richResultEligible: false };
  }

  const typeList = Array.isArray(types) ? types : (types ? [types] : []);
  // Usa o primeiro tipo reconhecido nas regras
  const matchedType = typeList.find(t => SCHEMA_RULES[t]) || typeList[0] || null;
  const rules = matchedType ? SCHEMA_RULES[matchedType] : null;

  const errors = [], warnings = [], valid = [];

  // @type ausente
  if (!typeList.length || !rawObj['@type']) {
    errors.push({ field: '@type', message: 'Propriedade @type ausente — obrigatória em todos os schemas', suggestion: 'Adicione "@type": "LocalBusiness" (ou o tipo correto).' });
  }

  if (!rules) {
    // Tipo sem regras definidas: apenas valida @context e @type
    if (rawObj['@context']) valid.push({ field: '@context', value: rawObj['@context'] });
    if (rawObj['@type'])    valid.push({ field: '@type',    value: Array.isArray(rawObj['@type']) ? rawObj['@type'].join(', ') : rawObj['@type'] });
    return { errors, warnings, valid, score: errors.length === 0 ? 70 : 0, richResultEligible: false, type: matchedType };
  }

  // Verifica campos required
  for (const field of rules.required) {
    const val = rawObj[field];
    if (val === undefined || val === null || val === '') {
      errors.push({
        field,
        message: `Campo obrigatório ausente: "${field}"`,
        suggestion: rules.suggestions?.[field] || `Adicione o campo "${field}" para habilitar rich results.`,
      });
    } else {
      // Validação de formato para campos específicos
      const valErr = validateFieldFormat(field, val);
      if (valErr) {
        errors.push({ field, message: valErr, suggestion: rules.suggestions?.[field] || '' });
      } else {
        const preview = typeof val === 'string' ? val.substring(0, 60) : (typeof val === 'object' ? '[objeto]' : String(val));
        valid.push({ field, value: preview });
      }
    }
  }

  // Verifica campos recommended
  for (const field of rules.recommended) {
    const val = rawObj[field];
    if (val === undefined || val === null || val === '') {
      warnings.push({
        field,
        message: `Campo recomendado ausente: "${field}"`,
        suggestion: rules.suggestions?.[field] || `Adicione "${field}" para melhorar a elegibilidade para rich results.`,
      });
    } else {
      const fmtErr = validateFieldFormat(field, val);
      if (fmtErr) {
        warnings.push({ field, message: fmtErr, suggestion: rules.suggestions?.[field] || '' });
      } else {
        const preview = typeof val === 'string' ? val.substring(0, 60) : (typeof val === 'object' ? '[objeto]' : String(val));
        valid.push({ field, value: preview });
      }
    }
  }

  // Verifica campos aninhados obrigatórios (nestedRequired)
  if (rules.nestedRequired) {
    for (const [parentField, subFields] of Object.entries(rules.nestedRequired)) {
      const parentVal = rawObj[parentField];
      if (!parentVal) continue; // campo pai ausente já foi capturado acima
      const parentObjs = Array.isArray(parentVal) ? parentVal : [parentVal];
      parentObjs.forEach((obj, idx) => {
        if (!obj || typeof obj !== 'object') return;
        for (const sub of subFields) {
          if (obj[sub] === undefined || obj[sub] === null || obj[sub] === '') {
            const label = parentObjs.length > 1 ? `${parentField}[${idx}].${sub}` : `${parentField}.${sub}`;
            warnings.push({
              field: label,
              message: `Campo aninhado recomendado ausente: "${label}"`,
              suggestion: `Em "${parentField}", adicione o campo "${sub}".`,
            });
          }
        }
      });
    }
  }

  // Campos adicionais presentes (além dos required/recommended)
  const knownFields = new Set([...rules.required, ...rules.recommended, '@context', '@type', '@id']);
  for (const [k, v] of Object.entries(rawObj)) {
    if (!knownFields.has(k) && !k.startsWith('@')) {
      const preview = typeof v === 'string' ? v.substring(0, 60) : '[objeto/array]';
      valid.push({ field: k, value: preview, extra: true });
    }
  }

  const totalFields = rules.required.length + rules.recommended.length;
  const presentRequired = rules.required.filter(f => rawObj[f] !== undefined && rawObj[f] !== null && rawObj[f] !== '').length;
  const presentRecommended = rules.recommended.filter(f => rawObj[f] !== undefined && rawObj[f] !== null && rawObj[f] !== '').length;
  const score = totalFields > 0
    ? Math.round(((presentRequired * 2 + presentRecommended) / (rules.required.length * 2 + rules.recommended.length)) * 100)
    : errors.length === 0 ? 80 : 0;

  const richResultEligible = rules.richResult && errors.filter(e => rules.required.includes(e.field.replace(/:.*/,''))).length === 0;

  return { errors, warnings, valid, score, richResultEligible, type: matchedType, note: rules.note };
}

function validateFieldFormat(field, val) {
  // ── Datas ISO 8601 ────────────────────────────────────────────────
  const dateFields = ['datePublished','dateModified','startDate','endDate','uploadDate','datePosted','validThrough','lastReviewed','expires','birthDate','foundingDate'];
  if (dateFields.includes(field)) {
    if (typeof val === 'string' && val.length > 0) {
      if (!/^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)?)?)?)?$/.test(val)) {
        return `"${field}" deve estar em ISO 8601 (ex: "2025-06-01" ou "2025-06-01T10:00:00-03:00"). Valor: "${val.substring(0,30)}"`;
      }
    }
  }

  // ── Duration ISO 8601 ─────────────────────────────────────────────
  const durationFields = ['duration','prepTime','cookTime','totalTime','timeRequired','workHours'];
  if (durationFields.includes(field)) {
    if (typeof val === 'string' && !/^P(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(\d+H)?(\d+M)?(\d+S)?)?$/.test(val)) {
      return `"${field}" deve estar em ISO 8601 Duration (ex: "PT30M" = 30min, "PT1H30M" = 1h30min). Valor: "${val.substring(0,20)}"`;
    }
  }

  // ── URLs absolutas ────────────────────────────────────────────────
  const urlFields = ['url','contentUrl','embedUrl','thumbnailUrl','downloadUrl','logo','sameAs','hasMap'];
  if (urlFields.includes(field) && typeof val === 'string' && val.length > 0) {
    try { new URL(val); } catch { return `"${field}" deve ser uma URL absoluta válida (começando com https://). Valor: "${val.substring(0,40)}"`; }
    if (!val.startsWith('https://') && !val.startsWith('http://')) {
      return `"${field}" deve ser uma URL absoluta (https://). URLs relativas não são aceitas pelo Google.`;
    }
  }

  // ── Headline / name — limite de caracteres ────────────────────────
  if (field === 'headline' && typeof val === 'string' && val.length > 110) {
    return `"headline" tem ${val.length} caracteres. O Google trunca acima de 110 chars nos rich results.`;
  }

  // ── ratingValue — range numérico ──────────────────────────────────
  if (field === 'ratingValue') {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0 || num > 10) {
      return `"ratingValue" deve ser um número entre 0 e 10. Valor: "${val}"`;
    }
  }

  // ── ratingCount / reviewCount — deve ser inteiro positivo ─────────
  if (['ratingCount','reviewCount'].includes(field)) {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1) {
      return `"${field}" deve ser um inteiro positivo. Valor: "${val}"`;
    }
  }

  // ── price — deve ser numérico ou string numérica ──────────────────
  if (field === 'price' && val !== '' && val !== '0') {
    if (typeof val === 'string' && !/^\d+([.,]\d{1,2})?$/.test(val.trim())) {
      return `"price" deve ser numérico (ex: "29.90" ou "0" para gratuito). Valor: "${val}"`;
    }
  }

  // ── telephone — formato mínimo ────────────────────────────────────
  if (field === 'telephone' && typeof val === 'string') {
    const cleaned = val.replace(/[\s\-().+]/g, '');
    if (!/^\d{8,15}$/.test(cleaned)) {
      return `"telephone" parece inválido. Formato E.164 recomendado: "+55 62 99999-9999".`;
    }
  }

  // ── inLanguage — BCP 47 ───────────────────────────────────────────
  if (field === 'inLanguage' && typeof val === 'string') {
    if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(val)) {
      return `"inLanguage" deve ser código BCP 47 (ex: "pt-BR", "en", "es"). Valor: "${val}"`;
    }
  }

  // ── @id — deve ser URL absoluta ───────────────────────────────────
  if (field === '@id' && typeof val === 'string') {
    try { new URL(val); } catch { return `"@id" deve ser uma URL absoluta. Recomendado: URL canônica + fragmento (ex: "https://site.com/#empresa").`; }
  }

  return null;
}

// ── Rich Results Preview ──────────────────────────────────────────────────────

function generateRichPreview(rawObj, type) {
  const get = (obj, ...keys) => { let v = obj; for (const k of keys) { if (!v || typeof v !== 'object') return null; v = v[k]; } return v ?? null; };
  const str = v => (typeof v === 'string' ? v : (v?.name || v?.['@id'] || JSON.stringify(v) || '')).substring(0, 80);
  const esc = s => escHtml(String(s || ''));

  const generators = {
    LocalBusiness: () => {
      const name = str(get(rawObj, 'name') || '');
      const url  = str(get(rawObj, 'url') || '');
      const tel  = str(get(rawObj, 'telephone') || '');
      const rating = get(rawObj, 'aggregateRating', 'ratingValue');
      const ratingCount = get(rawObj, 'aggregateRating', 'reviewCount') || get(rawObj, 'aggregateRating', 'ratingCount');
      const addr = str(get(rawObj, 'address', 'streetAddress') || get(rawObj, 'address') || '');
      const stars = rating ? '★'.repeat(Math.round(Math.min(5, parseFloat(rating)))) + '☆'.repeat(5 - Math.round(Math.min(5, parseFloat(rating)))) : '';
      return `
        <div class="srp-mock srp-local">
          <div class="srp-breadcrumb">${esc(url || 'site.com.br')}</div>
          <div class="srp-title">${esc(name)}</div>
          ${rating ? `<div class="srp-rating"><span class="srp-stars">${stars}</span> <span class="srp-rating-val">${esc(rating)}</span>${ratingCount ? ` (${esc(ratingCount)} avaliações)` : ''}</div>` : ''}
          <div class="srp-meta">${[addr ? esc(addr) : '', tel ? esc(tel) : ''].filter(Boolean).join(' · ')}</div>
        </div>`;
    },
    Organization: () => {
      const name = str(get(rawObj, 'name') || '');
      const url  = str(get(rawObj, 'url') || '');
      const desc = str(get(rawObj, 'description') || '');
      return `
        <div class="srp-mock srp-org">
          <div class="srp-breadcrumb">${esc(url || 'site.com.br')}</div>
          <div class="srp-title">${esc(name)}</div>
          ${desc ? `<div class="srp-desc">${esc(desc)}</div>` : ''}
        </div>`;
    },
    Article: () => {
      const headline = str(get(rawObj, 'headline') || '');
      const author   = str(get(rawObj, 'author', 'name') || get(rawObj, 'author') || '');
      const date     = str(get(rawObj, 'datePublished') || '');
      const imgUrl   = str(get(rawObj, 'image', 'url') || get(rawObj, 'image') || '');
      return `
        <div class="srp-mock srp-article">
          ${imgUrl ? `<div class="srp-thumb-wrap"><img class="srp-thumb" src="${esc(imgUrl)}" onerror="this.style.display='none'" alt=""></div>` : ''}
          <div class="srp-article-body">
            <div class="srp-title">${esc(headline)}</div>
            <div class="srp-meta">${[author ? `Por ${esc(author)}` : '', date ? esc(date.substring(0,10)) : ''].filter(Boolean).join(' · ')}</div>
          </div>
        </div>`;
    },
    FAQPage: () => {
      const items = get(rawObj, 'mainEntity') || [];
      const list = (Array.isArray(items) ? items : [items]).slice(0, 3);
      if (!list.length) return `<div class="srp-mock srp-faq"><div class="srp-title">FAQPage — sem perguntas encontradas</div></div>`;
      return `<div class="srp-mock srp-faq">
        ${list.map(q => `
          <div class="srp-faq-item">
            <div class="srp-faq-q">▼ ${esc(str(q.name || q['@name'] || ''))}</div>
            <div class="srp-faq-a">${esc(str(get(q,'acceptedAnswer','text') || ''))}</div>
          </div>`).join('')}
      </div>`;
    },
    Product: () => {
      const name   = str(get(rawObj, 'name') || '');
      const price  = get(rawObj, 'offers', 'price') || get(rawObj, 'offers', 0, 'price');
      const currency = get(rawObj, 'offers', 'priceCurrency') || 'R$';
      const rating = get(rawObj, 'aggregateRating', 'ratingValue');
      const avail  = str(get(rawObj, 'offers', 'availability') || '').replace('https://schema.org/', '');
      const stars  = rating ? '★'.repeat(Math.round(Math.min(5, parseFloat(rating)))) + '☆'.repeat(5 - Math.round(Math.min(5, parseFloat(rating)))) : '';
      return `
        <div class="srp-mock srp-product">
          <div class="srp-title">${esc(name)}</div>
          ${rating ? `<div class="srp-rating"><span class="srp-stars">${stars}</span></div>` : ''}
          ${price ? `<div class="srp-price">${esc(currency)} ${esc(price)}</div>` : ''}
          ${avail ? `<div class="srp-avail ${avail === 'InStock' ? 'srp-instock' : ''}">${esc(avail === 'InStock' ? 'Em estoque' : avail)}</div>` : ''}
        </div>`;
    },
    BreadcrumbList: () => {
      const items = get(rawObj, 'itemListElement') || [];
      const crumbs = (Array.isArray(items) ? items : [items]).map(i => esc(str(i.name || i.item || ''))).join(' › ');
      return `<div class="srp-mock srp-breadcrumb-preview"><div class="srp-breadcrumb-trail">${crumbs || '(sem itens)'}</div></div>`;
    },
    Event: () => {
      const name  = str(get(rawObj, 'name') || '');
      const start = str(get(rawObj, 'startDate') || '');
      const loc   = str(get(rawObj, 'location', 'name') || get(rawObj, 'location') || '');
      return `
        <div class="srp-mock srp-event">
          <div class="srp-title">${esc(name)}</div>
          <div class="srp-meta">${[start ? esc(start.substring(0,10)) : '', loc ? esc(loc) : ''].filter(Boolean).join(' · ')}</div>
        </div>`;
    },
  };

  // Tenta gerar preview para o tipo, fallback genérico
  const gen = generators[type] || generators[Object.keys(generators).find(k => type && type.includes(k))];
  if (gen) return gen();

  // Fallback genérico
  const name = str(rawObj.name || rawObj.headline || '');
  const url  = str(rawObj.url || '');
  return `
    <div class="srp-mock srp-generic">
      ${url ? `<div class="srp-breadcrumb">${esc(url)}</div>` : ''}
      ${name ? `<div class="srp-title">${esc(name)}</div>` : `<div class="srp-title srp-no-preview">Preview não disponível para ${esc(type || 'este tipo')}</div>`}
    </div>`;
}

// ── Score combinado Schema + Sinais da Página ──────────────────
function computePageSchemaScore(pageSignals, validatedSchemas) {
  const ps = pageSignals || {};
  const issues = [];
  let schemaScore = 0;
  let pageScore   = 0;

  const types = new Set(validatedSchemas.flatMap(s => s.types || []));
  const hasLocal   = types.has('LocalBusiness') || types.has('ProfessionalService');
  const hasOrg     = types.has('Organization');
  const hasArticle = types.has('Article') || types.has('BlogPosting') || types.has('NewsArticle');
  const hasProduct = types.has('Product');
  const hasFAQ     = types.has('FAQPage');
  const hasPerson  = types.has('Person');

  // ── Schema score (0-50) ──────────────────────────────────────
  if (validatedSchemas.length === 0) {
    issues.push({ level: 'error', message: 'Nenhum schema JSON-LD detectado' });
  } else {
    const totalErrors   = validatedSchemas.reduce((n, s) => n + (s.validation?.errors?.length || 0), 0);
    const totalWarnings = validatedSchemas.reduce((n, s) => n + (s.validation?.warnings?.length || 0), 0);
    const totalValid    = validatedSchemas.reduce((n, s) => n + (s.validation?.valid?.length   || 0), 0);
    const totalFields   = totalErrors + totalWarnings + totalValid;
    const baseScore = totalFields > 0 ? Math.round((totalValid / totalFields) * 40) : 20;
    schemaScore = Math.min(50, baseScore + Math.min(10, validatedSchemas.length * 2));
    if (totalErrors > 0) issues.push({ level: 'error', message: `${totalErrors} erro(s) nos schemas` });
    if (totalWarnings > 3) issues.push({ level: 'warn', message: `${totalWarnings} campos recomendados ausentes` });
  }

  // ── Page signals score (0-50) ────────────────────────────────
  // H1
  if (ps.h1Count === 0) { issues.push({ level: 'error', message: 'Sem H1 — estrutura indefinida' }); }
  else if (ps.h1Count === 1) pageScore += 8;
  else { pageScore += 4; issues.push({ level: 'warn', message: `${ps.h1Count} H1s — múltiplos H1 prejudicam estrutura` }); }

  // Semantic tags
  if (ps.hasMainTag)    pageScore += 3;
  if (ps.hasArticleTag) pageScore += 2;
  if (ps.hasTimeTag)    pageScore += 2;
  if (ps.hasFigureTag)  pageScore += 1;
  if (ps.ogImage)       pageScore += 4;

  // Type-specific
  if (hasLocal || hasOrg) {
    if (ps.visiblePhones?.length > 0) pageScore += 6; else issues.push({ level: 'warn', message: 'LocalBusiness: telefone não visível na página' });
    if (ps.visibleAddress) pageScore += 5; else issues.push({ level: 'warn', message: 'LocalBusiness: endereço não detectado na página' });
    if (ps.visibleHours) pageScore += 4; else issues.push({ level: 'info', message: 'LocalBusiness: horário de funcionamento não detectado' });
  }
  if (hasProduct) {
    if (ps.visiblePrices?.length > 0) pageScore += 8; else issues.push({ level: 'error', message: 'Product: preço não visível (Google exige preço visível)' });
    if (ps.visibleRatingValue !== null) pageScore += 5;
  }
  if (hasArticle) {
    if (ps.authorByline) pageScore += 6; else issues.push({ level: 'warn', message: 'Article: byline do autor não detectado' });
    if (ps.publishedTimeMeta) pageScore += 4;
    if (ps.modifiedTimeMeta)  pageScore += 2;
  }
  if (hasPerson && ps.authorByline) pageScore += 6;
  if (ps.visibleEmails?.length > 0 && !hasArticle) pageScore += 2;

  pageScore = Math.min(50, pageScore);
  const totalScore = schemaScore + pageScore;
  return { schemaScore, pageScore, totalScore, issues };
}

function renderSchemaTab(data) {
  const schemas  = data.schemas  || [];
  const microdata = data.microdata || {};
  const container = document.getElementById('schema-list');
  if (!container) return;
  container.innerHTML = '';

  // ── Estado sem schema — preservado intacto ────────────────────
  if (schemas.length === 0 && !microdata.detected) {
    const empty = document.createElement('div');
    empty.className = 'schema-no-data';
    empty.innerHTML = `
      <div class="schema-no-data-header">
        <div class="schema-no-data-icon">⚠</div>
        <div>
          <div class="schema-no-data-title">Esta página está perdendo clientes agora</div>
          <div class="schema-no-data-sub">Nenhum dado estruturado detectado — JSON-LD e Microdata ausentes</div>
        </div>
      </div>
      <p class="schema-no-data-lead">
        O Google e as IAs não conseguem <strong>identificar sua empresa</strong> como uma fonte confiável. Isso não é um problema técnico — é prejuízo financeiro direto: visitantes que deveriam chegar até você estão indo para o concorrente que implementou isso.
      </p>
      <div class="schema-no-data-impacts">
        <div class="schema-no-data-impact"><span class="schema-no-data-impact-icon">💸</span><div><strong>Você some das respostas de IA</strong><span>ChatGPT, Gemini e Perplexity citam quem tem schema. Sem ele, você não existe para essas buscas.</span></div></div>
        <div class="schema-no-data-impact"><span class="schema-no-data-impact-icon">📉</span><div><strong>Seu resultado no Google aparece em branco</strong><span>Concorrentes exibem estrelas, preço e horário. O seu aparece como texto puro.</span></div></div>
        <div class="schema-no-data-impact"><span class="schema-no-data-impact-icon">🏆</span><div><strong>O Google não sabe quem você é</strong><span>Schema é como você se apresenta ao algoritmo. Sem isso, você é genérico.</span></div></div>
        <div class="schema-no-data-impact"><span class="schema-no-data-impact-icon">📞</span><div><strong>Telefone e endereço invisíveis nas buscas</strong><span>LocalBusiness schema faz seu contato aparecer direto na SERP.</span></div></div>
      </div>
      <div class="schema-no-data-action"><strong>Como resolver:</strong> Adicione JSON-LD com LocalBusiness, Organization e FAQPage. Use o botão "Colar JSON-LD Manual" abaixo para testar.</div>
    `;
    container.appendChild(empty);
    return;
  }

  // ── Roda validação em todos os schemas ───────────────────────
  const validated = schemas.map((s, i) => {
    try {
      const raw = typeof s.raw === 'string' ? (() => { try { return JSON.parse(s.raw); } catch { return null; } })() : s.raw;
      let types = s.types || [];
      if (!types.length && raw) {
        if (raw['@type']) {
          types = [].concat(raw['@type']);
        } else if (raw['@graph'] && Array.isArray(raw['@graph'])) {
          types = raw['@graph'].flatMap(n => n['@type'] ? [].concat(n['@type']) : []);
        }
      }
      const v = s.valid && raw ? validateSchema(raw, types) : { errors: [{ field: 'JSON', message: s.error || 'Erro de sintaxe no JSON-LD', suggestion: 'Verifique a sintaxe do JSON usando jsonlint.com' }], warnings: [], valid: [], score: 0, richResultEligible: false };
      return { ...s, raw, types, validation: v };
    } catch(err) {
      console.error(`[Schema] ERRO no schema[${i}]:`, err);
      return { ...s, raw: null, types: [], validation: { errors: [{ field: 'JS Error', message: err.message, suggestion: '' }], warnings: [], valid: [], score: 0, richResultEligible: false } };
    }
  });

  // ── Totais globais ────────────────────────────────────────────
  const totalErrors   = validated.reduce((n, s) => n + s.validation.errors.length, 0);
  const totalWarnings = validated.reduce((n, s) => n + s.validation.warnings.length, 0);
  const totalValid    = validated.reduce((n, s) => n + s.validation.valid.length, 0);
  const uniqueTypes   = [...new Set(validated.flatMap(s => s.types))];

  // ── SEÇÃO 1: Found + type pills ───────────────────────────────
  const header = document.createElement('div');
  header.className = 'sv-header';
  header.innerHTML = `
    <div class="sv-found">✅ Found: <strong>${validated.length}</strong> schemas (<strong>${uniqueTypes.length}</strong> types)</div>
    <div class="sv-pills">
      ${uniqueTypes.map(type => `<span class="sv-pill sv-pill--ok">${escHtml(type)} ✅</span>`).join('')}
    </div>
    <div class="sv-found-format">Format: JSON-LD (${validated.length})</div>
  `;
  container.appendChild(header);

  // ── SCORE COMBINADO Schema + Página ──────────────────────────
  const ps = data.pageSchemaSignals || {};
  const scored = computePageSchemaScore(ps, validated);
  const scoreEl = document.createElement('div');
  scoreEl.className = 'sv-combined-score';
  const scoreCls = scored.totalScore >= 80 ? 'sv-score-great' : scored.totalScore >= 60 ? 'sv-score-good' : scored.totalScore >= 40 ? 'sv-score-warn' : 'sv-score-bad';
  const scoreLabel = scored.totalScore >= 80 ? 'Excelente' : scored.totalScore >= 60 ? 'Bom' : scored.totalScore >= 40 ? 'Regular' : 'Crítico';
  scoreEl.innerHTML = `
    <div class="sv-score-main">
      <span class="sv-score-num ${scoreCls}">${scored.totalScore}</span>
      <span class="sv-score-den">/100</span>
      <span class="sv-score-label ${scoreCls}">${scoreLabel}</span>
    </div>
    <div class="sv-score-breakdown">
      <div class="sv-score-bar-row" title="Schema: ${scored.schemaScore}/50">
        <span class="sv-score-bar-label">Schema</span>
        <div class="sv-score-bar-track"><div class="sv-score-bar-fill sv-score-bar-schema" style="width:${scored.schemaScore * 2}%"></div></div>
        <span class="sv-score-bar-val">${scored.schemaScore}/50</span>
      </div>
      <div class="sv-score-bar-row" title="Sinais da página: ${scored.pageScore}/50">
        <span class="sv-score-bar-label">Página</span>
        <div class="sv-score-bar-track"><div class="sv-score-bar-fill sv-score-bar-page" style="width:${scored.pageScore * 2}%"></div></div>
        <span class="sv-score-bar-val">${scored.pageScore}/50</span>
      </div>
    </div>
    ${scored.issues.length > 0 ? `<div class="sv-score-issues">${scored.issues.slice(0, 3).map(i =>
      `<div class="sv-score-issue sv-score-issue--${i.level}">${i.level === 'error' ? '❌' : i.level === 'warn' ? '⚠️' : 'ℹ️'} ${escHtml(i.message)}</div>`
    ).join('')}</div>` : ''}
  `;
  container.appendChild(scoreEl);

  // ── SEÇÃO 2: Schema Tree View ─────────────────────────────────
  const treeSection = document.createElement('div');
  treeSection.className = 'sv-tree-section';

  const treeHeader = document.createElement('div');
  treeHeader.className = 'sv-section-header';
  treeHeader.innerHTML = `
    <span class="sv-section-header-title">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
      SCHEMA TREE VIEW
    </span>
    <button class="sv-expand-all" id="sv-expand-all">+ Expand All</button>
  `;
  treeSection.appendChild(treeHeader);

  // Links externos dentro da tree section
  if (validated.length > 0) {
    const encoded = encodeURIComponent(data.url);
    const bar = document.createElement('div');
    bar.className = 'schema-validation-bar';
    bar.innerHTML = `
      <a class="schema-val-link" href="https://search.google.com/test/rich-results?url=${encoded}" target="_blank">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>Google Rich Results Test
      </a>
      <a class="schema-val-link" href="https://validator.schema.org/#url=${encoded}" target="_blank">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>Schema.org Validator
      </a>`;
    treeSection.appendChild(bar);
  }

  // Schema rows na tree
  const allBodies = [];
  validated.forEach((s, i) => {
    const v    = s.validation;
    const type = s.types[0] || 'Schema';
    const block = document.createElement('div');
    block.className = 'sv-block';

    const hasErr  = v.errors.length > 0;
    const hasWarn = !hasErr && v.warnings.length > 0;
    const statusCls = hasErr ? ' sv-block-header--error' : hasWarn ? ' sv-block-header--warn' : ' sv-block-header--ok';

    const bHeader = document.createElement('div');
    bHeader.className = `sv-block-header${statusCls}`;
    bHeader.innerHTML = `
      <button class="sv-plus-btn${hasErr ? ' sv-plus-btn--error' : hasWarn ? ' sv-plus-btn--warn' : ''}" title="Expandir / ver JSON">+</button>
      <span class="sv-block-type">${escHtml(s.types.length ? s.types.join(' · ') : 'Script #' + (i+1))}</span>
      <span class="sv-badge-format">JSON-LD</span>
      <span class="sv-counters">
        <span class="sv-bubble sv-bubble--ok"   title="${v.valid.length} campos válidos">${v.valid.length}</span>
        ${v.warnings.length > 0 ? `<span class="sv-bubble sv-bubble--warn" title="${v.warnings.length} warnings">${v.warnings.length}</span>` : ''}
        <span class="sv-bubble sv-bubble--err"  title="${v.errors.length} erros">${v.errors.length}</span>
      </span>
    `;

    const bBody = document.createElement('div');
    bBody.className = 'sv-block-body';
    bBody.style.display = 'none';
    allBodies.push(bBody);

    if (v.note) bBody.innerHTML += `<div class="sv-note">ℹ️ ${escHtml(v.note)}</div>`;

    if (v.errors.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'sv-section';
      sec.innerHTML = `<div class="sv-section-title sv-section-title--err">❌ Erros (${v.errors.length})</div>`;
      v.errors.forEach(e => {
        const row = document.createElement('div');
        row.className = 'sv-msg sv-msg--err';
        row.innerHTML = `<div class="sv-msg-field">${escHtml(e.field)}</div><div class="sv-msg-text">${escHtml(e.message)}</div>${e.suggestion ? `<div class="sv-msg-tip">💡 ${escHtml(e.suggestion)}</div>` : ''}`;
        sec.appendChild(row);
      });
      bBody.appendChild(sec);
    }

    if (v.warnings.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'sv-section';
      sec.innerHTML = `<div class="sv-section-title sv-section-title--warn">⚠ Campos recomendados ausentes (${v.warnings.length})</div>`;
      v.warnings.forEach(w => {
        const row = document.createElement('div');
        row.className = 'sv-msg sv-msg--warn';
        row.innerHTML = `<div class="sv-msg-field">${escHtml(w.field)}</div><div class="sv-msg-text">${escHtml(w.message)}</div>${w.suggestion ? `<div class="sv-msg-tip">💡 ${escHtml(w.suggestion)}</div>` : ''}`;
        sec.appendChild(row);
      });
      bBody.appendChild(sec);
    }

    if (v.valid.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'sv-section';
      const toggle = document.createElement('div');
      toggle.className = 'sv-section-title sv-section-title--ok sv-section-toggle';
      toggle.innerHTML = `✅ Campos válidos (${v.valid.length}) <span class="sv-toggle-hint">ver</span>`;
      const list = document.createElement('div');
      list.style.display = 'none';
      v.valid.forEach(f => {
        const row = document.createElement('div');
        row.className = 'sv-msg sv-msg--ok';
        row.innerHTML = `<div class="sv-msg-field">${escHtml(f.field)}</div><div class="sv-msg-val">${escHtml(f.value || '')}</div>`;
        list.appendChild(row);
      });
      toggle.addEventListener('click', () => {
        const open = list.style.display !== 'none';
        list.style.display = open ? 'none' : 'block';
        toggle.querySelector('.sv-toggle-hint').textContent = open ? 'ver' : 'ocultar';
      });
      sec.appendChild(toggle);
      sec.appendChild(list);
      bBody.appendChild(sec);
    }

    // Tree View / Code View
    if (s.raw) addTreeCodeToggle(bBody, s.raw, data.url);

    // Copiar JSON
    if (s.raw) {
      const actBar = document.createElement('div');
      actBar.className = 'sv-actions';
      const copyBtn = document.createElement('button');
      copyBtn.className = 'sv-copy-btn';
      copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copiar JSON-LD`;
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(JSON.stringify(s.raw, null, 2)).then(() => {
          const orig = copyBtn.innerHTML;
          copyBtn.innerHTML = '✓ Copiado!';
          copyBtn.classList.add('sv-copy-btn--ok');
          setTimeout(() => { copyBtn.innerHTML = orig; copyBtn.classList.remove('sv-copy-btn--ok'); }, 2000);
        });
      });
      actBar.appendChild(copyBtn);
      bBody.appendChild(actBar);
    }

    // Toggle via + button e header
    const plusBtn = bHeader.querySelector('.sv-plus-btn');
    const toggleFn = () => {
      const open = bBody.style.display !== 'none';
      bBody.style.display = open ? 'none' : 'block';
      if (plusBtn) plusBtn.textContent = open ? '+' : '−';
      bHeader.classList.toggle('sv-block-header--open', !open);
    };
    if (plusBtn) plusBtn.addEventListener('click', e => { e.stopPropagation(); toggleFn(); });
    bHeader.addEventListener('click', toggleFn);

    block.appendChild(bHeader);
    block.appendChild(bBody);
    treeSection.appendChild(block);
  });

  // Expand All
  container.appendChild(treeSection);
  const expandAllBtn = treeSection.querySelector('#sv-expand-all');
  if (expandAllBtn) {
    let expanded = false;
    expandAllBtn.addEventListener('click', () => {
      expanded = !expanded;
      allBodies.forEach(b => { b.style.display = expanded ? 'block' : 'none'; });
      treeSection.querySelectorAll('.sv-plus-btn').forEach(b => { b.textContent = expanded ? '−' : '+'; });
      expandAllBtn.textContent = expanded ? '− Collapse All' : '+ Expand All';
    });
  }

  // ── SEÇÃO 3: Validation Results ───────────────────────────────
  const validSection = document.createElement('div');
  validSection.className = 'sv-validation-section';

  const validHeader = document.createElement('div');
  validHeader.className = 'sv-section-header';
  validHeader.innerHTML = `
    <span class="sv-section-header-title">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      VALIDATION RESULTS
    </span>
  `;
  validSection.appendChild(validHeader);

  const statsRow = document.createElement('div');
  statsRow.className = 'sv-stats-row';
  statsRow.innerHTML = `
    <div class="sv-stat-card sv-stat-card--ok">
      <div class="sv-stat-num">${totalValid}</div>
      <div class="sv-stat-label">Fields Valid</div>
    </div>
    <div class="sv-stat-card sv-stat-card--warn">
      <div class="sv-stat-num">${totalWarnings}</div>
      <div class="sv-stat-label">Warnings</div>
    </div>
    <div class="sv-stat-card sv-stat-card--err">
      <div class="sv-stat-num">${totalErrors}</div>
      <div class="sv-stat-label">Errors</div>
    </div>
  `;
  validSection.appendChild(statsRow);

  // Lista apenas de ERROS globais (warnings ficam nos blocos individuais da Tree View)
  const allErrors = [];
  validated.forEach(s => {
    const typeName = s.types[0] || 'Schema';
    s.validation.errors.forEach(e => allErrors.push({ typeName, ...e }));
  });
  if (allErrors.length > 0) {
    const issueList = document.createElement('div');
    issueList.className = 'sv-issue-list';
    allErrors.forEach(issue => {
      const row = document.createElement('div');
      row.className = 'sv-issue-row sv-issue-row--err';
      row.innerHTML = `<span class="sv-issue-icon">❌</span><span class="sv-issue-text"><strong>${escHtml(issue.typeName)}:</strong> ${escHtml(issue.message)}</span>`;
      issueList.appendChild(row);
    });
    validSection.appendChild(issueList);
  }
  container.appendChild(validSection);

  // ── SEÇÃO 4: Rich Result Preview ─────────────────────────────
  const previewSection = document.createElement('div');
  previewSection.className = 'sv-preview-section-wrap';

  const previewHeader = document.createElement('div');
  previewHeader.className = 'sv-section-header';

  let activeVp = 'mobile';
  previewHeader.innerHTML = `
    <span class="sv-section-header-title">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      RICH RESULT PREVIEW
    </span>
    <div class="sv-vp-toggle-group">
      <button class="sv-vp-btn sv-vp-btn--active" data-vp2="mobile">Mobile</button>
      <button class="sv-vp-btn" data-vp2="desktop">Desktop</button>
    </div>
  `;
  previewSection.appendChild(previewHeader);

  previewHeader.querySelectorAll('[data-vp2]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeVp = btn.dataset.vp2;
      previewHeader.querySelectorAll('[data-vp2]').forEach(b => b.classList.remove('sv-vp-btn--active'));
      btn.classList.add('sv-vp-btn--active');
      previewSection.querySelectorAll('.sv-preview-card').forEach(card => {
        card.className = `sv-preview-card sv-preview-card--${activeVp}`;
      });
    });
  });

  validated.forEach((s, i) => {
    const v    = s.validation;
    const type = s.types[0] || 'Unknown';
    const card = document.createElement('div');
    card.className = 'sv-preview-card sv-preview-card--mobile';
    const label = document.createElement('div');
    label.className = 'sv-preview-card-label';
    label.textContent = `Schema ${i + 1} · ${type}`;
    card.appendChild(label);
    const frame = document.createElement('div');
    frame.className = 'sv-preview-frame';
    frame.innerHTML = s.raw ? generateRichPreview(s.raw, type) : `<div class="srp-no-preview">Preview not available for this type.</div>`;
    card.appendChild(frame);
    previewSection.appendChild(card);
  });

  container.appendChild(previewSection);

  // ── Microdata ─────────────────────────────────────────────────
  if (microdata.detected) {
    const mdItem = document.createElement('div');
    mdItem.className = 'sv-block';
    const mdHeader = document.createElement('div');
    mdHeader.className = 'sv-block-header';
    mdHeader.innerHTML = `
      <span class="sv-chevron">▶</span>
      <span class="sv-block-type">Microdata</span>
      <span class="sv-badge-format sv-badge-format--md">Microdata</span>
      <span class="sv-counters"><span class="sv-cnt sv-cnt--ok">${microdata.itemtype} tipo(s)</span></span>
    `;
    const mdBody = document.createElement('div');
    mdBody.className = 'sv-block-body';
    mdBody.style.display = 'none';
    mdBody.innerHTML = `
      <div class="schema-microdata-grid">
        <div class="schema-md-row"><span class="schema-md-key">itemscope</span><span class="schema-md-val">${microdata.itemscope}</span></div>
        <div class="schema-md-row"><span class="schema-md-key">itemtype</span><span class="schema-md-val">${microdata.itemtype}</span></div>
        <div class="schema-md-row"><span class="schema-md-key">itemprop</span><span class="schema-md-val">${microdata.itemprop}</span></div>
      </div>
    `;
    mdHeader.addEventListener('click', () => {
      const open = mdBody.style.display !== 'none';
      mdBody.style.display = open ? 'none' : 'block';
      const ch = mdHeader.querySelector('.sv-chevron');
      if (ch) ch.textContent = open ? '▶' : '▼';
    });
    mdItem.appendChild(mdHeader);
    mdItem.appendChild(mdBody);
    container.appendChild(mdItem);
  }
}
function buildSchemaTree(obj, depth) {
  if (obj === null || obj === undefined) return '<span class="schema-null">null</span>';
  if (typeof obj === 'boolean') return `<span class="schema-bool">${obj}</span>`;
  if (typeof obj === 'number') return `<span class="schema-num">${obj}</span>`;
  if (typeof obj === 'string') {
    const val = escHtml(obj);
    const isUrl = obj.startsWith('http://') || obj.startsWith('https://');
    return isUrl
      ? `<a class="schema-url" href="${val}" target="_blank">${val.length > 60 ? val.slice(0, 60) + '…' : val}</a>`
      : `<span class="schema-str">${val.length > 120 ? val.slice(0, 120) + '…' : val}</span>`;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '<span class="schema-null">[]</span>';
    if (obj.every(v => typeof v === 'string' || typeof v === 'number')) {
      return obj.map(v => `<span class="schema-str">${escHtml(String(v))}</span>`).join('<span class="schema-comma">, </span>');
    }
    return obj.map(v => `<div class="schema-array-item">${buildSchemaTree(v, depth + 1)}</div>`).join('');
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '<span class="schema-null">{}</span>';
    const rows = entries.map(([k, v]) => {
      const isSpecial = k === '@type' || k === '@id' || k === '@context';
      return `<div class="schema-prop-row ${isSpecial ? 'schema-prop-special' : ''}">
        <span class="schema-prop-key">${escHtml(k)}</span>
        <span class="schema-prop-sep">:</span>
        <span class="schema-prop-val">${buildSchemaTree(v, depth + 1)}</span>
      </div>`;
    }).join('');
    return depth === 0 ? rows : `<div class="schema-nested">${rows}</div>`;
  }
  return escHtml(String(obj));
}

function buildHeadingItem(level, text) {
  const item = document.createElement('div');
  const lvl = level.toLowerCase(); // sempre minúsculo para CSS
  item.className = `heading-item level-${lvl}`;
  item.innerHTML = `
    <span class="heading-tag tag-${lvl}">${lvl.toUpperCase()}</span>
    <span class="heading-text">${escHtml(text)}</span>
  `;
  return item;
}

// ── AI Send — Analisar títulos com IA ────────────────────────────────────
let _headingNodesForAI = [];

function initAISend() {
  const btn      = document.getElementById('ai-send-btn');
  const dropdown = document.getElementById('ai-dropdown');
  if (!btn || !dropdown) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', () => dropdown.classList.remove('open'));

  dropdown.querySelectorAll('.ai-option').forEach(opt => {
    opt.addEventListener('click', () => {
      dropdown.classList.remove('open');
      sendToAI(opt.dataset.ai);
    });
  });
}

const NLP_API_KEY = 'AIzaSyA5_eN_gHjq-9jrAYeTspjY-wgJEcORmTU';

async function fetchNLPEntities(text) {
  try {
    const res = await fetch(
      `https://language.googleapis.com/v1/documents:analyzeEntities?key=${NLP_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: { type: 'PLAIN_TEXT', language: getNLApiLang(), content: text },
          encodingType: 'UTF8',
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Retorna top 10 entidades por salience, filtra ruído (salience < 0.03)
    return (data.entities || [])
      .filter(e => e.salience >= 0.03)
      .sort((a, b) => b.salience - a.salience)
      .slice(0, 10)
      .map(e => ({
        name: e.name,
        type: e.type,
        salience: Math.round(e.salience * 100),
      }));
  } catch (_) {
    return null;
  }
}

function buildHeadingsPrompt(nodes, pageUrl, nlpEntities) {
  const tree = nodes.map(n => {
    const lvlNum = parseInt(n.level.replace(/h/i, ''));
    const indent = '  '.repeat(lvlNum - 1);
    return `${indent}${n.level.toUpperCase()}: ${n.text}`;
  }).join('\n');

  // Bloco NLP — só inclui se a API retornou dados
  const nlpBlock = nlpEntities && nlpEntities.length
    ? `**Entidades detectadas pelo Google NLP (salience real):**
${nlpEntities.map(e => `- ${e.name} (salience: ${e.salience}%) — ${e.type}`).join('\n')}

`
    : '';

  return `Você é um especialista em SEO semântico. Analise a estrutura de títulos da página abaixo e forneça uma revisão detalhada considerando os seguintes pontos:

1. **Entity Salience** — O H1 define claramente o tópico principal? Os H2s e H3s reforçam e aprofundam esse tópico, ou estão dispersos? Use os dados do Google NLP abaixo para identificar quais entidades estão sendo sinalizadas com mais força e se os títulos reforçam as entidades certas.

2. **Hierarquia e estrutura** — A progressão H1 → H2 → H3 → H4 está correta? Há saltos de nível? Os H3s são subtópicos reais dos H2s que os precedem?

3. **Legibilidade para o Google** — Apenas lendo os títulos em sequência, é possível entender do que trata a página? Os títulos comunicam o propósito sem precisar ler o corpo do texto?

4. **Cobertura semântica** — Os subtítulos exploram o tema com profundidade suficiente? Há ângulos importantes do tópico que estão faltando como subtítulo?

5. **O que alterar** — Para cada problema encontrado, sugira o título revisado ou o título que deveria ser adicionado.

**URL da página:** ${pageUrl}

${nlpBlock}**Estrutura de títulos atual:**
\`\`\`
${tree}
\`\`\`

Seja direto e específico. Mostre os problemas e as sugestões de melhoria lado a lado.`;
}

function sendToAI(ai) {
  const nodes = _headingNodesForAI;
  if (!nodes.length) { alert('Nenhum heading encontrado nesta página.'); return; }

  // Mostra estado de carregando no botão
  const btn = document.getElementById('ai-send-btn');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = `<span style="font-size:11px;opacity:.7">Chamando NLP...</span>`;
  btn.disabled = true;

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const pageUrl = tabs[0]?.url || '';

    // Texto para NLP: todos os headings concatenados
    const headingText = nodes.map(n => n.text).join('. ');

    // Chama Google NLP (best-effort — se falhar, envia prompt sem NLP)
    const nlpEntities = await fetchNLPEntities(headingText);

    const prompt = buildHeadingsPrompt(nodes, pageUrl, nlpEntities);
    const encoded = encodeURIComponent(prompt);

    const urls = {
      claude:     `https://claude.ai/new?q=${encoded}`,
      chatgpt:    `https://chatgpt.com/?q=${encoded}`,
      gemini:     `https://gemini.google.com/app?q=${encoded}`,
      perplexity: `https://www.perplexity.ai/?q=${encoded}`,
    };

    const url = urls[ai];
    if (url) chrome.tabs.create({ url });

    // Restaura botão
    btn.innerHTML = originalHTML;
    btn.disabled = false;
  });
}

// ══════════════════════════════════════════════════════════════
// HEADING SCORE ENGINE — 12 critérios, painel de experts
// Stox · Batista · Tugberk · Anderson · Meyers · Muller · Shepard
// ══════════════════════════════════════════════════════════════

// Regexes de snippet targets — escopo global (usadas em computeHeadingScore e renderSchemaTab)
const QUESTION_RE   = /[?？]$|^(como|por que|por quê|quando|onde|o que|qual|quais|quanto|quem|why|how|what|when|where|which)\b/i;
const ENUMERATED_RE = /^(\d+\s+|top\s+\d|melhores?|principais?|passos?|dicas?|razões?|formas?|maneiras?|tipos?|exemplos?)/i;

const HEADING_STOPWORDS = new Set([
  'de','da','do','das','dos','a','o','as','os','e','em','para','que','se',
  'na','no','nas','nos','com','por','um','uma','ao','à','é','são','foi',
  'tem','the','a','an','and','or','but','in','on','at','to','for','of',
  'with','by','from','is','are','was','be','this','that','it','its',
]);

function hdTokenize(text) {
  return (text || '').toLowerCase()
    .replace(/[^a-záéíóúãõâêîôûç\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !HEADING_STOPWORDS.has(w));
}

function hdJaccard(tokensA, tokensB) {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const inter = tokensA.filter(t => setB.has(t)).length;
  const union  = new Set([...setA, ...setB]).size;
  return union > 0 ? inter / union : 0;
}

function hdSlugWords(url) {
  try {
    const path = new URL(url.startsWith('http') ? url : 'http://x' + url).pathname;
    return path.split(/[-_/]/).filter(w => w.length > 2 && !HEADING_STOPWORDS.has(w.toLowerCase()));
  } catch { return []; }
}

function computeHeadingScore(headingNodes, pageTitle, pageUrl, wordCount) {
  const norm = l => (l || '').toUpperCase().replace(/[^H0-9]/g, '');
  const h1s  = headingNodes.filter(n => norm(n.level) === 'H1');
  const h2s  = headingNodes.filter(n => norm(n.level) === 'H2');
  const h3s  = headingNodes.filter(n => norm(n.level) === 'H3');
  const total = headingNodes.length;

  const breakdown = [];

  // ── C1: H1 Presença e Unicidade (15 pts) ─────────────────────
  let c1 = 0, c1level = 'ok';
  if      (h1s.length === 1)  { c1 = 15; c1level = 'ok'; }
  else if (h1s.length === 0)  { c1 = 0;  c1level = 'critical'; }
  else                        { c1 = 0;  c1level = 'critical'; }
  breakdown.push({ id: 'c1', label: 'H1 — presença e unicidade', pts: c1, max: 15, level: c1level,
    icon: c1level === 'ok' ? '✓' : '✕',
    why: h1s.length === 0
      ? 'Nenhum H1 encontrado. O Google trata o H1 como declaração do tópico principal — sem ele, a página não tem âncora semântica para passage indexing e featured snippets.'
      : h1s.length > 1
      ? `${h1s.length} H1s encontrados. Múltiplos H1s diluem o sinal do tópico principal. Use exatamente 1 H1 por página.`
      : `H1 único presente: "${h1s[0].text.substring(0, 60)}${h1s[0].text.length > 60 ? '…' : ''}"`,
  });

  // ── C2: Hierarquia de headings (12 pts) ──────────────────────
  let c2 = 12, c2level = 'ok';
  const skips = [];
  let prevLvl = 0;
  for (const n of headingNodes) {
    const lvl = parseInt(norm(n.level).replace('H', ''));
    if (prevLvl > 0 && lvl > prevLvl + 1) skips.push(`H${prevLvl}→H${lvl}`);
    prevLvl = lvl;
  }
  if      (skips.length === 0) { c2 = 12; c2level = 'ok'; }
  else if (skips.length === 1) { c2 = 7;  c2level = 'warn'; }
  else                         { c2 = 2;  c2level = 'critical'; }
  breakdown.push({ id: 'c2', label: 'Hierarquia sem saltos', pts: c2, max: 12, level: c2level,
    icon: c2level === 'ok' ? '✓' : c2level === 'warn' ? '⚠' : '✕',
    why: skips.length === 0
      ? 'Hierarquia sequencial correta — o Google consegue segmentar o conteúdo em passagens contíguas para passage ranking e featured snippets.'
      : `Salto${skips.length > 1 ? 's' : ''} detectado${skips.length > 1 ? 's' : ''}: ${skips.join(', ')}. Saltos quebram o modelo de segmentação de passagens do Google e prejudicam acessibilidade.`,
  });

  // ── C3: H1 ↔ Title semântico (12 pts) ────────────────────────
  let c3 = 0, c3level = 'ok';
  if (h1s.length === 1 && pageTitle) {
    const sim = hdJaccard(hdTokenize(h1s[0].text), hdTokenize(pageTitle));
    if      (sim >= 0.5) { c3 = 12; c3level = 'ok'; }
    else if (sim >= 0.3) { c3 = 7;  c3level = 'warn'; }
    else if (sim >= 0.1) { c3 = 3;  c3level = 'warn'; }
    else                 { c3 = 0;  c3level = 'critical'; }
    const simPct = Math.round(sim * 100);
    breakdown.push({ id: 'c3', label: 'H1 alinhado com o Title', pts: c3, max: 12, level: c3level,
      icon: c3level === 'ok' ? '✓' : c3level === 'warn' ? '⚠' : '✕',
      why: c3level === 'ok'
        ? `H1 e Title compartilham ${simPct}% de vocabulário — reforço mútuo do tópico. O Google correlaciona H1 e Title para confirmar o tema da página.`
        : c3level === 'warn'
        ? `Alinhamento parcial (${simPct}%) entre H1 e Title. H1 e Title devem reforçar o mesmo tópico sem ser idênticos — variações semânticas são bem-vindas.`
        : `H1 e Title com baixo alinhamento (${simPct}%). Tópicos divergentes confundem o Google sobre o assunto da página.`,
    });
  } else if (h1s.length !== 1) {
    breakdown.push({ id: 'c3', label: 'H1 alinhado com o Title', pts: 0, max: 12, level: 'critical',
      icon: '✕', why: 'Não avaliável sem exatamente 1 H1.',
    });
  } else {
    breakdown.push({ id: 'c3', label: 'H1 alinhado com o Title', pts: 0, max: 12, level: 'warn',
      icon: '⚠', why: 'Title tag não encontrado — sem base de comparação.',
    });
  }

  // ── C4: H1 ↔ URL slug (7 pts) ────────────────────────────────
  let c4 = 0, c4level = 'ok';
  if (h1s.length === 1 && pageUrl) {
    const slugWords = hdSlugWords(pageUrl);
    const h1Tokens  = hdTokenize(h1s[0].text);
    const matched   = slugWords.filter(sw => h1Tokens.some(ht => ht.includes(sw.toLowerCase()) || sw.toLowerCase().includes(ht))).length;
    const ratio     = slugWords.length > 0 ? matched / slugWords.length : 0;
    if      (ratio >= 0.5) { c4 = 7; c4level = 'ok'; }
    else if (ratio >= 0.25) { c4 = 4; c4level = 'warn'; }
    else                    { c4 = 1; c4level = 'warn'; }
    breakdown.push({ id: 'c4', label: 'H1 alinhado com a URL', pts: c4, max: 7, level: c4level,
      icon: c4level === 'ok' ? '✓' : '⚠',
      why: c4level === 'ok'
        ? `${Math.round(ratio * 100)}% das palavras do slug aparecem no H1 — URL e H1 reforçam o mesmo tópico para o Google.`
        : `Baixo alinhamento (${Math.round(ratio * 100)}%) entre H1 e slug da URL. Exemplo ideal: H1 "Aluguel de Empilhadeira em Goiânia" → /aluguel-empilhadeira-goiania.`,
    });
  } else {
    breakdown.push({ id: 'c4', label: 'H1 alinhado com a URL', pts: 1, max: 7, level: 'warn',
      icon: '⚠', why: 'Não avaliável sem H1 único ou URL.',
    });
  }

  // ── C5: Entity salience — nomes próprios, técnicos e números (12 pts) ─
  // Baseado em: avgTermWeight (Google Leak) + NLP entity recognition
  // hasNumber agora é sinal de especificidade (Patent: semantic distance shorter for specific terms)
  let c5 = 0, c5level = 'ok';
  const allHeadingText = headingNodes.map(n => n.text).join(' ');
  const properNounMatches = (allHeadingText.match(/(?<![.!?]\s)\b[A-ZÁÉÍÓÚÃÕ][a-záéíóúãõâêîôûç]{2,}\b/g) || []);
  const acronymMatches    = (allHeadingText.match(/\b[A-Z]{2,}(?:-\d+)?\b/g) || []);
  const yearMatches       = (allHeadingText.match(/\b(19|20)\d{2}\b/g) || []);
  const numberMatches     = (allHeadingText.match(/\b\d+(?:[.,]\d+)?(?:\s*%|\s*km|\s*m²|\s*kg|h|min)?\b/g) || []);
  // headings com número são mais específicos (ex: "5 passos", "NR-35", "R$ 500")
  const headingsWithNumbers = headingNodes.filter(n => n.hasNumber !== undefined ? n.hasNumber : /\d/.test(n.text)).length;
  const entityCount     = properNounMatches.length + acronymMatches.length + yearMatches.length + Math.floor(numberMatches.length / 2);
  const headingWordCount = (allHeadingText.match(/\b\w+\b/g) || []).length;
  const entityDensity   = headingWordCount > 0 ? entityCount / headingWordCount : 0;
  // Bônus por headings com números (especificidade concreta)
  const numberBonus = headingsWithNumbers >= 2 ? 2 : headingsWithNumbers >= 1 ? 1 : 0;

  if      (entityDensity >= 0.20) { c5 = Math.min(12, 10 + numberBonus); c5level = 'ok'; }
  else if (entityDensity >= 0.10) { c5 = Math.min(12, 7 + numberBonus);  c5level = 'warn'; }
  else if (entityDensity >= 0.05) { c5 = Math.min(12, 3 + numberBonus);  c5level = 'warn'; }
  else                            { c5 = numberBonus; c5level = 'critical'; }
  const entityExamples = [...new Set([...properNounMatches, ...acronymMatches])].slice(0, 3);
  breakdown.push({ id: 'c5', label: 'Entity salience — nomes, siglas e dados', pts: c5, max: 12, level: c5level,
    icon: c5level === 'ok' ? '✓' : c5level === 'warn' ? '⚠' : '✕',
    why: c5level === 'ok'
      ? `Boa densidade de entidades (${Math.round(entityDensity * 100)}%)${entityExamples.length ? ` — ${entityExamples.join(', ')}` : ''}. ${headingsWithNumbers >= 1 ? `${headingsWithNumbers} heading${headingsWithNumbers > 1 ? 's' : ''} com dados numéricos (especificidade E-E-A-T).` : ''}`
      : c5level === 'warn'
      ? `Densidade moderada de entidades (${Math.round(entityDensity * 100)}%). Adicione nomes de produtos, marcas, localidades, siglas técnicas ou dados numéricos nos headings.`
      : 'Headings com linguagem genérica — sem nomes próprios, siglas ou dados. Entidades específicas são o principal diferencial de topical authority para o Google.',
  });

  // ── C6: Consistência tópica H2s → H1 (10 pts) ───────────────
  let c6 = 0, c6level = 'ok';
  if (h1s.length === 1 && h2s.length > 0) {
    const h1tok = hdTokenize(h1s[0].text);
    const sims  = h2s.map(h => hdJaccard(hdTokenize(h.text), h1tok));
    const avg   = sims.reduce((a, b) => a + b, 0) / sims.length;
    if      (avg >= 0.30) { c6 = 10; c6level = 'ok'; }
    else if (avg >= 0.15) { c6 = 6;  c6level = 'warn'; }
    else                  { c6 = 2;  c6level = 'critical'; }
    breakdown.push({ id: 'c6', label: 'H2s consistentes com o H1', pts: c6, max: 10, level: c6level,
      icon: c6level === 'ok' ? '✓' : c6level === 'warn' ? '⚠' : '✕',
      why: c6level === 'ok'
        ? `H2s com boa coerência semântica em relação ao H1 (${Math.round(avg * 100)}% de sobreposição média). O Google interpreta os H2s como expansões do tópico principal.`
        : c6level === 'warn'
        ? `H2s parcialmente alinhados com o H1 (${Math.round(avg * 100)}% de sobreposição). Garanta que cada H2 aprofunde o tópico do H1 em vez de introduzir assuntos desconexos.`
        : `H2s sem relação com o H1 — o conteúdo parece cobrir múltiplos tópicos sem foco. Isso enfraquece a topical authority e dificulta o ranqueamento.`,
    });
  } else if (h2s.length === 0) {
    breakdown.push({ id: 'c6', label: 'H2s consistentes com o H1', pts: 0, max: 10, level: 'critical',
      icon: '✕', why: 'Nenhum H2 encontrado. H2s são necessários para estruturar o conteúdo em seções e guiar o crawler pelo tópico.',
    });
  } else {
    breakdown.push({ id: 'c6', label: 'H2s consistentes com o H1', pts: 0, max: 10, level: 'critical',
      icon: '✕', why: 'Não avaliável sem exatamente 1 H1.',
    });
  }

  // ── C7: Snippet Targets — perguntas + listas enumeradas (8 pts) ─
  // Baseado em: Blue Corona study (56% featured snippets vêm de H2)
  // Patent US10592553B1: passage com pergunta + lista = snippet candidate ideal
  let c7 = 0, c7level = 'ok';
  // QUESTION_RE e ENUMERATED_RE são globais (definidas antes de HEADING_STOPWORDS)
  const snippetTargets = h2s.filter(n => {
    const t = n.text.trim();
    const isQuestion   = QUESTION_RE.test(t);
    const isEnumerated = ENUMERATED_RE.test(t);
    // H2 com lista abaixo = snippet candidate mesmo sem ser pergunta
    const hasList = n.listCount > 0;
    return isQuestion || isEnumerated || (hasList && n.pCount >= 1);
  });
  if      (snippetTargets.length >= 2) { c7 = 8; c7level = 'ok'; }
  else if (snippetTargets.length === 1) { c7 = 4; c7level = 'warn'; }
  else if (h2s.length >= 3)            { c7 = 0; c7level = 'warn'; }
  else                                 { c7 = 4; c7level = 'ok'; }
  breakdown.push({ id: 'c7', label: 'Featured Snippet targets', pts: c7, max: 8, level: c7level,
    icon: c7level === 'ok' ? '✓' : '⚠',
    why: snippetTargets.length >= 2
      ? `${snippetTargets.length} H2s com potencial de featured snippet (perguntas, listas enumeradas ou H2+lista). Blue Corona: 56% dos snippets extraídos de H2. Ex: "${snippetTargets[0].text.substring(0, 50)}"`
      : snippetTargets.length === 1
      ? `Apenas 1 H2 com potencial de snippet. Adicione H2s com perguntas ("Como funciona X?") ou listas enumeradas ("5 passos para Y") para aumentar elegibilidade.`
      : `Nenhum H2 com estrutura de pergunta ou lista enumerada. Para aparecer em "Pessoas também perguntam" e featured snippets, estruture H2s como perguntas respondíveis.`,
  });

  // ── C8: Primeiro H2 reforça o H1 (9 pts) ─────────────────────
  let c8 = 0, c8level = 'ok';
  if (h1s.length === 1 && h2s.length > 0) {
    const sim = hdJaccard(hdTokenize(h2s[0].text), hdTokenize(h1s[0].text));
    if      (sim >= 0.4) { c8 = 9; c8level = 'ok'; }
    else if (sim >= 0.2) { c8 = 5; c8level = 'warn'; }
    else                 { c8 = 2; c8level = 'warn'; }
    breakdown.push({ id: 'c8', label: 'Primeiro H2 reforça o H1', pts: c8, max: 9, level: c8level,
      icon: c8level === 'ok' ? '✓' : '⚠',
      why: c8level === 'ok'
        ? `O primeiro H2 "${h2s[0].text.substring(0, 50)}" expande diretamente o tópico do H1 — estrutura ideal para guiar o crawler desde o início do conteúdo.`
        : `O primeiro H2 "${h2s[0].text.substring(0, 50)}" tem baixo alinhamento com o H1. O primeiro H2 deve ser a continuação natural do tópico do H1, não um desvio.`,
    });
  } else {
    breakdown.push({ id: 'c8', label: 'Primeiro H2 reforça o H1', pts: 0, max: 9, level: 'warn',
      icon: '⚠', why: 'Sem H1 único ou sem H2 para avaliar.',
    });
  }

  // ── C9: Headings duplicados (7 pts) ──────────────────────────
  let c9 = 0, c9level = 'ok';
  const headingTexts = headingNodes.map(n => n.text.trim().toLowerCase());
  const uniqueTexts  = new Set(headingTexts);
  const dupCount     = headingTexts.length - uniqueTexts.size;
  if      (dupCount === 0) { c9 = 7; c9level = 'ok'; }
  else if (dupCount === 1) { c9 = 4; c9level = 'warn'; }
  else                     { c9 = 0; c9level = 'critical'; }
  // Encontra os duplicados para mostrar no texto
  const seen = new Set();
  const dups = headingTexts.filter(t => { if (seen.has(t)) return true; seen.add(t); return false; });
  breakdown.push({ id: 'c9', label: 'Headings únicos — sem repetição', pts: c9, max: 7, level: c9level,
    icon: c9level === 'ok' ? '✓' : c9level === 'warn' ? '⚠' : '✕',
    why: c9level === 'ok'
      ? 'Todos os headings têm texto único — cada seção aborda um ângulo diferente do tópico.'
      : `${dupCount} heading${dupCount > 1 ? 's' : ''} repetido${dupCount > 1 ? 's' : ''}: "${dups[0]}". Headings duplicados sinalizam conteúdo thin e falta de profundidade temática.`,
  });

  // ── C10: Passage Completeness — H2s com conteúdo suficiente (7 pts) ─
  // Baseado em: Patent US10592553B1 (passage indexing)
  // Cada H2 = mini-documento independente. Passage sem conteúdo = invisível para snippet extraction.
  let c10 = 0, c10level = 'ok';
  const h2sWithData = h2s.filter(n => n.pCount !== undefined); // verifica se temos os novos dados
  if (h2s.length === 0) {
    c10 = 0; c10level = 'critical';
    breakdown.push({ id: 'c10', label: 'Passage Completeness', pts: 0, max: 7, level: 'critical',
      icon: '✕', why: 'Nenhum H2 encontrado. Sem H2s, o Google não consegue segmentar o conteúdo em passagens independentes para featured snippets e passage ranking.',
    });
  } else if (h2sWithData.length === 0) {
    // dados antigos sem pCount — fallback neutro
    c10 = 4; c10level = 'warn';
    breakdown.push({ id: 'c10', label: 'Passage Completeness', pts: 4, max: 7, level: 'warn',
      icon: '⚠', why: 'Não foi possível analisar o conteúdo abaixo dos H2s nesta versão. Recarregue a extensão para obter a análise completa.',
    });
  } else {
    // isComplete = H2 tem ≥2 parágrafos OU ≥1 lista OU ≥100 palavras abaixo
    const completePassages  = h2s.filter(n => n.pCount >= 2 || n.listCount >= 1 || n.wordsBelow >= 100);
    const incompleteParts   = h2s.filter(n => n.pCount < 2 && n.listCount === 0 && (n.wordsBelow || 0) < 100);
    const completeRatio     = completePassages.length / h2s.length;
    if      (completeRatio >= 1.0)  { c10 = 7; c10level = 'ok'; }
    else if (completeRatio >= 0.7)  { c10 = 5; c10level = 'warn'; }
    else if (completeRatio >= 0.4)  { c10 = 2; c10level = 'warn'; }
    else                            { c10 = 0; c10level = 'critical'; }
    const incompleteNames = incompleteParts.slice(0, 2).map(n => `"${n.text.substring(0, 35)}"`).join(', ');
    breakdown.push({ id: 'c10', label: 'Passage Completeness', pts: c10, max: 7, level: c10level,
      icon: c10level === 'ok' ? '✓' : c10level === 'warn' ? '⚠' : '✕',
      passageData: h2s.map(n => ({
        text: n.text, pCount: n.pCount || 0, listCount: n.listCount || 0,
        wordsBelow: n.wordsBelow || 0,
        isComplete: n.pCount >= 2 || n.listCount >= 1 || (n.wordsBelow || 0) >= 100,
        isSnippetReady: (QUESTION_RE.test(n.text.trim()) || ENUMERATED_RE.test(n.text.trim())) && (n.listCount > 0 || n.pCount >= 1),
      })),
      why: c10level === 'ok'
        ? `Todos os ${h2s.length} H2s têm conteúdo suficiente abaixo — cada passagem é um mini-documento completo. Google pode extrair featured snippets de qualquer seção.`
        : c10level === 'warn'
        ? `${completePassages.length} de ${h2s.length} H2s têm conteúdo suficiente. Passagens incompletas (${incompleteNames}) têm poucas chances de virar featured snippet.`
        : `A maioria dos H2s está sem conteúdo suficiente abaixo. Cada H2 precisa de ≥2 parágrafos ou ≥1 lista para ser candidato a passage ranking e featured snippet.`,
    });
  }

  // ── C11: E-E-A-T — especificidade, expertise e ênfase (5 pts) ──
  // hasBold = avgTermWeight (Google Leak): <strong> dentro de heading eleva peso semântico
  let c11 = 0, c11level = 'ok';
  const EEAT_PATTERNS = [
    /\b(20\d{2}|19\d{2})\b/,
    /\b(segundo|de acordo|conforme|baseado em)\b/i,
    /\b(NR-\d+|ISO[-\s]\d+|ABNT|CRM|CRP|OAB)\b/i,
    /\b(Dr\.|Prof\.|Eng\.)\b/i,
    /\b(\d+\s*anos?)\b/i,
    /\b(estudo|pesquisa|dados?|relatório|evidência)\b/i,
    /\b(certificado|aprovado|homologado|auditado)\b/i,
  ];
  const eeatHeadings = headingNodes.filter(n => EEAT_PATTERNS.some(p => p.test(n.text)));
  const boldHeadings = headingNodes.filter(n => n.hasBold !== undefined ? n.hasBold : false);
  const eeatRatio    = total > 0 ? eeatHeadings.length / total : 0;
  const boldBonus11  = boldHeadings.length >= 1 ? 1 : 0;
  if      (eeatRatio >= 0.15) { c11 = Math.min(5, 4 + boldBonus11); c11level = 'ok'; }
  else if (eeatRatio >= 0.05) { c11 = Math.min(5, 2 + boldBonus11); c11level = 'warn'; }
  else                        { c11 = boldBonus11; c11level = 'warn'; }
  breakdown.push({ id: 'c11', label: 'E-E-A-T — expertise e ênfase', pts: c11, max: 5, level: c11level,
    icon: c11level === 'ok' ? '✓' : '⚠',
    why: c11level === 'ok'
      ? `${eeatHeadings.length} heading${eeatHeadings.length > 1 ? 's' : ''} com sinais de expertise.${boldHeadings.length ? ` ${boldHeadings.length} com &lt;strong&gt; — peso semântico elevado (avgTermWeight).` : ''}`
      : `Headings sem sinais de expertise (datas, NR-XX, ISO, títulos profissionais).${boldHeadings.length ? '' : ' Considere usar &lt;strong&gt; em termos-chave dentro dos headings.'}`,
  });

  // ── C12: Information gain H3 vs H2 (5 pts) ───────────────────
  let c12 = 0, c12level = 'ok';
  if (h2s.length > 0 && h3s.length > 0) {
    let gainCount = 0;
    let pairCount = 0;
    let lastH2idx = -1;
    for (let i = 0; i < headingNodes.length; i++) {
      const n = headingNodes[i];
      if (norm(n.level) === 'H2') { lastH2idx = i; }
      else if (norm(n.level) === 'H3' && lastH2idx >= 0) {
        pairCount++;
        const h2tok = hdTokenize(headingNodes[lastH2idx].text);
        const h3tok = hdTokenize(n.text);
        const sim   = hdJaccard(h2tok, h3tok);
        if (sim < 0.8) gainCount++; // H3 introduz algo novo
      }
    }
    const gainRatio = pairCount > 0 ? gainCount / pairCount : 0;
    if      (gainRatio >= 0.7) { c12 = 5; c12level = 'ok'; }
    else if (gainRatio >= 0.4) { c12 = 3; c12level = 'warn'; }
    else                       { c12 = 0; c12level = 'warn'; }
    breakdown.push({ id: 'c12', label: 'H3s adicionam informação nova', pts: c12, max: 5, level: c12level,
      icon: c12level === 'ok' ? '✓' : '⚠',
      why: c12level === 'ok'
        ? `${Math.round(gainRatio * 100)}% dos H3s introduzem ângulos novos em relação ao H2 pai — boa profundidade de conteúdo sem repetição.`
        : `Alguns H3s parecem repetir o H2 pai com outras palavras. Cada H3 deve aprofundar ou especificar um aspecto do H2, não parafraseá-lo.`,
    });
  } else {
    breakdown.push({ id: 'c12', label: 'H3s adicionam informação nova', pts: 3, max: 5, level: 'ok',
      icon: '✓', why: 'Não aplicável — sem pares H2+H3 para comparar.',
    });
  }

  // ── Score final ───────────────────────────────────────────────
  const finalScore = Math.min(100, Math.max(0, breakdown.reduce((s, c) => s + c.pts, 0)));

  const gradeTable = [
    { min: 90, label: 'Excelente', cls: 'excelente',
      why: 'Estrutura de headings publication-ready. H1 único, hierarquia correta, entidades ricas e coerência semântica forte.' },
    { min: 75, label: 'Bom',       cls: 'bom',
      why: 'Estrutura sólida com 1-2 pontos de melhoria. Corrija antes de publicar para maximizar a visibilidade nos resultados.' },
    { min: 60, label: 'Regular',   cls: 'regular',
      why: 'Problemas estruturais presentes. Risco de perda de featured snippets e passage ranking. Revise headings antes de publicar.' },
    { min: 40, label: 'Ruim',      cls: 'ruim',
      why: 'Falhas críticas na estrutura — H1 ausente, saltos de hierarquia ou headings genéricos. Reescrita necessária antes da publicação.' },
    { min: 0,  label: 'Crítico',   cls: 'critico',
      why: 'A página não tem estrutura semântica legível pelo Google. Prioridade máxima — sem correção, passage ranking e featured snippets são impossíveis.' },
  ];
  const grade = gradeTable.find(g => finalScore >= g.min) || gradeTable[gradeTable.length - 1];

  return { score: finalScore, breakdown, grade };
}

// ── Entity Salience Analysis ───────────────────────────────────────────────
function renderEntitySalience(headingNodes) {
  // entity-panel foi removido — a função agora só alimenta o score bar
  if (!headingNodes.length) return;

  const issues = [];
  const allText = headingNodes.map(n => n.text.toLowerCase()).join(' ');
  // level pode vir como 'h1' (content_analyzer) ou 'H1' (popup.js fallback)
  const norm = l => l.toUpperCase();
  const h1s = headingNodes.filter(n => norm(n.level) === 'H1');
  const h2s = headingNodes.filter(n => norm(n.level) === 'H2');
  const h3s = headingNodes.filter(n => norm(n.level) === 'H3');

  // Detecta tópico principal a partir do H1 (primeiras palavras significativas)
  const stopWords = new Set(['de','da','do','das','dos','a','o','as','os','e','em','para','que','se','na','no','com','por','um','uma','ao','à','é','são','foi','tem']);
  const h1Text = h1s[0]?.text || '';
  const topicWords = h1Text.toLowerCase()
    .replace(/[^a-záéíóúãõâêîôûç\s]/gi, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 3);
  const topicLabel = topicWords.join(' ') || '—';

  // ── Checagens ────────────────────────────────────────────────────────────

  // 1. Tem H1?
  if (h1s.length === 0) {
    issues.push({ type: 'bad', text: 'Sem H1 — o Google não tem âncora para o tópico principal da página.' });
  } else if (h1s.length > 1) {
    issues.push({ type: 'warn', text: `${h1s.length} H1s encontrados — use apenas um H1 por página.` });
  } else {
    issues.push({ type: 'ok', text: `H1 presente: "${h1s[0].text.substring(0, 60)}${h1s[0].text.length > 60 ? '…' : ''}"` });
  }

  // 2. H1 reforça o tópico? (verifica se as palavras do tópico aparecem nos H2s)
  if (topicWords.length > 0 && h2s.length > 0) {
    const h2sWithTopic = h2s.filter(h => topicWords.some(w => h.text.toLowerCase().includes(w)));
    const pct = Math.round((h2sWithTopic.length / h2s.length) * 100);
    if (pct >= 50) {
      issues.push({ type: 'ok', text: `${pct}% dos H2s reforçam o tópico principal — boa cobertura semântica.` });
    } else if (pct >= 25) {
      issues.push({ type: 'warn', text: `Apenas ${pct}% dos H2s mencionam o tópico do H1 — considere alinhar mais subseções ao tema central.` });
    } else {
      issues.push({ type: 'bad', text: `H2s não reforçam o tópico do H1 — os subtítulos parecem desconexos do tema principal para o Google.` });
    }
  }

  // 3. Hierarquia respeitada?
  // Regra: um heading só é salto se for MAIS PROFUNDO que (nível anterior + 1).
  // Subir de nível (H3 → H2) é sempre válido.
  // Exemplos: H1→H3 = salto | H1→H2→H3→H2→H3 = ok | H2→H4 = salto
  let prevLevel = 0;
  let hierarchyBroken = false;
  let brokenExample = '';
  for (const n of headingNodes) {
    const lvl = parseInt(n.level.replace(/h/i, ''));
    if (prevLevel > 0 && lvl > prevLevel + 1) {
      hierarchyBroken = true;
      brokenExample = `H${prevLevel} → H${lvl}`;
      break;
    }
    prevLevel = lvl;
  }
  if (hierarchyBroken) {
    issues.push({ type: 'warn', text: `Hierarquia quebrada — salto detectado (${brokenExample} sem nível intermediário). O Google prefere progressão sequencial.` });
  } else {
    issues.push({ type: 'ok', text: 'Hierarquia sequencial correta — sem saltos de nível.' });
  }

  // 4. Quantidade de H2s
  if (h2s.length === 0) {
    issues.push({ type: 'warn', text: 'Nenhum H2 encontrado — estruture o conteúdo em seções com H2 para facilitar a leitura do Google.' });
  } else if (h2s.length > 12) {
    issues.push({ type: 'warn', text: `${h2s.length} H2s — muitos subtítulos podem diluir a entity salience. Considere agrupar seções relacionadas.` });
  }

  // 5. Comprimento médio
  const avgWords = headingNodes.reduce((s, n) => s + n.text.split(/\s+/).length, 0) / headingNodes.length;
  if (avgWords < 3) {
    issues.push({ type: 'warn', text: 'Títulos muito curtos em média — headings vagos não transmitem contexto suficiente ao Google.' });
  } else if (avgWords > 12) {
    issues.push({ type: 'warn', text: 'Títulos muito longos em média — headings longos diluem a palavra-chave principal.' });
  } else {
    issues.push({ type: 'ok', text: `Comprimento médio dos títulos adequado (${avgWords.toFixed(1)} palavras).` });
  }

  // ── Análise de qualidade dos H2s ─────────────────────────────────────────
  const h2Quality = { score: 100, issues: [] };

  if (h2s.length > 0) {
    // A. Keyword coverage — % dos H2s que mencionam o tópico do H1
    if (topicWords.length > 0) {
      const withKw = h2s.filter(h => topicWords.some(w => h.text.toLowerCase().includes(w)));
      const kwPct  = Math.round((withKw.length / h2s.length) * 100);
      if (kwPct < 30) {
        h2Quality.score -= 25;
        h2Quality.issues.push({ type: 'bad', text: `Apenas ${kwPct}% dos H2s mencionam o tópico principal — H2s genéricos demais para o Google entender o tema da página.` });
      } else if (kwPct < 50) {
        h2Quality.score -= 10;
        h2Quality.issues.push({ type: 'warn', text: `${kwPct}% dos H2s reforçam o tópico — considere incluir a keyword em mais subtítulos.` });
      } else {
        h2Quality.issues.push({ type: 'ok', text: `${kwPct}% dos H2s reforçam o tópico — boa cobertura semântica.` });
      }
    }

    // B. H2s genéricos (frases de template sem a keyword)
    const GENERIC_PATTERNS = [
      /^(o que nossos|nossos clientes|clientes (dizem|falam))/i,
      /^(perguntas frequentes|faq|dúvidas)/i,
      /^(sobre nós|quem somos|a empresa|nossa empresa)/i,
      /^(entre em contato|fale conosco|contato)/i,
      /^(veja (também|mais)|saiba mais|leia mais)/i,
      /^(da ideia|do projeto|passo a passo)/i,
      /^(alguns projetos|nossos projetos|projetos realizados)/i,
    ];
    const genericH2s = h2s.filter(h => GENERIC_PATTERNS.some(p => p.test(h.text.trim())));
    if (genericH2s.length > 0) {
      h2Quality.score -= Math.min(genericH2s.length * 8, 24);
      h2Quality.issues.push({ type: 'warn', text: `${genericH2s.length} H2${genericH2s.length > 1 ? 's' : ''} genérico${genericH2s.length > 1 ? 's' : ''} sem keyword (ex: "${escHtml(genericH2s[0].text.substring(0, 40))}") — difíceis de ranquear isoladamente.` });
    }

    // C. H2s longos demais (>10 palavras)
    const longH2s = h2s.filter(h => h.text.split(/\s+/).length > 10);
    if (longH2s.length >= 2) {
      h2Quality.score -= 8;
      h2Quality.issues.push({ type: 'warn', text: `${longH2s.length} H2s com mais de 10 palavras — títulos longos diluem a palavra-chave principal.` });
    }

    // D. Starts duplicados (primeiras 2 palavras iguais)
    const starts = h2s.map(h => h.text.toLowerCase().split(/\s+/).slice(0, 2).join(' '));
    const dupStarts = starts.filter((s, i) => starts.indexOf(s) !== i);
    if (dupStarts.length > 0) {
      h2Quality.score -= 8;
      h2Quality.issues.push({ type: 'warn', text: `${dupStarts.length} H2${dupStarts.length > 1 ? 's' : ''} com início repetido — varie a abertura dos subtítulos para cobrir mais intenções de busca.` });
    }

    h2Quality.score = Math.max(0, h2Quality.score);
  }

  // ── Score 0-100 ──────────────────────────────────────────────────────────
  let deductions = 0;
  const noH1 = h1s.length === 0;
  const multiH1 = h1s.length > 1;

  // Penalidades dos issues existentes
  issues.forEach(i => {
    if (i.type === 'bad') {
      deductions += i.text.startsWith('Sem H1') ? 50 : 20;
    } else if (i.type === 'warn') {
      deductions += i.text.includes('H1s encontrados') ? 25 : 8;
    }
  });

  // ── Penalidades adicionais críticas ──────────────────────────────────────

  // H1 no final da página (posição > 70% dos headings)
  if (h1s.length === 1) {
    const h1idx = headingNodes.findIndex(n => norm(n.level) === 'H1');
    if (h1idx > headingNodes.length * 0.7) {
      deductions += 25;
      issues.push({ type: 'bad', text: `H1 aparece no final da página (posição ${h1idx + 1}/${headingNodes.length}) — o H1 deve ser o primeiro elemento de conteúdo, não o último.` });
    }
  }

  // H1 genérico (não descreve o negócio)
  const GENERIC_H1 = /^(contato|contact|home|início|index|bem.vindo|welcome|sobre|about|início|início)$/i;
  if (h1s.length === 1 && GENERIC_H1.test(h1s[0].text.trim())) {
    deductions += 30;
    issues.push({ type: 'bad', text: `H1 genérico: "${h1s[0].text}" — não define o tópico da página para o Google. Use o nome do serviço ou produto principal.` });
  }

  // H3s sem H2 pai imediato (saltos na hierarquia)
  let orphanH3 = 0;
  let lastWasH2 = false;
  let hasH2BeforeH3 = false;
  headingNodes.forEach(n => {
    const lvl = parseInt(n.level.replace(/h/i, ''));
    if (lvl === 2) { lastWasH2 = true; hasH2BeforeH3 = true; }
    else if (lvl === 3) {
      if (!hasH2BeforeH3) orphanH3++;
      lastWasH2 = false;
    } else if (lvl === 1) { hasH2BeforeH3 = false; lastWasH2 = false; }
  });
  if (orphanH3 > 0) {
    deductions += Math.min(orphanH3 * 8, 20);
    issues.push({ type: 'warn', text: `${orphanH3} H3${orphanH3 > 1 ? 's' : ''} sem H2 pai — subtítulos H3 precisam estar sob um H2 que os contextualize.` });
  }

  // Títulos fragmentados (menos de 2 palavras — ex: "SOBRE", "CLIENTES")
  const fragmentTitles = headingNodes.filter(n => {
    const lvl = parseInt(n.level.replace(/h/i, ''));
    return lvl <= 3 && n.text.trim().split(/\s+/).length < 2;
  });
  if (fragmentTitles.length >= 2) {
    deductions += Math.min(fragmentTitles.length * 5, 20);
    issues.push({ type: 'bad', text: `${fragmentTitles.length} títulos de 1 palavra só (ex: "${fragmentTitles[0].text}") — headings de uma palavra não transmitem contexto semântico ao Google.` });
  }

  // H2s que são continuação de frase (título só faz sentido lendo o anterior)
  // Detecta H3 imediatamente após H2 que parece completar a frase
  let continuationCount = 0;
  for (let i = 1; i < headingNodes.length; i++) {
    const prev = headingNodes[i - 1];
    const curr = headingNodes[i];
    const prevLvl = parseInt(prev.level.replace(/h/i, ''));
    const currLvl = parseInt(curr.level.replace(/h/i, ''));
    if (prevLvl === 2 && currLvl === 3) {
      // Se o H2 termina sem ponto final e o H3 parece continuar
      const prevText = prev.text.trim();
      const currText = curr.text.trim();
      if (!prevText.endsWith('.') && !prevText.endsWith('?') &&
          prevText.length < 30 && currText.length < 30 &&
          !currText.match(/^(como|por que|quando|onde|quem|o que)/i)) {
        continuationCount++;
      }
    }
  }
  if (continuationCount >= 2) {
    deductions += 15;
    issues.push({ type: 'bad', text: `${continuationCount} pares H2+H3 parecem fragmentos de frase — cada título deve ser autossuficiente e compreensível fora de contexto.` });
  }

  // H2s de empresa/institucional demais sem produto/serviço (missão, valores, estrutura, profissionais)
  const institutionalOnly = ['missão','valores','tecnologia','estrutura','profissionais','história','equipe','time'];
  const institutionalH2s = h2s.filter(h => institutionalOnly.some(w => h.text.toLowerCase().includes(w)));
  if (institutionalH2s.length >= 3) {
    deductions += 15;
    issues.push({ type: 'warn', text: `${institutionalH2s.length} H2s institucionais (missão/valores/estrutura) sem menção ao produto/serviço — priorize subtítulos que reforcem o que você vende.` });
  }

  // ── Novo engine de 12 critérios ──────────────────────────────
  const pageTitle   = typeof graphData !== 'undefined' ? (graphData?.title || '') : '';
  const pageUrl     = typeof graphData !== 'undefined' ? (graphData?.url   || '') : '';
  const wc          = typeof graphData !== 'undefined' ? (graphData?.wordCount || 0) : 0;
  const { score: newScore, breakdown: newBreakdown, grade: newGrade } = computeHeadingScore(headingNodes, pageTitle, pageUrl, wc);

  // ── Popula score bar no topo da aba (sempre visível) ──
  const sbNum    = document.getElementById('headings-score-number');
  const sbBadge  = document.getElementById('headings-score-badge');
  const sbFill   = document.getElementById('headings-score-fill');
  const sbIssues = document.getElementById('headings-score-issues');

  if (sbNum) {
    let cur = 0;
    const t = setInterval(() => {
      cur = Math.min(cur + 3, newScore);
      sbNum.textContent = cur;
      if (cur >= newScore) clearInterval(t);
    }, 20);
  }
  if (sbBadge) {
    sbBadge.textContent = newGrade.label;
    sbBadge.className   = 'headings-score-badge ' + newGrade.cls;
  }
  if (sbFill) {
    sbFill.style.width  = newScore + '%';
    sbFill.className    = 'headings-score-fill ' + newGrade.cls;
  }
  if (sbIssues) {
    const ctaLine = `<span class="headings-score-cta">A estrutura de títulos desta página será enviada para a IA, que vai analisar e propor uma hierarquia ideal. Clique em <strong>Analisar com IA</strong> acima.</span>`;

    sbIssues.innerHTML = `
      <div class="lds-grade-why">${escHtml(newGrade.why)}</div>
      <div class="lds-accordion">
        <button class="lds-accordion-toggle" type="button">
          <span>Como essa nota foi calculada? <span class="lds-accordion-hint">ver ${newBreakdown.length} critérios</span></span>
          <svg class="lds-accordion-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="lds-accordion-body" style="display:none">
          <div class="lds-breakdown">
            ${newBreakdown.map(c => `
            <div class="lds-criterion lds-criterion--${c.level}">
              <div class="lds-criterion-header">
                <span class="lds-criterion-icon">${c.icon}</span>
                <span class="lds-criterion-label">${c.label}</span>
                <span class="lds-criterion-pts ${c.pts === c.max ? 'lds-pts-full' : c.pts === 0 ? 'lds-pts-zero' : 'lds-pts-partial'}">${c.pts}/${c.max}</span>
              </div>
              <div class="lds-criterion-why">${escHtml(c.why)}</div>
            </div>`).join('')}
          </div>
        </div>
      </div>
      ${ctaLine}
    `;

    const accBtn = sbIssues.querySelector('.lds-accordion-toggle');
    const accBody = sbIssues.querySelector('.lds-accordion-body');
    const accChevron = sbIssues.querySelector('.lds-accordion-chevron');
    if (accBtn && accBody) {
      accBtn.addEventListener('click', () => {
        const open = accBody.style.display !== 'none';
        accBody.style.display = open ? 'none' : 'block';
        if (accChevron) accChevron.style.transform = open ? '' : 'rotate(180deg)';
      });
    }
  }
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── KNOWLEDGE GRAPH ──
function renderGraph(data) {
  const schemas = (data.schemas || []).filter(s => s.valid && s.raw);
  const canvas = document.getElementById('graph-canvas');
  const infoEl = document.getElementById('graph-info');
  const emptyEl = document.getElementById('graph-empty');

  if (schemas.length === 0) {
    emptyEl.style.display = 'flex';
    canvas.style.display = 'none';
    return;
  }

  // ── Limites ──
  const MAX_NODES = 1200;
  const MAX_LINKS = 2500;

  // ── Build graph nodes + links from JSON-LD ──
  const nodes = new Map();
  const links = [];
  const idToNodeId = new Map();   // @id string → nodeId
  const unresolvedLinks = [];
  let _nc = 0; // node counter

  // ID: @id quando disponível (único no schema), senão counter sequencial simples
  function makeNodeId(obj) {
    const atId = obj && obj['@id'];
    if (atId && typeof atId === 'string' && atId.trim()) return 'id::' + atId.trim();
    return 'n::' + (_nc++);
  }

  // Color palette per @type
  const TYPE_COLORS = {
    'Organization':'#7c74ff','WebSite':'#3b82f6','WebPage':'#06b6d4',
    'LocalBusiness':'#10b981','Product':'#f59e0b','Service':'#f59e0b',
    'Article':'#ec4899','BlogPosting':'#ec4899','FAQPage':'#8b5cf6',
    'Person':'#ef4444','BreadcrumbList':'#64748b','ListItem':'#64748b',
    'ImageObject':'#84cc16','VideoObject':'#14b8a6','Review':'#f97316',
    'AggregateRating':'#f97316','Offer':'#a855f7','ContactPoint':'#22d3ee',
    'PostalAddress':'#94a3b8','SiteLinksSearchBox':'#60a5fa','SearchAction':'#60a5fa',
    'HowTo':'#f472b6','HowToStep':'#fb7185','Event':'#34d399','Course':'#a3e635',
    'Recipe':'#fbbf24','JobPosting':'#60a5fa','NewsArticle':'#e879f9',
  };
  const DEFAULT_COLOR = '#a78bfa';
  function getColor(type) {
    if (!type) return DEFAULT_COLOR;
    const t = Array.isArray(type) ? type[0] : type;
    return TYPE_COLORS[t] || DEFAULT_COLOR;
  }

  function truncate(str, max) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) + '…' : str;
  }

  // Calcula profundidade máxima real do JSON
  function calcMaxDepth(obj, d = 0) {
    if (!obj || typeof obj !== 'object') return d;
    if (Array.isArray(obj)) return Math.max(...obj.map(i => calcMaxDepth(i, d)));
    return Math.max(d, ...Object.values(obj).map(v => calcMaxDepth(v, d + 1)));
  }
  const dynamicMaxDepth = Math.min(calcMaxDepth(schemas.map(s => s.raw)), 14);

  function collectNodes(obj, parentId, edgeLabel, depth) {
    if (!obj || typeof obj !== 'object' || depth > dynamicMaxDepth) return;
    if (nodes.size >= MAX_NODES || links.length >= MAX_LINKS) return;

    const type = obj['@type'];
    const atId = obj['@id'];

    // Só @id → deferido para resolução posterior
    const keys = Object.keys(obj);
    if (keys.length === 1 && keys[0] === '@id') {
      if (atId && parentId) unresolvedLinks.push({ sourceId: parentId, targetAtId: atId.trim(), label: edgeLabel });
      return;
    }

    const nodeId = makeNodeId(obj);

    // Se já existe (mesmo @id referenciado de outro lugar), só adiciona o link e não recursa
    if (nodes.has(nodeId)) {
      if (parentId) links.push({ sourceId: parentId, targetId: nodeId, label: edgeLabel });
      return;
    }

    const name = obj['name'] || obj['url'] || (atId ? atId.split('/').pop().split('#').pop() : '') || '';
    const typeLabel = type ? (Array.isArray(type) ? type[0] : type) : null;

    const node = {
      id: nodeId,
      type: typeLabel,
      label: truncate(name || typeLabel || '?', 50),
      fullType: type,
      atId: atId,
      depth,
      radius: Math.max(5, 20 - depth * 2),
      color: getColor(type),
      props: {},
    };

    // Tooltip props — todos os campos string superficiais
    const TOOLTIP_PROPS = ['name','url','description','telephone','email','addressLocality','streetAddress','ratingValue','addressRegion','postalCode'];
    TOOLTIP_PROPS.forEach(p => {
      if (obj[p] && typeof obj[p] === 'string') node.props[p] = truncate(obj[p], 70);
    });

    nodes.set(nodeId, node);
    if (atId) idToNodeId.set(atId.trim(), nodeId);
    if (parentId) links.push({ sourceId: parentId, targetId: nodeId, label: edgeLabel });

    // Percorre TODOS os campos (sem SKIP_KEYS agressivo)
    const SKIP = new Set(['@context', '@type', '@id']);
    Object.entries(obj).forEach(([k, v]) => {
      if (SKIP.has(k)) return;
      if (nodes.size >= MAX_NODES || links.length >= MAX_LINKS) return;
      if (Array.isArray(v)) {
        v.forEach(item => { if (item && typeof item === 'object') collectNodes(item, nodeId, k, depth + 1); });
      } else if (v && typeof v === 'object') {
        collectNodes(v, nodeId, k, depth + 1);
      }
    });
  }

  // Cria nó raiz virtual por script — ancora todos os nós de nível 0
  function createScriptRoot(index, scriptObj) {
    const types = scriptObj['@graph']
      ? [...new Set(scriptObj['@graph'].map(n => n['@type']).filter(Boolean).flat())]
      : (scriptObj['@type'] ? [].concat(scriptObj['@type']) : []);
    const label = types.slice(0,2).join(' + ') || `Script ${index + 1}`;
    const rootId = `script-root-${index}`;
    nodes.set(rootId, {
      id: rootId,
      type: types[0] || null,
      label: truncate(label, 40),
      fullType: types,
      atId: null,
      depth: -1,
      radius: 16,
      color: '#4b5563',
      props: {},
      isRoot: true,
    });
    return rootId;
  }

  function processJsonLd(obj, scriptIndex) {
    if (Array.isArray(obj)) { obj.forEach((i, idx) => processJsonLd(i, idx)); return; }
    if (!obj || typeof obj !== 'object') return;

    const rootId = createScriptRoot(scriptIndex, obj);

    if (obj['@graph']) {
      obj['@graph'].forEach(i => collectNodes(i, rootId, '@graph', 0));
    } else {
      collectNodes(obj, rootId, 'schema', 0);
    }
  }

  schemas.forEach((s, i) => processJsonLd(typeof s.raw === 'string' ? JSON.parse(s.raw) : s.raw, i));

  // Resolve cross-references @id entre scripts
  unresolvedLinks.forEach(ul => {
    const targetId = idToNodeId.get(ul.targetAtId);
    if (targetId && links.length < MAX_LINKS) links.push({ sourceId: ul.sourceId, targetId, label: ul.label });
  });

  // Deferred @id links do collectNodes
  links.forEach(l => {
    if (l.targetAtId) {
      const t = idToNodeId.get(l.targetAtId);
      if (t) { l.targetId = t; delete l.targetAtId; }
    }
  });

  const validLinks = links.filter(l => l.sourceId && l.targetId)
    .map(l => ({ source: l.sourceId, target: l.targetId, label: l.label }));
  const nodesArray = Array.from(nodes.values());

  // Salva para refiltragem e inicializa painel de filtros
  sourceNodesArray = nodesArray;
  sourceValidLinks = validLinks;
  setupTypeFilterPanel();
  buildTypeFilters(nodesArray, validLinks);

  // Contagem de tipos para o infoEl
  const typeCounts = {};
  nodesArray.forEach(n => { if (n.type) typeCounts[n.type] = (typeCounts[n.type] || 0) + 1; });
  const topTypes = Object.entries(typeCounts).sort((a,b) => b[1]-a[1]).slice(0,3).map(([t,c]) => `${t}(${c})`).join(' · ');
  infoEl.textContent = `${nodesArray.length} nós · ${validLinks.length} conexões · ${topTypes}`;

  if (nodesArray.length === 0) {
    emptyEl.style.display = 'flex';
    canvas.style.display = 'none';
    return;
  }

  // ── D3 force simulation ──
  const W = canvas.offsetWidth  || 760;
  const H = canvas.offsetHeight || 520;

  const svg = d3.select('#graph-canvas')
    .append('svg')
    .attr('width', W)
    .attr('height', H)
    .style('display', 'block');

  // Arrow marker
  svg.append('defs').append('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 28)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#4b5563');

  const g = svg.append('g');

  // Zoom
  const zoom = d3.zoom()
    .scaleExtent([0.2, 4])
    .on('zoom', (e) => g.attr('transform', e.transform));
  svg.call(zoom);

  // Links
  const link = g.append('g')
    .selectAll('line')
    .data(validLinks)
    .join('line')
    .attr('stroke', '#2d3748')
    .attr('stroke-width', 1.5)
    .attr('marker-end', 'url(#arrow)');

  // Link labels — oculta labels de arestas do nó raiz (@graph, schema)
  const linkLabel = g.append('g')
    .selectAll('text')
    .data(validLinks.filter(l => l.label && l.label !== '@graph' && l.label !== 'schema'))
    .join('text')
    .attr('font-size', 9)
    .attr('fill', '#475569')
    .attr('text-anchor', 'middle')
    .attr('pointer-events', 'none')
    .text(d => truncate(d.label, 16));

  // Nodes
  const node = g.append('g')
    .selectAll('g')
    .data(nodesArray)
    .join('g')
    .attr('cursor', 'grab');

  node.append('circle')
    .attr('r', d => d.radius)
    .attr('fill', d => d.color)
    .attr('fill-opacity', 0.85)
    .attr('stroke', d => d.color)
    .attr('stroke-width', 1.5)
    .attr('stroke-opacity', 0.4);

  node.append('text')
    .attr('y', d => d.radius + 11)
    .attr('text-anchor', 'middle')
    .attr('font-size', 10)
    .attr('fill', '#94a3b8')
    .attr('pointer-events', 'none')
    .text(d => d.label);

  // Tooltip
  const tooltip = document.getElementById('graph-tooltip');

  node.on('mouseenter', (event, d) => {
    const lines = [];
    if (d.fullType) {
      const t = Array.isArray(d.fullType) ? d.fullType.join(', ') : d.fullType;
      lines.push(`<div class="graph-tooltip-type">${t}</div>`);
    }
    if (d.atId) lines.push(`<div class="graph-tooltip-id">${d.atId}</div>`);
    Object.entries(d.props).forEach(([k, v]) => {
      lines.push(`<div class="graph-tooltip-prop"><span>${k}:</span> ${escHtml(v)}</div>`);
    });
    tooltip.innerHTML = lines.join('');
    tooltip.classList.add('visible');
  });

  node.on('mousemove', (event) => {
    tooltip.style.left = (event.clientX + 14) + 'px';
    tooltip.style.top = (event.clientY - 10) + 'px';
  });

  node.on('mouseleave', () => {
    tooltip.classList.remove('visible');
  });

  // Drag
  let paused = false;
  node.call(d3.drag()
    .on('start', (event, d) => {
      if (!paused) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on('drag', (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on('end', (event, d) => {
      if (!paused) simulation.alphaTarget(0);
      // Keep pinned if paused
      if (!paused) { d.fx = null; d.fy = null; }
    })
  );

  // Simulation — força de repulsão proporcional ao tamanho do grafo
  const chargeStrength = Math.max(-600, -200 - nodesArray.length * 20);
  const linkDist = Math.max(80, Math.min(160, W / Math.max(nodesArray.length, 5)));

  const simulation = d3.forceSimulation(nodesArray)
    .force('link', d3.forceLink(validLinks)
      .id(d => d.id)
      .distance(d => {
        const src = d.source && typeof d.source === 'object' ? d.source : {};
        if (src.isRoot) return linkDist * 1.4; // nó raiz mais afastado dos filhos
        return linkDist;
      })
    )
    .force('charge', d3.forceManyBody().strength(chargeStrength))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide(d => d.radius + 18))
    .force('x', d3.forceX(W / 2).strength(0.04))
    .force('y', d3.forceY(H / 2).strength(0.04))
    .on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      linkLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2 - 4);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

  // Pause/Resume
  const pauseBtn = document.getElementById('graph-pause');
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    if (paused) {
      simulation.stop();
      nodesArray.forEach(d => { d.fx = d.x; d.fy = d.y; });
      pauseBtn.classList.add('active');
      pauseBtn.title = 'Retomar simulação';
      pauseBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    } else {
      nodesArray.forEach(d => { d.fx = null; d.fy = null; });
      simulation.alphaTarget(0.3).restart();
      setTimeout(() => simulation.alphaTarget(0), 1500);
      pauseBtn.classList.remove('active');
      pauseBtn.title = 'Pausar simulação';
      pauseBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    }
  });

  // Reset zoom
  document.getElementById('graph-reset').addEventListener('click', () => {
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
  });

  // Sliders toggle
  const slidersPanel = document.getElementById('graph-sliders');
  const slidersBtn   = document.getElementById('graph-sliders-toggle');
  if (slidersBtn && slidersPanel) {
    slidersBtn.addEventListener('click', () => {
      const open = slidersPanel.style.display === 'none' || !slidersPanel.style.display;
      slidersPanel.style.display = open ? 'flex' : 'none';
      slidersBtn.classList.toggle('active', open);
    });
  }

  function applySliders() {
    const linkDist  = +document.getElementById('sl-link-dist').value;
    const nodeSize  = +document.getElementById('sl-node-size').value;
    const charge    = +document.getElementById('sl-charge').value;
    const fontSize  = +document.getElementById('sl-font').value;
    const maxDepth  = +document.getElementById('sl-depth').value;

    // Update val labels
    document.getElementById('sl-link-dist-val').textContent = linkDist;
    document.getElementById('sl-node-size-val').textContent = nodeSize;
    document.getElementById('sl-charge-val').textContent = charge;
    document.getElementById('sl-font-val').textContent = fontSize;
    document.getElementById('sl-depth-val').textContent = maxDepth;

    // Link distance
    simulation.force('link').distance(linkDist);

    // Charge strength
    simulation.force('charge').strength(charge);

    // Node size + depth visibility
    node.each(function(d) {
      const visible = d.depth === 0 || d.depth <= maxDepth;
      d3.select(this).style('display', visible ? null : 'none');
      d3.select(this).select('circle').attr('r', d.radius * (nodeSize / 10));
    });

    // Label font size
    node.selectAll('text').attr('font-size', fontSize);

    // Link depth visibility
    link.style('display', d => {
      const sd = (d.source && typeof d.source === 'object') ? d.source.depth : 0;
      const td = (d.target && typeof d.target === 'object') ? d.target.depth : 0;
      return (sd <= maxDepth && td <= maxDepth) ? null : 'none';
    });

    simulation.alpha(0.3).restart();
  }

  ['sl-link-dist','sl-node-size','sl-charge','sl-font','sl-depth'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', applySliders);
  });

  // ResizeObserver: re-renderiza se o canvas mudar de tamanho (ex: transição body width)
  if (typeof ResizeObserver !== 'undefined') {
    let resizeTimer = null;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const newW = entry.contentRect.width;
        const newH = entry.contentRect.height;
        // Só re-renderiza se a diferença for significativa (>30px)
        if (Math.abs(newW - W) > 30 || Math.abs(newH - H) > 30) {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            ro.disconnect();
            // Limpa SVG atual e re-renderiza com novas dimensões
            const c = document.getElementById('graph-canvas');
            if (c) { c.innerHTML = ''; graphRendered = false; }
            if (graphData) renderGraph(graphData);
          }, 150);
        }
      }
    });
    ro.observe(canvas);
  }
}

// ── MAIN ORCHESTRATOR ──
(async () => {
  const BLOCKED = ['chrome://', 'chrome-extension://', 'edge://', 'brave://',
                   'about:', 'file://', 'data:', 'view-source:', 'devtools://'];

  function showError(msg) {
    document.getElementById('loading').style.display = 'none';
    const errEl = document.getElementById('error');
    errEl.style.display = 'flex';
    if (msg) errEl.querySelector('p').textContent = msg;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) { showError(); return; }

  const url = tab.url || '';
  if (BLOCKED.some(p => url.startsWith(p))) {
    showError('Não é possível analisar páginas internas do Chrome.');
    return;
  }

  // ── 1. Verificar cache da sessão ──
  const cached = await chrome.runtime.sendMessage({ type: 'getCache', tabId: tab.id })
    .catch(() => ({ data: null }));

  if (cached?.data) {
    render(cached.data);
    return;
  }

  // ── 2. Análise paralela: content script + robots.txt + X-Robots-Tag ──
  const origin = new URL(url).origin;

  const [scriptResult, robotsResult, xRobotsResult] = await Promise.all([
    // Content script: análise completa da página (16 categorias)
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content_analyzer.js'] })
      .then(r => r?.[0]?.result ?? null)
      .catch(err => { console.error('[SEO Analyzer] executeScript failed:', err); return null; }),

    // robots.txt: fetch direto do background context (sem CORS issues)
    fetch(`${origin}/robots.txt`, { cache: 'no-store' })
      .then(r => r.ok ? r.text() : null)
      .catch(() => null),

    // X-Robots-Tag: HEAD request na URL atual para ler header HTTP
    fetch(url, { method: 'HEAD', cache: 'no-store' })
      .then(r => r.headers.get('x-robots-tag') || null)
      .catch(() => null),
  ]);

  if (!scriptResult) { showError(); return; }

  // ── 3. Enriquecer dados com checagens server-side ──
  scriptResult.robotsTxt = robotsResult;
  scriptResult.xRobotsTag = xRobotsResult;

  // Verificar se o domínio está bloqueado no robots.txt
  if (robotsResult) {
    const ua = robotsResult.match(/User-agent:\s*\*/i);
    const disallowAll = /User-agent:\s*\*[\s\S]*?Disallow:\s*\//i.test(robotsResult);
    scriptResult.robotsBlocked = disallowAll;
    scriptResult.hasRobotsTxt = true;
  } else {
    scriptResult.robotsBlocked = false;
    scriptResult.hasRobotsTxt = false;
  }

  // ── 4. Render + Cache + Badge ──
  render(scriptResult);

  chrome.runtime.sendMessage({ type: 'setCache', tabId: tab.id, data: scriptResult })
    .catch(() => {});

  const badgeScore = scriptResult.overallScore ?? scriptResult.score ?? null;
  chrome.runtime.sendMessage({ type: 'setBadge', tabId: tab.id, score: badgeScore })
    .catch(() => {});
})();

// ─────────────────────────────────────────────
// SEMANTIC TAB — diagrama comparativo
// ─────────────────────────────────────────────

// ── Perfis de página: árvore ideal + regras por tipo ──

const SEM_PROFILES = {
  blog: {
    label: 'Artigo / Blog',
    icon: '✍',
    tree: [
      { tag: 'header', level: 0, children: [
        { tag: 'nav', level: 1, children: [] },
      ]},
      { tag: 'main', level: 0, children: [
        { tag: 'article', level: 1, children: [
          { tag: 'header', level: 2, tip: 'header do artigo', children: [
            { tag: 'h1',   level: 3, children: [] },
            { tag: 'time', level: 3, children: [] },
          ]},
          { tag: 'figure', level: 2, children: [
            { tag: 'figcaption', level: 3, children: [] },
          ]},
          { tag: 'p',          level: 2, children: [] },
          { tag: 'blockquote', level: 2, children: [] },
          { tag: 'footer',     level: 2, tip: 'footer do artigo', children: [] },
        ]},
        { tag: 'aside', level: 1, tip: 'artigos relacionados', children: [] },
      ]},
      { tag: 'footer', level: 0, children: [
        { tag: 'address', level: 1, children: [] },
      ]},
    ],
    meta: {
      header:     { priority: 'P0', expected: 1 },
      nav:        { priority: 'P0', expected: 1 },
      main:       { priority: 'P0', expected: 1 },
      footer:     { priority: 'P0', expected: 1 },
      article:    { priority: 'P0', expected: 1 },
      h1:         { priority: 'P0', expected: 1 },
      time:       { priority: 'P1', expected: 1 },
      figure:     { priority: 'P1', expected: null },
      figcaption: { priority: 'P1', expected: null },
      aside:      { priority: 'P1', expected: null },
      p:          { priority: 'P2', expected: null },
      blockquote: { priority: 'P2', expected: null },
      address:    { priority: 'P2', expected: null },
      section:    { priority: 'P2', expected: null },
      mark:       { priority: 'P2', expected: null },
    },
  },

  home: {
    label: 'Home / Landing Page',
    icon: '🏠',
    tree: [
      { tag: 'header', level: 0, children: [
        { tag: 'nav', level: 1, children: [] },
      ]},
      { tag: 'main', level: 0, children: [
        { tag: 'section', level: 1, tip: 'hero / serviços / depoimentos', children: [
          { tag: 'h1', level: 2, children: [] },
        ]},
        { tag: 'section', level: 1, tip: 'segunda seção', children: [] },
        { tag: 'aside',   level: 1, tip: 'CTA lateral / destaque', children: [] },
      ]},
      { tag: 'footer', level: 0, children: [
        { tag: 'address', level: 1, children: [] },
      ]},
    ],
    meta: {
      header:   { priority: 'P0', expected: 1 },
      nav:      { priority: 'P0', expected: 1 },
      main:     { priority: 'P0', expected: 1 },
      footer:   { priority: 'P0', expected: 1 },
      section:  { priority: 'P0', expected: null },
      h1:       { priority: 'P0', expected: 1 },
      aside:       { priority: 'P2', expected: null },
      address:     { priority: 'P2', expected: null },
      article:     { priority: 'P2', expected: null },
      figure:      { priority: 'P2', expected: null },
      time:        { priority: 'P2', expected: null },
      p:           { priority: 'P2', expected: null },
      mark:        { priority: 'P2', expected: null },
      blockquote:  { priority: 'P2', expected: null },
      figcaption:  { priority: 'P2', expected: null },
    },
  },

  listing: {
    label: 'Categoria / Listagem',
    icon: '📋',
    tree: [
      { tag: 'header', level: 0, children: [
        { tag: 'nav', level: 1, children: [] },
      ]},
      { tag: 'main', level: 0, children: [
        { tag: 'h1', level: 1, children: [] },
        { tag: 'section', level: 1, tip: 'grupo de itens', children: [
          { tag: 'article', level: 2, tip: 'card × N', children: [
            { tag: 'h1', level: 3, tip: 'h2/h3 de cada card', children: [] },
            { tag: 'figure', level: 3, children: [] },
          ]},
        ]},
        { tag: 'aside', level: 1, tip: 'filtros / sidebar', children: [] },
      ]},
      { tag: 'footer', level: 0, children: [
        { tag: 'address', level: 1, children: [] },
      ]},
    ],
    meta: {
      header:   { priority: 'P0', expected: 1 },
      nav:      { priority: 'P0', expected: 1 },
      main:     { priority: 'P0', expected: 1 },
      footer:   { priority: 'P0', expected: 1 },
      h1:       { priority: 'P0', expected: 1 },
      section:  { priority: 'P0', expected: null },
      article:  { priority: 'P1', expected: null },
      aside:    { priority: 'P1', expected: null },
      figure:   { priority: 'P1', expected: null },
      address:  { priority: 'P2', expected: null },
      time:     { priority: 'P2', expected: null },
      p:        { priority: 'P2', expected: null },
      figcaption:  { priority: 'P2', expected: null },
      mark:        { priority: 'P2', expected: null },
      blockquote:  { priority: 'P2', expected: null },
    },
  },

  product: {
    label: 'Produto (PDP)',
    icon: '📦',
    tree: [
      { tag: 'header', level: 0, children: [
        { tag: 'nav', level: 1, children: [] },
      ]},
      { tag: 'main', level: 0, children: [
        { tag: 'article', level: 1, tip: 'o produto é uma entidade', children: [
          { tag: 'h1',     level: 2, children: [] },
          { tag: 'figure', level: 2, children: [
            { tag: 'figcaption', level: 3, children: [] },
          ]},
          { tag: 'section', level: 2, tip: 'specs / descrição', children: [] },
          { tag: 'section', level: 2, tip: 'avaliações', children: [] },
        ]},
      ]},
      { tag: 'footer', level: 0, children: [
        { tag: 'address', level: 1, children: [] },
      ]},
    ],
    meta: {
      header:     { priority: 'P0', expected: 1 },
      nav:        { priority: 'P0', expected: 1 },
      main:       { priority: 'P0', expected: 1 },
      footer:     { priority: 'P0', expected: 1 },
      article:    { priority: 'P0', expected: 1 },
      h1:         { priority: 'P0', expected: 1 },
      figure:     { priority: 'P1', expected: null },
      figcaption: { priority: 'P1', expected: null },
      section:    { priority: 'P1', expected: null },
      address:    { priority: 'P2', expected: null },
      aside:      { priority: 'P2', expected: null },
      time:       { priority: 'P2', expected: null },
      p:          { priority: 'P2', expected: null },
      mark:       { priority: 'P2', expected: null },
      blockquote: { priority: 'P2', expected: null },
    },
  },
};

// Detecta tipo de página pelos sinais do DOM/URL
function semDetectPageType(semData, url) {
  const u = (url || '').toLowerCase();
  const articleCount = semData?.article?.count || 0;
  const sectionCount = semData?.section?.count || 0;
  const timeCount    = semData?.time?.count    || 0;

  // Extrai só o pathname para não casar partes do domínio
  let pathname = '/';
  try { pathname = new URL(url).pathname.toLowerCase(); } catch(e) {}

  // URL raiz = home (antes de qualquer sinal de DOM)
  if (pathname === '/' || pathname === '' || pathname === '/index.html') return 'home';

  // URL signals por pathname
  if (/\/(blog|artigo|post|news|noticias)(\/|$)/.test(pathname)) return 'blog';
  if (/\/(produto|product|loja|shop|item|sku)(\/|$)/.test(pathname))  return 'product';
  if (/\/(categoria|category|busca|search|tag|colecao)(\/|$)/.test(pathname)) return 'listing';
  if (/\/(home|index)(\/|$)/.test(pathname)) return 'home';

  // DOM signals — só acionam quando URL não foi conclusiva
  if (articleCount === 1 && timeCount >= 1) return 'blog';
  if (articleCount === 1 && sectionCount >= 2) return 'product';
  // Home com cards: múltiplos articles numa home não vira listing
  // só vira listing se o pathname sugere arquivo de listagem
  if (sectionCount >= 2 && timeCount === 0) return 'home';

  return 'home'; // fallback seguro
}

// Compatibilidade retroativa — SEM_META aponta para o perfil ativo
let SEM_META = SEM_PROFILES.blog.meta;

// ── Glossário de tags semânticas ──
const SEM_GLOSSARY = {
  header: {
    level: '●●○',
    difficulty: 'Intermediário',
    seo: 'Alto',
    definition: 'Cabeçalho da página ou de uma seção. Agrupa logo, navegação principal e identidade do site. O Google usa o <header> para identificar o bloco de navegação e separar o conteúdo editorial do conteúdo de suporte.',
    bad: 'Usar <div class="header"> faz o Google tratar o bloco como conteúdo genérico, sem reconhecer a hierarquia da página.',
    good: 'Um <header> semântico sinaliza ao crawler que o conteúdo abaixo de </header> é o corpo editorial. Aumenta precisão do PageRank interno.',
    related: ['nav', 'main', 'footer'],
  },
  nav: {
    level: '●●○',
    difficulty: 'Intermediário',
    seo: 'Alto',
    definition: 'Landmark de navegação. Envolve links de navegação principal ou secundária. Leitores de tela pulam direto para o <nav>. O Google Googlebot prioriza links dentro de <nav> para descoberta de URLs.',
    bad: '<div class="menu"> não é reconhecido como navegação por assistivos nem pelo crawler — os links perdem peso estrutural.',
    good: 'Com <nav>, o Google entende quais links são estruturais (menu) vs. editoriais (corpo do texto), melhorando a distribuição de PageRank.',
    related: ['header', 'main', 'aside'],
  },
  main: {
    level: '●○○',
    difficulty: 'Básico',
    seo: 'Crítico',
    definition: 'O conteúdo principal e único da página. Deve existir apenas uma vez. O Google extrai o snippet de busca e o conteúdo para Featured Snippets prioritariamente do que está dentro de <main>.',
    bad: 'Sem <main>, o crawler não sabe onde começa o conteúdo editorial — pode indexar nav, rodapé e widgets junto com o texto.',
    good: 'Páginas com <main> bem definido têm snippets mais precisos no Google e maior chance de aparecer em respostas de IA (AEO).',
    related: ['header', 'article', 'section', 'footer'],
  },
  article: {
    level: '●●○',
    difficulty: 'Intermediário',
    seo: 'Alto',
    definition: 'Conteúdo independente e autocontido — faz sentido fora do contexto da página (post de blog, produto, notícia). LLMs como GPT e Claude usam <article> para identificar unidades de conteúdo citável no RAG.',
    bad: 'Sem <article>, o conteúdo editorial se mistura com widgets e banners — a IA não sabe o que citar, reduzindo aparições em respostas geradas.',
    good: 'Cada <article> é um chunk semântico. Chunking semântico atinge 87% de precisão vs 13% de corte arbitrário em sistemas RAG.',
    related: ['main', 'section', 'header', 'figure', 'time'],
  },
  section: {
    level: '●●○',
    difficulty: 'Intermediário',
    seo: 'Médio',
    definition: 'Agrupa conteúdo tematicamente relacionado. É a única tag semântica que deve aparecer múltiplas vezes — uma por bloco temático (hero, serviços, depoimentos, FAQ...). Cada <section> deve ter seu próprio H2/H3 como título interno.',
    bad: 'Uma única <section> ou nenhuma: o Google vê a página como bloco monolítico. Múltiplos <div> sem semântica impedem o mapeamento dos subtópicos cobertos.',
    good: 'Múltiplas <section> bem tituladas ensinam o Google quais subtópicos a página cobre — aumenta cobertura temática e chance de Featured Snippet por subtópico.',
    related: ['article', 'main', 'aside'],
  },
  aside: {
    level: '●●○',
    difficulty: 'Intermediário',
    seo: 'Médio',
    definition: 'Conteúdo tangencialmente relacionado ao conteúdo principal — sidebar, artigos relacionados, CTAs. O Google separa o conteúdo de <aside> do editorial principal, evitando que widgets poluam o índice.',
    bad: 'Sidebar em <div> pode fazer o Google indexar "Artigos Relacionados" e widgets como parte do conteúdo editorial, diluindo relevância.',
    good: '<aside> isola o conteúdo de suporte. O texto editorial de <main> fica mais limpo e relevante para a query do usuário.',
    related: ['main', 'nav', 'section'],
  },
  footer: {
    level: '●○○',
    difficulty: 'Básico',
    seo: 'Alto',
    definition: 'Rodapé da página ou de uma seção. Contém copyright, links institucionais, contato. O Google atribui menor PageRank a links no <footer> — isso é intencional: separa links editoriais de links estruturais.',
    bad: '<div class="footer"> pode fazer links do rodapé receberem peso editorial indevido, ou o contrário — o Google pode não reconhecer o endereço como <address>.',
    good: 'Com <footer> + <address> internos, o NAP (Nome, Endereço, Telefone) é reconhecido por schema implícito, reforçando SEO local.',
    related: ['header', 'address', 'main'],
  },
  h1: {
    level: '●○○',
    difficulty: 'Básico',
    seo: 'Crítico',
    definition: 'Título principal da página. Deve existir exatamente uma vez. É o sinal mais forte de relevância temática para o Google — indica sobre o que a página inteira trata. LLMs usam o H1 como âncora semântica.',
    bad: 'Múltiplos H1 confundem o Google sobre o tema principal. Ausência de H1 é penalizável — a página fica sem âncora semântica.',
    good: 'H1 com a keyword principal no início aumenta relevância da página para aquela query. Único H1 = foco claro = ranking mais preciso.',
    related: ['main', 'article', 'section'],
  },
  figure: {
    level: '●●●',
    difficulty: 'Avançado',
    seo: 'Médio',
    definition: 'Agrupa mídia autocontida (imagem, vídeo, gráfico, código) com sua legenda. O Google Image Search usa <figure> + <figcaption> para entender o contexto da imagem e gerar alt text contextual automaticamente.',
    bad: '<img> solto sem <figure> perde o contexto editorial. O Google indexa a imagem desassociada do texto ao redor.',
    good: '<figure> + <figcaption> + alt text = tripla confirmação semântica. Imagens em <figure> têm melhor chance de aparecer no Google Images com snippet rico.',
    related: ['article', 'figcaption', 'main'],
  },
  figcaption: {
    level: '●●●',
    difficulty: 'Avançado',
    seo: 'Médio',
    definition: 'Legenda da figura. Complementa o alt text e é indexada como texto editorial. O Google usa figcaption para enriquecer o entendimento da imagem — especialmente útil para gráficos sem texto interno.',
    bad: 'Legenda em <p class="caption"> não é associada semanticamente à imagem — o Google trata como texto solto.',
    good: 'Figcaption bem escrito pode aparecer como snippet de imagem no Google e como citação em respostas de IA sobre o tema da imagem.',
    related: ['figure', 'article'],
  },
  time: {
    level: '●●○',
    difficulty: 'Intermediário',
    seo: 'Alto',
    definition: 'Data e hora legíveis por máquina. O atributo datetime="YYYY-MM-DD" é lido pelo Google para determinar frescor do conteúdo — impacta diretamente o ranking de queries sensíveis a tempo (notícias, tendências).',
    bad: 'Data escrita como texto puro ("15 de abril de 2025") não é parseada pelo Google — a página pode parecer sem data ou mais antiga do que é.',
    good: '<time datetime="2025-04-15"> garante que o Google leia a data corretamente. Conteúdo com data explícita ranqueia melhor em queries "recentes".',
    related: ['article', 'header'],
  },
  address: {
    level: '●●●',
    difficulty: 'Avançado',
    seo: 'Alto',
    definition: 'Informações de contato do autor ou da organização. Dentro do <footer>, sinaliza NAP (Nome, Endereço, Telefone) para SEO local. O Google Maps e o Knowledge Graph leem <address> para confirmar dados de localização.',
    bad: 'Endereço em <p class="contato"> não é reconhecido como informação de contato — prejudica SEO local e não contribui para o Knowledge Graph.',
    good: '<address> no rodapé reforça sinais de E-E-A-T (Expertise, Autoridade, Confiança) e melhora visibilidade no Google Meu Negócio.',
    related: ['footer', 'main'],
  },
  p: {
    level: '●○○',
    difficulty: 'Básico',
    seo: 'Médio',
    definition: 'Parágrafo de texto. Parece simples, mas é a unidade de chunking mais comum em LLMs. Parágrafos de 3-5 linhas são o tamanho ideal para RAG (256-512 tokens). Parágrafos enormes são ignorados por IA generativa.',
    bad: 'Texto em <div> ou <span> perde a semântica de parágrafo — LLMs tratam como bloco genérico e evitam citar.',
    good: 'Parágrafos curtos em <p> são preferidos por sistemas RAG. Cada <p> pode ser citado independentemente em respostas de IA.',
    related: ['article', 'section', 'blockquote'],
  },
  blockquote: {
    level: '●●○',
    difficulty: 'Intermediário',
    seo: 'Médio',
    definition: 'Citação longa de outra fonte. O Google usa <blockquote> para identificar conteúdo citado vs. original — isso afeta E-E-A-T (evidencia curadoria e pesquisa). LLMs reconhecem como "depoimento" ou "dado externo".',
    bad: 'Citação em <div class="quote"> é tratada como texto editorial comum — o Google não distingue sua opinião da opinião de especialistas que você cita.',
    good: '<blockquote> com <cite> dentro sinaliza autoridade externa ao seu conteúdo, reforçando credibilidade editorial.',
    related: ['article', 'p', 'cite'],
  },
  mark: {
    level: '●●●',
    difficulty: 'Avançado',
    seo: 'Baixo',
    definition: 'Texto destacado por relevância no contexto atual (não por importância estilística — para isso use <strong>). Usado para highlighting de termos de busca. Pouco impacto direto em SEO, mas melhora UX de leitura.',
    bad: '<span class="highlight"> serve o mesmo papel visualmente mas não tem semântica — leitores de tela não anunciam o destaque.',
    good: '<mark> em termos-chave na resposta a uma pergunta pode sinalizar ao Google que o parágrafo responde aquela query diretamente.',
    related: ['p', 'article'],
  },
};


function semGetStatus(tag, count, metaOverride) {
  const meta = metaOverride || SEM_META[tag];
  if (!meta) return count > 0 ? 'ok' : 'missing';
  if (meta.expected === 1) {
    if (count === 0) return 'missing';
    if (count === 1) return 'ok';
    return 'warning';
  }
  return count > 0 ? 'ok' : 'missing';
}

function semScoreLabel(score) {
  if (score >= 85) return 'excelente';
  if (score >= 70) return 'bom';
  if (score >= 40) return 'regular';
  return 'ruim';
}

function semBuildSelector(tag, index) {
  const all = document.querySelectorAll ? [] : [];
  return `${tag}:nth-of-type(${index + 1})`;
}

function semRenderTree(nodes, mode, semData, tabId) {
  const tooltip = document.getElementById('sem-tooltip');
  let html = '';

  function walk(nodeList) {
    nodeList.forEach(node => {
      const tag = node.tag;
      const tagData = semData ? semData[tag] : null;
      const count = tagData ? tagData.count : 0;
      const status = mode === 'ideal' ? 'ok' : semGetStatus(tag, count);

      let icon = '';
      let labelText = `&lt;${tag}&gt;`;
      let extraClass = '';

      if (mode === 'actual') {
        if (status === 'missing') {
          icon = '✕';
          labelText = `&lt;div&gt;`;
          extraClass = 'clickable';
        } else if (status === 'wrong') {
          icon = '⚠';
          labelText = `&lt;div&gt;`;
          extraClass = 'clickable';
        } else if (status === 'ok' || status === 'warning') {
          icon = status === 'warning' ? '' : '';
          extraClass = 'clickable';
        }
      }

      // Badge de contagem só para tags que devem ser únicas (expected:1)
      // section, article em listagem, figure etc. podem e devem ser múltiplas
      const activeMeta = SEM_META[tag];
      const isUnique = activeMeta && activeMeta.expected === 1;
      const badge = (mode === 'actual' && count > 1 && isUnique)
        ? `<span class="sem-badge">${count}×</span>`
        : (mode === 'actual' && count > 1 && !isUnique)
          ? `<span class="sem-badge sem-badge--ok">${count}×</span>`
          : '';

      const iconHtml = icon ? `<em class="sem-node-icon">${icon}</em>` : '';
      const tipHtml  = (mode === 'ideal' && node.tip) ? `<span class="sem-node-tip">${node.tip}</span>` : '';

      html += `<div
        class="sem-node sem-node--${tag} sem-node--${status} ${extraClass}"
        data-tag="${tag}"
        data-status="${status}"
        data-count="${count}"
        data-level="${node.level}"
      >${iconHtml}<span>${labelText}</span>${tipHtml}${badge}</div>`;

      if (node.children && node.children.length) walk(node.children);
    });
  }

  walk(nodes);
  return html;
}

function semRenderSkeleton() {
  return [0,1,1,2,0,1,0,0,1].map((lvl, i) =>
    `<div class="sem-skeleton" data-level="${lvl}" style="width:${90 - lvl*10}%"></div>`
  ).join('');
}

function renderSemantic(semData) {
  const idealTree = document.getElementById('sem-ideal-tree');
  const actualTree = document.getElementById('sem-actual-tree');
  const scoreNum = document.getElementById('sem-score-number');
  const scoreBadge = document.getElementById('sem-score-badge');
  const scoreFill = document.getElementById('sem-score-fill');
  const scoreSub = document.getElementById('sem-score-sub');
  const tableBody = document.getElementById('sem-table-body');

  if (!idealTree) return;

  // Skeleton enquanto não há dados
  if (!semData) {
    idealTree.innerHTML = semRenderSkeleton();
    actualTree.innerHTML = semRenderSkeleton();
    return;
  }

  // Detectar tipo de página e escolher perfil
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    const url = tab?.url || '';
    const pageType = semData._pageType || semDetectPageType(semData, url);
    const profile = SEM_PROFILES[pageType] || SEM_PROFILES.home;
    SEM_META = profile.meta;

    // Badge de tipo de página nos títulos dos painéis
    const idealTitleEl = idealTree.previousElementSibling;
    if (idealTitleEl && idealTitleEl.classList.contains('sem-pane-title')) {
      idealTitleEl.innerHTML = `Estrutura Ideal`;
    }
    const actualTitleEl = actualTree.previousElementSibling;
    if (actualTitleEl && actualTitleEl.classList.contains('sem-pane-title')) {
      actualTitleEl.innerHTML = `Seu Site <span class="sem-page-type-badge">${profile.icon} ${profile.label}</span>`;
    }

    // Render diagramas com a árvore do perfil correto
    idealTree.innerHTML = semRenderTree(profile.tree, 'ideal', semData, null);
    actualTree.innerHTML = semRenderTree(profile.tree, 'actual', semData, null);

    // Score
    const score = semData._score || 0;
    const label = semScoreLabel(score);

    let displayScore = 0;
    const timer = setInterval(() => {
      displayScore = Math.min(displayScore + 3, score);
      scoreNum.textContent = displayScore;
      if (displayScore >= score) clearInterval(timer);
    }, 25);

    scoreBadge.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    scoreBadge.className = 'sem-score-badge ' + label;
    scoreFill.style.width = score + '%';
    scoreFill.className = 'sem-score-fill ' + label;

    const missing = Object.values(semData).filter(d => d && typeof d === 'object' && d.status === 'missing').length;
    const wrong   = semData._divAbuse ? semData._divAbuse.length : 0;
    const parts = [];
    if (missing > 0) parts.push(`${missing} ${missing === 1 ? 'elemento ausente' : 'elementos ausentes'}`);
    if (wrong > 0)   parts.push(`${wrong} ${wrong === 1 ? 'div em lugar errado' : 'divs em lugar errado'}`);
    scoreSub.textContent = parts.length ? parts.join(' · ') : 'Semântica OK';

    // Tabela de detalhes com tags do perfil ativo
    if (tableBody) {
      const rows = Object.entries(profile.meta).map(([tag, meta]) => {
        const d = semData[tag] || { count: 0 };
        const status = semGetStatus(tag, d.count, meta);
        const statusLabels = { ok: '✓ OK', missing: '✕ Ausente', warning: '⚠ Duplicado', wrong: '⚠ Div no lugar' };
        return `<tr>
          <td class="tag-cell">&lt;${tag}&gt;</td>
          <td class="count-cell">${d.count}</td>
          <td class="count-cell">${meta.expected || '—'}</td>
          <td class="status-cell"><span class="sem-status-${status}">${statusLabels[status] || status}</span></td>
          <td><span class="sem-priority ${meta.priority.toLowerCase()}">${meta.priority}</span></td>
        </tr>`;
      }).join('');
      tableBody.innerHTML = rows;
    }

    // Tooltip glossário em todos os nós (ideal + real)
    [...idealTree.querySelectorAll('.sem-node'),
     ...actualTree.querySelectorAll('.sem-node')].forEach(node => {
      node.addEventListener('mouseenter', (e) => semShowGlossary(node, e));
      node.addEventListener('mousemove',  (e) => semMoveGlossary(e));
      node.addEventListener('mouseleave', ()  => semHideGlossary());
    });

    // Highlight ao clicar nos nós reais
    actualTree.querySelectorAll('.sem-node.clickable').forEach(node => {
      const tag    = node.dataset.tag;
      const status = node.dataset.status;
      const count  = parseInt(node.dataset.count, 10);

      if (status === 'ok' || status === 'warning') {
        node.addEventListener('click', () => {
          chrome.tabs.query({ active: true, currentWindow: true }, ([t]) => {
            if (!t) return;
            chrome.scripting.executeScript({
              target: { tabId: t.id },
              func: (sel) => {
                const el = document.querySelector(sel);
                if (!el) return;
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const prev = el.style.outline;
                el.style.outline = '3px solid #fbbf24';
                el.style.outlineOffset = '3px';
                setTimeout(() => {
                  el.style.outline = prev;
                  el.style.outlineOffset = '';
                }, 2200);
              },
              args: [tag],
            }).catch(() => {});
          });
        });
      }
    });
  }); // fim chrome.tabs.query

  // Botões de cópia
  const btnActual  = document.getElementById('sem-copy-actual');
  const btnIdeal   = document.getElementById('sem-copy-ideal');
  const btnPrompt  = document.getElementById('sem-copy-prompt');
  if (btnActual) btnActual.addEventListener('click', () => semCopyStructure('actual', semData, btnActual));
  if (btnIdeal)  btnIdeal.addEventListener('click',  () => semCopyStructure('ideal',  semData, btnIdeal));
  if (btnPrompt) btnPrompt.addEventListener('click', () => semCopyPrompt(semData, btnPrompt));
}

// ── Glossário tooltip ──

function semShowGlossary(node, e) {
  const tag    = node.dataset.tag;
  const status = node.dataset.status || 'ok';
  const count  = parseInt(node.dataset.count || '0', 10);
  const g      = SEM_GLOSSARY[tag];
  const tooltip = document.getElementById('sem-tooltip');
  if (!tooltip) return;

  // Banner de status (só na coluna real, quando há problema)
  let statusBanner = '';
  if (status === 'missing') {
    statusBanner = `<div class="sgt-status sgt-status--missing">✕ Ausente — nenhum &lt;${tag}&gt; encontrado</div>`;
  } else if (status === 'warning') {
    statusBanner = `<div class="sgt-status sgt-status--warning">⚠ Duplicado ${count}× — o ideal é 1</div>`;
  } else if (status === 'wrong') {
    statusBanner = `<div class="sgt-status sgt-status--wrong">⚠ &lt;div&gt; no lugar de &lt;${tag}&gt;</div>`;
  }

  if (!g) {
    tooltip.innerHTML = `${statusBanner}<div class="sgt-tag">&lt;${tag}&gt;</div>`;
    tooltip.classList.add('visible', 'sgt');
    semMoveGlossary(e);
    return;
  }

  const seoColor = g.seo === 'Crítico' ? 'var(--red)' : g.seo === 'Alto' ? 'var(--green)' : g.seo === 'Médio' ? 'var(--yellow)' : 'var(--text-muted)';
  const related  = g.related.map(t => `<span class="sgt-related-tag">&lt;${t}&gt;</span>`).join('');

  tooltip.innerHTML = `
    ${statusBanner}
    <div class="sgt-head">
      <span class="sgt-tag">&lt;${tag}&gt;</span>
      <div class="sgt-meta">
        <span class="sgt-level">${g.level}</span>
        <span class="sgt-difficulty">${g.difficulty}</span>
        <span class="sgt-seo" style="color:${seoColor}">SEO ${g.seo}</span>
      </div>
    </div>
    <p class="sgt-definition">${g.definition}</p>
    <div class="sgt-block sgt-block--bad">
      <span class="sgt-block-label">❌ Sem semântica</span>
      <p>${g.bad}</p>
    </div>
    <div class="sgt-block sgt-block--good">
      <span class="sgt-block-label">✅ Com &lt;${tag}&gt;</span>
      <p>${g.good}</p>
    </div>
    <div class="sgt-footer">
      <span class="sgt-related-label">Relacionados</span>
      ${related}
    </div>
  `;

  tooltip.classList.add('visible', 'sgt');
  semMoveGlossary(e);
}

function semMoveGlossary(e) {
  const tooltip = document.getElementById('sem-tooltip');
  if (!tooltip) return;
  const tw = tooltip.offsetWidth  || 280;
  const th = tooltip.offsetHeight || 200;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = e.clientX + 14;
  let y = e.clientY - 10;
  if (x + tw > vw - 8) x = e.clientX - tw - 14;
  if (y + th > vh - 8) y = vh - th - 8;
  if (y < 4) y = 4;
  tooltip.style.left = x + 'px';
  tooltip.style.top  = y + 'px';
}

function semHideGlossary() {
  const tooltip = document.getElementById('sem-tooltip');
  if (tooltip) tooltip.classList.remove('visible');
}

// Gera HTML semântico a partir dos dados e copia para clipboard
function semCopyStructure(mode, semData, btn) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    const url = tab?.url || '';
    const pageType = semData?._pageType || semDetectPageType(semData, url);
    const profile  = SEM_PROFILES[pageType] || SEM_PROFILES.home;

    const html = mode === 'actual'
      ? semBuildActualHTML(semData, profile)
      : semBuildIdealHTML(profile.tree, 0);

    navigator.clipboard.writeText(html).then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Copiado!`;
      btn.classList.add('copied');
      setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
    }).catch(() => {});
  });
}

// Gera HTML da estrutura IDEAL (árvore do perfil) com indentação
function semBuildIdealHTML(tree, depth) {
  const indent = '  '.repeat(depth);
  return tree.map(node => {
    const children = node.children && node.children.length
      ? '\n' + semBuildIdealHTML(node.children, depth + 1) + '\n' + indent
      : '';
    const tip = node.tip ? ` <!-- ${node.tip} -->` : '';
    return `${indent}<${node.tag}>${tip}${children}</${node.tag}>`;
  }).join('\n');
}

// Gera HTML da estrutura REAL — usa os dados reais do DOM para montar o esqueleto
function semBuildActualHTML(semData, profile) {
  function walk(nodes, depth) {
    const indent = '  '.repeat(depth);
    return nodes.map(node => {
      const tag   = node.tag;
      const data  = semData[tag] || { count: 0 };
      const count = data.count || 0;
      const meta  = profile.meta[tag];
      const status = semGetStatus(tag, count, meta);

      // Tag real: se missing/wrong, mostra div com comentário
      let openTag, closeTag, comment;
      if (status === 'missing') {
        openTag  = `<div`;
        closeTag = `</div>`;
        comment  = ` <!-- ⚠ deveria ser <${tag}> -->`;
      } else if (status === 'warning') {
        openTag  = `<${tag}`;
        closeTag = `</${tag}>`;
        comment  = ` <!-- ⚠ encontrado ${count}× — ideal: 1 -->`;
      } else {
        openTag  = `<${tag}`;
        closeTag = `</${tag}>`;
        comment  = '';
      }

      const children = node.children && node.children.length
        ? '\n' + walk(node.children, depth + 1) + '\n' + indent
        : '';

      return `${indent}${openTag}>${comment}${children}${closeTag}`;
    }).join('\n');
  }

  return walk(profile.tree, 0);
}

// Gera prompt completo para IA e copia para clipboard
function semCopyPrompt(semData, btn) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    const url      = tab?.url || 'desconhecida';
    const pageType = semData?._pageType || semDetectPageType(semData, url);
    const profile  = SEM_PROFILES[pageType] || SEM_PROFILES.home;

    // Diagnóstico: apenas P0 e P1 são problemas reais — P2 são melhorias opcionais
    const problems  = [];
    const optionals = [];
    Object.entries(profile.meta).forEach(([tag, meta]) => {
      const d      = semData[tag] || { count: 0 };
      const status = semGetStatus(tag, d.count, meta);
      const isP2   = meta.priority === 'P2';

      if (status === 'missing') {
        const msg = `- <${tag}> está AUSENTE (encontrado: 0, esperado: ${meta.expected || 'pelo menos 1'})`;
        isP2 ? optionals.push(msg) : problems.push(msg);
      } else if (status === 'warning') {
        const msg = `- <${tag}> está DUPLICADO (encontrado: ${d.count}×, esperado: 1)`;
        isP2 ? optionals.push(msg) : problems.push(msg);
      }
    });
    // div-abuse é sempre um problema estrutural (P0/P1)
    if (semData._divAbuse && semData._divAbuse.length) {
      semData._divAbuse.forEach(abuse => {
        problems.push(`- <div> em posição estrutural onde deveria ser <${abuse.suggestion}>${abuse.id ? ` (id="${abuse.id}")` : abuse.className ? ` (class="${abuse.className.trim().split(' ')[0]}")` : ''}`);
      });
    }

    const score        = semData._score || 0;
    const actualHTML   = semBuildActualHTML(semData, profile);
    const idealHTML    = semBuildIdealHTML(profile.tree, 0);

    const optionalsBlock = optionals.length
      ? `\n## Melhorias opcionais (P2 — não obrigatórias)\n${optionals.join('\n')}`
      : '';

    const prompt = `Você é um especialista em HTML semântico e SEO técnico. Preciso que você corrija a estrutura semântica do HTML do meu site.

## Contexto
- URL: ${url}
- Tipo de página: ${profile.label}
- Score semântico atual: ${score}/100

## Problemas estruturais (P0/P1 — obrigatório corrigir)
${problems.length ? problems.join('\n') : '- Nenhum problema estrutural encontrado'}
${optionalsBlock}

## Estrutura atual (problemas marcados com ⚠)
\`\`\`html
${actualHTML}
\`\`\`

## Estrutura ideal para ${profile.label}
\`\`\`html
${idealHTML}
\`\`\`

## Instruções
1. Substitua cada \`<div>\` marcado com "⚠ deveria ser <tag>" pela tag semântica correta
2. Mantenha todos os atributos \`class\`, \`id\` e \`data-*\` originais — apenas troque o nome da tag
3. Se alguma tag estiver duplicada, explique qual manter e qual remover
4. Ignore as melhorias P2 a menos que eu peça explicitamente
5. Gere o HTML corrigido completo e um checklist do que foi alterado

Responda com o HTML corrigido e o checklist.`;

    navigator.clipboard.writeText(prompt).then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Copiado!`;
      btn.classList.add('copied');
      setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
    }).catch(() => {});
  });
}

// This function runs in the page context (injected)
function analyzePageFull() {
  const url = location.href;
  const domain = location.hostname;

  const titleEl = document.querySelector('title');
  const title = titleEl ? titleEl.textContent.trim() : '';
  const titleLen = title.length;

  const metaDesc = document.querySelector('meta[name="description"]');
  const description = metaDesc ? (metaDesc.getAttribute('content') || '').trim() : '';
  const descLen = description.length;

  const canonicalEl = document.querySelector('link[rel="canonical"]');
  const canonical = canonicalEl ? (canonicalEl.getAttribute('href') || '') : '';

  const robotsEl = document.querySelector('meta[name="robots"]');
  const robots = robotsEl ? (robotsEl.getAttribute('content') || '').toLowerCase() : '';
  const isNoindex = robots.includes('noindex');
  const isNofollow = robots.includes('nofollow');

  const htmlLang = document.documentElement.getAttribute('lang') || '';

  // Headings — ordered, with text
  const headingNodes = [];
  document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(el => {
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    if (text) headingNodes.push({ level: el.tagName, text });
  });

  const h1Count = document.querySelectorAll('h1').length;
  const h2Count = document.querySelectorAll('h2').length;
  const h3Count = document.querySelectorAll('h3').length;
  const h4Count = document.querySelectorAll('h4').length;
  const h5Count = document.querySelectorAll('h5').length;
  const h6Count = document.querySelectorAll('h6').length;
  const h1Text = [...document.querySelectorAll('h1')].map(el => el.textContent.trim());

  const og = {
    title: document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '',
    description: document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '',
    image: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '',
  };

  const images = [...document.querySelectorAll('img')];
  const imgTotal = images.length;
  const imgNoAlt = images.filter(img => {
    const alt = img.getAttribute('alt');
    return alt === null || alt.trim() === '';
  }).length;

  const links = [...document.querySelectorAll('a[href]')];
  let internalLinks = 0, externalLinks = 0, nofollowLinks = 0;
  links.forEach(a => {
    try {
      const href = new URL(a.getAttribute('href'), url);
      if (href.hostname === domain) internalLinks++;
      else if (href.hostname) externalLinks++;
    } catch {}
    if ((a.getAttribute('rel') || '').includes('nofollow')) nofollowLinks++;
  });
  const totalLinks = links.length;

  const jsonldScripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
  const schemas = jsonldScripts.map((el, idx) => {
    try {
      const parsed = JSON.parse(el.textContent);
      const types = [];
      const ids = [];
      const collect = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node['@type']) types.push(Array.isArray(node['@type']) ? node['@type'].join(', ') : node['@type']);
        if (node['@id']) ids.push(node['@id']);
        if (node['@graph']) node['@graph'].forEach(collect);
      };
      collect(parsed);
      return { valid: true, types, ids, raw: parsed, index: idx };
    } catch (e) { return { valid: false, types: [], ids: [], raw: null, index: idx, error: e.message }; }
  });

  // Microdata detection
  const microdataEls = [...document.querySelectorAll('[itemscope],[itemtype],[itemprop]')];
  const microdataTypes = [...new Set(
    [...document.querySelectorAll('[itemtype]')].map(el => el.getAttribute('itemtype')).filter(Boolean)
  )];
  const microdata = {
    detected: microdataEls.length > 0,
    itemscope: document.querySelectorAll('[itemscope]').length,
    itemtype: document.querySelectorAll('[itemtype]').length,
    itemprop: document.querySelectorAll('[itemprop]').length,
    types: microdataTypes.slice(0, 10),
  };

  const hasViewport = !!document.querySelector('meta[name="viewport"]');

  // Score
  let score = 100;
  if (!title) score -= 15;
  else if (titleLen < 30) score -= 8;
  else if (titleLen > 60) score -= 5;

  if (!description) score -= 10;
  else if (descLen < 70) score -= 5;
  else if (descLen > 160) score -= 3;

  if (h1Count === 0) score -= 12;
  else if (h1Count > 1) score -= 8;

  if (!canonical) score -= 5;
  if (isNoindex) score -= 20;

  const imgNoAltCount = imgNoAlt;
  if (imgNoAltCount > 0) score -= Math.min(imgNoAltCount * 2, 10);

  if (schemas.filter(s => s.valid).length === 0) score -= 5;

  if (!og.title || !og.description || !og.image) score -= 5;

  if (!hasViewport) score -= 8;

  if (!htmlLang) score -= 3;

  score = Math.max(0, Math.min(100, score));

  return {
    url, title, titleLen, description, descLen,
    canonical, robots, isNoindex, isNofollow, htmlLang,
    headingNodes, h1Count, h2Count, h3Count, h4Count, h5Count, h6Count, h1Text,
    og, imgTotal, imgNoAlt,
    internalLinks, externalLinks, nofollowLinks, totalLinks,
    schemas, microdata, hasViewport, score,
  };
}
// ═══════════════════════════════════════════════════════════════
// MANUAL JSON-LD INPUT MODAL (adicionar ao final de popup.js)
// ═══════════════════════════════════════════════════════════════

/**
 * Abre o modal de entrada manual de JSON-LD
 */
function openManualJsonldModal() {
  const modal = document.getElementById('manual-jsonld-modal');
  const textarea = document.getElementById('manual-jsonld-textarea');
  const error = document.getElementById('manual-jsonld-error');
  
  modal.style.display = 'flex';
  textarea.focus();
  error.style.display = 'none';
  textarea.value = '';
}

/**
 * Fecha o modal de entrada manual
 */
function closeManualJsonldModal() {
  const modal = document.getElementById('manual-jsonld-modal');
  const textarea = document.getElementById('manual-jsonld-textarea');
  const error = document.getElementById('manual-jsonld-error');
  
  modal.style.display = 'none';
  textarea.value = '';
  error.style.display = 'none';
}

/**
 * Parseia o input do textarea (JSON puro ou <script type="application/ld+json">)
 */
function parseManualJsonldInput(text) {
  if (!text || !text.trim()) return null;
  
  const trimmed = text.trim();
  const scriptMatch = trimmed.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  let jsonText = scriptMatch ? scriptMatch[1] : trimmed;
  
  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'object' && parsed !== null) return [parsed];
    return null;
  } catch (err) {
    throw new Error(`JSON inválido: ${err.message}`);
  }
}

/**
 * Converte JSON parseado para formato esperado por renderSchemaTab
 */
function convertToSchemaFormat(jsonObjects) {
  return jsonObjects.map(obj => {
    const types = obj['@type'] 
      ? (Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']])
      : [];
    const ids = obj['@id'] ? [obj['@id']] : [];
    
    const collectIds = (o) => {
      if (!o || typeof o !== 'object') return;
      if (o['@id'] && !ids.includes(o['@id'])) ids.push(o['@id']);
      Object.values(o).forEach(v => {
        if (Array.isArray(v)) v.forEach(collectIds);
        else if (typeof v === 'object') collectIds(v);
      });
    };
    collectIds(obj);
    
    return {
      valid: true,
      types,
      ids,
      raw: obj,
      error: null
    };
  });
}

/**
 * Processa a entrada do usuário e renderiza na aba Schema
 */
function processManualJsonldInput() {
  const textarea = document.getElementById('manual-jsonld-textarea');
  const error = document.getElementById('manual-jsonld-error');
  
  error.style.display = 'none';
  
  try {
    const text = textarea.value;
    
    if (!text || !text.trim()) {
      error.textContent = 'Por favor, cole algum JSON-LD';
      error.style.display = 'block';
      return;
    }
    
    const jsonObjects = parseManualJsonldInput(text);
    
    if (!jsonObjects || jsonObjects.length === 0) {
      error.textContent = 'Nenhum JSON-LD válido encontrado';
      error.style.display = 'block';
      return;
    }
    
    const schemas = convertToSchemaFormat(jsonObjects);
    
    const mockData = {
      schemas,
      microdata: { detected: false },
      url: window.location.href || 'about:blank'
    };
    
    renderSchemaTab(mockData);
    _afterRenderSchemaTab();

    if (graphData) {
      graphData.schemas = schemas;
    } else {
      graphData = mockData;
    }
    
    graphRendered = false;
    closeManualJsonldModal();
    
  } catch (err) {
    error.textContent = err.message || 'Erro ao processar JSON-LD';
    error.style.display = 'block';
  }
}

/**
 * Inicializa event listeners do modal
 */
function initManualJsonldModal() {
  const modal = document.getElementById('manual-jsonld-modal');
  if (!modal) return;
  
  const overlay = document.querySelector('.manual-jsonld-overlay');
  const closeBtn = document.getElementById('manual-jsonld-close');
  const cancelBtn = document.getElementById('manual-jsonld-btn-cancel');
  const clearBtn = document.getElementById('manual-jsonld-btn-clear');
  const submitBtn = document.getElementById('manual-jsonld-btn-submit');
  const textarea = document.getElementById('manual-jsonld-textarea');
  
  if (overlay) overlay.addEventListener('click', closeManualJsonldModal);
  if (closeBtn) closeBtn.addEventListener('click', closeManualJsonldModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeManualJsonldModal);
  
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      textarea.value = '';
      document.getElementById('manual-jsonld-error').style.display = 'none';
      textarea.focus();
    });
  }
  
  if (submitBtn) {
    submitBtn.addEventListener('click', processManualJsonldInput);
  }
  
  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      processManualJsonldInput();
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'flex') {
      closeManualJsonldModal();
    }
  });
}

/**
 * Insere botão "Colar JSON-LD" na toolbar da aba Schema
 */
function addManualSchemaButton(container) {
  if (document.querySelector('.schema-paste-jsonld-btn')) return;
  
  const toolbar = document.createElement('div');
  toolbar.className = 'schema-manual-toolbar';
  toolbar.innerHTML = `
    <button class="schema-paste-jsonld-btn" type="button" title="Colar JSON-LD manual">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/>
        <path d="M15 2h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/>
        <path d="M9 7h6"/><path d="M9 11h6"/><path d="M9 15h6"/>
      </svg>
      Colar JSON-LD
    </button>
  `;
  
  container.appendChild(toolbar);
  toolbar.querySelector('.schema-paste-jsonld-btn').addEventListener('click', openManualJsonldModal);
}

// Adiciona botão manual após renderSchemaTab — chamado via hook na linha 454
function _afterRenderSchemaTab() {
  const container = document.getElementById('schema-list');
  if (container) {
    addManualSchemaButton(container);
    initManualJsonldModal();
  }
}

// Inicializa modal quando DOM está pronto
document.addEventListener('DOMContentLoaded', () => {
  requestAnimationFrame(() => {
    initManualJsonldModal();
  });
});

// ═══════════════════════════════════════════════════════════════
// EXPORT SVG/PNG FUNCTIONS (adicionar ao final de popup.js)
// ═══════════════════════════════════════════════════════════════

function exportGraphSVG() {
  const canvas = document.getElementById('graph-canvas');
  const svg = canvas.querySelector('svg');
  
  if (!svg) {
    console.warn('Nenhum SVG encontrado para exportar');
    return;
  }

  try {
    const svgClone = svg.cloneNode(true);
    
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      text { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
      .graph-node-label { font-size: 10px; fill: rgba(237,240,247,.8); }
      circle { fill-opacity: 0.85; stroke-opacity: 0.4; }
      line { stroke: #2d3748; stroke-width: 1.5; }
    `;
    svgClone.insertBefore(styleEl, svgClone.firstChild);
    
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgClone);
    
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `seo-graph-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    console.log('[SEO Analyzer] SVG exportado com sucesso');
  } catch (err) {
    console.error('[SEO Analyzer] Erro ao exportar SVG:', err);
  }
}

function exportGraphPNG() {
  const canvas = document.getElementById('graph-canvas');
  const svg = canvas.querySelector('svg');
  
  if (!svg) {
    console.warn('Nenhum SVG encontrado para exportar');
    return;
  }

  try {
    const width = svg.getAttribute('width') || svg.clientWidth || 636;
    const height = svg.getAttribute('height') || svg.clientHeight || 380;
    
    const svgClone = svg.cloneNode(true);
    
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      text { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
      .graph-node-label { font-size: 10px; fill: rgba(237,240,247,.8); }
      circle { fill-opacity: 0.85; stroke-opacity: 0.4; }
      line { stroke: #2d3748; stroke-width: 1.5; }
    `;
    svgClone.insertBefore(styleEl, svgClone.firstChild);
    
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgClone);
    
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const img = new Image();
    img.onload = () => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const ctx = tempCanvas.getContext('2d');
      
      ctx.fillStyle = '#080910';
      ctx.fillRect(0, 0, width, height);
      
      ctx.drawImage(img, 0, 0, width, height);
      
      tempCanvas.toBlob((pngBlob) => {
        const pngUrl = URL.createObjectURL(pngBlob);
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = `seo-graph-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(pngUrl);
        URL.revokeObjectURL(url);
        
        console.log('[SEO Analyzer] PNG exportado com sucesso');
      }, 'image/png', 1.0);
    };
    
    img.onerror = () => {
      console.error('[SEO Analyzer] Erro ao carregar SVG como imagem');
      URL.revokeObjectURL(url);
    };
    
    img.src = url;
  } catch (err) {
    console.error('[SEO Analyzer] Erro ao exportar PNG:', err);
  }
}

document.getElementById('graph-export-svg')?.addEventListener('click', exportGraphSVG);
document.getElementById('graph-export-png')?.addEventListener('click', exportGraphPNG);

// ═══════════════════════════════════════════════════════════════
// FULLSCREEN GRAPH (adicionar ao final de popup.js)
// ═══════════════════════════════════════════════════════════════

async function openGraphFullscreen() {
  if (!graphData || !graphData.schemas || graphData.schemas.length === 0) {
    return;
  }

  try {
    const schemasClean = (graphData.schemas || []).map(s => ({
      valid: s.valid !== false,
      types: s.types || [],
      ids: s.ids || [],
      raw: typeof s.raw === 'string' ? (() => { try { return JSON.parse(s.raw); } catch(_) { return null; } })() : s.raw,
    })).filter(s => s.raw);

    await chrome.storage.local.set({
      'seo_graph_fullscreen': { schemas: schemasClean, timestamp: Date.now() }
    });

    return new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'openGraphFullscreen' }, () => resolve());
    });
  } catch (err) {
    console.error('Error opening fullscreen graph:', err);
  }
}

function showGraphOpenedState() {
  const canvas = document.getElementById('graph-canvas');
  const infoEl = document.getElementById('graph-info');
  if (!canvas) return;

  // Mostra estado "aberto em nova aba" no popup
  canvas.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100%;gap:16px;color:var(--text-muted);text-align:center;padding:24px;">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#7c74ff" stroke-width="1.5" opacity="0.6">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
      </svg>
      <div>
        <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">
          Grafo aberto em nova aba
        </div>
        <div style="font-size:12px;line-height:1.6;">
          O grafo foi aberto em tela cheia para<br>melhor visualização e navegação.
        </div>
      </div>
      <button id="graph-reopen-btn" style="
        padding:8px 18px;border:1px solid var(--accent);border-radius:8px;
        background:var(--accent-dim);color:var(--accent);font-size:12px;
        font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;">
        Abrir novamente
      </button>
    </div>
  `;

  if (infoEl) infoEl.textContent = 'Aberto em tela cheia';

  document.getElementById('graph-reopen-btn')?.addEventListener('click', () => {
    graphRendered = false;
    openGraphFullscreen().then(() => showGraphOpenedState());
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('graph-fullscreen')?.addEventListener('click', openGraphFullscreen);
});

// ── Theme moon toggle ────────────────────────────────────────────────────────
// Clique cicla: dark → paper → light → dark...   Default: dark
(function initTheme() {
  const STORAGE_KEY = 'seo_ext_theme';
  const CYCLE       = ['dark', 'paper', 'light'];
  const DEFAULT     = 'dark';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  }

  let current = DEFAULT;
  try { current = localStorage.getItem(STORAGE_KEY) || DEFAULT; } catch {}

  function setup() {
    applyTheme(current);
    const btn = document.getElementById('theme-moon');
    if (btn) {
      btn.addEventListener('click', () => {
        current = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
        applyTheme(current);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();

// ═══════════════════════════════════════════════════════════════
// TYPE FILTERS (adicionar ao final de popup.js)
// ═══════════════════════════════════════════════════════════════

let sourceNodesArray = [];
let sourceValidLinks = [];

function buildTypeFilters(nodesArray, validLinks) {
  const typeCounts = {};
  nodesArray.forEach(n => {
    if (n.type) typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
  });

  const sortedTypes = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));

  const list = document.getElementById('filter-types-list');
  if (!list) return;

  const TYPE_COLORS = {
    'Organization':'#7c74ff','WebSite':'#3b82f6','WebPage':'#06b6d4',
    'LocalBusiness':'#10b981','Product':'#f59e0b','Service':'#f59e0b',
    'Article':'#ec4899','BlogPosting':'#ec4899','FAQPage':'#8b5cf6',
    'Person':'#ef4444','BreadcrumbList':'#64748b','ListItem':'#64748b',
    'ImageObject':'#84cc16','VideoObject':'#14b8a6','Review':'#f97316',
    'AggregateRating':'#f97316','Offer':'#a855f7','ContactPoint':'#22d3ee',
    'PostalAddress':'#94a3b8','SiteLinksSearchBox':'#60a5fa','SearchAction':'#60a5fa',
    'HowTo':'#f472b6','HowToStep':'#fb7185','Event':'#34d399','Course':'#a3e635',
    'Recipe':'#fbbf24','JobPosting':'#60a5fa','NewsArticle':'#e879f9',
  };

  list.innerHTML = sortedTypes.map(({ type, count }) => {
    const color = TYPE_COLORS[type] || '#a78bfa';
    return `
      <div class="filter-type-item">
        <label class="filter-type-checkbox">
          <input type="checkbox" class="filter-type-select" data-type="${type}" checked>
          <span class="filter-type-name">
            <span class="filter-type-color" style="background:${color}"></span>
            ${type}
          </span>
        </label>
        <span class="filter-type-count">${count}</span>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.filter-type-select').forEach(input => {
    input.addEventListener('change', applyTypeFilters);
  });

  document.getElementById('filter-only-connected')?.addEventListener('change', applyTypeFilters);
}

function applyTypeFilters() {
  const selectedTypes = new Set();
  document.querySelectorAll('.filter-type-select:checked').forEach(input => {
    selectedTypes.add(input.dataset.type);
  });

  const onlyConnected = document.getElementById('filter-only-connected')?.checked || false;

  let filteredNodes = sourceNodesArray.filter(n => {
    if (n.type && !selectedTypes.has(n.type)) return false;
    return true;
  });

  let filteredLinks = sourceValidLinks.filter(l => {
    const srcNode = sourceNodesArray.find(n => n.id === l.source);
    const tgtNode = sourceNodesArray.find(n => n.id === l.target);
    if (!srcNode || !tgtNode) return false;
    if (srcNode.type && !selectedTypes.has(srcNode.type)) return false;
    if (tgtNode.type && !selectedTypes.has(tgtNode.type)) return false;
    return true;
  });

  if (onlyConnected) {
    const connectedIds = new Set();
    filteredLinks.forEach(l => {
      connectedIds.add(l.source);
      connectedIds.add(l.target);
    });
    filteredNodes = filteredNodes.filter(n => connectedIds.has(n.id));
  }

  const activeFilters = (selectedTypes.size < sourceNodesArray.filter(n => n.type).length ? 1 : 0) +
                        (onlyConnected ? 1 : 0);
  const badge = document.getElementById('filter-badge');
  if (activeFilters > 0) {
    badge.textContent = activeFilters;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }

  rerenderGraph(filteredNodes, filteredLinks);
}

function rerenderGraph(filteredNodes, filteredLinks) {
  const canvas = document.getElementById('graph-canvas');
  d3.select(canvas).selectAll('svg').remove();

  if (filteredNodes.length === 0) {
    document.getElementById('graph-empty').style.display = 'flex';
    canvas.style.display = 'none';
    return;
  }

  canvas.style.display = 'block';
  document.getElementById('graph-empty').style.display = 'none';

  const infoEl = document.getElementById('graph-info');
  const typeCounts = {};
  filteredNodes.forEach(n => { if (n.type) typeCounts[n.type] = (typeCounts[n.type] || 0) + 1; });
  const topTypes = Object.entries(typeCounts).sort((a,b) => b[1]-a[1]).slice(0,3).map(([t,c]) => `${t}(${c})`).join(' · ');
  infoEl.textContent = `${filteredNodes.length} nós · ${filteredLinks.length} conexões · ${topTypes}`;

  const W = canvas.clientWidth || 636;
  const H = canvas.clientHeight || 380;

  const svg = d3.select(canvas)
    .append('svg')
    .attr('width', W)
    .attr('height', H);

  svg.append('defs').append('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 28)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#4b5563');

  const g = svg.append('g');

  const zoom = d3.zoom()
    .scaleExtent([0.2, 4])
    .on('zoom', (e) => g.attr('transform', e.transform));
  svg.call(zoom);

  const link = g.append('g')
    .selectAll('line')
    .data(filteredLinks)
    .join('line')
    .attr('stroke', '#2d3748')
    .attr('stroke-width', 1.5)
    .attr('marker-end', 'url(#arrow)');

  const linkLabel = g.append('g')
    .selectAll('text')
    .data(filteredLinks.filter(l => l.label))
    .join('text')
    .attr('font-size', 9)
    .attr('fill', '#475569')
    .attr('text-anchor', 'middle')
    .attr('pointer-events', 'none')
    .text(d => d.label ? (d.label.length > 16 ? d.label.slice(0, 16) + '…' : d.label) : '');

  const node = g.append('g')
    .selectAll('g')
    .data(filteredNodes)
    .join('g')
    .attr('cursor', 'grab');

  node.append('circle')
    .attr('r', d => d.radius)
    .attr('fill', d => d.color)
    .attr('fill-opacity', 0.85)
    .attr('stroke', d => d.color)
    .attr('stroke-width', 1.5)
    .attr('stroke-opacity', 0.4);

  node.append('text')
    .attr('y', d => d.radius + 11)
    .attr('text-anchor', 'middle')
    .attr('font-size', 10)
    .attr('fill', '#94a3b8')
    .attr('pointer-events', 'none')
    .text(d => d.label);

  const tooltip = document.getElementById('graph-tooltip');

  function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  node.on('mouseenter', (event, d) => {
    const lines = [];
    if (d.fullType) {
      const t = Array.isArray(d.fullType) ? d.fullType.join(', ') : d.fullType;
      lines.push(`<div class="graph-tooltip-type">${t}</div>`);
    }
    if (d.atId) lines.push(`<div class="graph-tooltip-id">${d.atId}</div>`);
    Object.entries(d.props || {}).forEach(([k, v]) => {
      lines.push(`<div class="graph-tooltip-prop"><span>${k}:</span> ${escHtml(v)}</div>`);
    });
    tooltip.innerHTML = lines.join('');
    tooltip.classList.add('visible');
  });

  node.on('mousemove', (event) => {
    tooltip.style.left = (event.clientX + 14) + 'px';
    tooltip.style.top = (event.clientY - 10) + 'px';
  });

  node.on('mouseleave', () => {
    tooltip.classList.remove('visible');
  });

  let paused = false;
  node.call(d3.drag()
    .on('start', (event, d) => {
      if (!paused) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on('drag', (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on('end', (event, d) => {
      if (!paused) simulation.alphaTarget(0);
      if (!paused) { d.fx = null; d.fy = null; }
    })
  );

  const simulation = d3.forceSimulation(filteredNodes)
    .force('link', d3.forceLink(filteredLinks)
      .id(d => d.id)
      .distance(d => {
        const srcDepth = (d.source && typeof d.source === 'object') ? (d.source.depth || 0) : 0;
        const tgtDepth = (d.target && typeof d.target === 'object') ? (d.target.depth || 0) : 0;
        return Math.max(60, 110 - ((srcDepth + tgtDepth) / 2) * 15);
      })
    )
    .force('charge', d3.forceManyBody().strength(-400))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide(d => d.radius + 14))
    .on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      linkLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2 - 4);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

  const pauseBtn = document.getElementById('graph-pause');
  pauseBtn.removeEventListener('click', null);
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    if (paused) {
      simulation.stop();
      filteredNodes.forEach(d => { d.fx = d.x; d.fy = d.y; });
      pauseBtn.classList.add('active');
      pauseBtn.title = 'Retomar simulação';
      pauseBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    } else {
      filteredNodes.forEach(d => { d.fx = null; d.fy = null; });
      simulation.alphaTarget(0.3).restart();
      setTimeout(() => simulation.alphaTarget(0), 1500);
      pauseBtn.classList.remove('active');
      pauseBtn.title = 'Pausar simulação';
      pauseBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    }
  });

  document.getElementById('graph-reset').removeEventListener('click', null);
  document.getElementById('graph-reset').addEventListener('click', () => {
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
  });

  const slidersPanel = document.getElementById('graph-sliders');
  const slidersBtn   = document.getElementById('graph-sliders-toggle');
  if (slidersBtn && slidersPanel) {
    slidersBtn.removeEventListener('click', null);
    slidersBtn.addEventListener('click', () => {
      const open = slidersPanel.style.display === 'none' || !slidersPanel.style.display;
      slidersPanel.style.display = open ? 'flex' : 'none';
      slidersBtn.classList.toggle('active', open);
    });
  }

  function applySliders() {
    const linkDist  = +document.getElementById('sl-link-dist').value;
    const nodeSize  = +document.getElementById('sl-node-size').value;
    const charge    = +document.getElementById('sl-charge').value;
    const fontSize  = +document.getElementById('sl-font').value;
    const maxDepth  = +document.getElementById('sl-depth').value;

    document.getElementById('sl-link-dist-val').textContent = linkDist;
    document.getElementById('sl-node-size-val').textContent = nodeSize;
    document.getElementById('sl-charge-val').textContent = charge;
    document.getElementById('sl-font-val').textContent = fontSize;
    document.getElementById('sl-depth-val').textContent = maxDepth;

    simulation.force('link').distance(linkDist);
    simulation.force('charge').strength(charge);

    node.each(function(d) {
      const visible = d.depth === 0 || d.depth <= maxDepth;
      d3.select(this).style('display', visible ? null : 'none');
      d3.select(this).select('circle').attr('r', d.radius * (nodeSize / 10));
    });

    node.selectAll('text').attr('font-size', fontSize);

    link.style('display', d => {
      const sd = (d.source && typeof d.source === 'object') ? d.source.depth : 0;
      const td = (d.target && typeof d.target === 'object') ? d.target.depth : 0;
      return (sd <= maxDepth && td <= maxDepth) ? null : 'none';
    });

    simulation.alpha(0.3).restart();
  }

  ['sl-link-dist','sl-node-size','sl-charge','sl-font','sl-depth'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.removeEventListener('input', null);
      el.addEventListener('input', applySliders);
    }
  });
}

function setupTypeFilterPanel() {
  const toggleBtn = document.getElementById('graph-filters-toggle');
  const panel = document.getElementById('graph-filters-panel');
  const closeBtn = document.getElementById('filters-close');

  if (!toggleBtn || !panel) return;

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = panel.style.display === 'none' || !panel.style.display;
    panel.style.display = isOpen ? 'flex' : 'none';
    toggleBtn.classList.toggle('active', isOpen);
  });

  closeBtn.addEventListener('click', () => {
    panel.style.display = 'none';
    toggleBtn.classList.remove('active');
  });

  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && !toggleBtn.contains(e.target)) {
      panel.style.display = 'none';
      toggleBtn.classList.remove('active');
    }
  });
}

// (bloco movido para dentro de renderGraph — ver chamada no final dessa função)


// ══════════════════════════════════════════════════════════════
// TOUR GUIADO — spotlight tooltip estilo Zicy
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// WELCOME CARD — boas-vindas simples, aparece uma vez
// ══════════════════════════════════════════════════════════════

function welcomeShow() {
  const overlay = document.getElementById('welcome-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  overlay.setAttribute('aria-hidden', 'false');
  document.getElementById('welcome-start')?.addEventListener('click', welcomeClose, { once: true });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) welcomeClose(); });
}

function welcomeClose() {
  const overlay = document.getElementById('welcome-overlay');
  if (overlay) { overlay.style.display = 'none'; overlay.setAttribute('aria-hidden', 'true'); }
  chrome.storage.sync.set({ seo_tour_done: true });
}

// tourStart agora abre o welcome card
function tourStart() { welcomeShow(); }

// ══════════════════════════════════════════════════════════════
// TOOLTIP CONTEXTUAL POR ABA
// Mostra 1 tooltip por aba na primeira visita do usuário
// Fecha ao clicar "Entendi" ou fora. Flag em chrome.storage.local.
// ══════════════════════════════════════════════════════════════

const CTX_TIPS = {
  config: {
    anchor: '#nim-api-key',
    title: '⚙️ Configure a API NVIDIA NIM',
    body: 'Cole sua chave gratuita de build.nvidia.com. Ela habilita análise qualitativa dos Chunks AEO (EAV triples, intent, AEO score). Sem ela, só a análise local roda.',
  },
  overview: {
    anchor: '.ovr-score-ring, .score-ring-wrap, #seo-score-ring, .overview-ring',
    title: '📊 Score de saúde da página',
    body: 'Este número resume title, meta, H1, canonical e Open Graph. Explore as outras abas para ver cada detalhe e corrigir o que está faltando.',
  },
  headings: {
    anchor: '#ai-send-btn',
    title: '🤖 Analisar títulos com IA',
    body: 'Clique aqui para enviar a estrutura H1-H6 desta página para o ChatGPT, Claude ou Gemini. A IA recebe a entity salience real e sugere melhorias específicas.',
  },
  links: {
    anchor: '#juice-fullscreen-btn',
    title: '🔗 Ver todos os links em detalhes',
    body: 'Clique em "Ver mapa completo" para abrir o grafo interativo de links em tela cheia. Você vê o fluxo de PageRank e a qualidade de cada anchor text.',
  },
  chunks: {
    anchor: '#chunks-ai-send-btn',
    title: '🧩 Análise semântica por seção',
    body: 'Cada card é uma seção analisada com Google NL API + NVIDIA NIM. Use "Analisar com IA" para receber sugestão de reescrita dos chunks com score mais baixo.',
  },
  schema: {
    anchor: '.sv-block, .schema-empty-state',
    title: '📋 Schema JSON-LD validado',
    body: 'Erros P0 (vermelho) impedem rich results no Google. Use a aba "Gerar Schema" para criar dados estruturados sem escrever código.',
  },
  checks: {
    anchor: '.cat-list, #checks-list',
    title: '✅ 16 categorias de análise',
    body: 'Foque nas categorias abaixo de 60. "Citability & Answer-Readiness" mede diretamente o potencial de ser citado por ChatGPT, Gemini e Perplexity.',
  },
  speed: {
    anchor: '#speed-run-btn',
    title: '⚡ Core Web Vitals reais',
    body: 'Clique em "Analisar agora" para buscar LCP, CLS e FCP via PageSpeed Insights. Páginas lentas aparecem menos nas respostas geradas por IA.',
  },
  learn: {
    anchor: '#la-search',
    title: '📚 Aprenda SEO Semântico',
    body: 'Curso completo com capítulos, quizzes e glossário de 300+ termos. Seu progresso é salvo automaticamente. Comece pelo Capítulo 1.',
  },
  bob: {
    anchor: '#bob-input',
    title: '✦ Pergunte ao Bob',
    body: 'O Bob tem acesso à análise completa desta página. Pergunte: "O que devo corrigir primeiro?" ou "Minha página está otimizada para IA?"',
  },
};

let _ctxTipActive = false;

function ctxTipShow(tabKey) {
  if (_ctxTipActive) return;
  const tip = CTX_TIPS[tabKey];
  if (!tip) return;

  const storageKey = `ctx_tip_${tabKey}`;
  chrome.storage.local.get([storageKey], result => {
    if (result[storageKey]) return;

    // Tentar cada seletor alternativo separado por vírgula
    let anchorEl = null;
    for (const sel of tip.anchor.split(',').map(s => s.trim())) {
      const el = document.querySelector(sel);
      if (el) { anchorEl = el; break; }
    }
    if (!anchorEl) return;

    _ctxTipActive = true;
    _ctxTipRender(anchorEl, tip.title, tip.body, storageKey);
  });
}

function _ctxTipRender(anchorEl, title, body, storageKey) {
  const tip     = document.getElementById('ctx-tooltip');
  const titleEl = document.getElementById('ctx-tooltip-title');
  const bodyEl  = document.getElementById('ctx-tooltip-body');
  const okBtn   = document.getElementById('ctx-tooltip-ok');
  if (!tip) return;

  if (titleEl) titleEl.textContent = title;
  if (bodyEl)  bodyEl.textContent  = body;
  tip.style.display = 'block';

  // Posicionar centrado sob (ou acima de) o âncora
  const TIP_W   = 272;
  const TIP_GAP = 10;
  const rect    = anchorEl.getBoundingClientRect();
  const viewW   = window.innerWidth;
  const viewH   = window.innerHeight;

  let left = rect.left + rect.width / 2 - TIP_W / 2;
  left = Math.max(8, Math.min(left, viewW - TIP_W - 8));

  if (viewH - rect.bottom > 130) {
    tip.style.top  = `${rect.bottom + TIP_GAP}px`;
    tip.style.left = `${left}px`;
    tip.className  = 'ctx-arrow-top';
  } else {
    tip.style.left = `${left}px`;
    tip.className  = 'ctx-arrow-bottom';
    requestAnimationFrame(() => {
      tip.style.top = `${rect.top - TIP_GAP - tip.offsetHeight}px`;
    });
  }

  const close = () => {
    tip.style.display = 'none';
    _ctxTipActive = false;
    chrome.storage.local.set({ [storageKey]: true });
  };

  okBtn?.addEventListener('click', close, { once: true });
  setTimeout(() => {
    document.addEventListener('click', function outside(e) {
      if (!tip.contains(e.target)) { close(); document.removeEventListener('click', outside); }
    });
  }, 120);
}

// ══════════════════════════════════════════════════════════════
// ABA GUIA — como usar cada funcionalidade
// ══════════════════════════════════════════════════════════════

const GUIDE_CARDS = [
  {
    tab: '360',
    name: '360° — Diagnóstico Completo',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>',
    iconClass: 'guide-card-icon--seo',
    badge: 'ALL',
    badgeClass: 'guide-badge--all',
    desc: 'Painel de status unificado com o resultado de todas as 13 categorias de análise. É o ponto de partida — veja tudo de uma vez e clique para ir direto ao problema.',
    tips: [
      'Abra aqui primeiro para ter uma visão rápida do estado geral',
      'Clique em "Ver →" ao lado de qualquer categoria para ir direto para ela',
      'O score geral (0-100) resume a saúde SEO da página',
    ],
  },
  {
    tab: 'overview',
    name: 'Visão Geral',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
    iconClass: 'guide-card-icon--seo',
    badge: 'SEO',
    badgeClass: 'guide-badge--seo',
    desc: 'Title tag, meta description, H1, canonical, robots, Open Graph, Twitter Card, hreflang e contagem de palavras. O básico que nunca pode falhar numa página.',
    tips: [
      'Verifique se o title tem 50-60 caracteres e inclui a keyword principal',
      'Meta description ideal: 150-160 chars, resolve a query do usuário',
      'Canonical sempre deve apontar para si mesma em páginas canônicas',
    ],
  },
  {
    tab: 'headings',
    name: 'Títulos & Entity Salience',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h12"/></svg>',
    iconClass: 'guide-card-icon--geo',
    badge: 'GEO',
    badgeClass: 'guide-badge--geo',
    desc: 'Analisa a hierarquia H1-H6 com score de 12 critérios, entity salience real via Google NL API e botão para enviar análise completa ao Claude, ChatGPT, Gemini ou Perplexity.',
    tips: [
      'Use "Analisar com IA" para receber sugestão de melhoria dos títulos',
      'H1 único e com a keyword principal — nunca repetido',
      'H2s devem ser perguntas que a persona faz em voz alta',
    ],
  },
  {
    tab: 'links',
    name: 'Links & Link Juice',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    iconClass: 'guide-card-icon--seo',
    badge: 'SEO',
    badgeClass: 'guide-badge--seo',
    desc: 'Analisa anchor text de todos os links (internos e externos), detecta nofollow, classifica qualidade dos anchors e visualiza o fluxo de link juice em grafo interativo.',
    tips: [
      'Anchors em verde = Phrase Match (bom). Vermelho = genérico ("clique aqui")',
      'Clique em "Ver mapa completo" para visualizar o grafo de links em tela cheia',
      'Links sem anchor text ou com "aqui/saiba mais" diluem PageRank',
    ],
  },
  {
    tab: 'images',
    name: 'Imagens',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    iconClass: 'guide-card-icon--speed',
    badge: 'SPEED',
    badgeClass: 'guide-badge--speed',
    desc: 'Detecta imagens em 9 camadas (img, picture, CSS background, SVG, Canvas, OG...). Verifica alt text, formato (WebP/AVIF/JPG), dimensões, lazy loading e tamanho real via headers HTTP.',
    tips: [
      'Toda imagem precisa de alt text descritivo — nunca genérico',
      'Imagens acima do fold devem ter loading="eager" e fetchpriority="high"',
      'Formato WebP reduz ~30% do tamanho sem perda de qualidade',
    ],
  },
  {
    tab: 'schema',
    name: 'Schema JSON-LD',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    iconClass: 'guide-card-icon--data',
    badge: 'DATA',
    badgeClass: 'guide-badge--data',
    desc: 'Valida todos os blocos JSON-LD da página, mostra erros P0 (críticos) e P1 (warnings) com sugestões. Gera novos schemas por tipo: Article, LocalBusiness, Product, FAQ, etc.',
    tips: [
      'Erros P0 impedem rich results no Google — corrija primeiro',
      'Use o gerador para criar schema sem escrever código',
      'Clique em "Validar no Google" para testar no Rich Results Tester',
    ],
  },
  {
    tab: 'checks',
    name: '16 Verificações Automáticas',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    iconClass: 'guide-card-icon--seo',
    badge: 'ALL',
    badgeClass: 'guide-badge--all',
    desc: 'O diagnóstico mais completo da extensão: 16 categorias automatizadas cobrindo dados estruturados, HTML semântico, acessibilidade para agentes, linkagem, freshness, densidade de informação e muito mais.',
    tips: [
      'Cada categoria tem score individual e lista de checks específicos',
      'Foque primeiro nas categorias com score abaixo de 60',
      'A categoria "Citability & Answer-Readiness" mede diretamente o potencial GEO',
    ],
  },
  {
    tab: 'graph',
    name: 'Knowledge Graph',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
    iconClass: 'guide-card-icon--data',
    badge: 'DATA',
    badgeClass: 'guide-badge--data',
    desc: 'Visualização interativa D3.js do grafo de entidades e relações schema da página. Cada nó é um @type, cada aresta é uma propriedade que conecta entidades.',
    tips: [
      'Arraste os nós para reorganizar o grafo',
      'Clique em "Abrir em tela cheia" para ver o grafo completo',
      'Mais nós conectados = schema mais rico = melhor compreensão pelos crawlers',
    ],
  },
  {
    tab: 'speed',
    name: 'Velocidade & CWV',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    iconClass: 'guide-card-icon--speed',
    badge: 'SPEED',
    badgeClass: 'guide-badge--speed',
    desc: 'Core Web Vitals reais via PageSpeed Insights API: LCP (carregamento), CLS (estabilidade visual), FCP (primeira pintura), TTFB (tempo de resposta). Com oportunidades de melhoria detalhadas.',
    tips: [
      'LCP ideal: < 2.5s. Acima de 4s = zona vermelha',
      'CLS ideal: < 0.1. Causado por imagens sem dimensões declaradas',
      'Páginas lentas são menos citadas por IAs — velocidade afeta GEO/AEO',
    ],
  },
  {
    tab: 'semantic',
    name: 'HTML Semântico',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 10h10M4 14h12M4 18h8"/><rect x="14" y="12" width="7" height="7" rx="1"/></svg>',
    iconClass: 'guide-card-icon--seo',
    badge: 'SEO',
    badgeClass: 'guide-badge--seo',
    desc: 'Verifica uso correto de tags semânticas HTML5: main, article, section, aside, header, footer, nav. Detecta div-abuse e compara com a estrutura ideal para o tipo de página.',
    tips: [
      'Todo conteúdo principal deve estar dentro de <main>',
      'Use <article> para conteúdo independente (posts, produtos)',
      'Div-abuse (divs onde deveria ter tags semânticas) prejudica crawlers de IA',
    ],
  },
  {
    tab: 'chunks',
    name: 'Chunks AEO ⭐',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="4" rx="1"/><rect x="3" y="10" width="18" height="4" rx="1"/><rect x="3" y="17" width="12" height="4" rx="1"/></svg>',
    iconClass: 'guide-card-icon--geo',
    badge: 'GEO/AEO',
    badgeClass: 'guide-badge--geo',
    desc: 'A aba mais avançada da extensão. Divide o conteúdo em chunks semânticos (H2+parágrafos), analisa cada um com Google NL API (entidades + S-P-O real) e NVIDIA NIM (EAV triples, intent layer, AEO score). Score GEO/AEO por seção.',
    tips: [
      'Cada chunk precisa: fato na 1ª frase + número no corpo + conclusão na última',
      'Use "Analisar com IA" para receber reescrita sugerida dos chunks mais fracos',
      'data-chunk nos elementos HTML melhora o score e facilita citação por IA',
    ],
  },
  {
    tab: 'index',
    name: 'Status de Indexação',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>',
    iconClass: 'guide-card-icon--seo',
    badge: 'SEO',
    badgeClass: 'guide-badge--seo',
    desc: 'Verifica se a URL está indexada no Google via operador site:. Útil para confirmar que novas páginas foram indexadas ou identificar páginas excluídas do índice.',
    tips: [
      'Cole qualquer URL e clique em verificar',
      'Se não indexada, verifique robots.txt, noindex e canonical',
      'Páginas não indexadas nunca aparecem em resultados — nem para IAs',
    ],
  },
  {
    tab: 'config',
    name: 'Configurações',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>',
    iconClass: 'guide-card-icon--seo',
    badge: 'CONFIG',
    badgeClass: 'guide-badge--all',
    desc: 'Configure as chaves de API (Google NL API, NVIDIA NIM, PageSpeed Insights), escolha o idioma da interface, selecione o modelo de IA e acesse o chat com a IA sobre a página atual.',
    tips: [
      'NVIDIA NIM é gratuito — configure a API key para habilitar análise qualitativa nos chunks',
      'Google NL API é essencial para entity salience real nos Headings e Chunks',
      'O chat Bob usa o contexto da página atual — pergunte qualquer coisa sobre ela',
    ],
  },
];

let _guideInitDone = false;

function initGuideTab() {
  if (_guideInitDone) return;
  _guideInitDone = true;

  const container = document.getElementById('guide-cards');
  if (!container) return;

  // Renderizar todos os cards
  container.innerHTML = GUIDE_CARDS.map((card, i) => `
    <div class="guide-card" id="guide-card-${i}">
      <div class="guide-card-header">
        <div class="guide-card-icon ${card.iconClass}">${card.icon}</div>
        <div class="guide-card-name">${escHtml(card.name)}</div>
        <span class="guide-card-badge ${card.badgeClass}">${card.badge}</span>
        <svg class="guide-card-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="guide-card-body">
        <p class="guide-card-desc">${escHtml(card.desc)}</p>
        <div class="guide-card-tips-title">Como usar</div>
        <ul class="guide-card-tips">
          ${card.tips.map(tip => `<li>${escHtml(tip)}</li>`).join('')}
        </ul>
        <button class="guide-card-goto" data-goto="${card.tab}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          Ir para esta aba
        </button>
      </div>
    </div>
  `).join('');

  // Listeners de collapse
  container.querySelectorAll('.guide-card-header').forEach(hdr => {
    hdr.addEventListener('click', () => {
      hdr.closest('.guide-card').classList.toggle('open');
    });
  });

  // Listeners "Ir para esta aba"
  container.querySelectorAll('.guide-card-goto').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = btn.dataset.goto;
      document.querySelector(`.tab[data-tab="${target}"]`)?.click() ||
      document.querySelector(`.topbar-btn[data-tab="${target}"]`)?.click();
    });
  });

  // Botão "Refazer tour"
  document.getElementById('guide-retour-btn')?.addEventListener('click', () => {
    chrome.storage.sync.remove('seo_tour_done', () => tourStart());
  });
}

// ══════════════════════════════════════════════════════════════
// LINKS TAB — Anchor Analysis + Link Juice Map
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// CHUNKS AEO TAB — análise semântica por chunk com dual API
// Google NL API (entidades + sintaxe) + NVIDIA NIM (qualitativo)
// ══════════════════════════════════════════════════════════════

// Experts fixos do painel (5 perspectivas)
const CHUNK_EXPERTS = [
  {
    name: 'Kyle Byers',
    criterion: '3-Element LLM Check',
    metric: 'pct3el',
    thresholds: [70, 50],
    unit: '% chunks',
    tip: 'Cada chunk deve ter: fato + número + conclusão acionável',
  },
  {
    name: 'Cindy Krum',
    criterion: 'Chunks citáveis (150-300 words)',
    metric: 'pctIdeal',
    thresholds: [60, 40],
    unit: '% chunks',
    tip: 'Fraggles: seções auto-suficientes e citáveis sem contexto externo',
  },
  {
    name: 'InLinks',
    criterion: 'Entity Salience',
    metric: 'avgSalience',
    thresholds: [65, 45],
    unit: '% média',
    tip: 'Entidade primária deve aparecer como sujeito com salience ≥ 0.65',
  },
  {
    name: 'Aleyda Solis',
    criterion: 'AEO Score médio (NVIDIA)',
    metric: 'avgAeo',
    thresholds: [6, 4],
    unit: '/ 10',
    tip: 'Quão diretamente cada chunk responde uma query de voz/IA',
  },
  {
    name: 'Eli Schwartz',
    criterion: 'Intent Layer coverage',
    metric: 'intentDiversity',
    thresholds: [3, 2],
    unit: 'camadas',
    tip: 'GEO requer chunks cobrindo diferentes camadas de intenção',
  },
];

// Mapa de intent → cor
const INTENT_COLORS = {
  'Problema':       'var(--red)',
  'Comparacao':     'var(--blue)',
  'Resultado':      'var(--green)',
  'Processo':       'var(--yellow)',
  'Definicao':      'var(--accent-hover)',
  'Especificacao':  'var(--text-secondary)',
  'Negativo':       'var(--red)',
  'UsoCaso':        'var(--blue)',
};

// Helper: badge de status expert
function _expertStatus(value, thresholds) {
  if (value >= thresholds[0]) return 'pass';
  if (value >= thresholds[1]) return 'warn';
  return 'fail';
}

// Helper: badge de score (pass/warn/fail)
function _scoreClass(score) {
  if (score >= 75) return 'pass';
  if (score >= 50) return 'warn';
  return 'fail';
}

// Helper: escapeHtml
function escChunk(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── NL API — analyzeEntities + analyzeSyntax por chunk ──────────────
async function analyzeChunkNL(text) {
  try {
    const res = await fetch(
      `https://language.googleapis.com/v1/documents:annotateText?key=${NLP_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: { type: 'PLAIN_TEXT', language: getNLApiLang(), content: text },
          features: { extractEntities: true, extractSyntax: true },
          encodingType: 'UTF8',
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();

    // Entidades com salience
    const entities = (data.entities || [])
      .filter(e => e.salience >= 0.02)
      .sort((a, b) => b.salience - a.salience)
      .slice(0, 8)
      .map(e => ({
        name: e.name,
        type: e.type,
        salience: Math.round(e.salience * 100),
        mentions: (e.mentions || []).length,
      }));

    const primaryEntity = entities[0] || null;

    // S-P-O via dependency parsing
    const tokens = data.tokens || [];
    const spo = [];
    tokens.forEach(tok => {
      const label = tok.dependencyEdge?.label;
      if (label !== 'ROOT') return;
      const verbIdx = tok.dependencyEdge?.headTokenIndex ?? -1;
      const verb = tok.text?.content || '';
      if (!verb) return;

      // Sujeito (NSUBJ) e objeto (DOBJ) ligados ao mesmo head
      const subj = tokens.find(t =>
        t.dependencyEdge?.headTokenIndex === tokens.indexOf(tok) &&
        t.dependencyEdge?.label === 'NSUBJ'
      );
      const obj = tokens.find(t =>
        t.dependencyEdge?.headTokenIndex === tokens.indexOf(tok) &&
        ['DOBJ', 'ATTR', 'POBJ'].includes(t.dependencyEdge?.label)
      );

      if (subj && obj) {
        spo.push({
          subject: subj.text?.content || '',
          predicate: verb,
          object: obj.text?.content || '',
        });
      }
    });

    // Verifica se entidade primária aparece como sujeito em algum S-P-O
    const primaryAsSubject = primaryEntity
      ? spo.some(s => s.subject.toLowerCase().includes(primaryEntity.name.toLowerCase().split(' ')[0]))
      : false;

    return { entities, primaryEntity, primaryAsSubject, spo: spo.slice(0, 4) };
  } catch (_) {
    return null;
  }
}

// ── NVIDIA NIM — análise qualitativa por chunk ──────────────────────
async function analyzeChunkNVIDIA(text, primaryEntityName) {
  const nimKey = localStorage.getItem('nim_api_key') || '';
  if (!nimKey) return null;

  const model = nimResolveModel(
    localStorage.getItem('nim_model') || 'meta/llama-4-maverick-17b-128e-instruct'
  );

  const systemPrompt =
    'You are a semantic content analyzer specialized in GEO and AEO. ' +
    'Analyze the provided text chunk and return ONLY valid JSON, no markdown, no explanations. ' +
    getNvidiaLangInstruction();

  const entityLine = primaryEntityName
    ? `Entidade primária detectada: "${primaryEntityName}"\n`
    : '';

  const userPrompt =
    `${entityLine}Chunk de texto:\n"""\n${text.slice(0, 1500)}\n"""\n\n` +
    'Retorne exatamente este JSON (sem quebras extras):\n' +
    '{"hasFact":true,"hasNumber":true,"hasConclusion":false,' +
    '"intentLayer":"Definicao","eavTriples":[{"entity":"","attribute":"","value":""}],' +
    '"ariScore":8,"aeoScore":7}\n\n' +
    'Regras:\n' +
    '- hasFact: primeira frase é fato/definição/estatística direta?\n' +
    '- hasNumber: existe dado numérico específico no corpo?\n' +
    '- hasConclusion: última frase é conclusão acionável?\n' +
    '- intentLayer: uma de Problema|Comparacao|Resultado|Processo|Definicao|Especificacao|Negativo|UsoCaso\n' +
    '- eavTriples: máx 3 triplas Entity-Attribute-Value encontradas (array vazio se nenhuma)\n' +
    '- ariScore: Automated Readability Index estimado (1-20, onde 6-9 é ideal para AEO)\n' +
    '- aeoScore: 0-10, quão citável por IA esta seção é';

  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'NVIDIA_API_CALL',
      payload: {
        apiKey: nimKey,
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        maxTokens: 300,
      },
    });

    if (resp?.error || !resp?.content) return null;

    // Extrair JSON da resposta (pode vir com texto ao redor)
    const jsonMatch = resp.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      hasFact:      !!parsed.hasFact,
      hasNumber:    !!parsed.hasNumber,
      hasConclusion:!!parsed.hasConclusion,
      intentLayer:  parsed.intentLayer || 'Desconhecido',
      eavTriples:   Array.isArray(parsed.eavTriples) ? parsed.eavTriples.filter(t => t.entity).slice(0, 3) : [],
      ariScore:     Number(parsed.ariScore) || 8,
      aeoScore:     Number(parsed.aeoScore) || 5,
    };
  } catch (_) {
    return null;
  }
}

// ── Score GEO/AEO final por chunk ───────────────────────────────────
function calcChunkScore(chunk) {
  const loc = chunk.local || {};
  const nl  = chunk.nlResult || {};
  const nv  = chunk.nvResult || {};

  // Entity salience (NL API)
  const salience = nl.primaryEntity?.salience ?? 0;
  const salienceScore = Math.min(salience, 100);

  // Completeness: chunk 150-300 palavras
  const wc = loc.wordCount || chunk.wordCount || 0;
  const completeness = wc >= 150 && wc <= 350 ? 100 : wc >= 80 ? 60 : 30;

  // S-P-O coverage
  const spoScore = (nl.spo?.length > 0 || loc.spoVerbCount > 0) ? 100 : 0;

  // 3-element LLM
  const hasFact       = nv?.hasFact       ?? loc.hasFact       ?? false;
  const hasNumber     = nv?.hasNumber     ?? loc.hasNumber     ?? false;
  const hasConclusion = nv?.hasConclusion ?? loc.hasConclusion ?? false;
  const elemCount = [hasFact, hasNumber, hasConclusion].filter(Boolean).length;
  const llmScore = Math.round((elemCount / 3) * 100);

  // data-chunk presence
  const dcScore = chunk.hasDataChunk ? 100 : 0;

  return Math.round(
    salienceScore * 0.30 +
    completeness  * 0.25 +
    spoScore      * 0.20 +
    llmScore      * 0.15 +
    dcScore       * 0.10
  );
}

// ── Render principal ────────────────────────────────────────────────
async function renderChunks(chunksData) {
  if (!chunksData || !chunksData.chunks?.length) {
    const list = document.getElementById('chunks-list');
    if (list) list.innerHTML =
      '<div style="padding:20px 18px;color:var(--text-muted);font-size:12px;">' +
      'Nenhum chunk detectado. A página pode não ter conteúdo textual estruturado.</div>';
    document.getElementById('chunks-list-count').textContent = '0 chunks detectados';
    return;
  }

  const chunks = chunksData.chunks;
  const pageH1 = chunksData.pageH1 || '';

  // Salvar referência global para o botão de IA (dados crescem ao longo do processamento)
  _chunksDataForAI = chunksData;
  initChunksAISend();

  // Atualizar contador
  document.getElementById('chunks-list-count').textContent =
    `${chunks.length} chunk${chunks.length !== 1 ? 's' : ''} detectado${chunks.length !== 1 ? 's' : ''}`;

  // Renderizar cards em estado de loading primeiro
  const listEl = document.getElementById('chunks-list');
  if (!listEl) return;
  listEl.innerHTML = chunks.map((ch, i) => _renderChunkCardLoading(ch, i)).join('');

  // Adicionar listeners de collapse
  listEl.querySelectorAll('.chunk-card-header').forEach(hdr => {
    hdr.addEventListener('click', () => {
      hdr.closest('.chunk-card').classList.toggle('open');
    });
  });

  // Processar chunks via dual-API (max 8 via API, resto local)
  const API_LIMIT = 8;
  const nimKey = localStorage.getItem('nim_api_key') || '';

  await Promise.all(chunks.map(async (ch, i) => {
    let nlResult = null;
    let nvResult = null;

    if (i < API_LIMIT) {
      // Chamadas em paralelo por chunk
      [nlResult, nvResult] = await Promise.all([
        analyzeChunkNL(ch.text),
        nimKey ? analyzeChunkNVIDIA(ch.text, null) : Promise.resolve(null),
      ]);

      // Segunda chamada NVIDIA com entidade primária real
      if (nlResult?.primaryEntity && !nvResult && nimKey) {
        nvResult = await analyzeChunkNVIDIA(ch.text, nlResult.primaryEntity.name);
      }
    }

    ch.nlResult = nlResult;
    ch.nvResult = nvResult;
    ch.score    = calcChunkScore(ch);

    // Atualizar card individual na UI
    const cardEl = document.getElementById(`chunk-card-${i}`);
    if (cardEl) {
      cardEl.outerHTML = _renderChunkCardFull(ch, i);
      // Re-bind listener de collapse
      const newCard = document.getElementById(`chunk-card-${i}`);
      newCard?.querySelector('.chunk-card-header')?.addEventListener('click', () => {
        newCard.classList.toggle('open');
      });
    }
  }));

  // Dados enriquecidos disponíveis para o botão de IA
  _chunksDataForAI = chunksData;

  // Calcular metricas agregadas para score geral e experts
  const scores = chunks.map(ch => ch.score);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  const pct3el = Math.round(
    chunks.filter(ch => {
      const l = ch.local; const nv = ch.nvResult;
      return [nv?.hasFact ?? l?.hasFact, nv?.hasNumber ?? l?.hasNumber, nv?.hasConclusion ?? l?.hasConclusion]
        .every(Boolean);
    }).length / chunks.length * 100
  );
  const pctIdeal = Math.round(chunks.filter(ch => ch.wordCount >= 150 && ch.wordCount <= 350).length / chunks.length * 100);
  const avgSalience = Math.round(chunks.reduce((s, ch) => s + (ch.nlResult?.primaryEntity?.salience ?? 0), 0) / chunks.length);
  const avgAeo = parseFloat((chunks.reduce((s, ch) => s + (ch.nvResult?.aeoScore ?? 5), 0) / chunks.length).toFixed(1));
  const intentLayers = new Set(chunks.map(ch => ch.nvResult?.intentLayer).filter(Boolean));
  const intentDiversity = intentLayers.size;

  const metrics = { pct3el, pctIdeal, avgSalience, avgAeo, intentDiversity };

  // Atualizar score ring
  _updateChunksScoreRing(avgScore);

  // Renderizar experts
  _renderChunkExperts(metrics, chunks.length);

  // Renderizar dimensoes
  _renderChunkDimensions(metrics);

  // Diagnostico final
  _renderChunkDiagnosis(chunks, metrics);
}

// Card de loading (antes das APIs retornarem)
function _renderChunkCardLoading(ch, i) {
  return `
<div class="chunk-card chunk-card--loading" id="chunk-card-${i}">
  <div class="chunk-card-header">
    <div class="chunk-score-badge chunk-score-badge--loading">···</div>
    <div class="chunk-card-title">${escChunk(ch.name)}</div>
    <div class="chunk-card-meta">
      <span class="chunk-meta-tag">${ch.wordCount}w</span>
      ${ch.hasDataChunk ? '<span class="chunk-meta-tag chunk-meta-tag--data">data-chunk</span>' : ''}
    </div>
    <svg class="chunk-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
  </div>
  <div class="chunk-3el">
    <span class="chunk-3el-item chunk-3el-item--wait">⟳ Fato</span>
    <span class="chunk-3el-item chunk-3el-item--wait">⟳ Número</span>
    <span class="chunk-3el-item chunk-3el-item--wait">⟳ Conclusão</span>
    <span class="chunk-3el-item chunk-3el-item--wait">⟳ NVIDIA</span>
  </div>
</div>`;
}

// Card completo (após APIs retornarem)
function _renderChunkCardFull(ch, i) {
  const score   = ch.score;
  const sc      = _scoreClass(score);
  const nl      = ch.nlResult;
  const nv      = ch.nvResult;
  const loc     = ch.local;

  const hasFact       = nv?.hasFact       ?? loc?.hasFact       ?? false;
  const hasNumber     = nv?.hasNumber     ?? loc?.hasNumber     ?? false;
  const hasConclusion = nv?.hasConclusion ?? loc?.hasConclusion ?? false;

  // 3-element indicators
  const el3html = [
    { label: 'Fato',      ok: hasFact },
    { label: 'Número',    ok: hasNumber },
    { label: 'Conclusão', ok: hasConclusion },
  ].map(e =>
    `<span class="chunk-3el-item chunk-3el-item--${e.ok ? 'ok' : 'fail'}">${e.ok ? '✓' : '✗'} ${e.label}</span>`
  ).join('');

  // AEO score NVIDIA
  const aeoHtml = nv
    ? `<span class="chunk-3el-item chunk-3el-item--${nv.aeoScore >= 7 ? 'ok' : nv.aeoScore >= 5 ? 'warn' : 'fail'}">AEO ${nv.aeoScore}/10</span>`
    : `<span class="chunk-3el-item chunk-3el-item--wait">AEO —</span>`;

  // Entidades NL API
  const entitiesHtml = nl?.entities?.length
    ? nl.entities.slice(0, 6).map((e, ei) =>
        `<span class="chunk-entity-pill ${ei === 0 ? 'chunk-entity-pill--primary' : ''}">
          ${escChunk(e.name)}
          <span class="chunk-entity-salience">${e.salience}%</span>
          <span class="chunk-entity-type">${e.type.slice(0,3)}</span>
        </span>`
      ).join('')
    : '<span style="color:var(--text-muted);font-size:11px;">API não processada</span>';

  // S-P-O
  const spoHtml = (() => {
    const rows = nl?.spo?.length ? nl.spo : [];
    if (!rows.length) {
      return loc?.spoVerbCount > 0
        ? `<div style="font-size:11px;color:var(--text-muted);">${loc.spoVerbCount} verbo(s) relacional(is) detectado(s) localmente</div>`
        : '<div style="font-size:11px;color:var(--text-muted);">Nenhuma estrutura S-P-O identificada</div>';
    }
    return `<div class="chunk-spo-list">${rows.map(r =>
      `<div class="chunk-spo-row">
        <span class="chunk-spo-subj">${escChunk(r.subject)}</span>
        <span class="chunk-spo-arrow">→</span>
        <span class="chunk-spo-pred">${escChunk(r.predicate)}</span>
        <span class="chunk-spo-arrow">→</span>
        <span class="chunk-spo-obj">${escChunk(r.object)}</span>
      </div>`).join('')}</div>`;
  })();

  // EAV triples NVIDIA
  const eavHtml = (() => {
    const triples = nv?.eavTriples || [];
    if (!triples.length) return '<div style="font-size:11px;color:var(--text-muted);">Nenhuma EAV triple extraída</div>';
    return `<div class="chunk-eav-list">${triples.map(t =>
      `<div class="chunk-eav-row">
        <span class="chunk-eav-entity">${escChunk(t.entity)}</span>
        <span class="chunk-eav-sep">→</span>
        <span class="chunk-eav-attr">${escChunk(t.attribute)}</span>
        <span class="chunk-eav-sep">→</span>
        <span class="chunk-eav-value">${escChunk(t.value)}</span>
      </div>`).join('')}</div>`;
  })();

  // NVIDIA qualitativo
  const nvHtml = nv ? `
    <div class="chunk-nvidia-row">
      <span class="chunk-nvidia-label">Intent Layer</span>
      <span class="chunk-intent-badge" style="color:${INTENT_COLORS[nv.intentLayer] || 'var(--text-secondary)'}">
        ${escChunk(nv.intentLayer)}
      </span>
    </div>
    <div class="chunk-nvidia-row">
      <span class="chunk-nvidia-label">ARI Score</span>
      <span class="chunk-ari-badge chunk-ari-badge--${nv.ariScore <= 9 ? 'good' : nv.ariScore <= 13 ? 'ok' : 'hard'}">
        ${nv.ariScore} ${nv.ariScore <= 9 ? '(ideal)' : nv.ariScore <= 13 ? '(médio)' : '(difícil)'}
      </span>
    </div>
  ` : '<div class="chunk-nvidia-thinking">⟳ NVIDIA não configurado ou sem chave API</div>';

  // Heading vector
  const hvStatus = ch.headingVectorOk === true ? 'ok' : ch.headingVectorOk === false ? 'warn' : 'null';
  const hvText   = ch.headingVectorOk === true ? '✓ H2 relacionado ao H1' : ch.headingVectorOk === false ? '⚠ H2 sem relação clara com H1' : '— N/A';
  const hvHtml   = `<span class="chunk-hv chunk-hv--${hvStatus}">${hvText}</span>`;

  return `
<div class="chunk-card chunk-card--${sc}" id="chunk-card-${i}">
  <div class="chunk-card-header">
    <div class="chunk-score-badge chunk-score-badge--${sc}">${score}</div>
    <div class="chunk-card-title" title="${escChunk(ch.name)}">${escChunk(ch.name)}</div>
    <div class="chunk-card-meta">
      <span class="chunk-meta-tag">${ch.wordCount}w</span>
      <span class="chunk-meta-tag">${ch.source === 'h2-group' ? 'H2' : 'P'}</span>
      ${ch.hasDataChunk ? '<span class="chunk-meta-tag chunk-meta-tag--data">data-chunk</span>' : ''}
    </div>
    <svg class="chunk-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
  </div>

  <div class="chunk-3el">
    ${el3html}
    ${aeoHtml}
  </div>

  <div class="chunk-card-body">

    <div class="chunk-section">
      <div class="chunk-section-title">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
        Entidades — Google NL API
      </div>
      <div class="chunk-entities">${entitiesHtml}</div>
    </div>

    <div class="chunk-section">
      <div class="chunk-section-title">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>
        Sujeito → Predicado → Objeto
      </div>
      ${spoHtml}
    </div>

    <div class="chunk-section">
      <div class="chunk-section-title">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
        EAV Triples — NVIDIA NIM
      </div>
      ${eavHtml}
    </div>

    <div class="chunk-section">
      <div class="chunk-section-title">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10"/><path d="m16 2 6 6-6 6"/></svg>
        Análise Qualitativa — NVIDIA NIM
      </div>
      ${nvHtml}
    </div>

    <div class="chunk-section">
      <div class="chunk-section-title">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        Heading Vector
      </div>
      ${hvHtml}
    </div>

  </div>
</div>`;
}

// Atualizar ring de score
function _updateChunksScoreRing(score) {
  const numEl   = document.getElementById('chunks-score-number');
  const gradeEl = document.getElementById('chunks-score-grade');
  const detailEl= document.getElementById('chunks-score-detail');
  const fillEl  = document.getElementById('chunks-ring-fill');

  if (numEl)   numEl.textContent = score;
  const grade  = score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D';
  const color  = score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)';
  if (gradeEl) { gradeEl.textContent = `Grau ${grade}`; gradeEl.style.color = color; }
  if (detailEl) detailEl.textContent =
    score >= 75 ? 'Conteúdo bem estruturado para citação por IA' :
    score >= 50 ? 'Melhorias necessárias em alguns chunks' :
    'Estrutura semântica fraca — revisar chunks';

  if (fillEl) {
    const circumference = 213.6; // 2π × 34
    const offset = circumference - (score / 100) * circumference;
    fillEl.style.strokeDashoffset = offset;
    fillEl.style.stroke = color;
  }
}

// Renderizar painel de experts
function _renderChunkExperts(metrics, total) {
  const grid = document.getElementById('chunks-experts-grid');
  if (!grid) return;
  grid.innerHTML = CHUNK_EXPERTS.map(exp => {
    const val    = metrics[exp.metric] ?? 0;
    const status = _expertStatus(val, exp.thresholds);
    const icons  = { pass: '✓', warn: '⚠', fail: '✗' };
    return `<div class="chunk-expert-card chunk-expert-card--${status}" title="${escChunk(exp.tip)}">
      <div class="chunk-expert-name">${escChunk(exp.name)}</div>
      <div class="chunk-expert-criterion">${escChunk(exp.criterion)}</div>
      <div class="chunk-expert-result chunk-expert-result--${status}">
        ${icons[status]} ${val}${exp.unit}
      </div>
    </div>`;
  }).join('');
}

// Chips de dimensoes do score
function _renderChunkDimensions(metrics) {
  const el = document.getElementById('chunks-dimensions');
  if (!el) return;
  const dims = [
    { label: `Entity Salience ${metrics.avgSalience}%`, status: _scoreClass(metrics.avgSalience) },
    { label: `3-Element ${metrics.pct3el}%`,            status: _scoreClass(metrics.pct3el) },
    { label: `Completeness ${metrics.pctIdeal}%`,       status: _scoreClass(metrics.pctIdeal) },
    { label: `AEO médio ${metrics.avgAeo}/10`,          status: metrics.avgAeo >= 7 ? 'pass' : metrics.avgAeo >= 5 ? 'warn' : 'fail' },
    { label: `${metrics.intentDiversity} intent layers`,status: metrics.intentDiversity >= 3 ? 'pass' : metrics.intentDiversity >= 2 ? 'warn' : 'fail' },
  ];
  el.innerHTML = dims.map(d =>
    `<span class="chunks-dim-chip chunks-dim-chip--${d.status}">${escChunk(d.label)}</span>`
  ).join('');
}

// Diagnostico final
function _renderChunkDiagnosis(chunks, metrics) {
  const el = document.getElementById('chunks-diagnosis');
  if (!el) return;

  const items = [];

  // Chunks sem conclusao
  const noConclusion = chunks.filter(ch => !(ch.nvResult?.hasConclusion ?? ch.local?.hasConclusion));
  if (noConclusion.length)
    items.push({ icon: 'fail', text: `${noConclusion.length} chunk(s) sem conclusão acionável — últimas frases precisam indicar próximo passo` });
  else
    items.push({ icon: 'pass', text: 'Todos os chunks têm conclusão acionável' });

  // data-chunk ausente
  const noDataChunk = chunks.filter(ch => !ch.hasDataChunk).length;
  if (noDataChunk > 0)
    items.push({ icon: 'warn', text: `${noDataChunk} chunk(s) sem atributo data-chunk — adicionar para facilitar citação direta por IA` });
  else
    items.push({ icon: 'pass', text: 'Todos os chunks têm data-chunk declarado' });

  // Salience
  if (metrics.avgSalience >= 65)
    items.push({ icon: 'pass', text: `Entidade primária como sujeito em média ${metrics.avgSalience}% (meta: ≥65%)` });
  else
    items.push({ icon: 'fail', text: `Entity salience baixa: ${metrics.avgSalience}% — usar entidade primária como sujeito gramatical` });

  // ARI
  if (metrics.avgAeo >= 7)
    items.push({ icon: 'pass', text: `Score AEO médio ${metrics.avgAeo}/10 — conteúdo bem posicionado para citação por IA` });
  else
    items.push({ icon: 'warn', text: `Score AEO médio ${metrics.avgAeo}/10 — estruturar respostas diretas no início de cada seção` });

  // Chunks ideais
  if (metrics.pctIdeal < 50)
    items.push({ icon: 'warn', text: `Apenas ${metrics.pctIdeal}% dos chunks estão na faixa ideal (150-300 palavras)` });

  const icons = { pass: '✓', warn: '⚠', fail: '✗' };
  el.innerHTML = `<div class="chunks-diagnosis-title">Diagnóstico Final</div>` +
    items.map(it =>
      `<div class="chunks-diag-item">
        <span class="chunks-diag-icon chunks-diag-icon--${it.icon}">${icons[it.icon]}</span>
        <span>${escChunk(it.text)}</span>
      </div>`
    ).join('');
}

// ── Variável global para guardar estado dos chunks após análise ──────────────
let _chunksDataForAI = null;

// ── Constrói o prompt completo para envio à IA ───────────────────────────────
function buildChunksPrompt(chunksData, pageUrl) {
  const h1 = chunksData.pageH1 || '(sem H1)';
  const chunks = chunksData.chunks || [];

  // Bloco 1: contexto da página
  const pageCtxBlock = `**URL:** ${pageUrl}
**H1 da página:** ${h1}
**Total de chunks detectados:** ${chunks.length}`;

  // Bloco 2: análise atual chunk a chunk
  const chunksBlock = chunks.map((ch, i) => {
    const nl  = ch.nlResult;
    const nv  = ch.nvResult;
    const loc = ch.local;

    // Entidades NL API
    const entities = nl?.entities?.length
      ? nl.entities.slice(0, 5).map(e => `${e.name} (${e.salience}% — ${e.type})`).join(', ')
      : 'não processado';

    // S-P-O
    const spo = nl?.spo?.length
      ? nl.spo.map(s => `${s.subject} → ${s.predicate} → ${s.object}`).join(' | ')
      : loc?.spoVerbCount > 0 ? `${loc.spoVerbCount} verbo(s) relacional(is) detectado(s) localmente` : 'nenhum detectado';

    // EAV triples
    const eav = nv?.eavTriples?.length
      ? nv.eavTriples.map(t => `[${t.entity} → ${t.attribute} → ${t.value}]`).join(' | ')
      : 'nenhuma extraída';

    // 3-element check
    const hasFact       = nv?.hasFact       ?? loc?.hasFact       ?? false;
    const hasNumber     = nv?.hasNumber     ?? loc?.hasNumber     ?? false;
    const hasConclusion = nv?.hasConclusion ?? loc?.hasConclusion ?? false;
    const llmCheck = `Fato:${hasFact?'✓':'✗'} Número:${hasNumber?'✓':'✗'} Conclusão:${hasConclusion?'✓':'✗'}`;

    const intentLayer  = nv?.intentLayer  || 'não processado';
    const ariScore     = nv?.ariScore     || loc?.ariScore || '—';
    const aeoScore     = nv?.aeoScore != null ? `${nv.aeoScore}/10` : '—';
    const primaryEnt   = nl?.primaryEntity ? `${nl.primaryEntity.name} (${nl.primaryEntity.salience}%)` : '—';
    const primSubj     = nl?.primaryAsSubject ? 'Sim' : 'Não';
    const hvOk         = ch.headingVectorOk === true ? 'Sim' : ch.headingVectorOk === false ? 'Não' : 'N/A';

    return `### Chunk ${i + 1}: "${ch.name}"
- **Palavras:** ${ch.wordCount} | **Fonte:** ${ch.source} | **data-chunk:** ${ch.hasDataChunk ? 'Sim' : 'Não'}
- **Score GEO/AEO:** ${ch.score ?? '—'}/100
- **3-Element LLM Check:** ${llmCheck}
- **Intent Layer:** ${intentLayer}
- **ARI Score:** ${ariScore} | **AEO Score:** ${aeoScore}
- **Heading Vector (H2 relacionado ao H1):** ${hvOk}
- **Entidade primária:** ${primaryEnt} | **Como sujeito:** ${primSubj}
- **Entidades NL API:** ${entities}
- **S-P-O detectados:** ${spo}
- **EAV Triples:** ${eav}
- **Texto atual (primeiras 400 chars):**
\`\`\`
${ch.text.slice(0, 400)}${ch.text.length > 400 ? '...' : ''}
\`\`\``;
  }).join('\n\n');

  // Bloco 3: o prompt de instrução
  const instruction = `---

## Sua tarefa — Análise Semântica e Sugestão de Chunks Otimizados

Você é um especialista em SEO Semântico, GEO (Generative Engine Optimization) e AEO (Answer Engine Optimization), aplicando as metodologias de Koray Tugberk, InLinks e o framework de escrita GEO/AEO.

Analise os chunks acima e produza uma **comparação lado a lado** entre o estado atual e o estado otimizado, seguindo estas etapas:

---

### ETAPA 1 — Diagnóstico Global
Identifique os principais problemas semânticos da página como um todo:
- Qual é a **entidade primária D1** (principal) da página? Está claramente estabelecida?
- Quais são as **entidades secundárias D2** que deveriam reforçar D1?
- Existe **canibalização de intenção** entre chunks?
- A **Entity Salience Formula** está sendo respeitada? (título×0.4 + primeiras 300 words×0.3 + H2s×0.2 + schema×0.1)

---

### ETAPA 2 — Análise por Chunk (tabela comparativa)
Para cada chunk, apresente:

| Dimensão | Estado Atual | Estado Otimizado |
|---|---|---|
| Nome/H2 | atual | sugestão |
| 3-Element (Fato+Número+Conclusão) | atual | como corrigir |
| S-P-O principal | atual | versão otimizada |
| EAV triple principal | atual | versão otimizada |
| Intent Layer | atual | confirmar ou corrigir |
| Entity salience D1 como sujeito | atual | recomendação |
| AEO Score estimado | atual | meta após otimização |

---

### ETAPA 3 — Reescrita de Chunks Prioritários
Para os **3 chunks com menor score GEO/AEO**, sugira:
1. A **primeira frase reescrita** (deve ser fato/definição direto — sem warm-up)
2. A **última frase reescrita** (deve ser conclusão acionável)
3. Uma **EAV triple explícita** que deve ser inserida
4. A **S-P-O structure** que deve guiar o parágrafo principal

---

### ETAPA 4 — Entidades Faltantes
Liste entidades que deveriam aparecer nos chunks mas estão ausentes:
- **D1 ausente:** entidade primária que falta como sujeito em algum chunk
- **D2 ausentes:** entidades secundárias que completariam o conhecimento semântico
- **Co-ocorrências recomendadas:** grupos de entidades que deveriam aparecer juntas no mesmo chunk (vector clusters)

---

### ETAPA 5 — Score projetado
Estime o score GEO/AEO após as otimizações sugeridas, usando a fórmula:
\`SCORE = entity_salience×0.30 + chunk_completeness×0.25 + spo_coverage×0.20 + 3element_llm×0.15 + data_chunk_presence×0.10\`

---

**Responda em português. Seja direto e específico. Mostre os problemas e as sugestões lado a lado.**`;

  return `# Análise Semântica de Chunks — GEO/AEO

${pageCtxBlock}

---

## Estado Atual dos Chunks

${chunksBlock}

${instruction}`;
}

// ── Inicializa listeners do botão Analisar com IA (Chunks) ───────────────────
function initChunksAISend() {
  const btn      = document.getElementById('chunks-ai-send-btn');
  const dropdown = document.getElementById('chunks-ai-dropdown');
  if (!btn || !dropdown) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', () => dropdown.classList.remove('open'));

  dropdown.querySelectorAll('[data-chunks-ai]').forEach(opt => {
    opt.addEventListener('click', () => {
      dropdown.classList.remove('open');
      sendChunksToAI(opt.dataset.chunksAi);
    });
  });
}

function sendChunksToAI(ai) {
  if (!_chunksDataForAI || !_chunksDataForAI.chunks?.length) {
    alert('Aguarde a análise de chunks terminar antes de enviar para IA.');
    return;
  }

  const btn = document.getElementById('chunks-ai-send-btn');
  const originalHTML = btn?.innerHTML;
  if (btn) { btn.innerHTML = '<span style="font-size:11px;opacity:.7">Preparando...</span>'; btn.disabled = true; }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const pageUrl = tabs[0]?.url || '';
    const prompt  = buildChunksPrompt(_chunksDataForAI, pageUrl);
    const encoded = encodeURIComponent(prompt);

    const urls = {
      claude:     `https://claude.ai/new?q=${encoded}`,
      chatgpt:    `https://chatgpt.com/?q=${encoded}`,
      gemini:     `https://gemini.google.com/app?q=${encoded}`,
      perplexity: `https://www.perplexity.ai/?q=${encoded}`,
    };

    const url = urls[ai];
    if (url) chrome.tabs.create({ url });

    if (btn) { btn.innerHTML = originalHTML; btn.disabled = false; }
  });
}

// ─────────────────────────────────────────────
// LINKS TAB — diagnóstico + grafo 3D
// ─────────────────────────────────────────────

function renderLinksDiagnosis(linkNodes, pageUrl) {
  const el = document.getElementById('links-diagnosis');
  if (!el) return;

  const internal = linkNodes.filter(l => l.isInternal && l.href !== pageUrl && l.href !== '/');
  const totalInternal   = internal.length;
  const destSet         = new Set(internal.map(l => l.href));
  const uniqueDests     = destSet.size;
  const nofollowInternal = internal.filter(l => l.nofollow).length;

  // ── RUIM_SET expandido (igual ao de renderLinksTab) ──────────
  const RUIM_SET = new Set([
    'clique aqui','clique','aqui','saiba mais','leia mais','veja mais','ver mais',
    'acesse','acesse aqui','link','more','click here','read more','here',
    'ver','veja','mais','continue','continuar','download','baixar','abrir','open',
    '/','→','←','↓','↑','►','▶','•','saiba','conheça','confira','veja também',
  ]);
  const isGeneric = (t) => !t || t.length <= 2 || RUIM_SET.has(t.toLowerCase().trim()) || /^[\d\s\W]+$/.test(t);
  const genericAnchors = internal.filter(l => isGeneric(l.anchor));
  const genericPct = totalInternal > 0 ? Math.round((genericAnchors.length / totalInternal) * 100) : 0;
  const descriptivePct = 100 - genericPct;

  // ── Relevância âncora → slug destino ────────────────────────
  // Extraímos palavras do slug e verificamos quantas aparecem na âncora
  function anchorSlugMatch(anchor, href) {
    if (!anchor || !href || isGeneric(anchor)) return 0;
    const slug = href.replace(/^https?:\/\/[^/]+/, '').replace(/\/index\.html?$/, '').replace(/\/$/, '');
    const slugWords = slug.split(/[-_/]/).filter(w => w.length > 2);
    if (!slugWords.length) return 0;
    const anchorLower = anchor.toLowerCase();
    const matched = slugWords.filter(w => anchorLower.includes(w.toLowerCase())).length;
    return matched / slugWords.length;
  }
  const semanticScores = internal
    .filter(l => !isGeneric(l.anchor))
    .map(l => anchorSlugMatch(l.anchor, l.href));
  const avgSemantic = semanticScores.length > 0
    ? semanticScores.reduce((a, b) => a + b, 0) / semanticScores.length
    : 0;

  // ── Diversidade de destinos ───────────────────────────────────
  const destFreq = new Map();
  internal.forEach(l => destFreq.set(l.href, (destFreq.get(l.href) || 0) + 1));
  const maxFreq = totalInternal > 0 ? Math.max(...destFreq.values()) : 0;
  const diversityRatio = totalInternal > 0 ? 1 - (maxFreq / totalInternal) : 0;

  // ── Densidade links / palavras ────────────────────────────────
  // Tentamos usar wordCount do graphData se disponível, caso contrário estimamos
  const wordCount = (typeof graphData !== 'undefined' && graphData?.wordCount) || 500;
  const linkDensity = wordCount > 0 ? (totalInternal / wordCount) * 100 : 0; // links por 100 palavras

  // ══════════════════════════════════════════════════════════════
  // SCORING — 6 critérios, 100 pts total
  // Baseado em painel de experts: Stox, Haynes, Shepard, Eubanks, Indig, Solis
  // ══════════════════════════════════════════════════════════════

  const scoreBreakdown = [];

  // C1 — Quantidade de links internos (20 pts)
  let c1 = 0;
  let c1label = '', c1level = 'ok';
  if      (totalInternal === 0)               { c1 = 0;  c1label = 'Página isolada — 0 links'; c1level = 'critical'; }
  else if (totalInternal <= 2)                { c1 = 10; c1label = `${totalInternal} links — abaixo do ideal`; c1level = 'warn'; }
  else if (totalInternal <= 10)               { c1 = 20; c1label = `${totalInternal} links — ótimo`; c1level = 'ok'; }
  else if (totalInternal <= 50)               { c1 = 15; c1label = `${totalInternal} links — acima do ideal`; c1level = 'warn'; }
  else                                        { c1 = 8;  c1label = `${totalInternal} links — excessivo`; c1level = 'warn'; }
  scoreBreakdown.push({ id: 'c1', label: 'Quantidade de links', pts: c1, max: 20, level: c1level,
    icon: c1level === 'critical' ? '✕' : c1level === 'warn' ? '⚠' : '✓',
    why: c1level === 'critical'
      ? 'Nenhum link interno saindo. Esta página é uma ilha — a autoridade acumulada aqui não flui para nenhuma outra página do site. Google não consegue navegar a partir daqui.'
      : c1level === 'warn' && totalInternal <= 2
      ? `${totalInternal} link${totalInternal > 1 ? 's' : ''} interno${totalInternal > 1 ? 's' : ''} — abaixo do ideal. Estudos mostram que 3-10 links internos por página é o intervalo com melhor retorno de crawl e distribuição de PageRank.`
      : totalInternal > 50
      ? `${totalInternal} links internos é excessivo. Acima de 50, o valor de cada link individual cai significativamente — o Googlebot divide o "orçamento de atenção" entre todos.`
      : `${totalInternal} links internos — no intervalo ideal (3-10). A autoridade está sendo distribuída para ${uniqueDests} URL${uniqueDests !== 1 ? 's' : ''} únicas.`,
  });

  // C2 — Qualidade das âncoras (25 pts)
  let c2 = 0;
  let c2level = 'ok';
  if      (totalInternal === 0)   { c2 = 0; c2level = 'critical'; }
  else if (descriptivePct >= 80)  { c2 = 25; c2level = 'ok'; }
  else if (descriptivePct >= 60)  { c2 = 15; c2level = 'warn'; }
  else if (descriptivePct >= 40)  { c2 = 8;  c2level = 'warn'; }
  else                            { c2 = 0;  c2level = 'critical'; }
  if (totalInternal > 0) scoreBreakdown.push({ id: 'c2', label: 'Qualidade das âncoras', pts: c2, max: 25, level: c2level,
    icon: c2level === 'critical' ? '✕' : c2level === 'warn' ? '⚠' : '✓',
    why: c2level === 'critical'
      ? `${genericPct}% das âncoras são genéricas ("clique aqui", "saiba mais"). O Google usa o texto do link para entender o tema da página destino — âncoras sem contexto desperdiçam completamente esse sinal semântico.`
      : c2level === 'warn'
      ? `${genericPct}% das âncoras ainda são genéricas. Cada âncora substituída por texto descritivo (ex: "aluguel de empilhadeira em Goiânia") melhora o sinal semântico para o Google.`
      : `${descriptivePct}% das âncoras são descritivas. O Google consegue inferir o tema das páginas destino a partir dos textos dos links.`,
  });

  // C3 — Relevância âncora → slug destino (20 pts)
  let c3 = 0;
  let c3level = 'ok';
  if      (totalInternal === 0 || semanticScores.length === 0) { c3 = 0; c3level = 'critical'; }
  else if (avgSemantic >= 0.6)  { c3 = 20; c3level = 'ok'; }
  else if (avgSemantic >= 0.3)  { c3 = 10; c3level = 'warn'; }
  else                          { c3 = 0;  c3level = 'warn'; }
  if (totalInternal > 0) scoreBreakdown.push({ id: 'c3', label: 'Âncora descreve o destino', pts: c3, max: 20, level: c3level,
    icon: c3level === 'critical' ? '✕' : c3level === 'warn' ? '⚠' : '✓',
    why: c3level === 'ok'
      ? `As âncoras descrevem bem a página destino — palavras do slug aparecem no texto do link. Isso reforça o tema da página destino para o Google.`
      : semanticScores.length === 0
      ? `Todas as âncoras são genéricas — impossível avaliar se descrevem o destino. Substitua por âncoras que contenham as keywords da URL destino.`
      : `Âncoras parcialmente alinhadas com os destinos (${Math.round(avgSemantic * 100)}% de correspondência). Ideal: âncora "aluguel empilhadeira goiânia" → /aluguel-empilhadeira-goiania.`,
  });

  // C4 — Diversidade de destinos (15 pts)
  let c4 = 0;
  let c4level = 'ok';
  if      (totalInternal === 0)        { c4 = 0; c4level = 'critical'; }
  else if (diversityRatio >= 0.8)      { c4 = 15; c4level = 'ok'; }
  else if (diversityRatio >= 0.5)      { c4 = 8;  c4level = 'warn'; }
  else if (diversityRatio >= 0.2)      { c4 = 3;  c4level = 'warn'; }
  else                                 { c4 = 0;  c4level = 'critical'; }
  if (totalInternal > 0) scoreBreakdown.push({ id: 'c4', label: 'Diversidade de destinos', pts: c4, max: 15, level: c4level,
    icon: c4level === 'critical' ? '✕' : c4level === 'warn' ? '⚠' : '✓',
    why: c4level === 'ok'
      ? `${uniqueDests} destinos únicos — boa distribuição de autoridade. Links para páginas diferentes espalham o PageRank pelo site de forma equilibrada.`
      : c4level === 'critical'
      ? `A maioria dos links aponta para o mesmo destino (${maxFreq}× para uma única URL). Isso parece spam para o Google e concentra autoridade em vez de distribuí-la.`
      : `${uniqueDests} destinos únicos para ${totalInternal} links — distribuição mediana. Diversifique os destinos para espalhar o PageRank pelo site.`,
  });

  // C5 — Nofollow interno (10 pts)
  let c5 = 0;
  let c5level = 'ok';
  const nofollowPct = totalInternal > 0 ? nofollowInternal / totalInternal : 0;
  if      (totalInternal === 0)           { c5 = 0; c5level = 'critical'; }
  else if (nofollowInternal === 0)        { c5 = 10; c5level = 'ok'; }
  else if (nofollowInternal <= 2)         { c5 = 7;  c5level = 'warn'; }
  else if (nofollowPct < 0.5)             { c5 = 4;  c5level = 'warn'; }
  else                                    { c5 = 0;  c5level = 'critical'; }
  if (totalInternal > 0) scoreBreakdown.push({ id: 'c5', label: 'Nofollow em links internos', pts: c5, max: 10, level: c5level,
    icon: c5level === 'critical' ? '✕' : c5level === 'warn' ? '⚠' : '✓',
    why: c5level === 'ok'
      ? 'Nenhum link interno com nofollow — todo o PageRank flui livremente para as páginas destino.'
      : `${nofollowInternal} link${nofollowInternal > 1 ? 's' : ''} interno${nofollowInternal > 1 ? 's' : ''} com rel="nofollow" — PageRank bloqueado. O nofollow deve ser usado apenas em links externos não-endossados, nunca em links internos.`,
  });

  // C6 — Densidade de links por palavras (10 pts)
  let c6 = 0;
  let c6level = 'ok';
  if      (totalInternal === 0)                          { c6 = 0; c6level = 'critical'; }
  else if (linkDensity >= 0.5 && linkDensity <= 2.0)    { c6 = 10; c6level = 'ok'; }
  else if (linkDensity >= 0.2 && linkDensity < 0.5)     { c6 = 7;  c6level = 'warn'; }
  else if (linkDensity > 2.0  && linkDensity <= 3.5)    { c6 = 6;  c6level = 'warn'; }
  else if (linkDensity < 0.2)                            { c6 = 3;  c6level = 'warn'; }
  else                                                   { c6 = 3;  c6level = 'warn'; }
  if (totalInternal > 0) scoreBreakdown.push({ id: 'c6', label: 'Densidade de links', pts: c6, max: 10, level: c6level,
    icon: c6level === 'critical' ? '✕' : c6level === 'warn' ? '⚠' : '✓',
    why: c6level === 'ok'
      ? `${linkDensity.toFixed(1)} links por 100 palavras — proporção ideal. Cada link tem peso semântico suficiente sem diluir os outros.`
      : linkDensity < 0.5
      ? `${linkDensity.toFixed(1)} links por 100 palavras — abaixo do ideal. Conteúdo com mais palavras deveria ter mais links internos contextuais.`
      : `${linkDensity.toFixed(1)} links por 100 palavras — acima do ideal. Muitos links por parágrafo diluem o valor de cada um. Mantenha entre 0.5-2 por 100 palavras.`,
  });

  // ── Score final ───────────────────────────────────────────────
  const linkScore = Math.min(100, Math.max(0, scoreBreakdown.reduce((s, c) => s + c.pts, 0)));

  const gradeTable = [
    { min: 85, label: 'Excelente', cls: 'lds-good',
      why: 'Linkagem estratégica, âncoras descritivas e destinos diversificados. Esta página está contribuindo ativamente para a topical authority do site.' },
    { min: 70, label: 'Bom',       cls: 'lds-good',
      why: 'Boa estrutura de links internos. Ajustes pontuais nas âncoras ou diversidade de destinos podem elevar para Excelente.' },
    { min: 50, label: 'Regular',   cls: 'lds-warn',
      why: 'Links existem, mas âncoras genéricas ou destinos repetidos reduzem o sinal semântico. Revise as âncoras primeiro — é o ganho mais rápido.' },
    { min: 20, label: 'Ruim',      cls: 'lds-bad',
      why: 'Poucos links, âncoras fracas ou nofollow em links internos comprometem a distribuição de autoridade. Abra "Como essa nota foi calculada" para ver quais critérios precisam de atenção.' },
    { min: 0,  label: 'Crítico',   cls: 'lds-bad',
      why: 'Sem links internos saindo desta página — ela não distribui autoridade para o resto do site. Adicionar links internos contextuais com âncoras descritivas é a ação de maior impacto imediato.' },
  ];
  const grade = gradeTable.find(g => linkScore >= g.min) || gradeTable[gradeTable.length - 1];

  // Quando não há links, adiciona C2-C6 como "Não avaliado"
  // para mostrar todos os critérios que existem no score
  if (totalInternal === 0) {
    scoreBreakdown.push(
      { id: 'c2', label: 'Qualidade das âncoras', pts: 0, max: 25, level: 'na', icon: '—',
        why: 'Não avaliado — sem links internos. Com links, analisaremos se as âncoras são descritivas ("aluguel empilhadeira Goiânia") ou genéricas ("clique aqui").' },
      { id: 'c3', label: 'Âncora descreve o destino', pts: 0, max: 20, level: 'na', icon: '—',
        why: 'Não avaliado — sem links internos. Este critério verifica se o texto da âncora contém palavras da URL destino, reforçando o sinal semântico para o Google.' },
      { id: 'c4', label: 'Diversidade de destinos', pts: 0, max: 15, level: 'na', icon: '—',
        why: 'Não avaliado — sem links internos. Links para páginas diferentes distribuem autoridade por todo o site; todos para o mesmo destino concentram demais.' },
      { id: 'c5', label: 'Nofollow em links internos', pts: 0, max: 10, level: 'na', icon: '—',
        why: 'Não avaliado — sem links internos. Nofollow bloqueia o fluxo de PageRank e deve ser evitado em links internos.' },
      { id: 'c6', label: 'Densidade de links', pts: 0, max: 10, level: 'na', icon: '—',
        why: 'Não avaliado — sem links internos. O ideal é 0,5 a 2 links internos por 100 palavras de conteúdo.' }
    );
  }

  // ── Render ────────────────────────────────────────────────────
  el.innerHTML = `
    <div class="links-diag-score-wrap">
      <div class="links-diag-score-left">
        <span class="links-diag-score-num ${grade.cls}" id="lds-num">0</span>
        <span class="links-diag-score-slash">/100</span>
        <span class="links-diag-score-badge ${grade.cls}">${grade.label}</span>
      </div>
      <div class="links-diag-score-track">
        <div class="links-diag-score-fill ${grade.cls}" style="width:${linkScore}%"></div>
      </div>
    </div>
    <div class="lds-grade-why">${grade.why}</div>
    <div class="lds-accordion">
      <button class="lds-accordion-toggle" type="button">
        <span>Como essa nota foi calculada? <span class="lds-accordion-hint">Clique para visualizar</span></span>
        <svg class="lds-accordion-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="lds-accordion-body" style="display:none">
        <div class="lds-breakdown">
          ${scoreBreakdown.map(c => `
          <div class="lds-criterion lds-criterion--${c.level}">
            <div class="lds-criterion-header">
              <span class="lds-criterion-icon">${c.icon}</span>
              <span class="lds-criterion-label">${c.label}</span>
              <span class="lds-criterion-pts ${c.level === 'na' ? 'lds-pts-na' : c.pts === c.max ? 'lds-pts-full' : c.pts === 0 ? 'lds-pts-zero' : 'lds-pts-partial'}">${c.level === 'na' ? '—' : `${c.pts}/${c.max}`}</span>
            </div>
            <div class="lds-criterion-why">${c.why}</div>
          </div>`).join('')}
        </div>
      </div>
    </div>`;

  // Toggle do accordion
  const accBtn = el.querySelector('.lds-accordion-toggle');
  const accBody = el.querySelector('.lds-accordion-body');
  const accChevron = el.querySelector('.lds-accordion-chevron');
  if (accBtn && accBody) {
    accBtn.addEventListener('click', () => {
      const open = accBody.style.display !== 'none';
      accBody.style.display = open ? 'none' : 'block';
      accChevron.style.transform = open ? '' : 'rotate(180deg)';
    });
  }

  // Anima o número do score
  const numEl = el.querySelector('#lds-num');
  if (numEl) {
    let cur = 0;
    const t = setInterval(() => {
      cur = Math.min(cur + 3, linkScore);
      numEl.textContent = cur;
      if (cur >= linkScore) clearInterval(t);
    }, 20);
  }
}

// ── Link Juice — visual de copos ─────────────────────────────────────────────

function renderLinksGraph(linkNodes, pageUrl) {
  // Alias: agora renderiza o visual de copos de link juice
  renderLinksJuice(linkNodes, pageUrl);
}

function renderLinksJuice(linkNodes, pageUrl) {
  const stage   = document.getElementById('juice-stage');
  const subtitle = document.getElementById('juice-subtitle');
  if (!stage) return;
  stage.innerHTML = '';

  // Normaliza rootPath
  let rootPath = '/';
  try { rootPath = new URL(pageUrl).pathname || '/'; } catch {}

  // Monta mapa de destinos únicos com contagem e info de nofollow
  const destMap = new Map(); // path → { count, nofollow, anchors[] }
  linkNodes.forEach(l => {
    if (!l.isInternal || !l.href) return;
    let p = l.href;
    try { p = new URL(l.href.startsWith('http') ? l.href : 'http://x' + l.href).pathname; } catch {}
    if (!p || p === rootPath || p === '/') return;
    if (!destMap.has(p)) destMap.set(p, { count: 0, nofollow: true, anchors: [] });
    const d = destMap.get(p);
    d.count++;
    if (!l.nofollow) d.nofollow = false; // tem ao menos 1 dofollow
    if (l.anchor && !d.anchors.includes(l.anchor)) d.anchors.push(l.anchor);
  });

  // Ordena por count desc, limita a 8 destinos visíveis
  const dests = [...destMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 8);

  const totalLinks = dests.reduce((s, [, d]) => s + d.count, 0);
  const maxCount   = dests[0]?.[1].count || 1;

  // Subtitle
  if (subtitle) {
    subtitle.textContent = dests.length
      ? `${dests.length} páginas recebem link juice`
      : 'Nenhuma página recebe link juice desta página';
  }

  // ── Estado vazio ─────────────────────────────────────────────
  if (dests.length === 0) {
    stage.innerHTML = `
      <div class="juice-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="1.5">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <strong style="color:var(--red);font-size:13px">Nenhum link interno saindo desta página</strong>
        <span>A autoridade acumulada aqui não flui para nenhuma outra página do site.</span>
      </div>`;
    return;
  }

  // ── Helpers SVG ──────────────────────────────────────────────

  // Desenha um copo trapezoidal SVG
  // w=largura topo, h=altura total, liquidPct=0-1, nofollow=bool
  function cupSVG(w, h, liquidPct, nofollow, valueText, isSource) {
    const bevel = w * 0.12;  // quanto o fundo é mais estreito que o topo
    const bw    = w - bevel * 2;
    const pad   = 2; // padding lateral interno
    const liqH  = Math.max(0, Math.min(1, liquidPct)) * (h - 6);
    const liqY  = h - 3 - liqH;
    const liqColor = nofollow ? '#374151' : (isSource ? '#f97316' : '#fb923c');
    const borderColor = nofollow ? '#4b5563' : (isSource ? '#f97316' : '#fb923c');
    const glowOpacity = isSource ? 0.35 : 0.2;

    return `<svg class="juice-cup-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs>
        <clipPath id="cup-clip-${valueText.replace(/[^a-z0-9]/gi,'_')}">
          <polygon points="${bevel},0 ${w-bevel},0 ${w-pad},${h} ${pad},${h}"/>
        </clipPath>
        <linearGradient id="cup-grad-${valueText.replace(/[^a-z0-9]/gi,'_')}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${liqColor}" stop-opacity="0.7"/>
          <stop offset="50%" stop-color="${liqColor}"/>
          <stop offset="100%" stop-color="${liqColor}" stop-opacity="0.7"/>
        </linearGradient>
      </defs>
      <!-- Corpo do copo -->
      <polygon class="cup-body" points="${bevel},0 ${w-bevel},0 ${w-pad},${h} ${pad},${h}"
        style="fill:#1e2035;stroke:${borderColor};stroke-width:1.5"/>
      <!-- Líquido -->
      <rect class="cup-liquid${nofollow ? ' cup-liquid--nofollow' : ''}"
        x="${pad}" y="${liqY}" width="${w - pad*2}" height="${liqH}"
        style="fill:url(#cup-grad-${valueText.replace(/[^a-z0-9]/gi,'_')})"
        clip-path="url(#cup-clip-${valueText.replace(/[^a-z0-9]/gi,'_')})"/>
      <!-- Reflexo lateral -->
      <rect x="${bevel + 3}" y="4" width="3" height="${h * 0.55}"
        style="fill:rgba(255,255,255,0.08);border-radius:2px"
        clip-path="url(#cup-clip-${valueText.replace(/[^a-z0-9]/gi,'_')})"/>
      <!-- Borda superior -->
      <line x1="${bevel}" y1="0" x2="${w-bevel}" y2="0"
        style="stroke:${borderColor};stroke-width:2.5;opacity:0.6"/>
      <!-- Valor no líquido -->
      ${liqH > 12 ? `<text class="cup-value${isSource ? ' cup-value--big' : ''}"
        x="${w/2}" y="${liqY + liqH/2 + 1}" style="fill:#fff;font-weight:700;
        font-family:Space Mono,monospace;font-size:${isSource ? 11 : 9}px;text-anchor:middle;dominant-baseline:middle"
        >${valueText}</text>` : ''}
    </svg>`;
  }

  // ── Source cup ───────────────────────────────────────────────
  const SW = 72, SH = 80;
  const sourcePct = 1; // copo fonte sempre cheio
  const sourceRow = document.createElement('div');
  sourceRow.className = 'juice-source-row';

  const sourceCup = document.createElement('div');
  sourceCup.className = 'juice-cup-wrap';
  sourceCup.innerHTML = cupSVG(SW, SH, sourcePct, false, 'Esta\npágina', true)
    + `<span class="juice-cup-label juice-cup-label--source">Esta página</span>`;
  sourceRow.appendChild(sourceCup);
  stage.appendChild(sourceRow);

  // ── Conectores SVG ───────────────────────────────────────────
  // Calcula largura total dos copos destino para centralizar as linhas
  const DW_MAX = 56, DW_MIN = 36;
  const DW = Math.max(DW_MIN, Math.min(DW_MAX, Math.floor((document.body.clientWidth - 60) / dests.length) - 10));
  const DH = 56;
  const destRowW = dests.length * (DW + 10) - 10;
  const connH = 44;
  const connW = Math.max(destRowW, SW) + 20;

  const connSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  connSVG.setAttribute('width', '100%');
  connSVG.setAttribute('height', String(connH));
  connSVG.setAttribute('viewBox', `0 0 ${connW} ${connH}`);
  connSVG.style.display = 'block';

  const cx = connW / 2; // centro horizontal
  const srcX = cx;      // posição X do bico do copo fonte

  dests.forEach(([, d], i) => {
    const spacing = connW / (dests.length + 1);
    const dx = spacing * (i + 1);
    const isNF = d.nofollow;
    const color = isNF ? '#f87171' : '#f97316';
    const opacity = isNF ? 0.4 : 0.75;

    // Linha de cima (saindo do source)
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${srcX} 0 L ${srcX} ${connH * 0.4} L ${dx} ${connH * 0.75} L ${dx} ${connH}`);
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-dasharray', '4 3');
    path.setAttribute('opacity', String(opacity));
    path.style.animation = isNF ? 'none' : 'juice-flow 1.2s linear infinite';
    connSVG.appendChild(path);

    // Seta na ponta
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    arrow.setAttribute('points',
      `${dx},${connH} ${dx-4},${connH-7} ${dx+4},${connH-7}`);
    arrow.setAttribute('fill', color);
    arrow.setAttribute('opacity', String(opacity + 0.1));
    connSVG.appendChild(arrow);
  });

  stage.appendChild(connSVG);

  // ── Copos destino ─────────────────────────────────────────────
  // ── Painel de âncoras ────────────────────────────────────────
  const anchorPanel = document.getElementById('juice-anchor-panel');
  const anchorTitle = document.getElementById('juice-anchor-title');
  const anchorUrl   = document.getElementById('juice-anchor-url');
  const anchorListEl= document.getElementById('juice-anchor-list');
  const anchorClose = document.getElementById('juice-anchor-close');
  let selectedWrap  = null;

  const GENERIC_ANCHORS = new Set([
    'clique aqui','clique','aqui','saiba mais','leia mais','veja mais','ver mais',
    'acesse','acesse aqui','link','more','click here','read more','here','ver','veja',
    'mais','continue','continuar','download','baixar','abrir','open',
  ]);

  function showAnchorPanel(path, wrap) {
    if (!anchorPanel) return;
    if (selectedWrap) selectedWrap.classList.remove('selected');
    selectedWrap = wrap;
    wrap.classList.add('selected');

    const label = path.replace(/^\/|\/$/g, '') || '/';
    if (anchorTitle) anchorTitle.textContent = `Âncoras → ${label}`;
    if (anchorUrl)   anchorUrl.textContent   = path;

    // Coleta todas as ocorrências de links para este path
    const raw = linkNodes.filter(l => {
      if (!l.isInternal || !l.href) return false;
      let p = l.href;
      try { p = new URL(l.href.startsWith('http') ? l.href : 'http://x' + l.href).pathname; } catch {}
      return p === path;
    });

    // Agrupa por texto de âncora
    const aMap = new Map();
    raw.forEach(l => {
      const key = (l.anchor || '').trim();
      if (!aMap.has(key)) aMap.set(key, { count: 0, nofollow: true });
      const a = aMap.get(key);
      a.count++;
      if (!l.nofollow) a.nofollow = false;
    });

    const sorted = [...aMap.entries()].sort((a, b) => b[1].count - a[1].count);

    if (anchorListEl) {
      anchorListEl.innerHTML = '';
      if (!sorted.length) {
        anchorListEl.innerHTML = `<p style="font-size:11.5px;color:var(--text-muted);padding:4px 0">Nenhuma âncora encontrada.</p>`;
      } else {
        sorted.forEach(([text, info]) => {
          const isEmpty    = !text;
          const isGeneric  = !isEmpty && GENERIC_ANCHORS.has(text.toLowerCase());
          const isNofollow = info.nofollow;

          let dot = 'ok', tag = 'descritiva', tagCls = 'good';
          if (isEmpty)      { dot = 'empty';    tag = 'sem texto';  tagCls = 'empty'; }
          else if (isNofollow){ dot = 'nofollow'; tag = 'nofollow';  tagCls = 'nofollow'; }
          else if (isGeneric) { dot = 'generic';  tag = 'genérica';  tagCls = 'generic'; }

          const warn = (isGeneric && !isNofollow)
            ? `<span class="juice-anchor-tag juice-anchor-tag--generic">⚠ troque por keyword</span>` : '';

          const el = document.createElement('div');
          el.className = `juice-anchor-item${isNofollow ? ' juice-anchor-item--nofollow' : ''}`;
          el.innerHTML = `
            <div class="juice-anchor-dot juice-anchor-dot--${dot}"></div>
            <div class="juice-anchor-body">
              <div class="juice-anchor-text${isEmpty ? ' juice-anchor-text--empty' : ''}">
                ${isEmpty ? '(sem texto — link de imagem)' : escHtml(text)}
              </div>
              <div class="juice-anchor-tags">
                <span class="juice-anchor-tag juice-anchor-tag--${tagCls}">${tag}</span>
                ${warn}
              </div>
            </div>
            <span class="juice-anchor-count">${info.count}×</span>`;
          anchorListEl.appendChild(el);
        });
      }
    }
    anchorPanel.style.display = 'block';
  }

  if (anchorClose) {
    anchorClose.addEventListener('click', () => {
      if (anchorPanel) anchorPanel.style.display = 'none';
      if (selectedWrap) { selectedWrap.classList.remove('selected'); selectedWrap = null; }
    });
  }

  // ── Copos destino ─────────────────────────────────────────────
  const destRow = document.createElement('div');
  destRow.className = 'juice-dest-row';

  dests.forEach(([path, d]) => {
    const pct = totalLinks > 0 ? d.count / totalLinks : 0;
    const pctLabel = Math.round(pct * 100) + '%';
    const label = path.replace(/^\/|\/$/g, '').split('/').pop() || path;
    const shortLabel = label.length > 10 ? label.substring(0, 9) + '…' : label;

    const wrap = document.createElement('div');
    wrap.className = 'juice-cup-wrap';
    wrap.style.cursor = 'pointer';
    wrap.title = 'Ver âncoras → ' + path;
    wrap.innerHTML = cupSVG(DW, DH, pct, d.nofollow, pctLabel, false)
      + `<span class="juice-cup-label${d.nofollow ? ' juice-cup-label--nofollow' : ''}">${escHtml(shortLabel)}</span>`
      + (d.nofollow ? `<span class="juice-nofollow-tag">nofollow</span>` : '');

    wrap.addEventListener('click', () => showAnchorPanel(path, wrap));
    destRow.appendChild(wrap);
  });

  stage.appendChild(destRow);
}


function renderLinksTable(linkNodes) {
  const tbody    = document.getElementById('links-table-body');
  const footer   = document.getElementById('links-table-footer');
  const searchEl = document.getElementById('links-table-search');
  const headAnchor = document.getElementById('lt-head-anchor');
  if (!tbody) return;

  const internal  = linkNodes.filter(l => l.isInternal);
  const subdomain = linkNodes.filter(l => l.isSubdomain);
  const external  = linkNodes.filter(l => !l.isInternal && !l.isSubdomain);

  // Contagens de URLs únicas por tipo (para os pills no modo dedup)
  const uniqAll      = [...new Set(linkNodes.map(l => l.href))].length;
  const uniqInternal = [...new Set(internal.map(l => l.href))].length;
  const uniqExternal = [...new Set(external.map(l => l.href))].length;
  const uniqSub      = [...new Set(subdomain.map(l => l.href))].length;

  let activeFilter = 'all';
  let searchQuery  = '';
  let dedupMode    = false;

  function setPillCounts() {
    document.getElementById('lpill-all').textContent       = dedupMode ? uniqAll      : linkNodes.length;
    document.getElementById('lpill-internal').textContent  = dedupMode ? uniqInternal : internal.length;
    document.getElementById('lpill-external').textContent  = dedupMode ? uniqExternal : external.length;
    document.getElementById('lpill-subdomain').textContent = dedupMode ? uniqSub      : subdomain.length;
    if (headAnchor) headAnchor.textContent = dedupMode ? 'Âncoras' : 'Âncora';
  }
  setPillCounts();

  function typeLabel(l) {
    if (l.isInternal)  return { text: 'Interno',   cls: 'lt-type-internal' };
    if (l.isSubdomain) return { text: 'Subdomain', cls: 'lt-type-subdomain' };
    return                    { text: 'Externo',   cls: 'lt-type-external' };
  }

  // Agrupa por href, colecta âncoras únicas e nofollow
  // Normaliza href para agrupamento semântico:
  // wa.me/NUMERO?text=... → wa.me/NUMERO
  // tel:+55XX → tel:XX (remove + e espaços)
  // mailto:EMAIL → lowercase
  // URLs normais → remove trailing slash e fragment
  function normalizeHref(href) {
    if (!href) return href;
    try {
      // WhatsApp — agrupa pelo número, ignora ?text=
      if (href.includes('wa.me/') || href.includes('api.whatsapp.com/send')) {
        const u = new URL(href);
        return u.origin + u.pathname; // descarta ?text= e qualquer query
      }
      // Tel — normaliza removendo formatação
      if (href.startsWith('tel:')) {
        return 'tel:' + href.replace('tel:', '').replace(/[\s\-().+]/g, '');
      }
      // Mailto — lowercase
      if (href.startsWith('mailto:')) {
        return href.toLowerCase().split('?')[0];
      }
      // URLs normais — remove fragment e trailing slash
      const u = new URL(href);
      const path = u.pathname.replace(/\/$/, '') || '/';
      return u.origin + path + u.search;
    } catch (_) {
      return href;
    }
  }

  function dedup(list) {
    const map = new Map();
    list.forEach(l => {
      const key = normalizeHref(l.href);
      if (!map.has(key)) {
        map.set(key, { ...l, href: key, hrefOriginal: l.href, anchors: new Set(), count: 0 });
      }
      const entry = map.get(key);
      entry.count++;
      if (l.anchor) entry.anchors.add(l.anchor);
      if (!l.nofollow) entry.nofollow = false;
      // Guarda a URL mais curta (sem parâmetros) como href principal
      if (l.href.length < entry.hrefOriginal.length) entry.hrefOriginal = l.href;
    });
    return [...map.values()].map(e => ({
      ...e,
      href: e.hrefOriginal || e.href, // exibe a URL mais limpa
      anchors: [...e.anchors],
    }));
  }

  function render() {
    let list = linkNodes;
    if (activeFilter === 'internal')  list = internal;
    if (activeFilter === 'external')  list = external;
    if (activeFilter === 'subdomain') list = subdomain;

    if (dedupMode) list = dedup(list);

    const q = searchQuery.toLowerCase();
    if (q) list = list.filter(l =>
      (l.href || '').toLowerCase().includes(q) ||
      (l.anchor || '').toLowerCase().includes(q) ||
      (l.anchors || []).some(a => a.toLowerCase().includes(q))
    );

    tbody.innerHTML = '';
    list.forEach((l, i) => {
      const type = typeLabel(l);
      const tr = document.createElement('tr');
      const shortHref = l.href.length > 55 ? l.href.substring(0, 52) + '…' : l.href;

      let anchorCell;
      if (dedupMode) {
        const anchors = l.anchors || [];
        if (anchors.length === 0) {
          anchorCell = `<span class="lt-anchor-empty">—</span>`;
        } else if (anchors.length === 1) {
          const a = anchors[0];
          anchorCell = `<span title="${escHtml(a)}">${escHtml(a.length > 38 ? a.substring(0, 36) + '…' : a)}</span>`;
        } else {
          const preview = anchors.slice(0, 2).map(a => `"${escHtml(a.length > 20 ? a.substring(0,18)+'…' : a)}"`).join(', ');
          const rest = anchors.length > 2 ? ` <span class="lt-anchor-more">+${anchors.length - 2}</span>` : '';
          anchorCell = `<span title="${escHtml(anchors.join(' | '))}">${preview}${rest}</span>`;
        }
      } else {
        const a = l.anchor || '—';
        anchorCell = `<span title="${escHtml(l.anchor || '')}">${escHtml(a.length > 40 ? a.substring(0, 38) + '…' : a)}</span>`;
      }

      const countBadge = dedupMode && l.count > 1
        ? `<span class="lt-count-badge">${l.count}×</span> `
        : '';

      const href = l.href || '';
      tr.innerHTML = `
        <td class="lt-col-num">${i + 1}</td>
        <td class="lt-col-url">${countBadge}<a href="${escHtml(href)}" target="_blank" rel="noopener" title="${escHtml(href)}">${escHtml(shortHref)}</a></td>
        <td class="lt-col-follow">${l.nofollow
          ? '<span class="lt-nofollow">✕ No</span>'
          : '<span class="lt-dofollow">✓ Sim</span>'}</td>
        <td class="lt-col-anchor">${anchorCell}</td>
        <td class="lt-col-type"><span class="lt-type-badge ${type.cls}">${type.text}</span></td>
        <td class="lt-col-code"><span class="lt-code-cell lt-code-loading" data-href="${escHtml(href)}">…</span></td>`;
      tbody.appendChild(tr);
    });

    const total = dedupMode ? dedup(linkNodes).length : linkNodes.length;
    if (footer) footer.textContent = list.length === total
      ? `${list.length} ${dedupMode ? 'URLs únicas' : 'links'}`
      : `${list.length} de ${total} ${dedupMode ? 'URLs únicas' : 'links'}`;

    // Busca status HTTP em background para as células visíveis
    fetchLinkStatuses();
  }

  // Cache de status: href → [302, 200] etc.
  const statusCache = new Map();

  function statusClass(code) {
    if (!code) return 'lt-code-unknown';
    if (code >= 200 && code < 300) return 'lt-code-2xx';
    if (code >= 300 && code < 400) return 'lt-code-3xx';
    if (code >= 400 && code < 500) return 'lt-code-4xx';
    return 'lt-code-5xx';
  }

  function codeLabel(codes) {
    if (!codes || codes.length === 0) return '—';
    return codes.map(c => {
      const label = c === 200 ? '200 OK' : c === 301 ? '301' : c === 302 ? '302' : c === 303 ? '303' : c === 404 ? '404' : c === 500 ? '500' : String(c);
      return `<span class="lt-code-chip ${statusClass(c)}">${label}</span>`;
    }).join('');
  }

  function updateCodeCells() {
    tbody.querySelectorAll('.lt-code-cell').forEach(cell => {
      const href = cell.dataset.href;
      if (!href || !statusCache.has(href)) return;
      const codes = statusCache.get(href);
      if (codes === null) return; // ainda buscando
      cell.classList.remove('lt-code-loading');
      cell.innerHTML = codeLabel(codes);
    });
  }

  function bgCheckStatus(url) {
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), 8000); // timeout 8s
      try {
        chrome.runtime.sendMessage({ action: 'checkLinkStatus', url }, res => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) { resolve(null); return; }
          resolve(res?.codes ?? null);
        });
      } catch (_) {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  async function fetchLinkStatuses() {
    const cells = [...tbody.querySelectorAll('.lt-code-cell[data-href]')];
    const toFetch = [...new Set(cells.map(c => c.dataset.href).filter(h => h && !statusCache.has(h)))];
    if (!toFetch.length) { updateCodeCells(); return; }

    toFetch.forEach(h => statusCache.set(h, null));

    const BATCH = 6;
    for (let i = 0; i < toFetch.length; i += BATCH) {
      const chunk = toFetch.slice(i, i + BATCH);
      await Promise.all(chunk.map(async url => {
        if (url.startsWith('tel:') || url.startsWith('mailto:')) {
          statusCache.set(url, []); return;
        }
        const codes = await bgCheckStatus(url);
        statusCache.set(url, codes ?? []);
      }));
      updateCodeCells();
    }
  }

  // Pills
  const pills = document.querySelectorAll('.links-pill');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeFilter = pill.dataset.filter;
      render();
    });
  });

  // Toggle dedup
  const dedupBtns = document.querySelectorAll('.lt-dedup-btn');
  dedupBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      dedupBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      dedupMode = btn.dataset.dedup === 'true';
      setPillCounts();
      render();
    });
  });

  // Search
  if (searchEl) {
    searchEl.addEventListener('input', () => {
      searchQuery = searchEl.value;
      render();
    });
  }

  render();
}

function renderLinksTab(linkNodes, pageUrl) {
  if (!linkNodes || !linkNodes.length) return;

  // Diagnóstico imediato (sem canvas, não depende de visibilidade)
  renderLinksDiagnosis(linkNodes, pageUrl);
  // Tabela completa de links
  renderLinksTable(linkNodes);
  // Grafo: renderizado apenas quando a aba fica visível (ver tab click handler)

  // ── Classificação de âncoras — 4 tipos + ruins ────────────────
  // Ruins: sem contexto nenhum para o Google
  const RUIM_SET = new Set([
    'clique aqui','clique','aqui','saiba mais','leia mais','veja mais','ver mais',
    'acesse','acesse aqui','link','more','click here','read more','here',
    'ver','veja','mais','continue','continuar','download','baixar','abrir','open',
    '/','→','←','↓','↑','►','▶','•',
  ]);

  // Verifica se a âncora é um nome de marca isolado (1 palavra, capitalizada, sem keyword descritiva)
  const isBrandOnly = (text, destHref) => {
    if (!text) return false;
    const t = text.trim();
    // Palavra única, sem espaço, com inicial maiúscula e sem preposições/artigos
    return /^[A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][a-záéíóúãõâêîôûç]+$/.test(t) && t.split(' ').length === 1;
  };

  // Frase: 4+ palavras descrevendo o destino
  const isPhrase = (text) => {
    if (!text) return false;
    const words = text.trim().split(/\s+/);
    return words.length >= 4;
  };

  // Exata: 2-3 palavras com keyword clara (não é marca, não é ruim)
  const isExact = (text) => {
    if (!text) return false;
    const words = text.trim().split(/\s+/);
    return words.length >= 2 && words.length <= 3;
  };

  const classifyAnchor = (text, destHref, isInternal, nofollow) => {
    const t = (text || '').trim();
    const tl = t.toLowerCase();

    if (!t || t.length === 0)       return { type: 'image',   label: 'imagem',   dot: 'dot-warn',     tag: 'tag-image',    order: 3 };
    if (RUIM_SET.has(tl) || /^[\d\s\W]+$/.test(t) || t.length <= 2)
                                    return { type: 'ruim',    label: 'ruim',     dot: 'dot-bad',      tag: 'tag-ruim',     order: 0 };
    if (nofollow && isInternal)     return { type: 'nofollow',label: 'nofollow', dot: 'dot-nofollow', tag: 'tag-nofollow', order: 1 };
    if (!isInternal)                return { type: 'external', label: 'externo', dot: 'dot-good',     tag: 'tag-external', order: 5 };
    if (isBrandOnly(t, destHref))   return { type: 'branded', label: 'marca',    dot: 'dot-branded',  tag: 'tag-branded',  order: 2 };
    if (isPhrase(t))                return { type: 'phrase',  label: 'frase',    dot: 'dot-good',     tag: 'tag-phrase',   order: 4 };
    if (isExact(t))                 return { type: 'exact',   label: 'exata',    dot: 'dot-good',     tag: 'tag-exact',    order: 4 };
    return                                 { type: 'branded', label: 'marca',    dot: 'dot-branded',  tag: 'tag-branded',  order: 2 };
  };

  // Compatibilidade com código legado que usa isGenericAnchor
  const isGenericAnchor = (text) => {
    const t = (text || '').toLowerCase().trim();
    return !t || t.length <= 2 || RUIM_SET.has(t) || /^[\d\s\W]+$/.test(t);
  };

  // ── 1. Mapa de destinos internos (link juice) ─────────────────
  const destMap = new Map(); // href → { count, anchors[] }
  linkNodes.filter(l => l.isInternal).forEach(l => {
    if (!l.href || l.href === pageUrl || l.href === '/') return;
    if (!destMap.has(l.href)) destMap.set(l.href, { count: 0, anchors: [] });
    const d = destMap.get(l.href);
    d.count++;
    if (l.anchor && !d.anchors.includes(l.anchor)) d.anchors.push(l.anchor);
  });

  const destSorted = [...destMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 40);

  const maxCount = destSorted[0]?.[1].count || 1;
  const destList = document.getElementById('links-dest-list');
  const destCount = document.getElementById('links-dest-count');

  if (destList) {
    destCount.textContent = `${destSorted.length} URLs únicas`;
    destList.innerHTML = '';

    destSorted.forEach(([href, data]) => {
      const item = document.createElement('div');
      item.className = 'links-dest-item';
      const pct = Math.round((data.count / maxCount) * 100);
      const anchorPreview = data.anchors.slice(0, 2).join(' · ').substring(0, 60);

      // Crawl depth proxy: contar segmentos de path
      let depthLabel = '';
      try {
        const path = href.replace(/^https?:\/\/[^/]+/, '').replace(/\/index\.html?$/, '').replace(/\/$/, '');
        const depth = path.split('/').filter(Boolean).length;
        depthLabel = depth <= 1 ? 'L1' : depth === 2 ? 'L2' : 'L3+';
      } catch (e) { depthLabel = ''; }

      item.innerHTML = `
        <span class="links-dest-count">${data.count}×</span>
        <div class="links-dest-bar-wrap">
          <div class="links-dest-url-row">
            <span class="links-dest-url">${escHtml(href)}</span>
            ${depthLabel ? `<span class="links-depth-badge links-depth-badge--${depthLabel.replace('+','p')}" title="Profundidade estimada no site">${depthLabel}</span>` : ''}
          </div>
          <div class="links-dest-bar-bg">
            <div class="links-dest-bar-fill" style="width:${pct}%"></div>
          </div>
          ${anchorPreview ? `<span class="links-dest-anchors">${escHtml(anchorPreview)}</span>` : ''}
        </div>
      `;
      destList.appendChild(item);
    });
  }

  // ── 2. Análise de âncoras ─────────────────────────────────────
  // Deduplica por href+anchor, avalia qualidade
  const seen = new Set();
  const anchorItems = [];

  linkNodes.forEach(l => {
    const key = l.href + '||' + l.anchor;
    if (seen.has(key)) return;
    seen.add(key);

    const cls = classifyAnchor(l.anchor, l.href, l.isInternal, l.nofollow);
    anchorItems.push({ ...l, quality: cls.type, dotClass: cls.dot, tagLabel: cls.label, tagClass: cls.tag, order: cls.order });
  });

  // Score: ponderado por tipo (interno)
  // Sem links internos = 0 (página isolada é crítico, não neutro)
  // ruim=0, image=0.2, nofollow=0.3, branded=0.5, exact=0.85, phrase=1.0
  const WEIGHTS = { ruim:0, image:0.2, nofollow:0.3, branded:0.5, exact:0.85, phrase:1.0, external:1.0 };
  const internal = anchorItems.filter(a => a.isInternal);
  const scoreRaw = internal.length > 0
    ? internal.reduce((s, a) => s + (WEIGHTS[a.quality] ?? 0.5), 0) / internal.length * 100
    : 0;
  const score = Math.round(scoreRaw);
  const scoreEl = document.getElementById('links-anchor-score');
  if (scoreEl) {
    scoreEl.textContent = `${score}/100`;
    scoreEl.className = `links-anchor-score ${score >= 70 ? 'entity-score-good' : score >= 45 ? 'entity-score-warn' : 'entity-score-bad'}`;
  }

  // ── Distribuição ideal de âncoras ────────────────────────────
  const internalItems = anchorItems.filter(a => a.isInternal);
  const distEl = document.getElementById('links-dist-bar');
  if (distEl) {
    if (internalItems.length === 0) {
      // Estado vazio — sem links internos para avaliar
      distEl.innerHTML = `<div class="ldist-title">Distribuição de Âncoras</div>
        <div class="ldist-empty">Nenhum link interno — sem âncoras para avaliar.</div>`;
    } else {
      const counts = { phrase: 0, exact: 0, branded: 0, ruim: 0, image: 0, nofollow: 0 };
      internalItems.forEach(a => { if (counts[a.quality] !== undefined) counts[a.quality]++; });
      const total = internalItems.length;
      const pct = k => Math.round((counts[k] / total) * 100);

      // Ideais: Frase ≥40%, Exata ≥25%, Marca ≤20%, Ruim <10%
      const ideal = { phrase: 40, exact: 25, branded: 20, ruim: 10 };
      const status = (k, val) => {
        if (k === 'ruim' || k === 'image' || k === 'nofollow') return val <= ideal[k] ? 'ok' : val <= 20 ? 'warn' : 'bad';
        return val >= ideal[k] ? 'ok' : val >= ideal[k] * 0.6 ? 'warn' : 'bad';
      };
      const icon = s => s === 'ok' ? '✓' : s === 'warn' ? '⚠' : '✕';
      const rows = [
        { key: 'phrase',   label: 'Frase (4+ palavras)', ideal: '≥40%', color: '#22c55e' },
        { key: 'exact',    label: 'Exata (2-3 palavras)', ideal: '≥25%', color: '#3b82f6' },
        { key: 'branded',  label: 'Marca (1 palavra)', ideal: '≤20%', color: '#a78bfa' },
        { key: 'ruim',     label: 'Ruim / Genérica', ideal: '<10%', color: '#f87171' },
      ].map(r => {
        const v = pct(r.key);
        const s = status(r.key, v);
        return `<div class="ldist-row">
          <span class="ldist-icon ldist-icon--${s}">${icon(s)}</span>
          <span class="ldist-label">${r.label}</span>
          <div class="ldist-track"><div class="ldist-fill" style="width:${Math.min(v,100)}%;background:${r.color}"></div></div>
          <span class="ldist-pct ldist-pct--${s}">${v}%</span>
          <span class="ldist-ideal">${r.ideal}</span>
        </div>`;
      }).join('');
      distEl.innerHTML = `<div class="ldist-title">Distribuição de Âncoras</div>${rows}`;
    }
  }

  // ── Detector de over-optimization (mesma âncora → destinos diferentes) ──
  const anchorToDestMap = new Map(); // anchor text → Set of hrefs
  internalItems.forEach(a => {
    const t = (a.anchor || '').trim().toLowerCase();
    if (!t || t.length < 3) return;
    if (!anchorToDestMap.has(t)) anchorToDestMap.set(t, new Set());
    anchorToDestMap.get(t).add(a.href);
  });

  // Ordena: problemas primeiro
  anchorItems.sort((a, b) => a.order - b.order);

  // ── Função para sugerir âncora melhor a partir do path da URL ──
  const suggestAnchor = (href) => {
    if (!href) return null;
    try {
      const path = href.replace(/^https?:\/\/[^/]+/, '').replace(/\/index\.html?$/, '').replace(/\/$/, '');
      const slug = path.split('/').filter(Boolean).pop() || '';
      if (!slug) return null;
      return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    } catch (e) { return null; }
  };

  const anchorList = document.getElementById('links-anchor-list');
  if (anchorList) {
    anchorList.innerHTML = '';

    // ── Filtros rápidos ───────────────────────────────────────
    const filterTypes = ['todos', 'ruim', 'nofollow', 'externo', 'frase'];
    const filterLabels = { todos: 'Todos', ruim: 'Ruim', nofollow: 'Nofollow', externo: 'Externo', frase: 'Frase' };
    const filterCounts = {
      todos:    anchorItems.length,
      ruim:     anchorItems.filter(a => a.quality === 'ruim' || a.quality === 'image').length,
      nofollow: anchorItems.filter(a => a.quality === 'nofollow').length,
      externo:  anchorItems.filter(a => !a.isInternal).length,
      frase:    anchorItems.filter(a => a.quality === 'phrase').length,
    };

    const filterBar = document.createElement('div');
    filterBar.className = 'links-filter-bar';
    let activeFilter = 'todos';

    const applyFilter = (type) => {
      activeFilter = type;
      filterBar.querySelectorAll('.links-filter-pill').forEach(p => {
        p.classList.toggle('links-filter-pill--active', p.dataset.type === type);
      });
      renderAnchorList(type);
    };

    filterTypes.forEach(type => {
      const pill = document.createElement('button');
      pill.className = `links-filter-pill${type === 'todos' ? ' links-filter-pill--active' : ''}`;
      pill.dataset.type = type;
      pill.innerHTML = `${filterLabels[type]} <span class="links-filter-count">${filterCounts[type]}</span>`;
      pill.addEventListener('click', () => applyFilter(type));
      filterBar.appendChild(pill);
    });
    anchorList.appendChild(filterBar);

    const listContainer = document.createElement('div');
    listContainer.id = 'links-anchor-items';
    anchorList.appendChild(listContainer);

    const renderAnchorList = (filterType) => {
      const filtered = filterType === 'todos' ? anchorItems
        : filterType === 'ruim'     ? anchorItems.filter(a => a.quality === 'ruim' || a.quality === 'image')
        : filterType === 'nofollow' ? anchorItems.filter(a => a.quality === 'nofollow')
        : filterType === 'externo'  ? anchorItems.filter(a => !a.isInternal)
        : filterType === 'frase'    ? anchorItems.filter(a => a.quality === 'phrase')
        : anchorItems;

      listContainer.innerHTML = '';
      if (filtered.length === 0) {
        listContainer.innerHTML = '<div class="links-filter-empty">Nenhuma âncora nesta categoria.</div>';
        return;
      }

      filtered.slice(0, 80).forEach(item => {
        const t = (item.anchor || '').trim().toLowerCase();
        const overOptCount = anchorToDestMap.get(t)?.size || 0;
        const isOverOpt = overOptCount > 2 && item.isInternal;
        const suggestion = (item.quality === 'ruim' || item.quality === 'image') ? suggestAnchor(item.href) : null;

        const el = document.createElement('div');
        el.className = 'links-anchor-item';
        el.innerHTML = `
          <div class="links-anchor-dot ${item.dotClass}"></div>
          <div class="links-anchor-body">
            <div class="links-anchor-text">${escHtml(item.anchor || '(sem texto)')}${isOverOpt ? `<span class="links-overopt-badge" title="Mesma âncora em ${overOptCount} destinos diferentes — risco de over-optimization">⚠ ${overOptCount}×</span>` : ''}</div>
            <div class="links-anchor-meta">
              <span class="links-anchor-url">${escHtml(item.href)}</span>
              <span class="links-anchor-tag ${item.tagClass}">${item.tagLabel}</span>
              ${suggestion ? `<span class="links-anchor-suggest" title="Sugestão de âncora melhor">💡 ${escHtml(suggestion)}</span>` : ''}
            </div>
          </div>
        `;
        listContainer.appendChild(el);
      });
    };

    renderAnchorList('todos');
  }
}

// ══════════════════════════════════════════════════════════════
// IMAGES TAB — Score + Inventory
// ══════════════════════════════════════════════════════════════

function renderImagesTab(imgNodes, totalImgs) {
  if (!imgNodes) return;

  // Expõe buildImgItem globalmente para applyImgFilter usar
  _buildImgItem = buildImgItemScoped;

  const issues = [];
  const n = imgNodes.length;
  if (n === 0) {
    const sb = document.getElementById('img-score-number');
    if (sb) sb.textContent = '—';
    return;
  }

  // ── Métricas ──────────────────────────────────────────────────
  const noAlt      = imgNodes.filter(i => !i.hasAlt);
  const genericAlt = imgNodes.filter(i => i.isGenericAlt);
  const noDims     = imgNodes.filter(i => !i.hasDimAttrs);
  const oversized  = imgNodes.filter(i => i.oversized);
  const noLazy     = imgNodes.filter(i => !i.isLazy && !i.aboveFold);
  const modern     = imgNodes.filter(i => i.isModernFormat);
  const legacy     = imgNodes.filter(i => !i.isModernFormat && ['jpg','jpeg','png','gif','bmp'].includes(i.ext));

  // ── Issues ────────────────────────────────────────────────────
  let deductions = 0;

  // Alt text
  if (noAlt.length === n) {
    deductions += 40;
    issues.push({ type: 'bad', text: `Nenhuma imagem tem alt text — o Google não consegue entender o conteúdo visual da página.` });
  } else if (noAlt.length > 0) {
    const pct = Math.round((noAlt.length / n) * 100);
    deductions += Math.min(pct * 0.4, 30);
    issues.push({ type: 'bad', text: `${noAlt.length} imagem(ns) sem alt text (${pct}%) — cada imagem sem alt é uma oportunidade perdida de SEO.` });
  } else {
    issues.push({ type: 'ok', text: `Todas as imagens têm alt text.` });
  }

  if (genericAlt.length > 0) {
    deductions += Math.min(genericAlt.length * 5, 15);
    issues.push({ type: 'warn', text: `${genericAlt.length} imagem(ns) com alt genérico (ex: "image", "foto") — descreva o conteúdo real da imagem.` });
  }

  // Dimensões
  if (noDims.length > n * 0.5) {
    deductions += 15;
    issues.push({ type: 'warn', text: `${noDims.length} imagem(ns) sem atributos width/height — causa CLS (Cumulative Layout Shift) e prejudica Core Web Vitals.` });
  } else if (noDims.length > 0) {
    deductions += 5;
    issues.push({ type: 'warn', text: `${noDims.length} imagem(ns) sem dimensões definidas — adicione width e height para evitar layout shift.` });
  } else {
    issues.push({ type: 'ok', text: `Todas as imagens têm dimensões definidas (width/height).` });
  }

  // Oversized
  if (oversized.length > 0) {
    deductions += Math.min(oversized.length * 8, 20);
    issues.push({ type: 'bad', text: `${oversized.length} imagem(ns) sobredimensionada(s) — carregando resolução muito maior que o exibido, desperdiçando banda.` });
  }

  // Formato moderno
  const legacyPct = n > 0 ? Math.round((legacy.length / n) * 100) : 0;
  if (legacy.length > 0 && modern.length === 0) {
    deductions += 15;
    issues.push({ type: 'warn', text: `Nenhuma imagem em WebP ou AVIF — converta JPG/PNG para formatos modernos para reduzir 25-50% do tamanho.` });
  } else if (legacy.length > 0) {
    deductions += Math.round(legacyPct * 0.1);
    issues.push({ type: 'warn', text: `${legacy.length} imagem(ns) em formato legado (${legacyPct}%) — considere migrar para WebP/AVIF.` });
  } else if (modern.length > 0) {
    issues.push({ type: 'ok', text: `${modern.length} imagem(ns) em formato moderno (WebP/AVIF).` });
  }

  // Lazy loading
  if (noLazy.length > 3) {
    deductions += 8;
    issues.push({ type: 'warn', text: `${noLazy.length} imagem(ns) abaixo do fold sem lazy loading — adicione loading="lazy" para melhorar o LCP.` });
  }

  const score = Math.max(0, Math.min(100, Math.round(100 - deductions)));
  const label = score >= 85 ? 'excelente' : score >= 70 ? 'bom' : score >= 45 ? 'regular' : score >= 20 ? 'ruim' : 'critico';
  const labelPt = score >= 85 ? 'Excelente' : score >= 70 ? 'Bom' : score >= 45 ? 'Regular' : score >= 20 ? 'Ruim' : 'Crítico';

  // ── Render score bar ──────────────────────────────────────────
  const sbNum   = document.getElementById('img-score-number');
  const sbBadge = document.getElementById('img-score-badge');
  const sbFill  = document.getElementById('img-score-fill');
  const sbIssues= document.getElementById('img-score-issues');

  if (sbNum) {
    let cur = 0;
    const t = setInterval(() => {
      cur = Math.min(cur + 3, score);
      sbNum.textContent = cur;
      if (cur >= score) clearInterval(t);
    }, 20);
  }
  if (sbBadge) { sbBadge.textContent = labelPt; sbBadge.className = `img-score-badge ${label}`; }
  if (sbFill)  { sbFill.style.width = score + '%'; sbFill.className = `img-score-fill ${label}`; }
  if (sbIssues) {
    const icons = { bad: '✕', warn: '⚠', ok: '✓' };
    sbIssues.innerHTML = `
      <div class="lds-accordion">
        <button class="lds-accordion-toggle" type="button">
          <span>Como essa nota foi calculada? <span class="lds-accordion-hint">Clique para visualizar</span></span>
          <svg class="lds-accordion-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="lds-accordion-body" style="display:none">
          <div class="lds-breakdown">
            ${issues.map(i => `
            <div class="lds-criterion lds-criterion--${i.type === 'bad' ? 'critical' : i.type === 'warn' ? 'warn' : 'ok'}">
              <div class="lds-criterion-header">
                <span class="lds-criterion-icon">${icons[i.type]}</span>
                <span class="lds-criterion-label">${escHtml(i.text)}</span>
              </div>
            </div>`).join('')}
          </div>
        </div>
      </div>`;
    const accBtn = sbIssues.querySelector('.lds-accordion-toggle');
    const accBody = sbIssues.querySelector('.lds-accordion-body');
    const accChevron = sbIssues.querySelector('.lds-accordion-chevron');
    if (accBtn && accBody) {
      accBtn.addEventListener('click', () => {
        const open = accBody.style.display !== 'none';
        accBody.style.display = open ? 'none' : 'block';
        accChevron.style.transform = open ? '' : 'rotate(180deg)';
      });
    }
  }

  // ── Accordion educativo ───────────────────────────────────────
  const imgEduToggle = document.getElementById('img-edu-toggle');
  const imgEduBody   = document.getElementById('img-edu-body');
  if (imgEduToggle && imgEduBody && !imgEduToggle.dataset.bound) {
    imgEduToggle.dataset.bound = '1';
    imgEduToggle.addEventListener('click', () => {
      const open = imgEduBody.style.display !== 'none';
      imgEduBody.style.display = open ? 'none' : 'flex';
      const ch = imgEduToggle.querySelector('.links-edu-chevron');
      if (ch) ch.classList.toggle('open', !open);
    });
  }

  // ── Contadores dos cards de filtro ────────────────────────────
  const setCount = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setCount('stat-img-total',    n);
  setCount('stat-img-noalt',    noAlt.length);
  setCount('stat-img-generic',  genericAlt.length);
  setCount('stat-img-ok',       imgNodes.filter(i => i.hasAlt && !i.isGenericAlt).length);
  setCount('stat-img-modern',   modern.length);
  setCount('stat-img-legacy',   legacy.length);
  setCount('stat-img-oversized',oversized.length);
  setCount('stat-img-nolazy',   noLazy.length);

  // ── Render inventário com filtro ──────────────────────────────
  const listEl   = document.getElementById('img-node-list');
  const countEl  = document.getElementById('img-list-count');
  const titleEl  = document.getElementById('img-list-title');
  if (!listEl) return;

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return null;
    if (bytes < 1024)        return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // Formata bytes — definida dentro do escopo para estar disponível em buildImgItem
  function fmtBytes(b) {
    if (!b || b <= 0) return null;
    if (b < 1024)       return b + ' B';
    if (b < 1_048_576)  return (b / 1024).toFixed(1) + ' KB';
    return (b / 1_048_576).toFixed(1) + ' MB';
  }

  function buildImgItemScoped(img, index) {
    const tr = document.createElement('tr');
    tr.className = 'img-node-item';

    const filename  = img.src.split('/').pop().split('?')[0].substring(0, 40) || 'imagem';
    const sizeText  = fmtBytes(img.fileSize) || '—';
    const sizeClass = img.fileSize > 500_000 ? 'it-size-heavy' : img.fileSize > 100_000 ? 'it-size-mid' : 'it-size-ok';
    const fmtText   = (img.ext || '').toUpperCase() || '—';
    const fmtClass  = img.isModernFormat ? 'it-fmt-modern' : ['JPG','JPEG','PNG','GIF'].includes(fmtText) ? 'it-fmt-legacy' : '';

    // Dimensões
    let dimsText = '';
    if (img.natW > 0 && img.natH > 0) {
      dimsText = `${img.natW}×${img.natH}`;
      if (img.dispW > 0 && img.dispH > 0 && (img.natW !== img.dispW || img.natH !== img.dispH))
        dimsText += ` (${img.dispW}×${img.dispH})`;
    } else if (img.dispW > 0) {
      dimsText = `${img.dispW}×${img.dispH}`;
    }

    // ── td: Preview ──────────────────────────────────────────────
    const tdPrev = document.createElement('td');
    tdPrev.className = 'it-col-prev';
    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'it-thumb-wrap';
    const thumbImg = document.createElement('img');
    thumbImg.className = 'it-thumb';
    thumbImg.src = img.src;
    thumbImg.alt = '';
    thumbImg.loading = 'lazy';
    thumbImg.addEventListener('error', () => {
      thumbImg.outerHTML = '<div class="it-thumb it-thumb-placeholder">🖼</div>';
    }, { once: true });
    thumbWrap.appendChild(thumbImg);
    if (index) {
      const idx = document.createElement('span');
      idx.className = 'it-index';
      idx.textContent = index;
      thumbWrap.appendChild(idx);
    }
    const fnDiv = document.createElement('div');
    fnDiv.className = 'it-filename';
    fnDiv.title = img.src;
    fnDiv.textContent = filename;
    tdPrev.appendChild(thumbWrap);
    tdPrev.appendChild(fnDiv);

    // ── td: Alt Text ─────────────────────────────────────────────
    const tdAlt = document.createElement('td');
    tdAlt.className = 'it-col-alt';
    const altSpan = document.createElement('span');
    if (!img.hasAlt) {
      altSpan.className = 'it-alt-missing';
      altSpan.textContent = '— sem alt text';
    } else if (img.isGenericAlt) {
      altSpan.className = 'it-alt-generic';
      altSpan.title = img.alt;
      altSpan.textContent = img.alt.substring(0, 60);
    } else {
      altSpan.className = 'it-alt-ok';
      altSpan.title = img.alt;
      altSpan.textContent = img.alt.substring(0, 60);
    }
    tdAlt.appendChild(altSpan);

    // ── td: Formato + Dimensões ──────────────────────────────────
    const tdFmt = document.createElement('td');
    tdFmt.className = 'it-col-fmt';
    const fmtBadge = document.createElement('span');
    fmtBadge.className = `it-fmt-badge ${fmtClass}`;
    fmtBadge.textContent = fmtText;
    tdFmt.appendChild(fmtBadge);
    if (dimsText) {
      const dimsDiv = document.createElement('div');
      dimsDiv.className = 'it-dims';
      dimsDiv.textContent = dimsText;
      tdFmt.appendChild(dimsDiv);
    }

    // ── td: Tamanho ──────────────────────────────────────────────
    const tdSize = document.createElement('td');
    tdSize.className = 'it-col-size';
    const sizeSpan = document.createElement('span');
    sizeSpan.className = sizeClass;
    sizeSpan.textContent = sizeText;
    tdSize.appendChild(sizeSpan);

    // ── td: Tags SEO ─────────────────────────────────────────────
    const tdTags = document.createElement('td');
    tdTags.className = 'it-col-tags';
    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'img-node-tags';
    const tagDefs = [];
    if (!img.hasAlt)             tagDefs.push(['sem alt',          'img-node-tag tag-noalt']);
    else if (img.isGenericAlt)   tagDefs.push(['alt genérico',     'img-node-tag tag-generic']);
    else                         tagDefs.push(['alt ok',           'img-node-tag tag-ok-alt']);
    if (!img.hasDimAttrs)        tagDefs.push(['sem dimensões',    'img-node-tag tag-no-dim']);
    if (img.oversized)           tagDefs.push(['sobredimensionada','img-node-tag tag-oversized']);
    if (img.isModernFormat)      tagDefs.push([fmtText,            'img-node-tag tag-modern']);
    else if (['JPG','JPEG','PNG','GIF'].includes(fmtText)) tagDefs.push([fmtText, 'img-node-tag tag-legacy']);
    if (!img.isLazy && !img.aboveFold) tagDefs.push(['sem lazy',  'img-node-tag tag-no-lazy']);
    tagDefs.forEach(([text, cls]) => {
      const t = document.createElement('span');
      t.className = cls;
      t.textContent = text;
      tagsWrap.appendChild(t);
    });
    tdTags.appendChild(tagsWrap);

    // ── td: Download ─────────────────────────────────────────────
    const tdDl = document.createElement('td');
    tdDl.className = 'it-col-dl';
    const dlBtn = document.createElement('button');
    dlBtn.className = 'img-dl-btn';
    dlBtn.title = 'Baixar imagem';
    dlBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
    dlBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ action: 'downloadImage', url: img.src, filename });
    });
    tdDl.appendChild(dlBtn);

    tr.appendChild(tdPrev);
    tr.appendChild(tdAlt);
    tr.appendChild(tdFmt);
    tr.appendChild(tdSize);
    tr.appendChild(tdTags);
    tr.appendChild(tdDl);

    const item = tr;
    return item;
  }

  // Atualiza o banco global e re-renderiza com filtro atual
  _imgAllNodes = imgNodes;
  applyImgFilter(_imgCurrentFilter || 'all', true);
}

// ══════════════════════════════════════════════════════════════
// PAGESPEED INSIGHTS — Image weight + Core Web Vitals
// ══════════════════════════════════════════════════════════════

const PSI_API_KEY = 'AIzaSyD-q5Enf77s5xMMICbHCR5APro3yaHpxv4';

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function runPageSpeedAnalysis(pageUrl) {
  const btn    = document.getElementById('psi-run-btn');
  const status = document.getElementById('psi-status');
  if (!btn || !status) return;

  btn.disabled = true;
  btn.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border:2px solid rgba(52,211,153,.3);border-top-color:#34d399;border-radius:50%;animation:aio-spin 1s linear infinite"></span> Analisando...`;
  status.textContent = 'Chamando Lighthouse... (10-30s)';

  const keyParam = PSI_API_KEY ? `&key=${PSI_API_KEY}` : '';
  const url = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(pageUrl)}&strategy=mobile&category=performance${keyParam}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderPSIResults(data);
    status.textContent = 'Análise concluída ✓';
  } catch (err) {
    status.textContent = `Erro: ${err.message}`;
    console.error('[PSI]', err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Reanalisar`;
  }
}

function renderPSIResults(data) {
  const audits = data?.lighthouseResult?.audits || {};
  const perfScore = Math.round((data?.lighthouseResult?.categories?.performance?.score || 0) * 100);
  const resultsEl = document.getElementById('psi-results');
  if (resultsEl) resultsEl.style.display = 'block';

  // ── Core Web Vitals row ──────────────────────────────────────
  const scoresRow = document.getElementById('psi-scores-row');
  if (scoresRow) {
    const metrics = [
      { id: 'first-contentful-paint',    label: 'FCP',   good: 1800, bad: 3000 },
      { id: 'largest-contentful-paint',  label: 'LCP',   good: 2500, bad: 4000 },
      { id: 'total-blocking-time',       label: 'TBT',   good: 200,  bad: 600  },
      { id: 'cumulative-layout-shift',   label: 'CLS',   good: 0.1,  bad: 0.25, isCLS: true },
    ];

    const perfClass = perfScore >= 90 ? 'good' : perfScore >= 50 ? 'avg' : 'bad';
    let html = `<div class="psi-score-card"><div class="psi-score-num ${perfClass}">${perfScore}</div><div class="psi-score-label">Performance</div></div>`;

    metrics.forEach(m => {
      const audit = audits[m.id];
      if (!audit) return;
      const raw = m.isCLS ? audit.numericValue : audit.numericValue;
      const display = audit.displayValue || '—';
      const cls = m.isCLS
        ? (raw <= m.good ? 'good' : raw <= m.bad ? 'avg' : 'bad')
        : (raw <= m.good ? 'good' : raw <= m.bad ? 'avg' : 'bad');
      html += `<div class="psi-score-card"><div class="psi-score-num ${cls}">${display.replace(/\s*s$/, 's')}</div><div class="psi-score-label">${m.label}</div></div>`;
    });
    scoresRow.innerHTML = html;
  }

  // ── Oportunidades de imagem ──────────────────────────────────
  const oppAudits = [
    { id: 'uses-optimized-images',   title: 'Imagens não comprimidas' },
    { id: 'uses-responsive-images',  title: 'Imagens sobredimensionadas' },
    { id: 'uses-webp-images',        title: 'Converter para WebP/AVIF' },
    { id: 'efficient-animated-content', title: 'GIFs animados — usar vídeo' },
    { id: 'uses-lazy-loading',       title: 'Adicionar lazy loading' },
  ];

  const oppList  = document.getElementById('psi-opportunities-list');
  const oppCount = document.getElementById('psi-opportunities-count');
  if (!oppList) return;

  const activeOpps = oppAudits.filter(o => audits[o.id] && (audits[o.id].score ?? 1) < 0.9);
  if (oppCount) oppCount.textContent = `${activeOpps.length} oportunidade(s)`;

  if (activeOpps.length === 0) {
    oppList.innerHTML = '<div style="padding:14px;font-size:11.5px;color:var(--green)">✓ Nenhuma oportunidade de melhoria de imagem detectada pelo Lighthouse.</div>';
    return;
  }

  oppList.innerHTML = '';
  activeOpps.forEach(o => {
    const audit = audits[o.id];
    const items = audit?.details?.items || [];
    const el = document.createElement('div');
    el.className = 'psi-opp-item';

    const totalWasted = items.reduce((s, i) => s + (i.wastedBytes || 0), 0);
    const savings = totalWasted > 0 ? ` — economizar ${formatBytes(totalWasted)}` : '';

    let filesHtml = '';
    items.slice(0, 5).forEach(item => {
      const src = (item.url || item.node?.snippet || '').split('/').pop().split('?')[0].substring(0, 50);
      const total   = formatBytes(item.totalBytes || 0);
      const wasted  = item.wastedBytes > 0 ? formatBytes(item.wastedBytes) : null;
      const cls = item.wastedBytes > 100 * 1024 ? 'bad' : '';
      filesHtml += `
        <div class="psi-opp-file">
          <span class="psi-opp-filename">${escHtml(src || item.url?.substring(0,60) || '?')}</span>
          <span class="psi-opp-bytes ${cls}">${total}${wasted ? ` → economizar ${wasted}` : ''}</span>
        </div>`;
    });

    el.innerHTML = `
      <div class="psi-opp-title">${escHtml(o.title)}${savings}</div>
      <div class="psi-opp-display">${escHtml(audit.displayValue || '')}</div>
      <div class="psi-opp-items">${filesHtml}</div>
    `;
    oppList.appendChild(el);
  });
}

// Init PSI button
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('psi-run-btn')?.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const url = tabs[0]?.url || '';
      if (url) runPageSpeedAnalysis(url);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// GRAPH — prévia no popup com botão para tela cheia
// ══════════════════════════════════════════════════════════════

function showGraphPreview() {
  const canvas = document.getElementById('graph-canvas');
  const infoEl = document.getElementById('graph-info');
  if (!canvas) return;

  // Conta nós e tipos para mostrar preview informativo
  const schemas = graphData?.schemas || [];
  const totalScripts = schemas.length;
  const types = [...new Set(schemas.flatMap(s => s.types || []))];

  canvas.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100%;gap:16px;color:var(--text-muted);text-align:center;padding:24px;">
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#7c74ff" stroke-width="1.2" opacity="0.7">
        <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
      </svg>
      <div>
        <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">
          ${totalScripts} script${totalScripts !== 1 ? 's' : ''} JSON-LD detectado${totalScripts !== 1 ? 's' : ''}
        </div>
        <div style="font-size:11.5px;line-height:1.7;color:var(--text-muted)">
          ${types.slice(0,4).join(' · ') || 'Schema estruturado'}<br>
          Abra em tela cheia para visualizar o grafo completo
        </div>
      </div>
      <button id="graph-open-fullscreen-btn" style="
        padding:9px 20px;border:1px solid var(--accent);border-radius:8px;
        background:var(--accent-dim);color:var(--accent);font-size:13px;
        font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;
        display:flex;align-items:center;gap:8px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
        </svg>
        Abrir grafo em tela cheia
      </button>
    </div>
  `;

  if (infoEl) infoEl.textContent = `${totalScripts} script${totalScripts !== 1 ? 's' : ''} · clique para visualizar`;

  document.getElementById('graph-open-fullscreen-btn')?.addEventListener('click', () => {
    openGraphFullscreen();
  });
}

// ══════════════════════════════════════════════════════════════
// SPEED TAB — PageSpeed Insights mobile + desktop
// ══════════════════════════════════════════════════════════════

// Cache dos dados PSI para compartilhar com a aba Images
window._psiData = null;

async function fetchPSI(url, strategy) {
  const key = `&key=${PSI_API_KEY}`;
  // Sem filtro fields — retorna lighthouseResult completo e filtramos no JS
  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance${key}`;
  const res = await fetch(endpoint);
  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message ? ` — ${errBody.error.message}` : '';
    } catch (_) {}
    throw new Error(`PSI ${strategy}: HTTP ${res.status}${detail}`);
  }
  return res.json();
}

function scoreColor(s) { return s >= 90 ? 'good' : s >= 50 ? 'avg' : 'bad'; }
function ringColor(s)  { return s >= 90 ? '#34d399' : s >= 50 ? '#fbbf24' : '#f87171'; }

function renderSpeedRing(elId, score) {
  const CIRC = 213.6; // 2π×34
  const el = document.getElementById(elId);
  if (!el) return;
  el.style.stroke = ringColor(score);
  const offset = CIRC - (score / 100) * CIRC;
  requestAnimationFrame(() => { el.style.strokeDashoffset = offset; });
}

function renderCWV(containerId, audits) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const metrics = [
    { id: 'first-contentful-paint',   label: 'FCP', good: 1800, bad: 3000 },
    { id: 'largest-contentful-paint', label: 'LCP', good: 2500, bad: 4000 },
    { id: 'total-blocking-time',      label: 'TBT', good: 200,  bad: 600  },
    { id: 'cumulative-layout-shift',  label: 'CLS', good: 0.1,  bad: 0.25 },
    { id: 'speed-index',              label: 'SI',  good: 3400, bad: 5800 },
    { id: 'interactive',              label: 'TTI', good: 3800, bad: 7300 },
  ];

  el.innerHTML = metrics.map(m => {
    const audit = audits[m.id];
    if (!audit) return '';
    const val = audit.numericValue || 0;
    const display = (audit.displayValue || '—').trim();
    const cls = val <= m.good ? 'good' : val <= m.bad ? 'avg' : 'bad';
    return `<div class="speed-cwv-item">
      <div class="speed-cwv-val ${cls}">${display}</div>
      <div class="speed-cwv-label">${m.label}</div>
    </div>`;
  }).join('');
}

function renderSpeedOpportunities(listId, countId, audits) {
  const oppAudits = [
    { id: 'render-blocking-resources', label: 'Recursos bloqueando renderização', dot: 'bad' },
    { id: 'uses-optimized-images',     label: 'Imagens não comprimidas', dot: 'bad' },
    { id: 'uses-responsive-images',    label: 'Imagens sobredimensionadas', dot: 'bad' },
    { id: 'uses-webp-images',          label: 'Converter para WebP/AVIF', dot: 'warn' },
    { id: 'unused-javascript',         label: 'JavaScript não utilizado', dot: 'warn' },
    { id: 'unused-css-rules',          label: 'CSS não utilizado', dot: 'warn' },
    { id: 'uses-text-compression',     label: 'Compressão de texto (gzip/br)', dot: 'warn' },
    { id: 'uses-lazy-loading',         label: 'Adicionar lazy loading', dot: 'info' },
    { id: 'uses-long-cache-ttl',       label: 'Cache de recursos estáticos', dot: 'info' },
    { id: 'efficient-animated-content',label: 'GIFs animados — usar vídeo', dot: 'info' },
  ];

  const list  = document.getElementById(listId);
  const count = document.getElementById(countId);
  if (!list) return;

  const active = oppAudits.filter(o => {
    const a = audits[o.id];
    return a && (a.score ?? 1) < 0.9 && a.details?.items?.length > 0;
  });

  if (count) count.textContent = `${active.length} item${active.length !== 1 ? 's' : ''}`;

  if (active.length === 0) {
    list.innerHTML = '<div style="padding:14px;font-size:11.5px;color:var(--green)">✓ Nenhuma oportunidade crítica detectada.</div>';
    return;
  }

  list.innerHTML = '';
  active.forEach(o => {
    const audit = audits[o.id];
    const items = (audit.details?.items || []).slice(0, 4);
    const totalWasted = items.reduce((s, i) => s + (i.wastedBytes || i.totalBytes || 0), 0);
    const saving = totalWasted > 0 ? formatBytes(totalWasted) : audit.displayValue || '';

    const el = document.createElement('div');
    el.className = 'speed-opp-item';

    const filesHtml = items.map(item => {
      const fname = (item.url || '').split('/').pop().split('?')[0].substring(0, 45) || item.url?.substring(0, 55) || '';
      const bytes = item.wastedBytes > 0 ? formatBytes(item.wastedBytes) : item.totalBytes > 0 ? formatBytes(item.totalBytes) : '';
      return `<div class="speed-opp-file">
        <span class="speed-opp-fname">${escHtml(fname)}</span>
        ${bytes ? `<span class="speed-opp-fbytes">${bytes}</span>` : ''}
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="speed-opp-header">
        <div class="speed-opp-dot ${o.dot}"></div>
        <span class="speed-opp-title">${escHtml(o.label)}</span>
        ${saving ? `<span class="speed-opp-saving">${escHtml(saving)}</span>` : ''}
      </div>
      ${filesHtml ? `<div class="speed-opp-files">${filesHtml}</div>` : ''}
    `;
    list.appendChild(el);
  });
}

async function runSpeedAnalysis() {
  const btn      = document.getElementById('speed-run-btn');
  const loading  = document.getElementById('speed-loading');
  const loadText = document.getElementById('speed-loading-text');
  const empty    = document.getElementById('speed-empty');
  const results  = document.getElementById('speed-results');
  if (!btn) return;

  btn.disabled = true;
  if (empty)   empty.style.display   = 'none';
  if (results) results.style.display = 'none';
  if (loading) loading.style.display = 'flex';

  // Usa a URL salva no momento da análise — mais confiável que tabs.query
  const pageUrl = _analyzedPageUrl;

  const runAnalysis = async () => {
    // Valida
    const BLOCKED_PREFIXES = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'file://', 'data:', 'localhost', '127.0.0.1'];
    if (!pageUrl || BLOCKED_PREFIXES.some(p => pageUrl.startsWith(p))) {
      if (loading) loading.style.display = 'none';
      if (empty) {
        empty.style.display = 'flex';
        empty.innerHTML = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" stroke-width="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><p>URL não disponível</p><small>Abra uma página e clique na extensão antes de analisar</small>`;
      }
      btn.disabled = false;
      return;
    }

    // Mostra qual URL está sendo analisada
    if (loadText) loadText.textContent = `Analisando ${pageUrl.replace(/^https?:\/\//, '').substring(0, 40)}...`;

    try {
      if (loadText) loadText.textContent = 'Analisando mobile + desktop...';

      // Roda mobile e desktop em paralelo
      const [mobile, desktop] = await Promise.all([
        fetchPSI(pageUrl, 'mobile'),
        fetchPSI(pageUrl, 'desktop'),
      ]);

      // Cache para aba Images
      window._psiData = { mobile, desktop, url: pageUrl };

      if (loading)  loading.style.display  = 'none';
      if (results)  results.style.display  = 'block';

      // Mobile score
      const mScore = Math.round((mobile?.lighthouseResult?.categories?.performance?.score || 0) * 100);
      const dScore = Math.round((desktop?.lighthouseResult?.categories?.performance?.score || 0) * 100);
      const mAudits = mobile?.lighthouseResult?.audits || {};
      const dAudits = desktop?.lighthouseResult?.audits || {};

      // Animar score numbers
      ['mobile', 'desktop'].forEach((s, i) => {
        const score = i === 0 ? mScore : dScore;
        const numEl = document.getElementById(`speed-${s}-score`);
        if (numEl) {
          let cur = 0;
          const t = setInterval(() => {
            cur = Math.min(cur + 3, score);
            numEl.textContent = cur;
            if (cur >= score) clearInterval(t);
          }, 20);
        }
        renderSpeedRing(`speed-${s}-ring`, score);
        renderCWV(`speed-${s}-cwv`, i === 0 ? mAudits : dAudits);
      });

      // Impacto de negócio
      renderSpeedImpact('speed-impact', mScore, mAudits, pageUrl);

      // Oportunidades mobile
      renderSpeedOpportunities('speed-opp-list', 'speed-opp-count', mAudits);

      // Diagnósticos (server response, lcp element, etc.)
      renderSpeedDiagnostics('speed-diag-list', 'speed-diag-count', mAudits);

      // Notifica aba Images para atualizar com peso real
      updateImagesWithPSI(mAudits);

    } catch (err) {
      if (loading) loading.style.display = 'none';
      if (empty) {
        empty.style.display = 'flex';
        empty.innerHTML = `<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p>Erro: ${escHtml(err.message)}</p><small>URL analisada: ${escHtml(pageUrl.substring(0,60))}</small>`;
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Reanalisar`;
    }
  };

  runAnalysis();
}

function renderSpeedDiagnostics(listId, countId, audits) {
  const diagAudits = [
    { id: 'server-response-time',           label: 'Tempo de resposta do servidor (TTFB)' },
    { id: 'largest-contentful-paint-element', label: 'Elemento LCP' },
    { id: 'lcp-lazy-loaded',                label: 'LCP com lazy loading (problema)' },
  ];

  const list  = document.getElementById(listId);
  const count = document.getElementById(countId);
  if (!list) return;

  const active = diagAudits.filter(o => {
    const a = audits[o.id];
    return a && (a.score ?? 1) < 1;
  });

  if (count) count.textContent = `${active.length} item${active.length !== 1 ? 's' : ''}`;

  if (active.length === 0) {
    list.innerHTML = '<div style="padding:14px;font-size:11.5px;color:var(--green)">✓ Sem diagnósticos críticos.</div>';
    return;
  }

  list.innerHTML = active.map(o => {
    const audit = audits[o.id];
    const display = audit.displayValue || '';
    const items = (audit.details?.items || []).slice(0, 2);
    const filesHtml = items.map(item => {
      const node = item.node?.snippet || item.url || '';
      return node ? `<div class="speed-opp-file"><span class="speed-opp-fname">${escHtml(node.substring(0,60))}</span></div>` : '';
    }).join('');
    return `<div class="speed-opp-item">
      <div class="speed-opp-header">
        <div class="speed-opp-dot warn"></div>
        <span class="speed-opp-title">${escHtml(o.label)}</span>
        ${display ? `<span class="speed-opp-saving">${escHtml(display)}</span>` : ''}
      </div>
      ${filesHtml}
    </div>`;
  }).join('');
}

function updateImagesWithPSI(audits) {
  // Enriquece o inventário de imagens com peso real do Lighthouse
  const imgAudits = ['uses-optimized-images', 'uses-responsive-images', 'uses-webp-images'];
  const urlWeightMap = new Map(); // url → { totalBytes, wastedBytes, issue }

  imgAudits.forEach(id => {
    const items = audits[id]?.details?.items || [];
    items.forEach(item => {
      const url = item.url || '';
      if (!url) return;
      const existing = urlWeightMap.get(url) || { totalBytes: 0, wastedBytes: 0, issues: [] };
      if (item.totalBytes > existing.totalBytes) existing.totalBytes = item.totalBytes;
      if (item.wastedBytes > existing.wastedBytes) existing.wastedBytes = item.wastedBytes;
      existing.issues.push(id);
      urlWeightMap.set(url, existing);
    });
  });

  // Atualiza os itens existentes no inventário
  const imgItems = document.querySelectorAll('#img-node-list .img-node-item');
  imgItems.forEach(item => {
    const thumb = item.querySelector('.it-thumb');
    if (!thumb) return;
    const src = thumb.src || '';

    // Tenta match por filename
    const fname = src.split('/').pop().split('?')[0];
    let match = null;
    urlWeightMap.forEach((data, url) => {
      if (url.includes(fname) || fname && url.endsWith(fname)) match = data;
    });
    if (!match) return;

    const dims = item.querySelector('.it-dims');
    const weightInfo = `${formatBytes(match.totalBytes)}${match.wastedBytes > 0 ? ` · economizar ${formatBytes(match.wastedBytes)}` : ''}`;
    if (dims) {
      dims.textContent = (dims.textContent ? dims.textContent + ' · ' : '') + weightInfo;
    } else {
      const fmtCell = item.querySelector('.it-col-fmt');
      if (fmtCell) {
        const d = document.createElement('div');
        d.className = 'it-dims';
        d.style.color = match.wastedBytes > 50000 ? 'var(--red)' : 'var(--yellow)';
        d.textContent = weightInfo;
        fmtCell.appendChild(d);
      }
    }
  });
}

// Init Speed button
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('speed-run-btn')?.addEventListener('click', runSpeedAnalysis);
});

// ── Scan de imagens — chamado automaticamente e pelo botão reanalisar ──
let _imgScanDone      = false;
let _imgAllNodes      = [];   // todas as imagens do scan atual
let _imgCurrentFilter = 'all';

const IMG_FILTER_MAP = {
  all:       { fn: () => true,                                                                 label: 'Todas as imagens' },
  noalt:     { fn: i => !i.hasAlt,                                                             label: 'Sem alt text' },
  generic:   { fn: i => i.isGenericAlt,                                                        label: 'Alt genérico' },
  ok:        { fn: i => i.hasAlt && !i.isGenericAlt,                                           label: 'Com alt' },
  modern:    { fn: i => i.isModernFormat,                                                       label: 'WebP / AVIF' },
  legacy:    { fn: i => !i.isModernFormat && ['jpg','jpeg','png','gif','bmp'].includes(i.ext), label: 'JPG / PNG' },
  oversized: { fn: i => i.oversized,                                                           label: 'Sobredimensionadas' },
  nolazy:    { fn: i => !i.isLazy && !i.aboveFold,                                            label: 'Sem lazy loading' },
};

function applyImgFilter(filter, resetActive) {
  if (filter !== undefined) _imgCurrentFilter = filter;
  const { fn, label } = IMG_FILTER_MAP[_imgCurrentFilter] || IMG_FILTER_MAP.all;
  let filtered = _imgAllNodes.filter(fn);

  // Ordenação
  const sort = document.getElementById('img-sort-select')?.value || 'default';
  if (sort === 'size-desc') filtered = [...filtered].sort((a, b) => (b.fileSize || 0) - (a.fileSize || 0));
  if (sort === 'size-asc')  filtered = [...filtered].sort((a, b) => (a.fileSize || 0) - (b.fileSize || 0));

  // Atualiza UI
  const titleEl = document.getElementById('img-list-title');
  const countEl = document.getElementById('img-list-count');
  const listEl  = document.getElementById('img-node-list');
  if (titleEl) titleEl.textContent = label;
  if (countEl) countEl.textContent = `${filtered.length} imagem${filtered.length !== 1 ? 'ns' : ''}`;
  if (!listEl) return;
  listEl.innerHTML = '';
  filtered.forEach((img, i) => listEl.appendChild(_buildImgItem(img, i + 1)));

  // Marca card ativo
  if (resetActive) {
    document.querySelectorAll('.img-filter-card').forEach(c => {
      c.classList.toggle('img-filter-card--active', c.dataset.filter === _imgCurrentFilter);
    });
  }
}

// Referência global ao buildImgItem (preenchida ao renderizar)
let _buildImgItem = () => document.createElement('div');

async function runImgScan() {
  const runBtn     = document.getElementById('img-run-btn');
  const loading    = document.getElementById('img-loading');
  const hero       = document.getElementById('img-hero');
  const results    = document.getElementById('img-results');
  const loadingTxt = document.getElementById('img-loading-text');

  if (runBtn) { runBtn.disabled = true; runBtn.innerHTML = '<span class="speed-spinner" style="width:12px;height:12px;border-width:2px;display:inline-block"></span> Analisando...'; }
  if (hero)    hero.style.display    = 'none';
  if (loading) loading.style.display = 'flex';
  if (results) results.style.display = 'none';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('no tab');

      // Fase 1: scroll para ativar lazy loads + dispara scan completo no collector
      if (loadingTxt) loadingTxt.textContent = 'Ativando lazy loads e escaneando...';
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Scroll síncrono em saltos — ativa IntersectionObserver de lazy loaders
          const total = document.body.scrollHeight;
          const steps = 20;
          const step  = Math.ceil(total / steps);
          for (let i = 1; i <= steps; i++) window.scrollTo(0, step * i);
          window.scrollTo(0, 0);
          window.dispatchEvent(new Event('resize'));
          window.dispatchEvent(new Event('scroll'));
        },
      });

      // Fase 2: aguarda lazy loaders atualizarem src dos elementos
      if (loadingTxt) loadingTxt.textContent = 'Aguardando imagens carregarem...';
      await new Promise(r => setTimeout(r, 2000));

      // Fase 3: re-scan completo com as 9 camadas do collector (já está na página)
      if (loadingTxt) loadingTxt.textContent = 'Coletando imagens...';
      const scanResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const c = window.__seoImgCollector;

          // Se o collector não existir (página foi carregada antes da extensão ser
          // instalada), executa scan inline
          if (!c) {
            const results = [];
            const seen = new Set();
            function addInline(src, meta) {
              if (!src || src.startsWith('data:') || src.length < 6) return;
              try {
                const full = new URL(src, location.href).href;
                const key  = full.split('?')[0].split('#')[0];
                if (seen.has(key)) return;
                seen.add(key);
                const ext = key.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'');
                if (ext === 'svg') return;
                results.push({ src: full, ext, ...meta });
              } catch (_) {}
            }
            document.querySelectorAll('img').forEach(img => {
              [img.src, img.currentSrc].forEach(s => addInline(s, {
                alt: img.getAttribute('alt') || '', hasAlt: img.hasAttribute('alt') && (img.getAttribute('alt')||'').trim().length>0,
                hasDimAttrs: img.hasAttribute('width')&&img.hasAttribute('height'),
                dispW: img.offsetWidth, dispH: img.offsetHeight, isLazy: img.hasAttribute('data-src'),
              }));
            });
            return results;
          }

          // Força re-scan completo (replica as 9 camadas)
          // Camada 1+2: img.src e img.currentSrc
          Array.from(document.images).forEach(img => {
            function addSrc(s, src) {
              if (!s || s.startsWith('data:') || s.length < 6) return;
              try {
                const full = new URL(s, location.href).href;
                const key  = full.split('?')[0].split('#')[0];
                if (!c.urls.has(key)) c.urls.set(key, {
                  src: full, source: src,
                  alt: img.getAttribute('alt')||'',
                  hasAlt: img.hasAttribute('alt')&&(img.getAttribute('alt')||'').trim().length>0,
                  hasDimAttrs: img.hasAttribute('width')&&img.hasAttribute('height'),
                  dispW: img.offsetWidth||0, dispH: img.offsetHeight||0,
                  isLazy: img.getAttribute('loading')==='lazy'||img.hasAttribute('data-src'),
                });
              } catch(_) {}
            }
            addSrc(img.src, 'img.src'); addSrc(img.currentSrc, 'img.currentSrc');
            // srcset
            (img.getAttribute('srcset')||'').split(',').forEach(p => {
              const u = p.trim().split(/\s+/)[0]; if (u) addSrc(u, 'srcset');
            });
          });
          // Camada 9: regex no innerHTML (pega lazy carregadas após scroll)
          try {
            ((document.body?.innerHTML||'').match(/https?:\/\/[^\s"'<>()]+/gi)||[])
              .filter((u,i,a)=>i===a.indexOf(u))
              .filter(u=>/\.(png|jpg|jpeg|gif|webp|avif|bmp|ico|tif|apng|jfif)(\?|$)/i.test(u))
              .forEach(u=>{ try{ const k=new URL(u).href.split('?')[0]; if(!c.urls.has(k)) c.urls.set(k,{src:u,source:'regex',alt:'',hasAlt:false,hasDimAttrs:false,dispW:0,dispH:0,isLazy:false}); }catch(_){} });
          } catch(_) {}

          // Lê e retorna tudo
          return Array.from(c.urls.values()).map(img => {
            const ext = (img.src.split('?')[0].split('.').pop()||'').toLowerCase().replace(/[^a-z0-9]/g,'');
            // Enriquece com naturalWidth se o elemento ainda estiver no DOM
            let natW=0, natH=0, aboveFold=false, oversized=false;
            const domImg = Array.from(document.images).find(el =>
              (el.currentSrc||el.src||'').split('?')[0].split('#')[0] === img.src.split('?')[0].split('#')[0]
            );
            if (domImg) {
              natW=domImg.naturalWidth; natH=domImg.naturalHeight;
              aboveFold=domImg.getBoundingClientRect().top<window.innerHeight;
              oversized=natW>0&&domImg.offsetWidth>0&&natW>domImg.offsetWidth*2.5;
            }
            return {
              src: img.src,
              alt: img.alt||'',
              hasAlt: img.hasAlt||false,
              isGenericAlt: (img.hasAlt) && /^(image|img|photo|banner|picture|png|jpg|jpeg|gif|pic|foto|imagem|logo|icon|arrow|button|bg|background|undefined|null|_|-)\d*$/i.test((img.alt||'').trim()),
              isModernFormat: ['webp','avif','jxl'].includes(ext),
              isDecorative: false, ext: ext||'?',
              natW, natH,
              dispW: img.dispW||domImg?.offsetWidth||0,
              dispH: img.dispH||domImg?.offsetHeight||0,
              hasDimAttrs: img.hasDimAttrs||false,
              oversized, isLazy: img.isLazy||false, aboveFold,
            };
          });
        },
      });

      let imgNodes = scanResult?.[0]?.result || [];
      console.log(`[IMG SCAN] ${imgNodes.length} imagens coletadas`);

      // Busca peso de todas as imagens de uma vez dentro da página (sem CORS)
      if (loadingTxt) loadingTxt.textContent = `${imgNodes.length} imagens encontradas — buscando pesos...`;
      try {
        const weightResult = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: async (urls) => {
            async function measureOne(url) {
              // 1ª tentativa: HEAD com cache
              try {
                const r = await fetch(url, { method: 'HEAD', cache: 'force-cache' });
                const cl = parseInt(r.headers.get('content-length') || '0');
                if (cl > 0) return { url, size: cl, ok: true };
              } catch (_) {}

              // 2ª tentativa: HEAD sem cache
              try {
                const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
                const cl = parseInt(r.headers.get('content-length') || '0');
                if (cl > 0) return { url, size: cl, ok: true };
              } catch (_) {}

              // 3ª tentativa: GET com Range (obtém content-range sem baixar o arquivo)
              try {
                const r = await fetch(url, {
                  method: 'GET',
                  headers: { Range: 'bytes=0-0' },
                  cache: 'no-store',
                });
                // content-range: bytes 0-0/TOTAL
                const cr = r.headers.get('content-range') || '';
                const match = cr.match(/\/(\d+)$/);
                if (match) return { url, size: parseInt(match[1]), ok: true };
                // fallback: ler blob inteiro para medir
                const blob = await r.clone().blob();
                if (blob.size > 1) return { url, size: blob.size, ok: true };
              } catch (_) {}

              return { url, size: 0, ok: false };
            }

            // Processa em lotes de 8 para não saturar conexões
            const BATCH = 8;
            const results = [];
            for (let i = 0; i < urls.length; i += BATCH) {
              const chunk = urls.slice(i, i + BATCH);
              const res = await Promise.all(chunk.map(measureOne));
              results.push(...res);
            }
            return results;
          },
          args: [imgNodes.map(i => i.src)],
        });
        const weights = weightResult?.[0]?.result || [];
        const weightMap = {};
        weights.forEach(w => { weightMap[w.url] = w.size; });

        // Segunda passagem: imagens ainda sem peso tentam carregar via blob
        const missing = weights.filter(w => !w.ok).map(w => w.url);
        if (missing.length > 0) {
          if (loadingTxt) loadingTxt.textContent = `Verificando ${missing.length} imagens sem peso...`;
          const blobResult = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async (urls) => {
              return Promise.all(urls.map(async url => {
                try {
                  const r = await fetch(url, { cache: 'no-store' });
                  if (!r.ok) return { url, size: 0 };
                  const blob = await r.blob();
                  return { url, size: blob.size };
                } catch (_) { return { url, size: 0 }; }
              }));
            },
            args: [missing],
          });
          (blobResult?.[0]?.result || []).forEach(w => {
            if (w.size > 0) weightMap[w.url] = w.size;
          });
        }

        imgNodes = imgNodes.map(img => ({
          ...img,
          fileSize: weightMap[img.src] || 0,
        }));
      } catch (_) {}

      // ── Peso total das imagens ────────────────────────────────
      const totalBytes = imgNodes.reduce((sum, i) => sum + (i.fileSize || 0), 0);
      const withSize   = imgNodes.filter(i => i.fileSize > 0).length;
      const weightBar  = document.getElementById('img-weight-bar');

      if (weightBar && totalBytes > 0) {
        const fmt = b => {
          if (b < 1024)        return b + ' B';
          if (b < 1_048_576)   return (b / 1024).toFixed(1) + ' KB';
          return (b / 1_048_576).toFixed(1) + ' MB';
        };

        // Valor principal
        const weightVal = document.getElementById('img-weight-value');
        if (weightVal) weightVal.textContent = fmt(totalBytes);

        // Subtexto: "25 de 25 imagens com peso medido"
        const weightSub = document.getElementById('img-weight-sub');
        if (weightSub) weightSub.textContent = `${withSize} de ${imgNodes.length} imagens com peso medido`;

        // Economia potencial (30%)
        const savedBytes   = Math.round(totalBytes * 0.30);
        const weightSaving = document.getElementById('img-weight-saving');
        if (weightSaving) {
          weightSaving.innerHTML = `
            <span class="img-weight-saving-label">Economia estimada com compressão</span>
            <span class="img-weight-saving-value">−${fmt(savedBytes)}</span>`;
        }

        // Impacto: mensagem contextual baseada no peso
        const weightImpact = document.getElementById('img-weight-impact');
        if (weightImpact) {
          let level, icon, msg;
          if (totalBytes > 5_000_000) {
            level = 'red'; icon = '🔴';
            msg = `<strong>${fmt(totalBytes)} de imagens é crítico.</strong> Páginas com mais de 5 MB em imagens carregam em média 8+ segundos no celular — a maioria dos usuários abandona antes de 3s. Reduza pelo menos 60% do peso antes de qualquer outra otimização.`;
          } else if (totalBytes > 1_600_000) {
            level = 'yellow'; icon = '⚠️';
            msg = `<strong>${fmt(totalBytes)} de imagens está acima do ideal.</strong> O Google recomenda menos de 1.6 MB em imagens por página. Esse peso aumenta o LCP e prejudica o ranqueamento. Comprimir as imagens pode reduzir o tempo de carregamento em 2-3 segundos.`;
          } else {
            level = 'green'; icon = '✓';
            msg = `<strong>${fmt(totalBytes)} de imagens está dentro do ideal.</strong> Boa otimização. Manter as imagens abaixo de 1.6 MB garante carregamento rápido e LCP saudável.`;
          }
          weightImpact.className = `img-weight-impact img-weight-impact--${level}`;
          weightImpact.innerHTML = `
            <div class="img-weight-impact-text">${icon} ${msg}</div>
            ${level !== 'green' ? `
            <div class="img-weight-tools">
              <span class="img-weight-tools-label">Ferramentas gratuitas de compressão:</span>
              <a href="https://squoosh.app" target="_blank" class="img-weight-tool-link">Squoosh</a>
              <span class="img-weight-tools-sep">·</span>
              <a href="https://tinypng.com" target="_blank" class="img-weight-tool-link">TinyPNG</a>
              <span class="img-weight-tools-sep">·</span>
              <a href="https://imageoptim.com" target="_blank" class="img-weight-tool-link">ImageOptim</a>
            </div>` : ''}`;
        }

        weightBar.style.display = 'block';
        weightBar.className = `img-weight-card img-weight-card--${totalBytes > 5_000_000 ? 'red' : totalBytes > 1_600_000 ? 'yellow' : 'green'}`;
      }

      // Renderiza resultados
      loading.style.display = 'none';
      results.style.display = 'flex';
      renderImagesTab(imgNodes, imgNodes.length);

    } catch (err) {
      loading.style.display = 'none';
      results.style.display = 'flex';
      console.error('[IMG SCAN]', err);
    } finally {
      _imgScanDone = true;
      if (loading) loading.style.display = 'none';
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Reanalisar';
      }
      if (hero) hero.style.display = 'flex';
    }
}

// Chamado automaticamente ao entrar na aba Images
function initImagesTab() {
  if (_imgScanDone) return; // já rodou, não repete
  runImgScan();
}

// Listeners de imagem — registrados uma única vez no DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {

  // Botão reanalisar
  document.getElementById('img-run-btn')?.addEventListener('click', () => {
    _imgScanDone = false;
    runImgScan();
  });

  // Filtros por card — delegação no grid
  const filterGrid = document.getElementById('img-filter-grid');
  filterGrid?.addEventListener('click', e => {
    const card = e.target.closest('.img-filter-card');
    if (!card || !_imgAllNodes.length) return;
    filterGrid.querySelectorAll('.img-filter-card').forEach(c => c.classList.remove('img-filter-card--active'));
    card.classList.add('img-filter-card--active');
    applyImgFilter(card.dataset.filter);
  });

  // Ordenação
  document.getElementById('img-sort-select')?.addEventListener('change', () => {
    if (_imgAllNodes.length) applyImgFilter();
  });

  // Baixar todas
  document.getElementById('img-dl-all-btn')?.addEventListener('click', () => {
    const btns = document.querySelectorAll('#img-node-list .img-dl-btn');
    btns.forEach((btn, i) => {
      setTimeout(() => {
        const src  = btn.dataset?.src;
        const name = btn.dataset?.name;
        if (src) chrome.runtime.sendMessage({ action: 'downloadImage', url: src, filename: name });
      }, i * 200);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// SPEED — Bloco de Impacto 360° de Negócio
// ══════════════════════════════════════════════════════════════

function renderSpeedImpact(containerId, mScore, audits, pageUrl) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const lcp  = audits['largest-contentful-paint']?.numericValue  || 0;
  const fcp  = audits['first-contentful-paint']?.numericValue    || 0;
  const tbt  = audits['total-blocking-time']?.numericValue       || 0;
  const cls  = audits['cumulative-layout-shift']?.numericValue   || 0;
  const ttfb = audits['server-response-time']?.numericValue      || 0;

  // Calcula impactos baseados nos valores reais
  const impacts = [];

  // ── SEO / Ranking ─────────────────────────────────────────────
  const lcpSev = lcp > 4000 ? 'critical' : lcp > 2500 ? 'high' : 'ok';
  const lcpS   = lcp > 4000 ? 'sev-critical' : lcp > 2500 ? 'sev-high' : 'sev-ok';
  const lcpLabel = lcp > 4000 ? 'Crítico para SEO' : lcp > 2500 ? 'Risco de ranking' : 'LCP saudável';
  impacts.push({
    icon: '📉',
    label: `SEO Orgânico — ${lcpLabel}`,
    sevClass: lcpS,
    desc: lcp > 4000
      ? `LCP de <strong>${(lcp/1000).toFixed(1)}s</strong> está na zona vermelha do Google. Core Web Vitals são sinal de ranking desde 2021 — páginas lentas perdem posição para concorrentes mais rápidos. Usuários que desistem antes de carregar aumentam o bounce rate, que o Google interpreta como sinal de má experiência.`
      : lcp > 2500
      ? `LCP de <strong>${(lcp/1000).toFixed(1)}s</strong> está na zona amarela. O Google prefere páginas com LCP abaixo de 2.5s. Melhorias aqui podem gerar ganhos diretos de posição orgânica.`
      : `LCP de <strong>${(lcp/1000).toFixed(1)}s</strong> dentro do ideal. Google considera este site responsivo para o usuário.`,
    stat: 'Sites com LCP >4s têm até 24% menos tráfego orgânico (Cloudflare, 2023)',
  });

  // ── IA (GEO/AEO) ───────────────────────────────────────────────
  const aiSev = mScore < 50 ? 'critical' : mScore < 75 ? 'high' : 'ok';
  impacts.push({
    icon: '🤖',
    label: `Citações por IA (GEO/AEO) — ${mScore < 50 ? 'Risco alto' : mScore < 75 ? 'Risco moderado' : 'Favorável'}`,
    sevClass: mScore < 50 ? 'sev-critical' : mScore < 75 ? 'sev-high' : 'sev-ok',
    desc: mScore < 60
      ? `Performance mobile de <strong>${mScore}/100</strong> prejudica citações por Perplexity, ChatGPT e Google AI Overview. Modelos de linguagem priorizam fontes que carregam rápido para incluir em respostas — páginas lentas aparecem menos em resultados gerados por IA.`
      : `Performance de <strong>${mScore}/100</strong> é razoável para citações de IA, mas melhorias no LCP e FCP aumentariam a chance de aparecer em respostas do Google AI Overview e Perplexity.`,
    stat: 'Páginas com score <50 mobile têm 3× menos chance de citação em respostas de IA (Maturare, 2024)',
  });

  // ── Conversão ──────────────────────────────────────────────────
  const convSev = lcp > 4000 ? 'critical' : lcp > 2500 ? 'high' : 'ok';
  const extraSecs = Math.max(0, (lcp - 1000) / 1000);
  const convLoss = Math.round(extraSecs * 7);
  impacts.push({
    icon: '💸',
    label: `Conversão — ${convLoss > 20 ? 'Perda significativa' : convLoss > 10 ? 'Perda moderada' : 'Impacto baixo'}`,
    sevClass: lcp > 4000 ? 'sev-critical' : lcp > 2500 ? 'sev-high' : 'sev-ok',
    desc: lcp > 1000
      ? `Com LCP de <strong>${(lcp/1000).toFixed(1)}s</strong>, estima-se perda de até <strong>${convLoss}%</strong> nas conversões em relação a um carregamento de 1s. Cada segundo extra após o primeiro segundo reduz conversões em ~7%.`
      : `Carregamento excelente — impacto mínimo na conversão. Foco em conteúdo e CTA agora.`,
    stat: 'Amazon: 100ms de lentidão = -1% de receita | Google: 53% abandona páginas mobile com +3s',
  });

  // ── Experiência do usuário ─────────────────────────────────────
  const abandonment = fcp > 3000 ? 'alta probabilidade' : fcp > 1800 ? 'probabilidade moderada' : 'baixa probabilidade';
  impacts.push({
    icon: '👤',
    label: `Experiência do Usuário — ${fcp > 3000 ? 'Crítica' : fcp > 1800 ? 'Regular' : 'Boa'}`,
    sevClass: fcp > 3000 ? 'sev-critical' : fcp > 1800 ? 'sev-high' : 'sev-ok',
    desc: `FCP de <strong>${(fcp/1000).toFixed(1)}s</strong> — ${abandonment} de abandono antes do conteúdo aparecer. O Google mede a taxa de desistência: quando usuários voltam para a SERP sem interagir, o algoritmo entende que o site não serviu bem ao usuário e reduz impressões futuras.`,
    stat: '53% dos usuários mobile abandonam se a página demora mais de 3s (Google, Think with Google)',
  });

  // ── CLS / Estabilidade Visual ──────────────────────────────────
  if (cls > 0.1) {
    impacts.push({
      icon: '⚡',
      label: `CLS ${cls.toFixed(3)} — Layout instável`,
      sevClass: cls > 0.25 ? 'sev-critical' : 'sev-high',
      desc: `CLS de <strong>${cls.toFixed(3)}</strong> significa que elementos pulam durante o carregamento. Isso causa cliques acidentais, frustra o usuário e é penalizado diretamente pelo Google como sinal negativo de experiência.`,
      stat: 'CLS >0.1 afeta negativamente o ranking e a taxa de cliques em botões de conversão',
    });
  }

  // ── Link para PSI completo ─────────────────────────────────────
  const psiUrl = `https://pagespeed.web.dev/report?url=${encodeURIComponent(pageUrl)}`;

  el.innerHTML = `
    <div class="speed-impact-block">
      <div class="speed-impact-header">
        <span class="speed-impact-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Impacto de Negócio
        </span>
        <a class="speed-impact-psi-link" href="${escHtml(psiUrl)}" target="_blank" title="Ver relatório completo no PageSpeed Insights">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Ver relatório completo
        </a>
      </div>
      <div class="speed-impact-body">
        ${impacts.map(item => `
          <div class="speed-impact-item">
            <div class="speed-impact-icon">${item.icon}</div>
            <div class="speed-impact-content">
              <div class="speed-impact-label">
                ${escHtml(item.label)}
                <span class="speed-impact-severity ${item.sevClass}">${item.sevClass.includes('critical') ? 'Crítico' : item.sevClass.includes('high') ? 'Alto' : item.sevClass.includes('medium') ? 'Médio' : 'OK'}</span>
              </div>
              <div class="speed-impact-desc">${item.desc}</div>
              <div class="speed-impact-stat">${escHtml(item.stat)}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>
  `;

  // Abre links externos no Chrome sem fechar o popup
  el.querySelectorAll('a[target="_blank"]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      chrome.tabs.create({ url: a.href });
    });
  });
}

// ══════════════════════════════════════════════════════════════
// ABA 360 — Diagnóstico Estratégico
// ══════════════════════════════════════════════════════════════

// Estado global da aba 360
const _360 = {
  objetivo: '',
  keyword: '',
  pageText: '',
};

// Agrega scores de todas as abas analisadas
function get360Scores() {
  const data = graphData; // graphData contém os dados do render()
  if (!data) return [];

  const scores = [];

  // Headings
  const hScore = parseInt(document.getElementById('headings-score-number')?.textContent) || null;
  const hIssues = document.getElementById('headings-score-issues');
  const hFirstIssue = hIssues?.querySelector('.headings-score-issue--bad, .headings-score-issue--warn')?.textContent?.trim().substring(0, 60) || '';
  scores.push({
    name: 'Headings',
    icon: '≡',
    score: hScore,
    topIssue: hFirstIssue,
    tab: 'headings',
  });

  // Images
  const imgScore = parseInt(document.getElementById('img-score-number')?.textContent) || null;
  const imgIssueEl = document.getElementById('img-score-issues')?.querySelector('.img-score-issue--bad, .img-score-issue--warn');
  const imgIssue = imgIssueEl?.textContent?.replace(/^[✕⚠✓]\s*/, '').trim().substring(0, 60) || '';
  scores.push({
    name: 'Imagens',
    icon: '🖼',
    score: imgScore,
    topIssue: imgIssue,
    tab: 'images',
  });

  // Speed (PSI mobile)
  const mScoreEl = document.getElementById('speed-mobile-score');
  const mScore = mScoreEl && mScoreEl.textContent !== '—' ? parseInt(mScoreEl.textContent) : null;
  const lcpEl = document.querySelector('#speed-mobile-cwv .speed-cwv-val.bad');
  const lcpVal = lcpEl?.textContent?.trim() || '';
  scores.push({
    name: 'Velocidade',
    icon: '⚡',
    score: mScore,
    topIssue: mScore ? (lcpVal ? `LCP ${lcpVal} (mobile)` : '') : 'Não analisado — clique em Speed',
    tab: 'speed',
  });

  // Schema
  const schemaEl = document.querySelector('#schema-list .schema-summary');
  const schemaCount = schemaEl ? parseInt(schemaEl.querySelector('.schema-stat-num')?.textContent) || 0 : null;
  const schemaScore = schemaCount === null ? null : schemaCount > 0 ? Math.min(100, schemaCount * 20 + 40) : 0;
  scores.push({
    name: 'Schema',
    icon: '{}',
    score: schemaScore,
    topIssue: schemaCount === 0 ? 'Nenhum schema detectado' : schemaCount > 0 ? `${schemaCount} script(s) JSON-LD` : 'Não analisado',
    tab: 'schema',
  });

  // Links internos
  const intLinks = parseInt(document.getElementById('stat-internal')?.textContent) || null;
  const linkScore = intLinks === null ? null : intLinks >= 10 ? 80 : intLinks >= 5 ? 60 : intLinks > 0 ? 40 : 10;
  scores.push({
    name: 'Links internos',
    icon: '🔗',
    score: linkScore,
    topIssue: intLinks !== null ? `${intLinks} links internos nesta página` : 'Não analisado',
    tab: 'links',
  });

  // SEO on-page (overview score)
  const overviewScore = parseInt(document.getElementById('score-number')?.textContent) || null;
  scores.push({
    name: 'SEO On-page',
    icon: '📋',
    score: overviewScore,
    topIssue: data.title ? `Title: ${data.title.substring(0, 45)}` : 'Title ausente',
    tab: 'overview',
  });

  return scores;
}

function scoreClass(s) {
  if (s === null) return 'gray';
  if (s >= 70) return 'green';
  if (s >= 45) return 'yellow';
  return 'red';
}

function dotClass(s) {
  if (s === null) return 'dot-gray';
  if (s >= 70) return 'dot-green';
  if (s >= 45) return 'dot-yellow';
  return 'dot-red';
}

function issueClass(s) {
  if (s === null) return '';
  if (s >= 70) return '';
  if (s >= 45) return 'warn';
  return 'bad';
}

function render360StatusPanel() {
  const panel  = document.getElementById('tab360-status-panel');
  const qPanel = document.getElementById('tab360-questions');
  const grid   = document.getElementById('tab360-status-grid');
  const tags   = document.getElementById('tab360-context-tags');
  if (!panel || !grid || !tags) return;

  // Mostra painel, esconde perguntas
  qPanel.style.display = 'none';
  panel.style.display = 'block';

  // Context tags
  tags.innerHTML = [
    _360.objetivo ? `<span class="tab360-context-tag">🎯 ${escHtml(_360.objetivo)}</span>` : '',
    _360.keyword  ? `<span class="tab360-context-tag">🔑 ${escHtml(_360.keyword)}</span>` : '',
  ].join('');

  // Status rows
  const scores = get360Scores();
  grid.innerHTML = '';
  scores.forEach(s => {
    const row = document.createElement('div');
    row.className = 'tab360-status-row';
    const cls   = scoreClass(s.score);
    const dc    = dotClass(s.score);
    const ic    = issueClass(s.score);
    const scoreDisplay = s.score !== null ? `${s.score}/100` : '—';
    row.innerHTML = `
      <div class="tab360-status-dot ${dc}"></div>
      <div class="tab360-status-name">${escHtml(s.name)}</div>
      <div class="tab360-status-score ${cls}">${scoreDisplay}</div>
      <div class="tab360-status-issues ${ic}">${escHtml(s.topIssue)}</div>
      <span class="tab360-status-action" data-tab="${s.tab}">Ver →</span>
    `;
    row.querySelector('.tab360-status-action').addEventListener('click', e => {
      document.querySelector(`.tab[data-tab="${e.target.dataset.tab}"]`)?.click();
    });
    grid.appendChild(row);
  });
}

// Extrai dados reais de todas as fontes da extensão
function collect360Data() {
  const data = graphData || {};
  const url  = _analyzedPageUrl || data.url || '';

  // SEO on-page
  const seo = {
    title:       data.title || 'Ausente',
    description: data.description || 'Ausente',
    canonical:   data.canonical || 'Ausente',
    robots:      data.robots || 'Não detectado',
    score:       parseInt(document.getElementById('score-number')?.textContent) || null,
  };

  // Headings
  const headingNodes = data.headingNodes || _headingNodesForAI || [];
  const headingsText = headingNodes.map(n => `${n.level.toUpperCase()}: ${n.text}`).join('\n');
  const hScore = parseInt(document.getElementById('headings-score-number')?.textContent) || null;
  const hIssues = Array.from(document.querySelectorAll('#headings-score-issues .headings-score-issue--bad, #headings-score-issues .headings-score-issue--warn'))
    .map(el => el.textContent.trim()).slice(0, 5);

  // Velocidade (PSI real)
  const psi = window._psiData || null;
  let speedBlock = 'Não analisado — abra a aba Speed e clique em Analisar.';
  let mScoreNum = null, dScoreNum = null;
  if (psi) {
    const mAudits = psi.mobile?.lighthouseResult?.audits || {};
    const dAudits = psi.desktop?.lighthouseResult?.audits || {};
    mScoreNum = Math.round((psi.mobile?.lighthouseResult?.categories?.performance?.score || 0) * 100);
    dScoreNum = Math.round((psi.desktop?.lighthouseResult?.categories?.performance?.score || 0) * 100);
    const cwvIds    = ['first-contentful-paint','largest-contentful-paint','total-blocking-time','cumulative-layout-shift','speed-index','interactive'];
    const cwvLabels = ['FCP','LCP','TBT','CLS','SI','TTI'];
    const mobileCwv  = cwvIds.map((id,i) => `${cwvLabels[i]}: ${mAudits[id]?.displayValue || '—'}`).join(' | ');
    const desktopCwv = cwvIds.map((id,i) => `${cwvLabels[i]}: ${dAudits[id]?.displayValue || '—'}`).join(' | ');
    const opps = ['render-blocking-resources','uses-optimized-images','uses-webp-images','unused-javascript','unused-css-rules','uses-text-compression']
      .filter(id => mAudits[id]?.score !== null && mAudits[id]?.score < 0.9)
      .map(id => mAudits[id]?.title || id).slice(0, 4);
    speedBlock = `Score mobile: ${mScoreNum}/100 | Score desktop: ${dScoreNum}/100\nMobile CWV: ${mobileCwv}\nDesktop CWV: ${desktopCwv}\nOportunidades: ${opps.length ? opps.join('; ') : 'nenhuma crítica'}`;
  }

  // Imagens
  const imgScore  = parseInt(document.getElementById('img-score-number')?.textContent) || null;
  const imgNoAlt  = data.imgNoAlt ?? '—';
  const imgIssues = Array.from(document.querySelectorAll('#img-score-issues .img-score-issue--bad, #img-score-issues .img-score-issue--warn'))
    .map(el => el.textContent.replace(/^[✕⚠✓]\s*/, '').trim()).slice(0, 4);

  // Schema
  const schemas = data.schemas || [];
  const schemaTypes = schemas.map(s => s['@type'] || 'desconhecido').join(', ');
  const schemaBlock = schemas.length ? `${schemas.length} bloco(s) JSON-LD: ${schemaTypes}` : 'Nenhum schema detectado';

  // Links
  const linkNodes      = _linksDataForAI?.linkNodes || [];
  const intLinks       = parseInt(document.getElementById('stat-internal')?.textContent) || linkNodes.filter(l => l.type === 'internal').length || 0;
  const extLinks       = parseInt(document.getElementById('stat-external')?.textContent) || 0;
  const genericAnchors = linkNodes.filter(l => /^(clique aqui|saiba mais|acesse|veja mais|aqui|link)$/i.test((l.text || '').trim())).length;
  const linksBlock     = `Links internos: ${intLinks} | Links externos: ${extLinks} | Âncoras genéricas: ${genericAnchors}`;

  // HTML Semântico
  const semScore  = parseInt(document.querySelector('#semantic-score-number')?.textContent) || null;
  const semIssues = Array.from(document.querySelectorAll('.sem-issue--bad, .sem-issue--warn'))
    .map(el => el.textContent.trim()).slice(0, 4);

  const pageTextSection = _360.pageText
    ? `\nCONTEÚDO EXTRAÍDO (primeiros 2500 chars):\n${_360.pageText.substring(0, 2500)}`
    : '';

  return { url, seo, hScore, hIssues, headingsText, speedBlock, mScoreNum, dScoreNum, imgScore, imgNoAlt, imgIssues, schemaBlock, schemas, intLinks, linksBlock, genericAnchors, semScore, semIssues, pageTextSection };
}

function formatDataBlock(d) {
  return `SEO ON-PAGE (score: ${d.seo.score ?? 'n/a'}/100)
Title: ${d.seo.title}
Meta Description: ${d.seo.description}
Canonical: ${d.seo.canonical}
Robots: ${d.seo.robots}

HIERARQUIA DE TÍTULOS (score: ${d.hScore ?? 'n/a'}/100)
${d.headingsText || 'Não disponível'}
Problemas detectados: ${d.hIssues.length ? d.hIssues.join('; ') : 'nenhum'}

VELOCIDADE
${d.speedBlock}

IMAGENS (score: ${d.imgScore ?? 'n/a'}/100)
Imagens sem texto alternativo: ${d.imgNoAlt}
Problemas: ${d.imgIssues.length ? d.imgIssues.join('; ') : 'nenhum crítico'}

SCHEMA / DADOS ESTRUTURADOS
${d.schemaBlock}

LINKS INTERNOS
${d.linksBlock}

HTML SEMÂNTICO (score: ${d.semScore ?? 'n/a'}/100)
Problemas: ${d.semIssues.length ? d.semIssues.join('; ') : 'nenhum crítico'}
${d.pageTextSection}`;
}

function build360Prompt() {
  const d   = collect360Data();
  const obj = _360.objetivo || 'Não informado';
  const kw  = _360.keyword  || 'Não informada';

  return `Você é um consultor sênior de marketing digital especializado em pequenas e médias empresas brasileiras. Você combina profundo conhecimento técnico em SEO, GEO e AEO com a capacidade de traduzir qualquer complexidade em linguagem de negócio simples.

Seu cliente é um empresário que não entende de SEO técnico. Ele precisa saber: se o site está bom, o que está impedindo, e o que fazer primeiro.

CONTEXTO DO NEGÓCIO
URL analisada: ${d.url}
Objetivo da página: ${obj}
Palavra-chave prioritária: ${kw}

DADOS TÉCNICOS COLETADOS (extensão SEO Analyzer)
${formatDataBlock(d)}

INSTRUÇÕES DE RACIOCÍNIO (não mostrar no output)
Classifique internamente cada dimensão: CRÍTICO / ATENÇÃO / OK.
Selecione os 3 de maior impacto em ranqueamento + conversão para o objetivo "${obj}".

OUTPUT — SIGA EXATAMENTE ESTA ESTRUTURA:

▸ NOTA GERAL: [X]/10
▸ EM UMA FRASE: [o que está impedindo o ranqueamento para "${kw}"]

DIAGNÓSTICO PARA O EMPRESÁRIO
(máximo 220 palavras — zero siglas — zero termos técnicos)

PROBLEMA 1 — [nome em linguagem de negócio]
Consequência: [clientes ou visibilidade perdida]
Analogia: [comparação com loja, vitrine, cartão de visita, vendedor]
Ação: [instrução direta para o desenvolvedor/agência]

PROBLEMA 2 — [idem] | Consequência: [idem] | Analogia: [idem] | Ação: [idem]
PROBLEMA 3 — [idem] | Consequência: [idem] | Analogia: [idem] | Ação: [idem]

O QUE ESTÁ FUNCIONANDO BEM:
• [ponto positivo específico 1]
• [ponto positivo específico 2]

VISIBILIDADE NAS IAs
Citabilidade para "${kw}" no ChatGPT/Perplexity: [SIM / PARCIALMENTE / NÃO]
Por quê: [1 frase] | O que muda isso: [ação específica]

LISTA DE TAREFAS PARA SUA AGÊNCIA
[ ] P0 | [tarefa com localização exata] | ~[X]h
[ ] P0 | [tarefa] | ~[X]h
[ ] P1 | [tarefa] | ~[X]h
[ ] P1 | [tarefa] | ~[X]h
[ ] P2 | [tarefa] | ~[X]h

RESTRIÇÃO: nunca use siglas sem explicar (LCP, CLS, TBT, JSON-LD, canonical, schema, SERP, E-E-A-T). Substitua pela consequência de negócio. Seja específico com os dados reais acima.`;
}

function build360PromptClaude() {
  const d   = collect360Data();
  const obj = _360.objetivo || 'Não informado';
  const kw  = _360.keyword  || 'Não informada';

  return `Você é um consultor sênior de marketing digital especializado em pequenas e médias empresas brasileiras.

Recebi os dados técnicos de auditoria SEO abaixo, coletados automaticamente por uma extensão Chrome. Preciso que você gere um RELATÓRIO HTML VISUAL completo — um arquivo HTML standalone que o empresário possa salvar e abrir no navegador para entender a situação do site dele.

CONTEXTO DO NEGÓCIO
URL analisada: ${d.url}
Objetivo da página: ${obj}
Palavra-chave prioritária: ${kw}

DADOS TÉCNICOS COLETADOS (extensão SEO Analyzer)
${formatDataBlock(d)}

INSTRUÇÕES PARA O HTML
Gere um arquivo HTML único, completo (<!DOCTYPE html> até </html>), com CSS inline no <style>. Não use frameworks externos.

DESIGN: fundo branco, fonte system-ui, cores — verde #16a34a (bom/ok), amarelo #d97706 (atenção), vermelho #dc2626 (crítico), cinza #9ca3af (não analisado). Cards com sombra leve, bordas arredondadas.

ESTRUTURA OBRIGATÓRIA (nesta ordem):

1. CABEÇALHO
   Título "Diagnóstico 360° do Site", URL em badge, objetivo e palavra-chave em pills coloridos, data de geração
   Nota geral [X]/10 em número grande com cor correspondente + frase de 1 linha

2. PAINEL DE SAÚDE (grid de cards, 3 por linha)
   Um card por dimensão: SEO On-page, Velocidade Mobile, Velocidade Desktop, Hierarquia de Títulos, Imagens, Schema, Links Internos, HTML Semântico
   Cada card: nome, score numérico, barra de progresso colorida, status em badge

3. TOP 3 PROBLEMAS CRÍTICOS
   Cada problema: ícone ⚠, título em linguagem de negócio (sem siglas), consequência para o negócio, analogia do mundo físico (loja, vitrine, vendedor), ação recomendada com responsável

4. O QUE ESTÁ FUNCIONANDO BEM
   Lista com ícones ✓ verdes, linguagem positiva e específica

5. VISIBILIDADE NAS IAs
   Seção com fundo azul-claro. Status SIM/PARCIALMENTE/NÃO em badge. Explicação de 2 linhas. Ação específica.

6. LISTA DE TAREFAS PARA SUA AGÊNCIA
   Tabela: Prioridade (P0=vermelho, P1=amarelo, P2=azul) | Tarefa | Tempo estimado
   Nota: "Copie esta tabela e envie para quem cuida do seu site"

7. RODAPÉ
   "Relatório gerado por SEO Analyzer — extensão Chrome"

RESTRIÇÃO DE LINGUAGEM: zero siglas sem explicação. Substitua termos técnicos pela consequência de negócio entre parênteses. Relatório legível por empresário sem formação técnica.

Responda APENAS com o código HTML completo, sem nenhum texto antes ou depois.`;
}

function init360Tab() {
  // Chips Q1
  document.querySelectorAll('#q1-chips .tab360-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#q1-chips .tab360-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      const custom = document.getElementById('q1-custom');
      if (chip.dataset.val === 'Outro') {
        custom.style.display = 'block';
        custom.focus();
        _360.objetivo = '';
      } else {
        custom.style.display = 'none';
        _360.objetivo = chip.dataset.val;
      }
    });
  });

  document.getElementById('q1-custom')?.addEventListener('input', e => {
    _360.objetivo = e.target.value.trim();
  });

  document.getElementById('q2-keyword')?.addEventListener('input', e => {
    _360.keyword = e.target.value.trim();
  });

  // Botão gerar diagnóstico
  document.getElementById('tab360-run-btn')?.addEventListener('click', async () => {
    if (!_360.objetivo) {
      document.querySelector('#q1-chips .tab360-chip')?.classList.add('selected');
      _360.objetivo = document.querySelector('#q1-chips .tab360-chip')?.dataset.val || 'Vender serviço';
    }

    // Extrai texto da página via content script
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const body = document.body.cloneNode(true);
            // Remove scripts, styles, nav, footer, header
            ['script','style','nav','footer','header','noscript','svg'].forEach(tag => {
              body.querySelectorAll(tag).forEach(el => el.remove());
            });
            return (body.innerText || body.textContent || '')
              .replace(/\s+/g, ' ')
              .trim()
              .substring(0, 4000);
          }
        });
        _360.pageText = result?.[0]?.result || '';
      }
    } catch (_) {}

    render360StatusPanel();
  });

  // Editar contexto
  document.getElementById('tab360-edit-btn')?.addEventListener('click', () => {
    document.getElementById('tab360-questions').style.display = 'flex';
    document.getElementById('tab360-status-panel').style.display = 'none';
  });

  // Botões de IA — copia prompt e abre a IA em branco
  document.querySelectorAll('.tab360-ai-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ai = btn.dataset.ai;
      // Claude recebe prompt que pede HTML visual; demais recebem prompt de texto
      const prompt = ai === 'claude' ? build360PromptClaude() : build360Prompt();

      const urls = {
        chatgpt:    'https://chatgpt.com/',
        claude:     'https://claude.ai/new',
        gemini:     'https://gemini.google.com/app',
        perplexity: 'https://www.perplexity.ai/',
      };

      // Copia para clipboard
      try {
        await navigator.clipboard.writeText(prompt);
      } catch (_) {}

      // Feedback visual no botão
      const original = btn.innerHTML;
      const label = ai === 'claude' ? 'Copiado! Cole e peça HTML' : 'Copiado!';
      btn.innerHTML = btn.innerHTML.replace(/ChatGPT|Claude|Gemini|Perplexity/, label);
      btn.style.opacity = '0.7';
      setTimeout(() => {
        btn.innerHTML = original;
        btn.style.opacity = '';
        if (urls[ai]) chrome.tabs.create({ url: urls[ai] });
      }, 1200);
    });
  });
}

// init360Tab agora é chamado apenas se a aba 360 ainda existir (legado)
// Para o Bob, usar bob360Init() + bob360Open()

// ── Card 360° embutido no Bob ─────────────────────────────────────────────────

function bob360Init() {
  // Chips Q1
  document.querySelectorAll('#b360-q1-chips .b360-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#b360-q1-chips .b360-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      const custom = document.getElementById('b360-q1-custom');
      if (chip.dataset.val === 'Outro') {
        custom.style.display = 'block';
        custom.focus();
        _360.objetivo = '';
      } else {
        custom.style.display = 'none';
        _360.objetivo = chip.dataset.val;
      }
    });
  });

  document.getElementById('b360-q1-custom')?.addEventListener('input', e => {
    _360.objetivo = e.target.value.trim();
  });

  document.getElementById('b360-q2-keyword')?.addEventListener('input', e => {
    _360.keyword = e.target.value.trim();
  });

  // Botão Gerar diagnóstico
  document.getElementById('bob-360-run-btn')?.addEventListener('click', async () => {
    // Garantir objetivo padrão se não selecionou
    if (!_360.objetivo) {
      const firstChip = document.querySelector('#b360-q1-chips .b360-chip');
      firstChip?.classList.add('selected');
      _360.objetivo = firstChip?.dataset.val || 'Vender serviço';
    }

    // Esconder o card 360° e os chips
    document.getElementById('bob-360-card').style.display = 'none';

    // Extrair texto da página
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const body = document.body.cloneNode(true);
            ['script','style','nav','footer','header','noscript','svg'].forEach(tag => {
              body.querySelectorAll(tag).forEach(el => el.remove());
            });
            return (body.innerText || body.textContent || '')
              .replace(/\s+/g, ' ').trim().substring(0, 4000);
          }
        });
        _360.pageText = result?.[0]?.result || '';
      }
    } catch (_) {}

    // Montar e enviar mensagem ao Bob com contexto 360°
    const obj = _360.objetivo || 'Não informado';
    const kw  = _360.keyword  || 'Não informada';
    const msg = `Quero uma consultoria rápida desta página. Objetivo: ${obj}. Palavra-chave: ${kw}.

Responda como um consultor falando com o dono do negócio — sem jargão técnico, sem tabelas, sem listas enormes.

Estrutura da resposta (máximo 250 palavras no total):

1. Uma frase dizendo o que a página faz bem (algo positivo real)
2. Os 3 problemas mais urgentes, cada um com:
   - O problema em linguagem simples (o que está errado)
   - Por que isso prejudica o negócio (consequência real, não técnica)
   - O que fazer (ação concreta e simples)
3. Uma frase de encerramento com o próximo passo mais importante

Não use markdown pesado, não crie tabelas, não numere subtópicos. Escreva como se estivesse numa reunião de consultoria.`;

    sendBobMessage(msg);
  });
}

function bob360Open() {
  const card = document.getElementById('bob-360-card');
  if (!card) return;
  // Resetar estado
  _360.objetivo = '';
  _360.keyword  = '';
  document.querySelectorAll('#b360-q1-chips .b360-chip').forEach(c => c.classList.remove('selected'));
  const custom = document.getElementById('b360-q1-custom');
  if (custom) { custom.style.display = 'none'; custom.value = ''; }
  const kw = document.getElementById('b360-q2-keyword');
  if (kw) kw.value = '';
  // Mostrar card
  card.style.display = 'block';
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Card educativo Links — "O que é Link Interno?" toggle
document.addEventListener('DOMContentLoaded', () => {
  const toggle  = document.getElementById('links-what-toggle');
  const body    = document.getElementById('links-what-body');
  const chevron = toggle?.querySelector('.links-edu-chevron');
  if (!toggle || !body) return;
  toggle.addEventListener('click', () => {
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'flex';
    if (chevron) chevron.classList.toggle('open', !open);
  });
});

// Card educativo Headings — toggle
document.addEventListener('DOMContentLoaded', () => {
  const toggle  = document.getElementById('headings-edu-toggle');
  const body    = document.getElementById('headings-edu-body');
  const chevron = toggle?.querySelector('.links-edu-chevron');
  if (!toggle || !body) return;
  toggle.addEventListener('click', () => {
    const open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'flex';
    if (chevron) chevron.classList.toggle('open', !open);
  });
});

// ══════════════════════════════════════════════════════════════
// ABA CONFIG — Configurações (SERP tools + API keys)
// ══════════════════════════════════════════════════════════════

const CFG_TOOLS_KEY = 'seo_tools_enabled';
const CFG_KEYS_KEY  = 'seo_api_keys';

document.addEventListener('DOMContentLoaded', () => {
  const cbPaa = document.getElementById('cfg-paa');
  const cbAio = document.getElementById('cfg-aio');
  if (!cbPaa || !cbAio) return;

  // ── Carrega toggles SERP ──────────────────────────────────────
  chrome.storage.local.get(CFG_TOOLS_KEY, data => {
    const t = data[CFG_TOOLS_KEY] || {};
    cbPaa.checked = !!t.paa;
    cbAio.checked = !!t.aio;
  });

  function saveToggles() {
    chrome.storage.local.set({ [CFG_TOOLS_KEY]: { paa: cbPaa.checked, aio: cbAio.checked } });
  }
  cbPaa.addEventListener('change', saveToggles);
  cbAio.addEventListener('change', saveToggles);

  // ── Carrega API keys ──────────────────────────────────────────
  const keyIds = ['openai', 'anthropic', 'gemini', 'perplexity'];
  chrome.storage.local.get(CFG_KEYS_KEY, data => {
    const keys = data[CFG_KEYS_KEY] || {};
    keyIds.forEach(id => {
      const el = document.getElementById(`cfg-key-${id}`);
      if (el && keys[id]) el.value = keys[id];
    });
  });

  // ── Mostrar/ocultar senha ─────────────────────────────────────
  document.querySelectorAll('.cfg-eye-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  // ── Salvar API keys ───────────────────────────────────────────
  document.getElementById('cfg-save-btn')?.addEventListener('click', () => {
    const keys = {};
    keyIds.forEach(id => {
      const val = document.getElementById(`cfg-key-${id}`)?.value.trim();
      if (val) keys[id] = val;
    });
    chrome.storage.local.set({ [CFG_KEYS_KEY]: keys }, () => {
      const ok = document.getElementById('cfg-save-ok');
      if (!ok) return;
      ok.style.display = 'inline';
      setTimeout(() => { ok.style.display = 'none'; }, 2000);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// ABA INDEX — Indexação no Google (site:dominio)
// ══════════════════════════════════════════════════════════════

const IDX_KEY      = 'seo_index_data';
let _idxDotsTimer  = null;
let _idxListener   = null;
let _idxActiveDomain = '';

// ── UI helpers ────────────────────────────────────────────────

function idxShowState(state) {
  document.getElementById('idx-state-idle').style.display    = state === 'idle'    ? 'flex' : 'none';
  document.getElementById('idx-state-waiting').style.display = state === 'waiting' ? 'flex' : 'none';
  document.getElementById('idx-result').style.display        = state === 'result'  ? 'block': 'none';
}

function idxStatusBar(count) {
  const bar = document.getElementById('idx-status-bar');
  if (!bar) return;
  if (count === 0) {
    bar.className   = 'idx-status-bar idx-status-bar--red';
    bar.textContent = 'Nenhuma página encontrada. O site pode estar bloqueado para o Google.';
  } else if (count < 10) {
    bar.className   = 'idx-status-bar idx-status-bar--yellow';
    bar.textContent = 'Poucas páginas indexadas. Verifique o sitemap.xml.';
  } else if (count < 50) {
    bar.className   = 'idx-status-bar idx-status-bar--yellow';
    bar.textContent = 'Indexação parcial. O Google ainda está descobrindo o conteúdo.';
  } else {
    bar.className   = 'idx-status-bar idx-status-bar--green';
    bar.textContent = `Boa cobertura. ${count.toLocaleString('pt-BR')} páginas indexadas.`;
  }
}

function idxRenderResult(data) {
  const accum = data.accumulated || [];
  const count = accum.length;

  if (!data.done) {
    // Em progresso — só atualiza o contador ao vivo no estado waiting
    const liveNum = document.getElementById('idx-live-num');
    if (liveNum) liveNum.textContent = count.toLocaleString('pt-BR');
    const sub = document.getElementById('idx-crawling-sub');
    if (sub) sub.textContent = `Página ${(data.page || 0) + 1} de ?`;
    return;
  }

  // Finalizado — renderiza resultado completo
  idxStopDotsTimer();

  document.getElementById('idx-count-number').textContent = count.toLocaleString('pt-BR');
  document.getElementById('idx-count-domain').textContent = `site:${data.domain}`;
  idxStatusBar(count);

  const list = document.getElementById('idx-results-list');
  if (list) {
    list.innerHTML = count === 0
      ? '<p class="idx-no-results">Nenhuma URL indexada encontrada.</p>'
      : accum.map((r, i) => `
          <div class="idx-result-item">
            <div class="idx-result-num">${i + 1}</div>
            <div class="idx-result-body">
              <a class="idx-result-url" href="${escHtml(r.url)}" target="_blank">${escHtml(r.url)}</a>
              ${r.title ? `<div class="idx-result-title">${escHtml(r.title)}</div>` : ''}
            </div>
          </div>`).join('');
  }

  idxShowState('result');
}

function idxStopDotsTimer() {
  clearInterval(_idxDotsTimer);
  _idxDotsTimer = null;
}

function idxStopListener() {
  if (_idxListener) {
    chrome.storage.onChanged.removeListener(_idxListener);
    _idxListener = null;
  }
}

// ── Inicia crawl — delega ao background ──────────────────────

function idxStartCrawl(domain, path) {
  _idxActiveDomain = domain;
  const query = path ? `site:${domain}${path}` : `site:${domain}`;

  idxStopListener();
  idxStopDotsTimer();
  idxShowState('waiting');

  const sub = document.querySelector('#idx-state-waiting .idx-state-sub');
  if (sub) sub.textContent = 'Abrindo Google...';

  // Anima pontos
  let dots = 0;
  _idxDotsTimer = setInterval(() => {
    const el = document.querySelector('#idx-state-waiting .idx-dots');
    if (el) el.textContent = '.'.repeat((++dots % 3) + 1);
  }, 500);

  // Manda pro background — ele vive mesmo com popup fechado
  chrome.runtime.sendMessage({ action: 'startIndexCrawl', domain, query });

  // Escuta atualizações do storage vindas do background
  _idxListener = (changes, area) => {
    if (area !== 'local' || !changes[IDX_KEY]) return;
    const data = changes[IDX_KEY].newValue;
    if (!data || data.domain !== _idxActiveDomain) return;
    idxRenderResult(data);
  };
  chrome.storage.onChanged.addListener(_idxListener);
}

// ── Init ──────────────────────────────────────────────────────

function initIndexTab() {
  const input = document.getElementById('idx-url-input');
  if (!input) return;

  if (!input.dataset.initialized) {
    input.dataset.initialized = '1';

    // Auto-fill com domínio da aba analisada
    try {
      const pageUrl = _analyzedPageUrl || graphData?.url || '';
      if (pageUrl) {
        const host = new URL(pageUrl).hostname.replace(/^www\./, '');
        if (host) input.value = host;
      }
    } catch (_) {}

    function parseDomain() {
      return input.value.trim()
        .replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
    }

    document.getElementById('idx-run-btn').addEventListener('click', () => {
      const d = parseDomain();
      if (!d) return;
      idxStartCrawl(d, '');
    });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('idx-run-btn').click();
    });

    document.getElementById('idx-rerun-btn')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'stopIndexCrawl' });
      idxStopListener();
      idxStopDotsTimer();
      idxShowState('idle');
    });

    document.getElementById('idx-stop-btn')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'stopIndexCrawl' });
      idxStopListener();
      idxStopDotsTimer();
      idxShowState('idle');
    });

    // Filtros rápidos
    document.querySelectorAll('.idx-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.idx-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const customInput = document.getElementById('idx-filter-custom-input');
        if (btn.dataset.path === 'custom') {
          customInput.style.display = 'block';
          customInput.focus();
          customInput.addEventListener('keydown', function h(e) {
            if (e.key !== 'Enter') return;
            customInput.removeEventListener('keydown', h);
            customInput.style.display = 'none';
            const path = customInput.value.trim();
            const d = parseDomain();
            if (d) idxStartCrawl(d, path.startsWith('/') ? path : '/' + path);
          });
        } else {
          customInput.style.display = 'none';
          const d = parseDomain();
          if (d) idxStartCrawl(d, btn.dataset.path);
        }
      });
    });
  }

  // Ao abrir a aba, verifica se há resultado salvo
  const d = (input.value || '').trim()
    .replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
  if (d) {
    chrome.storage.local.get(IDX_KEY, stored => {
      const s = stored[IDX_KEY];
      if (!s || s.domain !== d) return;
      _idxActiveDomain = d;
      if (s.done) {
        idxRenderResult(s);
      } else {
        // Crawl em andamento — reconecta o listener
        idxShowState('waiting');
        const sub = document.querySelector('#idx-state-waiting .idx-state-sub');
        if (sub) sub.textContent = `Página ${(s.page || 0) + 1} — ${s.total || 0} URLs encontradas`;
        _idxListener = (changes, area) => {
          if (area !== 'local' || !changes[IDX_KEY]) return;
          const data = changes[IDX_KEY].newValue;
          if (!data || data.domain !== d) return;
          idxRenderResult(data);
        };
        chrome.storage.onChanged.addListener(_idxListener);
      }
    });
  }
}

// ══════════════════════════════════════════════════════════════
// SCHEMA — Sub-tab switcher (Validate / Generate)
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Sub-tab switching
  document.querySelectorAll('.schema-subtab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.schema-subtab').forEach(b => b.classList.remove('schema-subtab--active'));
      btn.classList.add('schema-subtab--active');
      const sub = btn.dataset.subtab;
      document.getElementById('schema-pane-validate').style.display = sub === 'validate' ? '' : 'none';
      document.getElementById('schema-pane-generate').style.display = sub === 'generate' ? '' : 'none';
      if (sub === 'generate') initSchemaGenerate();
    });
  });
});

// ══════════════════════════════════════════════════════════════
// SCHEMA GENERATE — 10 templates + auto-fill + inject
// ══════════════════════════════════════════════════════════════

const SG_FIELDS = {
  LocalBusiness: [
    { id: 'name',         label: 'Nome do negócio',   ph: 'ex: Move Máquinas',         req: true  },
    { id: 'telephone',    label: 'Telefone',           ph: 'ex: (62) 99999-9999',       req: true  },
    { id: 'url',          label: 'Website',            ph: 'https://movemaquinas.com.br', req: false },
    { id: 'street',       label: 'Rua / número',       ph: 'ex: Rua das Empilhadeiras, 10', req: false },
    { id: 'city',         label: 'Cidade',             ph: 'ex: Goiânia',               req: false },
    { id: 'state',        label: 'Estado (sigla)',     ph: 'ex: GO',                    req: false },
    { id: 'priceRange',   label: 'Faixa de preço',     ph: 'ex: $$',                    req: false },
    { id: 'image',        label: 'URL da imagem',      ph: 'https://...',               req: false },
    { id: 'description',  label: 'Descrição',          ph: '',                          req: false, textarea: true },
  ],
  Organization: [
    { id: 'name',         label: 'Nome',               ph: '',  req: true  },
    { id: 'url',          label: 'Website',            ph: 'https://', req: true },
    { id: 'logo',         label: 'URL do logo',        ph: 'https://...', req: false },
    { id: 'description',  label: 'Descrição',          ph: '', req: false, textarea: true },
    { id: 'telephone',    label: 'Telefone',           ph: '', req: false },
    { id: 'email',        label: 'E-mail',             ph: '', req: false },
    { id: 'sameAs',       label: 'Redes sociais (URLs separadas por vírgula)', ph: '', req: false },
  ],
  Article: [
    { id: 'headline',     label: 'Título do artigo',   ph: '', req: true  },
    { id: 'author',       label: 'Autor (nome)',        ph: '', req: true  },
    { id: 'datePublished',label: 'Data de publicação', ph: 'YYYY-MM-DD', req: true  },
    { id: 'dateModified', label: 'Data de modificação',ph: 'YYYY-MM-DD', req: false },
    { id: 'image',        label: 'URL da imagem',      ph: 'https://...', req: false },
    { id: 'description',  label: 'Descrição',          ph: '', req: false, textarea: true },
    { id: 'publisher',    label: 'Publisher (organização)', ph: '', req: false },
  ],
  Product: [
    { id: 'name',         label: 'Nome do produto',    ph: '', req: true  },
    { id: 'description',  label: 'Descrição',          ph: '', req: false, textarea: true },
    { id: 'image',        label: 'URL da imagem',      ph: 'https://...', req: false },
    { id: 'brand',        label: 'Marca',              ph: '', req: false },
    { id: 'sku',          label: 'SKU',                ph: '', req: false },
    { id: 'price',        label: 'Preço',              ph: 'ex: 199.90', req: false },
    { id: 'currency',     label: 'Moeda',              ph: 'BRL', req: false },
    { id: 'availability', label: 'Disponibilidade',    ph: 'InStock / OutOfStock', req: false },
  ],
  FAQPage: [
    { id: 'q1', label: 'Pergunta 1', ph: 'Como funciona...?', req: true },
    { id: 'a1', label: 'Resposta 1', ph: '', req: true, textarea: true },
    { id: 'q2', label: 'Pergunta 2', ph: '', req: false },
    { id: 'a2', label: 'Resposta 2', ph: '', req: false, textarea: true },
    { id: 'q3', label: 'Pergunta 3', ph: '', req: false },
    { id: 'a3', label: 'Resposta 3', ph: '', req: false, textarea: true },
  ],
  BreadcrumbList: [
    { id: 'bc1name', label: 'Nível 1 — Nome', ph: 'Home', req: true },
    { id: 'bc1url',  label: 'Nível 1 — URL',  ph: 'https://...', req: true },
    { id: 'bc2name', label: 'Nível 2 — Nome', ph: '', req: false },
    { id: 'bc2url',  label: 'Nível 2 — URL',  ph: '', req: false },
    { id: 'bc3name', label: 'Nível 3 — Nome', ph: '', req: false },
    { id: 'bc3url',  label: 'Nível 3 — URL',  ph: '', req: false },
  ],
  Person: [
    { id: 'name',      label: 'Nome completo',   ph: '', req: true  },
    { id: 'jobTitle',  label: 'Cargo',           ph: '', req: false },
    { id: 'url',       label: 'Website/perfil',  ph: 'https://...', req: false },
    { id: 'email',     label: 'E-mail',          ph: '', req: false },
    { id: 'telephone', label: 'Telefone',        ph: '', req: false },
    { id: 'image',     label: 'URL da foto',     ph: 'https://...', req: false },
    { id: 'worksFor',  label: 'Empresa',         ph: '', req: false },
    { id: 'sameAs',    label: 'Redes sociais (URLs separadas por vírgula)', ph: '', req: false },
  ],
  Event: [
    { id: 'name',        label: 'Nome do evento',   ph: '', req: true  },
    { id: 'startDate',   label: 'Data de início',   ph: 'YYYY-MM-DDTHH:MM', req: true  },
    { id: 'endDate',     label: 'Data de término',  ph: 'YYYY-MM-DDTHH:MM', req: false },
    { id: 'locName',     label: 'Nome do local',    ph: '', req: true  },
    { id: 'locAddress',  label: 'Endereço do local',ph: '', req: false },
    { id: 'description', label: 'Descrição',        ph: '', req: false, textarea: true },
    { id: 'image',       label: 'URL da imagem',    ph: 'https://...', req: false },
    { id: 'price',       label: 'Preço (entrada)',  ph: '', req: false },
    { id: 'currency',    label: 'Moeda',            ph: 'BRL', req: false },
  ],
  HowTo: [
    { id: 'name',        label: 'Título do guia',   ph: 'Como fazer...', req: true  },
    { id: 'description', label: 'Descrição',        ph: '', req: false, textarea: true },
    { id: 'totalTime',   label: 'Tempo total',      ph: 'ex: PT30M', req: false },
    { id: 'image',       label: 'URL da imagem',    ph: 'https://...', req: false },
    { id: 'step1name',   label: 'Passo 1 — Título', ph: '', req: true  },
    { id: 'step1text',   label: 'Passo 1 — Desc.',  ph: '', req: true, textarea: true },
    { id: 'step2name',   label: 'Passo 2 — Título', ph: '', req: false },
    { id: 'step2text',   label: 'Passo 2 — Desc.',  ph: '', req: false, textarea: true },
    { id: 'step3name',   label: 'Passo 3 — Título', ph: '', req: false },
    { id: 'step3text',   label: 'Passo 3 — Desc.',  ph: '', req: false, textarea: true },
  ],
  WebSite: [
    { id: 'name',         label: 'Nome do site',    ph: '', req: true  },
    { id: 'url',          label: 'URL',             ph: 'https://...', req: true  },
    { id: 'description',  label: 'Descrição',       ph: '', req: false, textarea: true },
    { id: 'searchUrl',    label: 'URL de busca (SearchAction)', ph: 'https://site.com/busca?q={search_term_string}', req: false },
  ],
};

// Extrai dados da página para auto-fill
// Extrai schema existente da página por tipo
function _existingSchema(data, ...types) {
  for (const s of (data.schemas || [])) {
    const raw = typeof s.raw === 'string' ? (() => { try { return JSON.parse(s.raw); } catch { return null; } })() : s.raw;
    if (!raw) continue;
    if (types.some(t => (s.types || []).includes(t) || [].concat(raw['@type'] || []).includes(t))) return raw;
  }
  return null;
}

// Extrai valor seguro de objeto aninhado
function _pick(obj, ...path) {
  let v = obj;
  for (const k of path) { if (!v || typeof v !== 'object') return ''; v = v[k]; }
  return (typeof v === 'string' ? v : '') || '';
}

const SG_AUTOFILL = {
  LocalBusiness: data => {
    const existing = _existingSchema(data, 'LocalBusiness', 'ProfessionalService', 'Organization');
    const cleanTitle = data.title?.replace(/\s*[|·\-–—].*$/, '').trim() || '';
    const addr = existing?.address || {};
    return {
      name:        existing?.name        || cleanTitle,
      telephone:   existing?.telephone   || '',
      url:         existing?.url         || data.url || '',
      description: existing?.description || data.description || '',
      image:       existing?.image       || data.ogImage || '',
      priceRange:  existing?.priceRange  || '',
      street:      addr.streetAddress    || '',
      city:        addr.addressLocality  || '',
      state:       addr.addressRegion    || '',
    };
  },

  Organization: data => {
    const existing = _existingSchema(data, 'Organization', 'LocalBusiness');
    const cleanTitle = data.title?.replace(/\s*[|·\-–—].*$/, '').trim() || '';
    const origin = (() => { try { return new URL(data.url).origin; } catch { return ''; } })();
    const sameAs = Array.isArray(existing?.sameAs) ? existing.sameAs.join(', ') : (existing?.sameAs || '');
    return {
      name:        existing?.name        || cleanTitle,
      url:         existing?.url         || origin,
      logo:        _pick(existing, 'logo', 'url') || existing?.logo || '',
      description: existing?.description || data.description || '',
      telephone:   existing?.telephone   || '',
      email:       existing?.email       || '',
      sameAs,
    };
  },

  Article: data => {
    const existing = _existingSchema(data, 'Article', 'NewsArticle', 'BlogPosting');
    return {
      headline:      existing?.headline      || data.title || '',
      description:   existing?.description   || data.description || '',
      datePublished: existing?.datePublished  || new Date().toISOString().slice(0, 10),
      dateModified:  existing?.dateModified   || '',
      image:         _pick(existing, 'image', 'url') || existing?.image || data.ogImage || '',
      author:        _pick(existing, 'author', 'name') || existing?.author || '',
      publisher:     _pick(existing, 'publisher', 'name') || existing?.publisher || '',
    };
  },

  Product: data => {
    const existing = _existingSchema(data, 'Product');
    const offer = Array.isArray(existing?.offers) ? existing.offers[0] : existing?.offers;
    return {
      name:         existing?.name        || data.title?.replace(/\s*[|·\-–—].*$/, '').trim() || '',
      description:  existing?.description || data.description || '',
      image:        _pick(existing, 'image', 'url') || existing?.image || data.ogImage || '',
      brand:        _pick(existing, 'brand', 'name') || '',
      sku:          existing?.sku         || '',
      price:        offer?.price          || '',
      currency:     offer?.priceCurrency  || 'BRL',
      availability: offer?.availability?.replace('https://schema.org/', '') || 'InStock',
    };
  },

  FAQPage: data => {
    const existing = _existingSchema(data, 'FAQPage');
    const result = {};
    // Primeiro tenta pegar perguntas do schema existente
    const existingQs = Array.isArray(existing?.mainEntity) ? existing.mainEntity : [];
    existingQs.slice(0, 3).forEach((q, i) => {
      result[`q${i+1}`] = q.name || '';
      result[`a${i+1}`] = _pick(q, 'acceptedAnswer', 'text') || '';
    });
    // Se não encontrou, usa headings com formato de pergunta
    if (!existingQs.length) {
      (data.headingNodes || [])
        .filter(h => (h.level === 'h2' || h.level === 'h3') && /[?？]$|^(como|por que|o que|qual|quando|onde)/i.test(h.text))
        .slice(0, 3)
        .forEach((h, i) => { result[`q${i+1}`] = h.text; });
    }
    return result;
  },

  Person: data => {
    const existing = _existingSchema(data, 'Person');
    const sameAs = Array.isArray(existing?.sameAs) ? existing.sameAs.join(', ') : (existing?.sameAs || '');
    return {
      name:     existing?.name     || '',
      jobTitle: existing?.jobTitle || '',
      url:      existing?.url      || data.url || '',
      email:    existing?.email    || '',
      image:    _pick(existing, 'image', 'url') || existing?.image || data.ogImage || '',
      worksFor: _pick(existing, 'worksFor', 'name') || '',
      sameAs,
    };
  },

  WebSite: data => {
    const existing = _existingSchema(data, 'WebSite');
    const origin = (() => { try { return new URL(data.url).origin; } catch { return ''; } })();
    const searchUrl = _pick(existing, 'potentialAction', 'target') || '';
    return {
      name:        existing?.name        || data.title?.replace(/\s*[|·\-–—].*$/, '').trim() || '',
      url:         existing?.url         || origin,
      description: existing?.description || data.description || '',
      searchUrl,
    };
  },

  Event: data => {
    const existing = _existingSchema(data, 'Event');
    const offer = Array.isArray(existing?.offers) ? existing.offers[0] : existing?.offers;
    return {
      name:        existing?.name        || data.title?.replace(/\s*[|·\-–—].*$/, '').trim() || '',
      startDate:   existing?.startDate   || '',
      endDate:     existing?.endDate     || '',
      description: existing?.description || data.description || '',
      image:       _pick(existing, 'image', 'url') || existing?.image || data.ogImage || '',
      locName:     _pick(existing, 'location', 'name') || '',
      locAddress:  _pick(existing, 'location', 'address', 'streetAddress') || '',
      price:       offer?.price || '',
      currency:    offer?.priceCurrency || 'BRL',
    };
  },
};

// Constrói o schema JSON a partir dos valores do form
function buildSchemaFromForm(type) {
  const val = id => (document.getElementById(`sg-field-${id}`)?.value || '').trim();

  const base = { '@context': 'https://schema.org', '@type': type };

  const builders = {
    LocalBusiness: () => ({
      ...base,
      name: val('name'),
      ...(val('telephone') && { telephone: val('telephone') }),
      ...(val('url')       && { url: val('url') }),
      ...(val('image')     && { image: val('image') }),
      ...(val('priceRange')&& { priceRange: val('priceRange') }),
      ...(val('description')&&{ description: val('description') }),
      ...(val('street')    && { address: {
        '@type': 'PostalAddress',
        streetAddress: val('street'),
        addressLocality: val('city'),
        addressRegion: val('state'),
      }}),
    }),
    Organization: () => ({
      ...base,
      name: val('name'),
      url:  val('url'),
      ...(val('logo')       && { logo: { '@type': 'ImageObject', url: val('logo') } }),
      ...(val('description')&& { description: val('description') }),
      ...(val('telephone')  && { telephone: val('telephone') }),
      ...(val('email')      && { email: val('email') }),
      ...(val('sameAs')     && { sameAs: val('sameAs').split(',').map(s => s.trim()).filter(Boolean) }),
    }),
    Article: () => ({
      ...base,
      headline: val('headline'),
      author: { '@type': 'Person', name: val('author') },
      datePublished: val('datePublished'),
      ...(val('dateModified') && { dateModified: val('dateModified') }),
      ...(val('image')        && { image: val('image') }),
      ...(val('description')  && { description: val('description') }),
      ...(val('publisher')    && { publisher: { '@type': 'Organization', name: val('publisher') } }),
    }),
    Product: () => ({
      ...base,
      name: val('name'),
      ...(val('description')  && { description: val('description') }),
      ...(val('image')        && { image: val('image') }),
      ...(val('brand')        && { brand: { '@type': 'Brand', name: val('brand') } }),
      ...(val('sku')          && { sku: val('sku') }),
      ...(val('price')        && { offers: {
        '@type': 'Offer',
        price: val('price'),
        priceCurrency: val('currency') || 'BRL',
        availability: `https://schema.org/${val('availability') || 'InStock'}`,
      }}),
    }),
    FAQPage: () => ({
      ...base,
      mainEntity: [1,2,3]
        .filter(n => val(`q${n}`) && val(`a${n}`))
        .map(n => ({
          '@type': 'Question',
          name: val(`q${n}`),
          acceptedAnswer: { '@type': 'Answer', text: val(`a${n}`) },
        })),
    }),
    BreadcrumbList: () => ({
      ...base,
      itemListElement: [1,2,3]
        .filter(n => val(`bc${n}name`) && val(`bc${n}url`))
        .map((n, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: val(`bc${n}name`),
          item: val(`bc${n}url`),
        })),
    }),
    Person: () => ({
      ...base,
      name: val('name'),
      ...(val('jobTitle')  && { jobTitle: val('jobTitle') }),
      ...(val('url')       && { url: val('url') }),
      ...(val('email')     && { email: val('email') }),
      ...(val('telephone') && { telephone: val('telephone') }),
      ...(val('image')     && { image: val('image') }),
      ...(val('worksFor')  && { worksFor: { '@type': 'Organization', name: val('worksFor') } }),
      ...(val('sameAs')    && { sameAs: val('sameAs').split(',').map(s => s.trim()).filter(Boolean) }),
    }),
    Event: () => ({
      ...base,
      name: val('name'),
      startDate: val('startDate'),
      ...(val('endDate')      && { endDate: val('endDate') }),
      location: {
        '@type': 'Place',
        name: val('locName'),
        ...(val('locAddress') && { address: val('locAddress') }),
      },
      ...(val('description')  && { description: val('description') }),
      ...(val('image')        && { image: val('image') }),
      ...(val('price')        && { offers: { '@type': 'Offer', price: val('price'), priceCurrency: val('currency') || 'BRL' } }),
    }),
    HowTo: () => ({
      ...base,
      name: val('name'),
      ...(val('description') && { description: val('description') }),
      ...(val('totalTime')   && { totalTime: val('totalTime') }),
      ...(val('image')       && { image: val('image') }),
      step: [1,2,3]
        .filter(n => val(`step${n}name`))
        .map(n => ({
          '@type': 'HowToStep',
          name: val(`step${n}name`),
          text: val(`step${n}text`),
        })),
    }),
    WebSite: () => ({
      ...base,
      name: val('name'),
      url:  val('url'),
      ...(val('description') && { description: val('description') }),
      ...(val('searchUrl')   && { potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: val('searchUrl') },
        'query-input': 'required name=search_term_string',
      }}),
    }),
  };

  const schema = (builders[type] || (() => base))();

  // Aplica custom fields
  document.querySelectorAll('.sg-custom-row').forEach(row => {
    const k = row.querySelector('.sg-custom-key')?.value?.trim();
    const v = row.querySelector('.sg-custom-val')?.value?.trim();
    if (k && v) {
      try { schema[k] = JSON.parse(v); } catch { schema[k] = v; }
    }
  });

  // Remove campos vazios recursivamente
  function removeEmpty(obj) {
    if (Array.isArray(obj)) return obj.map(removeEmpty).filter(v => v !== '' && v != null);
    if (typeof obj === 'object' && obj !== null) {
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        const cleaned = removeEmpty(v);
        if (cleaned !== '' && cleaned != null && !(Array.isArray(cleaned) && cleaned.length === 0)) out[k] = cleaned;
      }
      return out;
    }
    return obj;
  }
  return removeEmpty(schema);
}

let _sgActiveType = 'LocalBusiness';
let _sgInitialized = false;

function initSchemaGenerate() {
  if (_sgInitialized) return;
  _sgInitialized = true;

  // Type buttons
  document.querySelectorAll('.sg-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sg-type-btn').forEach(b => b.classList.remove('sg-type-btn--active'));
      btn.classList.add('sg-type-btn--active');
      _sgActiveType = btn.dataset.stype;
      renderSchemaForm(_sgActiveType);
      document.getElementById('sg-output').style.display = 'none';
    });
  });

  // Add custom field
  document.getElementById('sg-add-custom')?.addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'sg-custom-row';
    row.innerHTML = `
      <input class="sg-custom-key sg-input" type="text" placeholder="campo">
      <input class="sg-custom-val sg-input" type="text" placeholder="valor">
      <button class="sg-custom-remove" title="Remover">✕</button>
    `;
    row.querySelector('.sg-custom-remove').addEventListener('click', () => row.remove());
    document.getElementById('sg-custom-rows').appendChild(row);
  });

  // Auto-fill
  // Auto-Completar Informações
  document.getElementById('sg-autofill-btn')?.addEventListener('click', () => {
    if (!graphData) return;
    const fillFn = SG_AUTOFILL[_sgActiveType];
    if (!fillFn) return;
    const filled = fillFn(graphData);
    let count = 0;
    Object.entries(filled).forEach(([id, val]) => {
      const el = document.getElementById(`sg-field-${id}`);
      if (el && val) { el.value = val; count++; }
    });
    const btn = document.getElementById('sg-autofill-btn');
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ${count} campos preenchidos`;
    btn.classList.add('sg-btn--ok');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('sg-btn--ok'); }, 2500);
  });

  // Gerar Schema — mostra output + barra de IA
  document.getElementById('sg-generate-btn')?.addEventListener('click', () => {
    const schema = buildSchemaFromForm(_sgActiveType);
    const json = JSON.stringify(schema, null, 2);
    const out  = document.getElementById('sg-output');
    const code = document.getElementById('sg-output-code');
    const aiBar = document.getElementById('sg-ai-bar');
    if (code) code.textContent = json;
    if (out)  out.style.display = '';
    if (aiBar) aiBar.style.display = '';
  });

  // Gerar com IA — monta prompt e abre na IA escolhida
  function buildAiPrompt() {
    const json = document.getElementById('sg-output-code')?.textContent || '';
    const pageUrl = graphData?.url || '';
    const pageTitle = graphData?.title || '';
    const type = _sgActiveType;
    return `Você é um especialista em SEO técnico e dados estruturados (schema.org).

Analise o JSON-LD abaixo do tipo "${type}" e melhore-o com base nas diretrizes oficiais do Google Search Central (https://developers.google.com/search/docs/appearance/structured-data/${type.toLowerCase()}).

**Página:** ${pageTitle}
**URL:** ${pageUrl}

**Schema atual:**
\`\`\`json
${json}
\`\`\`

**O que fazer:**
1. Preencha todos os campos obrigatórios e recomendados que estiverem ausentes
2. Corrija formatos incorretos (datas ISO 8601, URLs absolutas, etc.)
3. Adicione campos que aumentam a elegibilidade para rich results
4. Mantenha os valores já preenchidos — apenas complemente
5. Retorne APENAS o JSON-LD completo e válido, sem explicações adicionais

**Retorne o JSON-LD melhorado:**`;
  }

  ['chatgpt', 'claude', 'gemini'].forEach(ai => {
    document.getElementById(`sg-ai-${ai}`)?.addEventListener('click', () => {
      const prompt = buildAiPrompt();
      const encoded = encodeURIComponent(prompt);
      const urls = {
        chatgpt: `https://chatgpt.com/?q=${encoded}`,
        claude:  `https://claude.ai/new?q=${encoded}`,
        gemini:  `https://gemini.google.com/app?q=${encoded}`,
      };
      chrome.tabs.create({ url: urls[ai] });
    });
  });

  // Copy
  document.getElementById('sg-copy-btn')?.addEventListener('click', () => {
    const code = document.getElementById('sg-output-code')?.textContent || '';
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('sg-copy-btn');
      const orig = btn.innerHTML;
      btn.innerHTML = '✓ Copiado!';
      btn.classList.add('sg-btn--ok');
      setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('sg-btn--ok'); }, 2000);
    });
  });

  // Inject na página
  document.getElementById('sg-inject-btn')?.addEventListener('click', async () => {
    const code = document.getElementById('sg-output-code')?.textContent || '';
    if (!code) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (jsonText) => {
        const existing = document.querySelector('script[data-seo-injected]');
        if (existing) existing.remove();
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute('data-seo-injected', '1');
        script.textContent = jsonText;
        document.head.appendChild(script);
        return true;
      },
      args: [code],
    });
    // Feedback
    const btn = document.getElementById('sg-inject-btn');
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Injetado!';
    btn.classList.add('sg-btn--ok');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('sg-btn--ok'); }, 2500);
  });

  // Render form inicial
  renderSchemaForm(_sgActiveType);
}

function renderSchemaForm(type) {
  const container = document.getElementById('sg-form');
  if (!container) return;
  const fields = SG_FIELDS[type] || [];
  container.innerHTML = fields.map(f => `
    <div class="sg-field-row">
      <label class="sg-label" for="sg-field-${f.id}">
        ${escHtml(f.label)}
        ${f.req ? '<span class="sg-req">*</span>' : ''}
      </label>
      ${f.textarea
        ? `<textarea class="sg-input sg-textarea" id="sg-field-${f.id}" placeholder="${escHtml(f.ph || '')}" rows="2"></textarea>`
        : `<input class="sg-input" id="sg-field-${f.id}" type="text" placeholder="${escHtml(f.ph || '')}">`
      }
    </div>
  `).join('');
}

// Tree View / Code View toggle — adicionado nos schema blocks
function addTreeCodeToggle(bBody, rawObj, pageUrl) {
  if (!rawObj) return;
  const toggleBar = document.createElement('div');
  toggleBar.className = 'sv-view-toggle-bar';

  const testHref = pageUrl
    ? `https://search.google.com/test/rich-results?url=${encodeURIComponent(pageUrl)}`
    : 'https://search.google.com/test/rich-results';

  toggleBar.innerHTML = `
    <button class="sv-view-btn sv-view-btn--active" data-view="tree">Tree View</button>
    <button class="sv-view-btn" data-view="code">Code View</button>
    <a class="sv-view-btn sv-test-btn" href="${testHref}" target="_blank" rel="noopener" title="Testar no Google Rich Results Test">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      Testar
    </a>
  `;

  const treeDiv = document.createElement('div');
  treeDiv.className = 'sv-tree-view';
  treeDiv.innerHTML = buildJsonTree(rawObj, 0);

  const codeDiv = document.createElement('pre');
  codeDiv.className = 'sv-code-view';
  codeDiv.style.display = 'none';
  codeDiv.textContent = JSON.stringify(rawObj, null, 2);

  toggleBar.querySelectorAll('.sv-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleBar.querySelectorAll('.sv-view-btn').forEach(b => b.classList.remove('sv-view-btn--active'));
      btn.classList.add('sv-view-btn--active');
      treeDiv.style.display = btn.dataset.view === 'tree' ? '' : 'none';
      codeDiv.style.display = btn.dataset.view === 'code' ? '' : 'none';
    });
  });

  bBody.appendChild(toggleBar);
  bBody.appendChild(treeDiv);
  bBody.appendChild(codeDiv);
}

function buildJsonTree(obj, depth) {
  if (obj === null) return `<span class="jt-null">null</span>`;
  if (typeof obj === 'boolean') return `<span class="jt-bool">${obj}</span>`;
  if (typeof obj === 'number') return `<span class="jt-num">${obj}</span>`;
  if (typeof obj === 'string') {
    const isUrl = /^https?:\/\//.test(obj);
    const display = obj.length > 80 ? obj.slice(0, 79) + '…' : obj;
    return isUrl
      ? `<a class="jt-url" href="${escHtml(obj)}" target="_blank">${escHtml(display)}</a>`
      : `<span class="jt-str">"${escHtml(display)}"</span>`;
  }
  if (Array.isArray(obj)) {
    if (!obj.length) return `<span class="jt-brace">[]</span>`;
    const items = obj.map(v => `<div class="jt-item" style="padding-left:${(depth+1)*14}px">
      ${buildJsonTree(v, depth + 1)}</div>`).join('');
    return `<span class="jt-brace">[</span>${items}<span class="jt-brace" style="padding-left:${depth*14}px">]</span>`;
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (!entries.length) return `<span class="jt-brace">{}</span>`;
    const rows = entries.map(([k, v]) => `<div class="jt-row" style="padding-left:${(depth+1)*14}px">
      <span class="jt-key">${escHtml(k)}:</span> ${buildJsonTree(v, depth + 1)}</div>`).join('');
    return `<span class="jt-brace">{</span>${rows}<span class="jt-brace" style="padding-left:${depth*14}px">}</span>`;
  }
  return escHtml(String(obj));
}

// ══════════════════════════════════════════════════════════════
// NVIDIA NIM — Chat IA local (streaming SSE)
// ══════════════════════════════════════════════════════════════

// Lista completa de modelos gratuitos NVIDIA NIM
// (mesmos IDs do Semantic SEO Expert + DeepSeek V4 Flash)
// Fetch direto à NVIDIA (sem passar pelo background — evita timeout do service worker MV3)
const NIM_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

async function nimFetch(apiKey, model, messages, maxTokens = 2048, temperature = 0.6, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(NIM_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || err.detail || err.error?.message || `HTTP ${resp.status} ${resp.statusText}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Timeout: o modelo demorou mais de 60s. Tente um modelo mais rápido (ex: Llama 3.1 8B).');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const NIM_MODELS = [
  { id: 'meta/llama-3.1-8b-instruct',                    label: '⚡ Llama 3.1 8B (Mais rápido)' },
  { id: 'meta/llama-3.3-70b-instruct',                   label: 'Llama 3.3 70B (128K)' },
  { id: 'meta/llama-4-maverick-17b-128e-instruct',       label: 'Llama 4 Maverick 17B (128K)' },
  { id: 'deepseek-ai/deepseek-v4-flash',                 label: 'DeepSeek V4 Flash (fila longa)' },
  { id: 'deepseek-ai/deepseek-v3.1-terminus',            label: 'DeepSeek V3.1' },
  { id: 'meta/llama-3.3-70b-instruct',                   label: 'Llama 3.3 70B (128K)' },
  { id: 'meta/llama-3.1-405b-instruct',                  label: 'Llama 3.1 405B' },
  { id: 'meta/llama-3.1-70b-instruct',                   label: 'Llama 3.1 70B' },
  { id: 'meta/llama-3.1-8b-instruct',                    label: 'Llama 3.1 8B (Fast)' },
  { id: 'meta/llama-3.2-90b-vision-instruct',            label: 'Llama 3.2 90B Vision' },
  { id: 'mistralai/mistral-nemotron',                    label: 'Mistral Nemotron (Agentic)' },
  { id: 'mistralai/mistral-large-3-675b-instruct-2512',  label: 'Mistral Large 3 675B' },
  { id: 'mistralai/mistral-7b-instruct-v0.3',            label: 'Mistral 7B' },
  { id: 'moonshotai/kimi-k2-thinking',                   label: 'Kimi K2 Thinking' },
  { id: 'moonshotai/kimi-k2-instruct-0905',              label: 'Kimi K2 Instruct' },
  { id: 'stepfun-ai/step-3.5-flash',                     label: 'Step 3.5 Flash' },
  { id: 'z-ai/glm4.7',                                   label: 'GLM 4.7' },
  { id: 'bytedance/seed-oss-36b-instruct',               label: 'Seed-OSS 36B Instruct' },
  { id: 'minimaxai/minimax-m2.7',                        label: '🔥 MiniMax M2.7 230B' },
  { id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',       label: 'Nemotron Ultra 253B' },
  { id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',      label: 'Nemotron Super 49B' },
  { id: 'nvidia/nemotron-mini-4b-instruct',              label: 'Nemotron Mini 4B (Fast)' },
  { id: 'google/gemma-3-27b-it',                         label: 'Gemma 3 27B (128K)' },
  { id: 'google/gemma-2-27b-it',                         label: 'Gemma 2 27B' },
  { id: 'google/gemma-2-9b-it',                          label: 'Gemma 2 9B' },
  { id: 'qwen/qwen2.5-coder-32b-instruct',               label: 'Qwen 2.5 Coder 32B' },
  { id: 'qwen/qwen3-coder-480b-a35b-instruct',           label: 'Qwen 3 Coder 480B' },
];

const NIM_BAD_CACHE_KEY   = 'nim_bad_models';
const NIM_AVAIL_CACHE_KEY = 'nim_available_models';

function nimGetBadCache() { try { return JSON.parse(localStorage.getItem(NIM_BAD_CACHE_KEY) || '{}'); } catch { return {}; } }
function nimSetBadCache(m){ try { localStorage.setItem(NIM_BAD_CACHE_KEY, JSON.stringify(m)); } catch {} }
function nimMarkBad(id, reason) { const c = nimGetBadCache(); c[id] = { reason, at: Date.now() }; nimSetBadCache(c); }
function nimClearBad(id) { const c = nimGetBadCache(); delete c[id]; nimSetBadCache(c); }

// Cache agora armazena [{id, ms}] — tempo medido no Refresh
function nimGetAvailCache() { try { return JSON.parse(localStorage.getItem(NIM_AVAIL_CACHE_KEY) || '[]'); } catch { return []; } }
function nimSetAvailCache(a){ try { localStorage.setItem(NIM_AVAIL_CACHE_KEY, JSON.stringify(a)); } catch {} }
// Lê só o ms de um modelo específico
function nimGetMs(id) {
  const cache = nimGetAvailCache();
  const entry = cache.find(e => (typeof e === 'object' ? e.id : e) === id);
  return entry && typeof entry === 'object' ? entry.ms : null;
}

// Converte ms → emoji de velocidade + texto curto
function nimSpeedLabel(ms) {
  if (ms == null) return '';
  if (ms < 500)   return '🟢 ' + ms + 'ms';
  if (ms < 1500)  return '🟡 ' + ms + 'ms';
  if (ms < 5000)  return '🔴 ' + (ms/1000).toFixed(1) + 's';
  return '⏳ ' + (ms/1000).toFixed(0) + 's';
}

function nimResolveModel(preferred) {
  const bad = nimGetBadCache();
  if (preferred && !bad[preferred]) return preferred;
  const fallback = NIM_MODELS.find(m => !bad[m.id]);
  return fallback?.id || NIM_MODELS[0].id;
}

function renderNimModelSelect() {
  const sel = document.getElementById('nim-model');
  if (!sel) return;
  const bad   = nimGetBadCache();
  const avail = nimGetAvailCache(); // [{id, ms}] ou [] se nunca fez Refresh
  const saved = localStorage.getItem('nim_model') || 'meta/llama-3.1-8b-instruct';

  // Extrai IDs disponíveis (suporta formato antigo string[] e novo {id,ms}[])
  const availIds = avail.map(e => typeof e === 'object' ? e.id : e);

  // Se já fez refresh, usa só os disponíveis; senão mostra todos
  const list = availIds.length > 0
    ? NIM_MODELS.filter(m => availIds.includes(m.id))
    : NIM_MODELS;

  // Ordena: sem bad primeiro, depois por velocidade (ms crescente)
  const sorted = [...list].sort((a, b) => {
    const badA = !!bad[a.id], badB = !!bad[b.id];
    if (badA !== badB) return badA ? 1 : -1;
    const msA = nimGetMs(a.id) ?? 99999;
    const msB = nimGetMs(b.id) ?? 99999;
    return msA - msB;
  });

  sel.innerHTML = '';
  sorted.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    const ms = nimGetMs(m.id);
    const speed = ms != null ? `  ${nimSpeedLabel(ms)}` : '';
    if (bad[m.id]) {
      opt.textContent = `⚠ ${m.label}`;
      opt.style.color = 'var(--text-muted)';
    } else {
      opt.textContent = `${m.label}${speed}`;
    }
    sel.appendChild(opt);
  });

  // Custom model salvo que não está na lista
  const custom = document.getElementById('nim-custom-model')?.value.trim();
  if (custom && !list.some(m => m.id === custom)) {
    const opt = document.createElement('option');
    opt.value = custom;
    opt.textContent = `${custom} (Custom)`;
    sel.appendChild(opt);
  }

  if ([...sel.options].some(o => o.value === saved)) sel.value = saved;
  nimUpdateSpeedBadge(sel.value);
}

function nimUpdateCustomBadge() {
  const val     = (document.getElementById('nim-custom-model')?.value || '').trim();
  const badge   = document.getElementById('nim-custom-active');
  const label   = document.getElementById('nim-custom-active-label');
  const sel     = document.getElementById('nim-model');
  if (!badge) return;
  if (val) {
    badge.style.display = '';
    if (label) label.textContent = val.split('/').pop(); // mostra só o nome, sem o prefixo do provider
    sel?.classList.add('nim-select-overridden');
  } else {
    badge.style.display = 'none';
    sel?.classList.remove('nim-select-overridden');
  }
}

function nimUpdateSpeedBadge(modelId) {
  const badge = document.getElementById('nim-speed-badge');
  if (!badge) return;
  const ms = nimGetMs(modelId);
  if (ms == null) {
    badge.style.display = 'none';
    return;
  }
  badge.style.display = '';
  let cls, arrow, text;
  if (ms < 1500)       { cls = 'fast';   arrow = '↓'; text = ms + 'ms'; }
  else if (ms < 5000)  { cls = 'medium'; arrow = '↓'; text = (ms/1000).toFixed(1) + 's'; }
  else                 { cls = 'slow';   arrow = '↓'; text = (ms/1000).toFixed(0) + 's'; }
  badge.className = `nim-speed-badge ${cls}`;
  badge.textContent = `${arrow} ${text}`;
  badge.title = `Tempo médio de resposta: ${ms < 1000 ? ms + 'ms' : (ms/1000).toFixed(1) + 's'}`;
}

(function initNimChat() {
  const NIM_KEY_STORAGE   = 'nim_api_key';
  const NIM_MODEL_STORAGE = 'nim_model';

  function getNimKey()   { return localStorage.getItem(NIM_KEY_STORAGE) || ''; }
  function getNimModel() {
    const custom = document.getElementById('nim-custom-model')?.value.trim();
    if (custom) return nimResolveModel(custom);
    const sel = document.getElementById('nim-model')?.value;
    // Default: llama 8b é o mais rápido e confiável com keys gratuitas
    return nimResolveModel(sel || localStorage.getItem(NIM_MODEL_STORAGE) || 'meta/llama-3.1-8b-instruct');
  }

  function showTestResult(html, cls) {
    const el = document.getElementById('nim-test-result');
    if (!el) return;
    el.className = `nim-test-result nim-test-result--${cls}`;
    el.innerHTML = html;
    el.style.display = '';
  }

  document.addEventListener('DOMContentLoaded', () => {
    const keyEl = document.getElementById('nim-api-key');
    if (keyEl) {
      keyEl.value = getNimKey();
      // Auto-salva quando o campo perde o foco (user cola e sai)
      keyEl.addEventListener('blur', () => {
        const v = keyEl.value.trim();
        if (v) localStorage.setItem(NIM_KEY_STORAGE, v);
      });
      // Auto-salva também ao digitar (debounced)
      let _saveTimer;
      keyEl.addEventListener('input', () => {
        clearTimeout(_saveTimer);
        _saveTimer = setTimeout(() => {
          const v = keyEl.value.trim();
          if (v) localStorage.setItem(NIM_KEY_STORAGE, v);
        }, 800);
      });
    }

    // Restaura custom model antes de renderNimModelSelect (ele lê o valor do campo)
    const customEl = document.getElementById('nim-custom-model');
    if (customEl) {
      const savedCustom = localStorage.getItem('nim_custom_model') || '';
      customEl.value = savedCustom;
      customEl.addEventListener('input', () => {
        nimUpdateCustomBadge();
      });
      customEl.addEventListener('blur', () => {
        localStorage.setItem('nim_custom_model', customEl.value.trim());
        renderNimModelSelect();
        nimUpdateCustomBadge();
      });
    }

    // Botão × para limpar o modelo personalizado
    document.getElementById('nim-custom-clear')?.addEventListener('click', () => {
      const el = document.getElementById('nim-custom-model');
      if (el) { el.value = ''; }
      localStorage.removeItem('nim_custom_model');
      renderNimModelSelect();
      nimUpdateCustomBadge();
    });

    const modelEl = document.getElementById('nim-model');
    if (modelEl) {
      modelEl.addEventListener('change', () => {
        localStorage.setItem(NIM_MODEL_STORAGE, modelEl.value);
        nimUpdateSpeedBadge(modelEl.value);
      });
    }

    renderNimModelSelect();
    nimUpdateCustomBadge();

    // Restaura estado: chat visível só se key foi validada antes
    const wasValidated = localStorage.getItem('nim_key_validated') === '1' && !!getNimKey();
    nimSetChatVisible(wasValidated);

    // Salvar chave
    document.getElementById('nim-save-btn')?.addEventListener('click', () => {
      const key    = document.getElementById('nim-api-key')?.value.trim() || '';
      const model  = document.getElementById('nim-model')?.value || '';
      const custom = document.getElementById('nim-custom-model')?.value.trim() || '';
      localStorage.setItem(NIM_KEY_STORAGE, key);
      localStorage.setItem(NIM_MODEL_STORAGE, model);
      localStorage.setItem('nim_custom_model', custom);
      const btn = document.getElementById('nim-save-btn');
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = '\u2713 Salvo!';
        btn.classList.add('nim-action-btn--ok');
        setTimeout(() => { btn.textContent = orig; btn.classList.remove('nim-action-btn--ok'); }, 2000);
      }
    });

    // Refresh models — verifica quais funcionam com a key
    document.getElementById('nim-refresh-btn')?.addEventListener('click', async () => {
      const key = document.getElementById('nim-api-key')?.value.trim() || getNimKey();
      if (!key) { showTestResult('\u26a0\ufe0f Insira a API Key antes de fazer Refresh.', 'warn'); return; }
      const btn = document.getElementById('nim-refresh-btn');
      if (btn) { btn.textContent = 'Verificando...'; btn.disabled = true; }
      showTestResult(`\u23f3 Testando ${NIM_MODELS.length} modelos... isso pode levar ~30s`, 'loading');
      try {
        const verified = [];
        const BATCH = 4;
        for (let i = 0; i < NIM_MODELS.length; i += BATCH) {
          const batch = NIM_MODELS.slice(i, i + BATCH);
          await Promise.all(batch.map(async m => {
            try {
              const t0 = performance.now();
              await nimFetch(key, m.id, [{ role: 'user', content: 'ok' }], 3, 0.6);
              const ms = Math.round(performance.now() - t0);
              nimClearBad(m.id); verified.push({ id: m.id, ms });
            } catch (e) { nimMarkBad(m.id, e.message); }
          }));
          showTestResult(`\u23f3 Verificando... ${verified.length} disponíveis até agora`, 'loading');
        }
        nimSetAvailCache(verified);
        renderNimModelSelect();
        localStorage.setItem(NIM_KEY_STORAGE, key);
        showTestResult(`\u2705 <strong>${verified.length}</strong> de ${NIM_MODELS.length} modelos disponíveis. Lista atualizada.`, 'ok');
      } catch (err) {
        showTestResult(`\u274c ${err.message}`, 'error');
      } finally {
        if (btn) { btn.textContent = 'Refresh models'; btn.disabled = false; }
      }
    });

    // Test selected model
    document.getElementById('nim-test-btn')?.addEventListener('click', async () => {
      const key   = document.getElementById('nim-api-key')?.value.trim() || getNimKey();
      const model = getNimModel();
      if (!key) { showTestResult('\u26a0\ufe0f Insira uma API Key antes de testar.', 'warn'); return; }
      const btn = document.getElementById('nim-test-btn');
      if (btn) { btn.textContent = 'Testing...'; btn.disabled = true; }
      showTestResult('\u23f3 Conectando...', 'loading');
      const t0 = performance.now();
      try {
        // fetch direto \u2014 sem passar pelo background (evita timeout MV3)
        await nimFetch(key, model, [{ role: 'user', content: 'Reply with: ok' }], 20, 0.6);
        const ms = Math.round(performance.now() - t0);
        nimClearBad(model);
        // Salva imediatamente ap\u00f3s sucesso
        localStorage.setItem(NIM_KEY_STORAGE, key);
        localStorage.setItem(NIM_MODEL_STORAGE, model);
        localStorage.setItem('nim_key_validated', '1');
        // Persiste o tempo medido no cache de dispon\u00edveis
        const avail = nimGetAvailCache();
        const idx = avail.findIndex(e => (typeof e === 'object' ? e.id : e) === model);
        if (idx >= 0) avail[idx] = { id: model, ms };
        else avail.push({ id: model, ms });
        nimSetAvailCache(avail);
        nimUpdateSpeedBadge(model);
        nimSetChatVisible(true);
        showTestResult(`\u2705 <strong>${escHtml(model.split('/').pop())}</strong> respondeu em <strong>${ms}ms</strong>. Chat liberado abaixo.`, 'ok');
      } catch (err) {
        nimMarkBad(model, err.message);
        renderNimModelSelect();
        const detail = err.message || 'Erro desconhecido';
        let hint = '';
        if (/401|unauthorized/i.test(detail)) hint = ' \u2014 API Key inv\u00e1lida ou expirada.';
        else if (/404|not found/i.test(detail)) hint = ' \u2014 Modelo n\u00e3o dispon\u00edvel. Tente outro.';
        else if (/429|rate/i.test(detail)) hint = ' \u2014 Limite atingido. Aguarde um momento.';
        showTestResult(`\u274c <strong>${escHtml(detail)}</strong>${hint}`, 'error');
      } finally {
        if (btn) { btn.textContent = 'Test selected model'; btn.disabled = false; }
      }
    });

    // Chat
    const sendBtn = document.getElementById('nim-send-btn');
    const inputEl = document.getElementById('nim-input');
    const sendMessage = () => {
      const text = inputEl?.value.trim();
      if (!text) return;
      const key   = getNimKey();
      const model = getNimModel();
      if (!key) {
        appendNimMsg('assistant', '\u26a0\ufe0f Configure uma API Key e clique em "Test selected model" antes de usar o chat.');
        return;
      }
      appendNimMsg('user', text);
      if (inputEl) inputEl.value = '';
      startNimStream(text, key, model);
    };
    sendBtn?.addEventListener('click', sendMessage);
    inputEl?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
  });

  // ── Estado do chat ───────────────────────────────────────────
  const _nimHistory = [];   // histórico de mensagens
  let _nimKeyValid  = false; // key foi testada com sucesso?
  let _nimLastUrl   = null;  // URL da última página analisada

  // Chamado pelo render() quando nova página é analisada
  window.nimOnPageUpdate = (url) => {
    if (url && url !== _nimLastUrl) {
      _nimLastUrl = url;
      // Limpa histórico e avisa usuário
      _nimHistory.length = 0;
      const container = document.getElementById('nim-messages');
      if (container) {
        container.innerHTML = '';
        const notice = document.createElement('div');
        notice.className = 'nim-msg nim-msg--system';
        notice.textContent = `📄 Nova página carregada: ${url.split('/').slice(-2).join('/')}. Histórico resetado.`;
        container.appendChild(notice);
        if (_nimKeyValid) {
          const ready = document.createElement('div');
          ready.className = 'nim-msg nim-msg--assistant';
          ready.textContent = 'Analisei os dados desta página. Pode perguntar qualquer coisa sobre SEO, headings, links, schema ou performance.';
          container.appendChild(ready);
        }
      }
    }
  };

  // Mostra/oculta o chat baseado na validação da key
  function nimSetChatVisible(visible) {
    _nimKeyValid = visible;
    const wrap = document.getElementById('nim-chat-wrap');
    const locked = document.getElementById('nim-chat-locked');
    if (wrap)   wrap.style.display   = visible ? '' : 'none';
    if (locked) locked.style.display = visible ? 'none' : '';
  }

  function buildPageContext() {
    if (!graphData) return '';
    const d = graphData;
    const sections = [];

    // ── Metadados básicos ────────────────────────────────────────
    const meta = [];
    if (d.url)            meta.push(`URL: ${d.url}`);
    if (d.title)          meta.push(`Title (${d.titleLen || 0} chars): ${d.title}`);
    if (d.description)    meta.push(`Meta description (${d.descLen || 0} chars): ${d.description}`);
    if (d.canonical)      meta.push(`Canonical: ${d.canonical}`);
    if (d.robots)         meta.push(`Robots: ${d.robots}`);
    if (d.htmlLang)       meta.push(`Lang: ${d.htmlLang}`);
    if (d.keywords)       meta.push(`Keywords: ${d.keywords}`);
    if (d.publisher)      meta.push(`Publisher: ${d.publisher}`);
    if (d.isNoindex)      meta.push(`⚠️ NOINDEX ATIVO — página não indexável`);
    if (d.overallScore != null) meta.push(`Score SEO geral: ${d.overallScore}/100`);
    if (meta.length) sections.push(`## Metadados\n${meta.join('\n')}`);

    // ── Open Graph e redes sociais ────────────────────────────────
    const og = [];
    if (d.ogTitle)       og.push(`OG Title: ${d.ogTitle}`);
    if (d.ogDescription) og.push(`OG Description: ${d.ogDescription}`);
    if (d.ogImage)       og.push(`OG Image: ${d.ogImage}`);
    if (d.twitterCard)   og.push(`Twitter Card: ${d.twitterCard}`);
    if (og.length) sections.push(`## Open Graph / Redes Sociais\n${og.join('\n')}`);

    // ── Headings ─────────────────────────────────────────────────
    const hdg = [];
    hdg.push(`Contagem: H1=${d.h1Count||0} H2=${d.h2Count||0} H3=${d.h3Count||0} H4=${d.h4Count||0} H5=${d.h5Count||0} H6=${d.h6Count||0}`);
    if (d.wordCount) hdg.push(`Word count: ${d.wordCount}`);
    if (d.headingNodes?.length) {
      const hdgs = d.headingNodes.map(h => {
        let info = `${(h.level||'').toUpperCase()}: "${h.text}"`;
        if (h.pCount != null) info += ` [${h.pCount}p ${h.listCount||0}l ${h.wordsBelow||0}w abaixo]`;
        if (h.hasBold) info += ' [tem <strong>]';
        return info;
      }).join('\n');
      hdg.push(`Estrutura:\n${hdgs}`);
    }
    sections.push(`## Headings\n${hdg.join('\n')}`);

    // ── Links ────────────────────────────────────────────────────
    const lnk = [];
    lnk.push(`Internos: ${d.internalLinks||0} | Externos: ${d.externalLinks||0} | Nofollow: ${d.nofollowLinks||0} | Total: ${d.totalLinks||0}`);
    if (d.linkNodes?.length) {
      const RUIM = new Set(['clique aqui','saiba mais','leia mais','ver mais','acesse','more','here','clique','aqui']);
      const internos = d.linkNodes.filter(l => l.isInternal);
      const genericAnchors = internos.filter(l => !l.anchor || RUIM.has((l.anchor||'').toLowerCase().trim()) || l.anchor.length <= 2);
      if (genericAnchors.length) lnk.push(`⚠️ ${genericAnchors.length} âncoras genéricas (clique aqui, saiba mais, etc.)`);
      const topLinks = internos.slice(0, 10).map(l => `  → ${l.href} | âncora: "${l.anchor||'(sem texto)'}"`).join('\n');
      if (topLinks) lnk.push(`Top 10 links internos:\n${topLinks}`);
    }
    sections.push(`## Links\n${lnk.join('\n')}`);

    // ── Imagens ──────────────────────────────────────────────────
    const img = [];
    img.push(`Total: ${d.imgTotal||0} | Sem alt: ${d.imgNoAlt||0}`);
    if (d.imgNodes?.length) {
      const modern  = d.imgNodes.filter(i => i.isModernFormat).length;
      const lazy    = d.imgNodes.filter(i => i.isLazy).length;
      const oversized = d.imgNodes.filter(i => i.oversized).length;
      img.push(`Formato moderno (WebP/AVIF): ${modern} | Lazy loading: ${lazy} | Oversized: ${oversized}`);
      const noAltList = d.imgNodes.filter(i => !i.hasAlt).slice(0, 5).map(i => `  - ${i.src.split('/').pop()}`).join('\n');
      if (noAltList) img.push(`Imagens sem alt:\n${noAltList}`);
    }
    sections.push(`## Imagens\n${img.join('\n')}`);

    // ── Schema ───────────────────────────────────────────────────
    if (d.schemas?.length) {
      const schemaLines = [];
      schemaLines.push(`Total: ${d.schemas.length} schemas JSON-LD`);
      const types = [...new Set(d.schemas.flatMap(s => s.types || []))];
      schemaLines.push(`Tipos: ${types.join(', ')}`);
      if (d.microdata?.detected) schemaLines.push(`Microdata detectado: ${d.microdata.itemtype} tipos`);
      sections.push(`## Schema Markup\n${schemaLines.join('\n')}`);
    }

    // ── Categorias de SEO (checks) ───────────────────────────────
    if (d.categories?.length) {
      const cats = d.categories.map(cat => {
        const score = cat.score != null ? ` (${cat.score}/100)` : '';
        const issues = (cat.checks || []).filter(c => c.status !== 'pass').slice(0, 3).map(c => `    ⚠ ${c.label}`).join('\n');
        return `  ${cat.category}${score}${issues ? '\n' + issues : ''}`;
      }).join('\n');
      sections.push(`## Auditoria SEO por categoria\n${cats}`);
    }

    // ── Semântica HTML ────────────────────────────────────────────
    if (d.semantic) {
      const sem = [];
      if (d.semantic.score != null) sem.push(`Score semântico: ${d.semantic.score}/100`);
      if (d.semantic.issues?.length) sem.push(`Issues: ${d.semantic.issues.slice(0,5).map(i=>i.message||i).join(' | ')}`);
      if (sem.length) sections.push(`## Estrutura Semântica HTML\n${sem.join('\n')}`);
    }

    // ── Chunks / GEO ─────────────────────────────────────────────
    if (_chunksDataForAI?.chunks?.length) {
      const ch = _chunksDataForAI.chunks;
      const chLines = [];
      chLines.push(`Total de chunks: ${ch.length}`);
      const avgScore = Math.round(ch.reduce((s,c) => s + (c.geoScore||0), 0) / ch.length);
      chLines.push(`Score GEO médio: ${avgScore}/100`);
      const weak = ch.filter(c => (c.geoScore||0) < 50);
      if (weak.length) chLines.push(`Chunks fracos para GEO (score <50): ${weak.length}`);
      ch.slice(0, 8).forEach(c => {
        const heading = c.heading ? `"${c.heading}"` : '(sem heading)';
        chLines.push(`  Chunk ${c.index||'?'}: ${heading} | score=${c.geoScore||0} | ${c.wordCount||0} palavras | intenção: ${c.intent||'?'}`);
      });
      sections.push(`## Chunks e GEO Score\n${chLines.join('\n')}`);
    }

    // ── Speed / PageSpeed Insights ────────────────────────────────
    const psi = window._psiData || null;
    if (psi) {
      const spd = [];
      if (psi.mobile)  spd.push(`Mobile: Performance=${psi.mobile.performance||'?'} | FCP=${psi.mobile.fcp||'?'} | LCP=${psi.mobile.lcp||'?'} | CLS=${psi.mobile.cls||'?'} | TBT=${psi.mobile.tbt||'?'}`);
      if (psi.desktop) spd.push(`Desktop: Performance=${psi.desktop.performance||'?'} | FCP=${psi.desktop.fcp||'?'} | LCP=${psi.desktop.lcp||'?'} | CLS=${psi.desktop.cls||'?'} | TBT=${psi.desktop.tbt||'?'}`);
      if (spd.length) sections.push(`## PageSpeed Insights (Core Web Vitals)\n${spd.join('\n')}`);
    }

    // ── Graph / Entidades ─────────────────────────────────────────
    if (d.linkNodes?.length) {
      const graph = [];
      const destMap = new Map();
      d.linkNodes.filter(l => l.isInternal).forEach(l => {
        if (!l.href) return;
        if (!destMap.has(l.href)) destMap.set(l.href, 0);
        destMap.set(l.href, destMap.get(l.href) + 1);
      });
      const topDest = [...destMap.entries()].sort((a,b) => b[1]-a[1]).slice(0, 5);
      if (topDest.length) {
        graph.push('Páginas mais linkadas internamente:');
        topDest.forEach(([href, count]) => graph.push(`  ${href} (${count} links)`));
      }
      const orphans = d.linkNodes.filter(l => l.isInternal && !l.nofollow).length;
      graph.push(`Links internos dofollow: ${orphans}`);
      if (graph.length) sections.push(`## Grafo de Links Internos\n${graph.join('\n')}`);
    }

    // ── Schema detalhado ──────────────────────────────────────────
    if (d.schemas?.length) {
      const schemaDetail = [];
      d.schemas.forEach((s, i) => {
        const types = (s.types||[]).join(', ') || 'Desconhecido';
        const status = s.valid ? '✅ válido' : `❌ erro: ${s.error||'parse error'}`;
        schemaDetail.push(`  Schema ${i+1}: [${types}] — ${status}`);
      });
      const existing = sections.findIndex(s => s.startsWith('## Schema'));
      if (existing >= 0) {
        sections[existing] += '\nDetalhes:\n' + schemaDetail.join('\n');
      }
    }

    return sections.join('\n\n');
  }

  function appendNimMsg(role, text) {
    const container = document.getElementById('nim-messages');
    if (!container) {
      // Cria o container se não existe (caso de race condition)
      console.warn('[NIM] nim-messages container not found');
      return { textContent: '', classList: { add: ()=>{}, remove: ()=>{} } }; // stub seguro
    }
    const div = document.createElement('div');
    div.className = `nim-msg nim-msg--${role}`;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  }

  function setNimStatus(text) {
    const el = document.getElementById('nim-status');
    if (el) el.textContent = text;
  }

  async function startNimStream(userText, apiKey, model) {
    setNimStatus('Pensando...');
    const sendBtn = document.getElementById('nim-send-btn');
    const inputEl = document.getElementById('nim-input');
    if (sendBtn) sendBtn.disabled = true;
    if (inputEl) inputEl.disabled = true;

    const pageCtx = buildPageContext();
    const systemMsg = pageCtx
      ? `Você é um especialista em SEO analisando uma página específica. Responda em português brasileiro de forma clara e objetiva. Contexto da página:\n${pageCtx}`
      : 'Você é um especialista em SEO. Responda em português brasileiro de forma clara e objetiva.';

    _nimHistory.push({ role: 'user', content: userText });
    const messages = [
      { role: 'system', content: systemMsg },
      ..._nimHistory.slice(-10),
    ];

    // Div de resposta com cursor piscante durante espera
    const replyDiv = appendNimMsg('assistant', '');
    replyDiv.classList.add('nim-msg--thinking');
    replyDiv.textContent = '···';

    try {
      // fetch direto — sem passar pelo background (popup ≠ side panel, service worker fecha)
      const content = await nimFetch(apiKey, model, messages, 2048, 0.6);

      replyDiv.classList.remove('nim-msg--thinking');

      // Efeito typewriter
      replyDiv.textContent = '';
      let i = 0;
      const TYPE_SPEED = 6;
      const typeNext = () => {
        if (i < content.length) {
          replyDiv.textContent += content[i++];
          const container = document.getElementById('nim-messages');
          if (container) container.scrollTop = container.scrollHeight;
          setTimeout(typeNext, TYPE_SPEED);
        } else {
          _nimHistory.push({ role: 'assistant', content });
        }
      };
      typeNext();
    } catch (err) {
      replyDiv.classList.remove('nim-msg--thinking');
      replyDiv.textContent = `⚠️ Erro: ${err.message}`;
      replyDiv.classList.add('nim-msg--error');
      _nimHistory.pop();
    } finally {
      setNimStatus('');
      if (sendBtn) sendBtn.disabled = false;
      if (inputEl) { inputEl.disabled = false; inputEl.focus(); }
    }
  }

  // Expõe buildPageContext globalmente para o Bob poder usar
  window._bobBuildPageContext = buildPageContext;
})();

// ══════════════════════════════════════════════════════════════
// GLOSSARY DRAWER — explicações estilo Maturare por campo SEO
// ══════════════════════════════════════════════════════════════

const GLOSS_DB = {
  title: {
    term: 'Title Tag',
    badge: 'On-Page SEO',
    difficulty: '●○○',
    def: 'A tag &lt;title&gt; é o headline que aparece nos resultados do Google (SERP), na aba do navegador e nos previews de redes sociais. É o elemento on-page com maior peso direto no ranking — o Google a usa para entender sobre o que é a página antes de qualquer outra coisa.',
    bad: { label: '❌ Ruim', text: '"Página inicial" ou "Home" — sem keyword, sem contexto, sem diferencial. O Google não consegue inferir o tópico e tende a reescrever por conta própria, geralmente pior.' },
    good: { label: '✅ Bom', text: '"Aluguel de Empilhadeira em Goiânia | Move Máquinas" — keyword principal + localização + marca em 52 caracteres. Ranqueia, tem CTR alto e não é cortado na SERP.' },
    analogy: 'A title tag é o título do livro na prateleira. Entre dezenas de opções, o leitor (usuário) decide qual clicar pelo título — antes de ler qualquer outra coisa.',
    impact: '<strong>Ideal: 50-60 caracteres.</strong> Abaixo de 40: o Google frequentemente reescreve. Acima de 60: cortado com "…" na SERP. Coloque a keyword principal nos primeiros 30 caracteres para garantir visibilidade mesmo em telas menores.',
    tags: ['Meta Description', 'SERP', 'H1', 'CTR'],
  },
  description: {
    term: 'Meta Description',
    badge: 'On-Page SEO',
    difficulty: '●○○',
    def: 'A meta description é o parágrafo que aparece abaixo do título nos resultados do Google. Ela não é fator direto de ranking, mas influencia muito o CTR — e CTR influencia ranking. Pense nela como um anúncio gratuito na SERP.',
    bad: { label: '❌ Ruim', text: '"Conheça nossos serviços." — vaga, sem keyword, sem benefício. O Google frequentemente a substitui por um trecho aleatório da página.' },
    good: { label: '✅ Bom', text: '"Aluguel de empilhadeira elétrica e a combustão em Goiânia. Frota Clark certificada, entrega em 24h. Solicite orçamento sem compromisso." — keyword + diferencial + CTA. 152 caracteres.' },
    analogy: 'A description é o argumento de venda em 160 caracteres. Se o título é a vitrine, a description é o vendedor na porta que convence você a entrar.',
    impact: '<strong>Ideal: 120-160 caracteres.</strong> Ausente = Google gera automaticamente, geralmente pior. Inclua a keyword principal — ela aparece em negrito na SERP quando bate com a busca do usuário.',
    tags: ['Title Tag', 'CTR', 'SERP', 'Keywords'],
  },
  url: {
    term: 'Estrutura da URL',
    badge: 'On-Page SEO',
    difficulty: '●○○',
    def: 'A URL não é só um endereço — é um sinal de relevância. O Google lê o caminho da URL para entender o tópico da página antes mesmo de processar o conteúdo. Uma URL descritiva reforça a keyword, facilita o clique na SERP e melhora o CTR.',
    bad: { label: '❌ URL opaca', text: 'maturare.com.br/page?id=4821 ou site.com/p=91 — o Google e o usuário não conseguem inferir o assunto. Sem keyword no caminho, sinal semântico perdido.' },
    good: { label: '✅ URL descritiva', text: 'maturare.com.br/glossario/title-tag ou move.com.br/goiania-go/aluguel-de-empilhadeira — keyword no slug, hierarquia clara, sem IDs ou parâmetros desnecessários.' },
    analogy: 'A URL é o endereço da casa. Um endereço como "Rua das Empilhadeiras, 10, Goiânia" diz tudo sobre onde você está. "Página 4821" não diz nada.',
    impact: '<strong>Boas práticas:</strong> use hífens para separar palavras (nunca underscore), letras minúsculas, sem acentos, sem stop words desnecessárias (/de/, /a/, /o/). Evite parâmetros de URL em páginas indexáveis — use canonical para consolidar variações.',
    tags: ['Canonical', 'Keywords', 'CTR', 'Crawl'],
  },
  canonical: {
    term: 'Canonical URL',
    badge: 'Técnico SEO',
    difficulty: '●●○',
    def: 'O canonical diz ao Google qual é a versão "oficial" de uma página quando existem URLs duplicadas ou similares. Sem ele, o Google pode dividir a autoridade entre várias versões e rankear a errada — ou nenhuma.',
    bad: { label: '❌ Sem canonical', text: 'A página existe em /produto/, /produto?cor=azul, e /produto/index.html. O Google vê 3 páginas disputando o mesmo ranking. Autoridade fragmentada.' },
    good: { label: '✅ Self-referencing', text: '<link rel="canonical" href="https://site.com/produto/"> em todas as variações. O Google consolida sinais de ranking na URL principal.' },
    analogy: 'O canonical é como registrar uma única sede oficial no CNPJ. Você pode operar em vários endereços, mas o Google sabe qual é o endereço-mãe que recebe todo o crédito.',
    impact: '<strong>Self-referencing canonical</strong> (apontando para si mesma) é a configuração padrão e correta. Canonical ausente em sites com parâmetros de URL pode causar canibalização severa.',
    tags: ['URL', 'Duplicate Content', 'Link Juice', 'Indexabilidade'],
  },
  robots: {
    term: 'Robots Tag (Meta)',
    badge: 'Crawl Control',
    difficulty: '●●○',
    def: 'A meta tag robots instrui o Googlebot e outros crawlers sobre o que fazer com a página: indexar ou não, seguir os links ou não. É diferente do robots.txt — esse controla o acesso ao arquivo, esta controla o que fazer após acessar.',
    bad: { label: '❌ noindex em página de conteúdo', text: '"noindex, nofollow" em uma LP de serviço. A página existe, o Google visita, mas descarta do índice. Todo esforço de SEO desperdiçado.' },
    good: { label: '✅ index, follow', text: '"index, follow" — padrão. O Google indexa a página e segue todos os links dela, passando PageRank adiante.' },
    analogy: 'O robots tag é o cartão de instruções na porta do hotel: "Não perturbe" (noindex) ou "Pode entrar e circular" (index, follow).',
    impact: '<strong>max-image-preview:large</strong> e <strong>max-snippet:-1</strong> aumentam a chance de Google mostrar rich snippets e imagens maiores na SERP. Vale incluir em todo conteúdo editorial.',
    tags: ['X-Robots-Tag', 'Indexabilidade', 'robots.txt', 'Crawl'],
  },
  xrobots: {
    term: 'X-Robots-Tag (HTTP)',
    badge: 'Técnico Avançado',
    difficulty: '●●●',
    def: 'O X-Robots-Tag funciona como o meta robots, mas é enviado no cabeçalho HTTP da resposta do servidor — não no HTML. Isso o torna a única forma de controlar indexação de arquivos não-HTML (PDFs, imagens, vídeos).',
    bad: { label: '❌ Conflito', text: 'Meta robots diz "index" mas o servidor envia X-Robots-Tag: noindex no header. O Google obedece o header HTTP — a página não será indexada mesmo com o meta correto.' },
    good: { label: '✅ Ausente ou consistente', text: 'Se não há intenção de bloquear, o X-Robots-Tag deve estar ausente (padrão) ou consistente com o meta robots. Incoerência é perigosa.' },
    analogy: 'Se o meta robots é a placa na janela da loja, o X-Robots-Tag é a instrução do gerente geral para o segurança na entrada. O segurança sempre prevalece.',
    impact: '<strong>Não verificável via JavaScript</strong> — só é visível nas headers da resposta HTTP. Use DevTools (aba Network → clique na página → Headers) ou ferramentas como curl para auditar.',
    tags: ['Robots Tag', 'Indexabilidade', 'HTTP Headers'],
  },
  keywords: {
    term: 'Meta Keywords',
    badge: 'Legado',
    difficulty: '●○○',
    def: 'A meta keywords foi criada nos anos 90 para declarar as palavras-chave de uma página. O Google a ignorou desde 2009. Bing também. Hoje ela tem zero impacto no ranking — mas ainda aparece em auditorias porque algumas ferramentas antigas a populam.',
    bad: { label: '❌ Populada com spam', text: 'keywords="empilhadeira, aluguel, barato, melhor, goiânia, goiania, goias..." — keyword stuffing que não ranqueia nada mas pode ser usado por concorrentes para espionar sua estratégia.' },
    good: { label: '✅ Ausente ou minimalista', text: 'Não usar, ou usar no máximo 3-5 keywords se o CMS gerar automaticamente. Não investir tempo aqui.' },
    analogy: 'Meta keywords é como o fax: ainda existe em alguns escritórios, mas ninguém o usa para comunicação real. Preserve energia para o que importa.',
    impact: '<strong>Atenção:</strong> a meta keywords é pública — qualquer concorrente pode ver as keywords que você está mirando. Se usar, seja estratégico ou omita.',
    tags: ['Title Tag', 'Meta Description', 'Conteúdo', 'On-Page SEO'],
  },
  publisher: {
    term: 'Publisher / og:site_name',
    badge: 'E-E-A-T',
    difficulty: '●●○',
    def: 'O publisher identifica a organização ou marca responsável pelo site. Via og:site_name (Open Graph), ele aparece quando o link é compartilhado em redes sociais. Para o Google, é um sinal de entidade — conecta a página a um Knowledge Graph reconhecível.',
    bad: { label: '❌ Ausente', text: 'Sem og:site_name. Quando alguém compartilha a URL no LinkedIn ou WhatsApp, o preview mostra só a URL crua — sem nome da empresa, sem branding.' },
    good: { label: '✅ Definido', text: '<meta property="og:site_name" content="Move Máquinas"> — o nome da empresa aparece no preview social e reforça a entidade para o Google Knowledge Graph.' },
    analogy: 'O publisher é como o timbre no papel timbrado. O conteúdo pode ser excelente, mas sem o nome da empresa no rodapé, parece anônimo.',
    impact: '<strong>E-E-A-T:</strong> Google usa entidades nomeadas para avaliar autoridade. Um site sem publisher definido é mais difícil de associar a uma organização verificável.',
    tags: ['E-E-A-T', 'Open Graph', 'Knowledge Graph', 'Schema'],
  },
  wordcount: {
    term: 'Word Count (Contagem de Palavras)',
    badge: 'Conteúdo',
    difficulty: '●○○',
    def: 'O word count é o número de palavras no conteúdo principal da página. Não é fator de ranking direto — o Google não tem "mínimo de palavras". Mas correlaciona com profundidade de tópico, que é fator. Conteúdo raso raramente ranqueia para termos competitivos.',
    bad: { label: '❌ Thin content (< 300 palavras)', text: 'Uma página de serviço com 80 palavras. O Google não tem material suficiente para entender o tópico, a entidade, ou a intenção. Frequentemente classificada como "thin content".' },
    good: { label: '✅ Adequado ao tópico', text: 'LP de serviço: 600-1200 palavras. Post de blog educacional: 1500-2500 palavras. O ideal varia por intenção de busca — não escreva por escrever.' },
    analogy: 'Word count é como a espessura de um livro. Um livro fino pode ser genial, mas se o tema exige profundidade e você entregou um folheto, o leitor (e o Google) percebem.',
    impact: '<strong>Cuidado com o excesso:</strong> 5000 palavras numa LP de produto é contra-produtivo. Calibre pelo tipo de página: informacional pede mais, transacional pede menos e mais direto.',
    tags: ['Thin Content', 'E-E-A-T', 'Headings', 'Semântica'],
  },
  lang: {
    term: 'Atributo lang (HTML)',
    badge: 'Técnico SEO',
    difficulty: '●○○',
    def: 'O atributo lang no elemento <html> declara o idioma do conteúdo da página. O Google usa isso para entender em qual idioma a página deve ser servida nas SERPs regionais. Navegadores usam para escolher o dicionário de correção ortográfica e leitores de tela usam para pronúncia correta.',
    bad: { label: '❌ Ausente ou incorreto', text: '<html> sem lang="". Ou lang="en" num site em português. O Google pode servir a página para audiências erradas ou priorizar buscas no idioma incorreto.' },
    good: { label: '✅ Correto', text: '<html lang="pt-BR"> para conteúdo em português brasileiro. Para sites multilíngues, combine com hreflang para sinalizar variações regionais.' },
    analogy: 'O atributo lang é o adesivo de idioma na mala antes de despachar no aeroporto. Sem ele, o sistema de rotas pode enviar seu conteúdo para o destino errado.',
    impact: '<strong>Para sites brasileiros:</strong> use sempre lang="pt-BR". Para Portugal: "pt-PT". Isso diferencia sua audiência-alvo dentro do universo lusófono.',
    tags: ['Hreflang', 'Internacionalização', 'Acessibilidade', 'Crawl'],
  },
  headings: {
    term: 'Hierarquia de Headings (H1-H6)',
    badge: 'Estrutura',
    difficulty: '●●○',
    def: 'Headings são os títulos e subtítulos do conteúdo HTML (H1 a H6). Eles criam a estrutura hierárquica da página — para humanos, para leitores de tela, e para o Google. O H1 é a declaração do tópico principal. H2s são os capítulos. H3s são seções dentro dos capítulos.',
    bad: { label: '❌ Estrutura quebrada', text: 'Zero H1, ou 3 H1s, ou H3 aparecendo antes de H2. O Google não consegue inferir qual é o tópico principal. Leitores de tela ficam desorientados. Hierarquia semântica destruída.' },
    good: { label: '✅ Hierarquia limpa', text: 'Exatamente 1 H1 com a keyword principal. 4-8 H2s dividindo os tópicos. H3s como subtópicos dos H2s. Estrutura que espelha o outline de um bom artigo.' },
    analogy: 'Headings são o sumário do livro. Imagine um livro sem sumário, com capítulos misturados e sem títulos — você conseguiria ler, mas o Google (e o leitor) vai pular para o próximo livro.',
    impact: '<strong>H1 é único e insubstituível:</strong> deve conter a keyword principal e descrever o tópico da página. H2s são oportunidades de incluir variações semânticas e perguntas que o usuário faz.',
    tags: ['Word Count', 'Semântica', 'Acessibilidade', 'Schema'],
  },
  images: {
    term: 'Imagens e Alt Text',
    badge: 'On-Page SEO',
    difficulty: '●○○',
    def: 'O atributo alt descreve uma imagem em texto. O Google é cego para imagens — ele lê o alt para entender o que a imagem representa. O alt também aparece quando a imagem falha ao carregar e é lido por leitores de tela para acessibilidade.',
    bad: { label: '❌ Sem alt ou genérico', text: 'alt="" ou alt="imagem1.jpg". O Google não consegue indexar a imagem no Google Images. Oportunidade de keyword perdida. Acessibilidade comprometida.' },
    good: { label: '✅ Descritivo e contextual', text: 'alt="Empilhadeira elétrica Clark EX55 no galpão da Move Máquinas em Goiânia" — descreve o que é, onde está, e inclui keywords naturalmente.' },
    analogy: 'O alt text é a legenda da foto para quem não pode ver. Seja o Google, um cego, ou alguém com imagem desativada — todos dependem da legenda para entender.',
    impact: '<strong>Imagens modernas (WebP, AVIF)</strong> carregam até 30% mais rápido que JPEG/PNG. Core Web Vitals são afetados por imagens pesadas. Format + alt + lazy loading = trifeta de otimização.',
    tags: ['Core Web Vitals', 'Google Images', 'Acessibilidade', 'LCP'],
  },
  links: {
    term: 'Links Internos e Externos',
    badge: 'Link Building',
    difficulty: '●●○',
    def: 'Links internos conectam páginas do mesmo site — distribuem autoridade (PageRank) e guiam o crawler. Links externos apontam para outros domínios — se são dofollow, passam autoridade para fora; se são nofollow, não passam. A proporção e qualidade de ambos importam.',
    bad: { label: '❌ Página isolada', text: 'Uma LP com 0 links internos. O Google encontra a página, mas não consegue navegar para o restante do site a partir dela. Toda autoridade fica presa aqui sem fluir.' },
    good: { label: '✅ Linkagem estratégica', text: '3-5 links internos para páginas relacionadas com âncoras descritivas. Links externos para fontes autoritativas (estudos, dados). Balanço entre dar e receber juice.' },
    analogy: 'Links internos são as estradas entre cidades. Sem estradas, cada cidade (página) é uma ilha. O PageRank é o fluxo de carros — só chega onde há estrada.',
    impact: '<strong>Âncoras genéricas</strong> ("clique aqui", "saiba mais") desperdiçam o sinal semântico do link. Use âncoras descritivas que incluam a keyword da página destino.',
    tags: ['PageRank', 'Âncoras', 'Link Juice', 'Crawl', 'Nofollow'],
  },
  robotstxt: {
    term: 'robots.txt',
    badge: 'Crawl Control',
    difficulty: '●●○',
    def: 'O robots.txt é um arquivo de texto na raiz do site que instrui crawlers sobre quais URLs podem ou não ser acessadas. É o primeiro arquivo que o Googlebot busca ao descobrir um domínio. Erros aqui podem bloquear o site inteiro da indexação.',
    bad: { label: '❌ Disallow: /', text: 'User-agent: * Disallow: / — bloqueia todos os crawlers de todo o site. Geralmente configurado por engano em ambientes de staging que migraram para produção. Consequência: sumiço completo do Google.' },
    good: { label: '✅ Configurado corretamente', text: 'Bloqueia apenas pastas que não devem ser indexadas (/wp-admin/, /checkout/, /conta/) e inclui a URL do Sitemap: https://site.com/sitemap.xml no final.' },
    analogy: 'O robots.txt é o segurança na entrada do condomínio com a lista de quem pode entrar em qual área. Se a lista diz "ninguém entra", o Google respeita e vai embora.',
    impact: '<strong>Importante:</strong> bloquear uma URL no robots.txt NÃO a remove do índice se já estava indexada e recebe links. Para remover, use noindex ou a ferramenta de remoção do Search Console.',
    tags: ['Crawl', 'Indexabilidade', 'Sitemap', 'Robots Tag'],
  },
  sitemapxml: {
    term: 'Sitemap.xml',
    badge: 'Crawl Control',
    difficulty: '●○○',
    def: 'O sitemap.xml é um arquivo que lista todas as URLs importantes do site com metadados (data de modificação, frequência de atualização, prioridade). É o mapa que você entrega ao Google para que ele saiba quais páginas existem e quando foram atualizadas.',
    bad: { label: '❌ Ausente ou desatualizado', text: 'Site com 200 páginas sem sitemap. O Google descobre URLs rastreando links — lento e incompleto. Páginas sem links internos suficientes podem nunca ser descobertas.' },
    good: { label: '✅ Atualizado automaticamente', text: 'Sitemap gerado pelo CMS sempre que uma página é criada ou atualizada. Inclui apenas páginas indexáveis (sem noindex). URL declarada no robots.txt para descoberta automática.' },
    analogy: 'O sitemap é o cardápio entregue na mesa antes de o garçom perguntar. Sem ele, o Google tem que descobrir os pratos circulando pela cozinha — leva muito mais tempo.',
    impact: '<strong>Dica:</strong> exclua do sitemap páginas com noindex, páginas de resultado de busca interna, e URLs com parâmetros. Sitemap com URLs de baixa qualidade dilui o crawl budget.',
    tags: ['Crawl Budget', 'Indexabilidade', 'robots.txt', 'Google Search Console'],
  },
  llmstxt: {
    term: 'llms.txt',
    badge: 'GEO / AEO',
    difficulty: '●●●',
    def: 'O llms.txt é um padrão emergente (proposto em 2024) que serve como "sitemap para IAs". Ele orienta crawlers de modelos de linguagem (ChatGPT, Claude, Gemini, Perplexity) sobre quais conteúdos são mais relevantes, confiáveis e como devem ser usados no treinamento ou em respostas.',
    bad: { label: '❌ Ausente', text: 'Sem llms.txt, cada IA decide sozinha o que raspar e como usar. Conteúdo de baixa qualidade pode ser priorizado sobre seu conteúdo especializado. Você perde controle sobre a narrativa da sua marca na IA.' },
    good: { label: '✅ Estruturado', text: 'llms.txt com seções marcadas: # NomeDoSite, ## Sobre, ## Conteúdo Principal, links para as páginas mais importantes e descrição de uso. A IA encontra o melhor do seu conteúdo primeiro.' },
    analogy: 'O llms.txt é como enviar um press kit para um jornalista antes da entrevista. Em vez de ele fuçar tudo, você entrega o que importa organizado — a narrativa que você quer que ele conte.',
    impact: '<strong>Padrão emergente:</strong> ainda não há confirmação oficial de Google/OpenAI, mas sites que adotam cedo ganham vantagem de citabilidade à medida que AIs evoluem para respeitar o arquivo.',
    tags: ['GEO', 'AEO', 'Citabilidade', 'robots.txt', 'Crawler de IA'],
  },
  securitytxt: {
    term: 'security.txt',
    badge: 'E-E-A-T / Trust',
    difficulty: '●●○',
    def: 'O security.txt (RFC 9116) é um arquivo padronizado em /.well-known/security.txt que informa como reportar vulnerabilidades de segurança ao site. Não é fator de ranking direto, mas é sinal de maturidade técnica e credibilidade institucional — componentes de E-E-A-T.',
    bad: { label: '❌ Ausente', text: 'Sem security.txt. Um pesquisador que encontra uma vulnerabilidade no seu site não sabe para onde reportar. A falha pode ficar exposta ou ser divulgada publicamente sem aviso.' },
    good: { label: '✅ Configurado', text: 'Contact: mailto:seguranca@empresa.com, Expires: 2026-01-01T00:00:00z, Preferred-Languages: pt — canal oficial de divulgação responsável.' },
    analogy: 'O security.txt é como ter a placa "Fale com o gerente" na loja. Sem ela, um cliente insatisfeito (ou um pesquisador de segurança) não sabe com quem reclamar e vai para o Reclame Aqui (internet pública).',
    impact: '<strong>E-E-A-T:</strong> Google avalia confiabilidade de domínios parcialmente por sinais de governança e transparência. Sites com estruturas de segurança visíveis são mais confiáveis para conteúdo YMYL.',
    tags: ['E-E-A-T', 'Confiabilidade', 'YMYL', 'Segurança'],
  },
  rssfeed: {
    term: 'RSS / Feed',
    badge: 'Conteúdo',
    difficulty: '●○○',
    def: 'RSS (Really Simple Syndication) é um formato XML que lista as publicações mais recentes de um site em ordem cronológica. Agregadores de conteúdo, ferramentas de monitoramento, e alguns crawlers de IA usam feeds para detectar conteúdo novo automaticamente.',
    bad: { label: '❌ Ausente', text: 'Blog sem feed RSS. Ferramentas que monitoram seu conteúdo (Feedly, leitores de RSS, agregadores de notícias) não conseguem detectar novos artigos automaticamente. Alcance limitado.' },
    good: { label: '✅ Ativo e válido', text: 'Feed RSS/Atom no /feed ou /feed.xml com as 10-20 publicações mais recentes, incluindo título, descrição, data e link. Descoberto automaticamente via <link rel="alternate" type="application/rss+xml">.' },
    analogy: 'O RSS é como uma assinatura de jornal. Em vez de você ir à banca todo dia (visitar o site), o jornal chega na sua porta (o feed notifica). Para ferramentas automáticas, isso é decisivo.',
    impact: '<strong>Para blogs de conteúdo:</strong> um feed ativo melhora a velocidade de indexação de novos artigos. O Google Discover e algumas ferramentas de IA usam feeds para detectar conteúdo fresco.',
    tags: ['Conteúdo', 'Indexação', 'Blog', 'Crawl'],
  },
  manifest: {
    term: 'Web App Manifest',
    badge: 'PWA / Técnico',
    difficulty: '●●○',
    def: 'O manifest.json define como um site se comporta quando instalado como Progressive Web App (PWA) — ícone na tela inicial, cor do tema, modo de exibição (fullscreen, standalone), nome do app. Não é fator de ranking direto, mas contribui para Core Web Vitals e experiência mobile.',
    bad: { label: '❌ Ausente', text: 'Site sem manifest. No Android Chrome, o banner "Adicionar à tela inicial" nunca aparece. Sem ícone personalizado. Oportunidade de engajamento recorrente perdida.' },
    good: { label: '✅ Configurado', text: '{ "name": "Move Máquinas", "short_name": "Move", "start_url": "/", "display": "standalone", "theme_color": "#1D9648", "icons": [...] } — app instalável com identidade visual.' },
    analogy: 'O manifest é a ficha de identidade do app. Sem ela, seu site é um visitante sem crachá — pode entrar, mas não fica no celular como morador.',
    impact: '<strong>Google usa PWA installability</strong> como sinal de qualidade de experiência. Sites instáveis ou lentos não se qualificam para PWA, o que correlaciona negativamente com Core Web Vitals.',
    tags: ['PWA', 'Core Web Vitals', 'Mobile', 'UX'],
  },
  secheaders: {
    term: 'Security Headers',
    badge: 'Segurança / E-E-A-T',
    difficulty: '●●○',
    def: 'Security headers são instruções que o servidor envia no cabeçalho HTTP de cada resposta — antes mesmo do HTML carregar. Eles dizem ao browser como se proteger contra os ataques mais comuns: scripts maliciosos injetados (XSS), páginas falsas em iframe (clickjacking), e arquivos executados com tipo errado (MIME sniffing).',
    bad: { label: '❌ Sem headers de segurança', text: 'Um site sem Content-Security-Policy pode ter scripts injetados por atacantes — roubando dados de usuários ou redirecionando visitantes para páginas maliciosas. O Google Safe Browsing detecta e sinaliza esses sites na SERP com aviso "Este site pode ser perigoso".' },
    good: { label: '✅ Nota A ou A+', text: 'HSTS ativo (força HTTPS), CSP configurado (bloqueia scripts externos não autorizados), X-Frame-Options: DENY (impede clickjacking), Referrer-Policy: strict-origin (protege privacidade), Permissions-Policy (controla câmera/microfone). Resultado: nota A ou A+ no securityheaders.com.' },
    analogy: 'Security headers são o sistema de alarme, câmeras e cofre da loja — invisíveis para o cliente, mas essenciais para o dono. Uma loja sem segurança pode parecer normal por fora, mas está aberta para invasores.',
    impact: '<strong>Impacto direto no SEO:</strong> sites hackeados são sinalizados pelo Google Safe Browsing e podem ser removidos da SERP ou exibidos com aviso vermelho — zerando o tráfego orgânico. <strong>E-E-A-T:</strong> Google avalia confiabilidade de domínios; segurança visível é sinal de seriedade, especialmente para sites YMYL (saúde, finanças, jurídico).',
    tags: ['E-E-A-T', 'Google Safe Browsing', 'YMYL', 'HTTPS', 'XSS'],
  },
};

// Mapeamento: data-tip keyword → chave do GLOSS_DB
const GLOSS_KEY_MAP = {
  'O título aparece na aba': 'title',
  'A meta description': 'description',
  'Estrutura da URL': 'url',
  'URL atual da página': 'url',
  'A URL canônica': 'canonical',
  'Controla se o Google indexa': 'robots',
  'Diretiva de robots no cabeçalho HTTP': 'xrobots',
  'Meta keywords': 'keywords',
  'og:site_name': 'publisher',
  'Número de palavras': 'wordcount',
  'Atributo lang': 'lang',
  'Contagem de headings': 'headings',
  'alt text': 'images',
  'Imagens e alt': 'images',
  'links internos': 'links',
  'Links internos': 'links',
  'robots.txt': 'robotstxt',
  'Sitemap': 'sitemapxml',
  'llms.txt': 'llmstxt',
  'security.txt': 'securitytxt',
  'Feed RSS': 'rssfeed',
  'Web App Manifest': 'manifest',
  'Headers HTTP de segurança': 'secheaders',
};

function findGlossKey(tip) {
  if (!tip) return null;
  for (const [fragment, key] of Object.entries(GLOSS_KEY_MAP)) {
    if (tip.includes(fragment)) return key;
  }
  return null;
}

function renderGlossDrawer(key) {
  const entry = GLOSS_DB[key];
  if (!entry) return;

  const badge     = document.getElementById('gloss-badge');
  const diff      = document.getElementById('gloss-difficulty');
  const body      = document.getElementById('gloss-body');

  if (badge) badge.textContent = entry.badge;
  if (diff)  diff.textContent  = entry.difficulty;

  if (body) body.innerHTML = `
    <div>
      <div class="gloss-term">${entry.term}</div>
      <p class="gloss-def">${entry.def}</p>
    </div>

    ${entry.bad || entry.good ? `
    <div>
      <div class="gloss-section-title">Exemplos práticos</div>
      <div class="gloss-examples">
        ${entry.bad  ? `<div class="gloss-ex gloss-ex--bad"><strong>${entry.bad.label}</strong>${entry.bad.text}</div>` : ''}
        ${entry.good ? `<div class="gloss-ex gloss-ex--good"><strong>${entry.good.label}</strong>${entry.good.text}</div>` : ''}
      </div>
    </div>` : ''}

    ${entry.analogy ? `
    <div>
      <div class="gloss-section-title">Analogia</div>
      <div class="gloss-analogy">${entry.analogy}</div>
    </div>` : ''}

    ${entry.impact ? `
    <div>
      <div class="gloss-section-title">Impacto SEO</div>
      <div class="gloss-impact">${entry.impact}</div>
    </div>` : ''}

    ${entry.tags && entry.tags.length ? `
    <div>
      <div class="gloss-section-title">Termos relacionados</div>
      <div class="gloss-tags">${entry.tags.map(t => `<span class="gloss-tag">${t}</span>`).join('')}</div>
    </div>` : ''}
  `;

  const overlay = document.getElementById('gloss-overlay');
  const drawer  = document.getElementById('gloss-drawer');
  if (overlay) overlay.classList.add('open');
  if (drawer)  { drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); }
}

function closeGlossDrawer() {
  const overlay = document.getElementById('gloss-overlay');
  const drawer  = document.getElementById('gloss-drawer');
  if (overlay) overlay.classList.remove('open');
  if (drawer)  { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }
}

document.addEventListener('DOMContentLoaded', () => {
  // Clique no ? abre o drawer
  document.addEventListener('click', e => {
    const icon = e.target.closest('.help-icon[data-tip]');
    if (icon) {
      e.stopPropagation();
      const key = findGlossKey(icon.dataset.tip);
      if (key) renderGlossDrawer(key);
      return;
    }
    // Fecha ao clicar fora
    if (e.target.id === 'gloss-overlay' || e.target.closest('#gloss-close')) {
      closeGlossDrawer();
    }
  });

  // ESC fecha
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeGlossDrawer();
  });
});


// ══════════════════════════════════════════════════════════════
// ABA APRENDER — Maturare SEO Academy (3 níveis)
// ══════════════════════════════════════════════════════════════

const LA_STORAGE_KEY = 'la_completed_lessons';

function laGetCompleted() {
  try { return JSON.parse(localStorage.getItem(LA_STORAGE_KEY) || '[]'); } catch { return []; }
}
function laSetCompleted(arr) {
  try { localStorage.setItem(LA_STORAGE_KEY, JSON.stringify(arr)); } catch {}
}
function laIsCompleted(chapterIdx, lessonIdx) {
  return laGetCompleted().includes(`${chapterIdx}_${lessonIdx}`);
}
function laMarkCompleted(chapterIdx, lessonIdx) {
  const arr = laGetCompleted();
  const key = `${chapterIdx}_${lessonIdx}`;
  if (!arr.includes(key)) { arr.push(key); laSetCompleted(arr); }
}

// ── Dados dos capítulos e lições ─────────────────────────────
// AUTO-GENERATED from Semantic SEO Expert learn-data.json — translated to PT-BR / Maturare voice
// 54 lições - Maturare SEO Academy - PT-BR
const LA_CHAPTERS = [
  {
    icon: '🌐',
    color: '#0d9488',
    title: `O que é SEO Semântico?`,
    desc: `SEO Semântico é sobre ajudar o Google a entender o SIGNIFICADO do seu conteúdo, não apenas as palavras. É a diferença entre um robô que conta palavras e um que realmente entende frases!`,
    lessons: [
      {
        id: 'ch1-l1',
        icon: '🔑',
        title: `Keywords vs. Significado`,
        level: 'iniciante', levelLabel: 'Iniciante',
        content: `O SEO antigo era simples: use uma keyword como 'melhor pizza' várias vezes e o Google te ranqueava. Mas o Google ficou mais inteligente! Agora ele lê sua página como um professor lê uma redação, buscando significado, não só palavras repetidas.

**Exemplo:** Se alguém pesquisa 'apple', a pessoa quer a fruta ou a empresa de tecnologia? O Google analisa as palavras ao redor para descobrir. Isso é busca semântica!`,
        keyTerms: [
          { term: `Keyword`, def: `Uma palavra que as pessoas digitam no Google para encontrar algo` },
          { term: `Busca Semântica`, def: `Google entendendo o significado por trás das palavras, não só as palavras em si` },
          { term: `Intenção de Busca`, def: `O que a pessoa realmente QUER ao pesquisar: informação, produto ou um site específico` },
        ],
        quiz: {
          q: `Alguém pesquisa 'como fazer bolo de cenoura'. O que essa pessoa quer?`,
          opts: [`Comprar um bolo pronto`, `Instruções passo a passo para fazer o bolo`, `Uma confeitaria perto de casa`, `Fotos de bolos`],
          correct: 1,
          feedback: `A intenção é APRENDER como fazer algo. Intenção informacional. O Google sabe disso e mostra receitas e guias práticos, não páginas de produto.`
        }
      },
      {
        id: 'ch1-l2',
        icon: '🧩',
        title: `O que é uma Entidade?`,
        level: 'iniciante', levelLabel: 'Iniciante',
        content: `Uma entidade é qualquer coisa real e definível: pessoa, lugar, organização, conceito ou evento. O Google constrói seu conhecimento a partir de entidades, não de keywords.

**Exemplos de entidades:**
• Friboi (uma empresa)
• São Paulo (uma cidade)
• COVID-19 (uma doença)
• iPhone 15 (um produto)

Cada entidade tem **atributos**, que são características ou fatos sobre ela. Os atributos da Friboi incluem: tipo (empresa), setor (alimentos), sede (São Paulo).`,
        keyTerms: [
          { term: `Entidade`, def: `Qualquer coisa real e identificável que o Google consegue definir: pessoa, lugar, produto ou conceito` },
          { term: `Atributo`, def: `Um fato ou característica que descreve uma entidade, como fundador, localização ou preço` },
          { term: `Entity Salience`, def: `O grau de destaque de uma entidade na página. Quanto mais central, mais o Google a nota` },
        ],
        quiz: {
          q: `Qual destes é uma ENTIDADE?`,
          opts: [`A palavra 'correr'`, `Pelé (jogador de futebol)`, `A frase 'melhores dicas'`, `A palavra 'e'`],
          correct: 1,
          feedback: `Pelé é uma pessoa real e específica, uma entidade definida. O Google conhece fatos sobre ele: esportes, títulos, nacionalidade.`
        }
      },
      {
        id: 'ch1-l3',
        icon: '🕸️',
        title: `O Knowledge Graph do Google`,
        level: 'iniciante', levelLabel: 'Iniciante',
        content: `Imagine uma teia gigante onde cada ponto é uma entidade e cada linha conectando os pontos é uma relação. Isso é o Knowledge Graph do Google!

**Exemplo:**
• Daniel Rios fundou a Maturare
• Maturare é especialista em GEO, AEO e SEO
• GEO é um tipo de otimização digital

Quando seu conteúdo cria conexões claras entre entidades, o Google consegue entendê-lo muito melhor!`,
        keyTerms: [
          { term: `Knowledge Graph`, def: `O banco de dados do Google conectando milhões de entidades e suas relações` },
          { term: `Triple Semântico`, def: `Um fato estruturado como Sujeito, Predicado e Objeto. Exemplo: Goiânia é capital de Goiás` },
          { term: `Knowledge Panel`, def: `A caixa lateral que aparece no Google mostrando fatos sobre uma entidade` },
        ],
        quiz: {
          q: `Complete: 'Maturare é especialista em ___'`,
          opts: [`Marketing em geral`, `GEO, AEO e SEO Semântico`, `Grande literatura`, `Palavras-chave antigas`],
          correct: 1,
          feedback: `GEO, AEO e SEO Semântico é o atributo específico. Triples semânticos precisam ser específicos: Sujeito, Predicado específico e Objeto específico.`
        }
      },
      {
        id: 'ch1-l4',
        icon: '🏆',
        title: `Topical Authority: Seja a Referência!`,
        level: 'iniciante', levelLabel: 'Iniciante',
        content: `Topical Authority é quando o Google te vê como a fonte mais confiável e completa sobre um tema inteiro, não só sobre uma página.

Pense assim: para uma cirurgia cardíaca, você prefere um clínico geral ou um cardiologista especialista? O Google pensa igual.

**Como construir Topical Authority:**
• Cobrir todos os subtópicos relevantes do tema
• Criar conteúdo interconectado (Topic Clusters)
• Atualizar regularmente com informações novas
• Ter autores identificados com expertise documentada`,
        keyTerms: [
          { term: `Topical Authority`, def: `O grau em que o Google considera seu site a referência mais completa sobre um tema` },
          { term: `Topic Cluster`, def: `Um grupo de páginas inter-relacionadas cobrindo um tema central e seus subtópicos` },
          { term: `Cobertura Tópica`, def: `O percentual dos subtópicos essenciais de um tema que você já produziu` },
        ],
        quiz: {
          q: `Um site tem 1 artigo excelente sobre 'empilhadeiras' mas nenhuma outra página sobre o tema. Ele tem Topical Authority?`,
          opts: [`Sim, qualidade é o que importa`, `Não. Topical Authority exige cobertura completa de todos os subtópicos`, `Depende dos backlinks`, `Depende da idade do domínio`],
          correct: 1,
          feedback: `Topical Authority é cobertura mais profundidade mais inter-relação. Um artigo, por melhor que seja, cobre apenas um ângulo. O Google quer ver o tema inteiro coberto.`
        }
      },
    ]
  },
  {
    icon: '🗺️',
    color: '#0891b2',
    title: `Construindo um Mapa Tópico`,
    desc: `Um Mapa Tópico é a planta baixa do seu site. Sem ele, você escreve artigos aleatórios e torce para ranquear. Com ele, cada página tem propósito, posição e conexão semântica.`,
    lessons: [
      {
        id: 'ch2-l1',
        icon: '📋',
        title: `O que é um Mapa Tópico?`,
        level: 'iniciante', levelLabel: 'Iniciante',
        content: `Um mapa tópico é como um currículo escolar para o seu site: mostra tudo que precisa ser coberto para ser considerado referência em um tema.

**Partes de um mapa tópico:**
• **Seção Core** = os subtópicos mais importantes (alta prioridade)
• **Seção Outer** = tópicos relacionados que adicionam profundidade
• **Topic Nodes** = as páginas e artigos individuais

**Exemplo para recreação infantil:**
• Core: aluguel de brinquedo inflável, pacotes de festa infantil
• Outer: segurança infantil, dicas de animação`,
        keyTerms: [
          { term: `Mapa Tópico`, def: `Um plano completo mostrando todos os tópicos e subtópicos que seu site precisa cobrir` },
          { term: `Seção Core`, def: `Os tópicos mais importantes e diretamente relacionados ao tema central: alta prioridade` },
          { term: `Seção Outer`, def: `Tópicos relacionados que adicionam profundidade mas não são o foco principal` },
        ],
        quiz: {
          q: `Para um site de culinária brasileira, qual é um tópico CORE?`,
          opts: [`História dos talheres medievais`, `Como fazer feijão tropeiro`, `Restaurantes famosos na Itália`, `Reforma de cozinha`],
          correct: 1,
          feedback: `'Como fazer feijão tropeiro' é diretamente sobre culinária brasileira, o core do tema. Os outros são periféricos ou completamente off-topic.`
        }
      },
      {
        id: 'ch2-l2',
        icon: '🎯',
        title: `Encontrando sua Entidade Central`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Antes de mapear tópicos, identifique qual é a entidade central do seu negócio.

A entidade central define seus Topical Borders, o território semântico que você domina. Conteúdo fora desse território dilui sua autoridade.

**Como identificar:**
• O que você vende ou oferece?
• Para quem exatamente?
• Em qual região?
• Qual problema principal resolve?

Uma clínica odontológica que começa a escrever sobre culinária está saindo dos seus Topical Borders. O Google questiona a especialização.`,
        keyTerms: [
          { term: `Entidade Central`, def: `A entidade principal que define o domínio semântico do seu site` },
          { term: `Topical Borders`, def: `Os limites que definem onde seu tema termina e outro começa` },
          { term: `Distância Semântica`, def: `O número de saltos conceituais entre duas entidades. Quanto menor, mais relacionadas` },
        ],
        quiz: {
          q: `Uma agência de SEO começa a publicar receitas de culinária. O que acontece semanticamente?`,
          opts: [`Atrai mais tráfego positivamente`, `Dilui a Topical Authority em SEO ao sair dos Topical Borders`, `O Google ignora o conteúdo off-topic`, `Melhora o E-E-A-T`],
          correct: 1,
          feedback: `Conteúdo off-topic sinaliza ao Google que o site não é especializado em nenhum tema específico, diluindo a autoridade no tema principal.`
        }
      },
      {
        id: 'ch2-l3',
        icon: '🔍',
        title: `Análise de SERP: Espione o que Funciona!`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Antes de criar conteúdo, analise o que já ranqueia para suas queries-alvo. A SERP é um espelho do que o Google considera relevante.

**O que observar na SERP:**
• Quais tipos de página ranqueiam? Artigos, LPs, vídeos?
• Qual o comprimento médio do conteúdo?
• Quais entidades aparecem em destaque?
• Existe AI Overview? O que ele cita?
• Quais subtópicos os concorrentes cobrem?

Se todos são artigos informativos e você cria uma LP de venda, está lutando contra a intenção dominante da SERP.`,
        keyTerms: [
          { term: `SERP`, def: `Search Engine Results Page, a página de resultados do Google para uma query` },
          { term: `Intent Purity`, def: `Alinhamento entre o tipo de página criada e a intenção de busca dominante na SERP` },
          { term: `AI Overview`, def: `Resposta sintetizada pelo Google usando IA que aparece acima dos resultados orgânicos` },
        ],
        quiz: {
          q: `Você quer ranquear para 'o que é GEO no marketing'. A SERP mostra só artigos explicativos. O que criar?`,
          opts: [`Uma página de vendas`, `Um artigo explicativo alinhado com a intenção informacional da SERP`, `Uma página de produto`, `Um vídeo no YouTube`],
          correct: 1,
          feedback: `A SERP revela a intenção dominante: informacional. Um artigo explicativo alinha sua página com o que o Google já considera relevante.`
        }
      },
      {
        id: 'ch2-l4',
        icon: '🗂️',
        title: `Query Clustering: Agrupe suas Keywords!`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Nem toda query diferente precisa de uma página diferente. Queries com a **mesma intenção de busca** devem ser resolvidas pela mesma URL.

**Exemplo de cluster:**
• 'aluguel empilhadeira Goiânia'
• 'alugar empilhadeira em Goiânia'
• 'locação empilhadeira Goiânia preço'

Mesma intenção transacional, uma única LP.

**Cuidado com canibalização:** páginas separadas para cada variação fazem suas próprias páginas competirem entre si no Google.`,
        keyTerms: [
          { term: `Query Clustering`, def: `Agrupar queries com a mesma intenção de busca para uma única URL otimizada` },
          { term: `Canibalização`, def: `Quando múltiplas páginas do mesmo site competem pela mesma query, dividindo o ranqueamento` },
          { term: `Query Expansion`, def: `O processo onde o Google amplia internamente a busca com termos semanticamente relacionados` },
        ],
        quiz: {
          q: `'Dentista implante Niterói' e 'implante dentário em Niterói preço' precisam de páginas separadas?`,
          opts: [`Sim, são queries diferentes`, `Não. Mesma intenção transacional, mesma página. Separar causaria canibalização.`, `Depende do volume de busca`, `Sempre separe para mais tráfego`],
          correct: 1,
          feedback: `Mesma intenção (encontrar dentista de implante em Niterói) significa mesma URL. Páginas separadas competem entre si e enfraquecem as duas.`
        }
      },
    ]
  },
  {
    icon: '✍️',
    color: '#dc2626',
    title: `Escrevendo Conteúdo Semântico`,
    desc: `Conteúdo semântico não é sobre quantidade de palavras. É sobre densidade de significado. Aprenda a estruturar textos que o Google e a IA entendem, extraem e citam.`,
    lessons: [
      {
        id: 'ch3-l1',
        icon: '📜',
        title: `As Regras de Ouro da Escrita Semântica`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Escrever para SEO semântico não é sobre repetir keywords. É sobre cobrir o tema com profundidade que a IA consegue extrair.

**As regras de ouro:**
• Responda a intenção principal nos primeiros parágrafos
• Use o vocabulário natural do domínio (co-ocorrências)
• Escreva em chunks coesos: cada seção responde uma pergunta
• Declare entidades claramente, não assuma que o leitor já sabe
• Inclua claims verificáveis com dados específicos

Evite texto vago, afirmações sem embasamento e padding de palavras.`,
        keyTerms: [
          { term: `Co-Occurrence`, def: `Termos semanticamente relacionados que naturalmente aparecem juntos em conteúdo especializado` },
          { term: `Claim`, def: `Afirmação factual verificável que uma IA pode extrair e usar como resposta` },
          { term: `Content Chunking`, def: `Divisão do texto em blocos coesos onde cada um responde uma intenção específica` },
        ],
        quiz: {
          q: `Qual destes é um 'claim' forte para SEO semântico?`,
          opts: [`'SEO é muito importante para empresas'`, `'Agências de SEO ajudam negócios a crescer'`, `'Sites com Schema Markup têm 20 a 30% mais CTR em rich results'`, `'Conteúdo bom ranqueia melhor'`],
          correct: 2,
          feedback: `O terceiro é forte: específico (20 a 30%), mensurável (CTR), sobre um mecanismo concreto (Schema mais rich results). Os outros são vagos e não verificáveis.`
        }
      },
      {
        id: 'ch3-l2',
        icon: '🏗️',
        title: `Estrutura de Conteúdo: Os Títulos Importam!`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `A hierarquia de títulos (H1, H2, H3) não é só visual. É o esqueleto semântico da sua página. O Google usa os títulos para entender a estrutura lógica do conteúdo.

**Boas práticas:**
• **H1:** o tópico principal da página (único, contém a entidade principal)
• **H2:** os subtópicos principais (como capítulos)
• **H3:** detalhamentos dos H2s

**Dica AEO:** Formule H2s como perguntas. 'O que é Topical Authority?' Isso aumenta a chance de aparecer no AI Overview.`,
        keyTerms: [
          { term: `H1`, def: `O título principal da página, deve conter a entidade central e aparecer uma única vez` },
          { term: `Hierarquia de Títulos`, def: `A estrutura lógica H1, H2, H3 que organiza o conteúdo semanticamente` },
          { term: `AEO`, def: `Answer Engine Optimization, otimizar para responder perguntas em motores de resposta como o AI Overview` },
        ],
        quiz: {
          q: `Quantos H1s uma página deve ter?`,
          opts: [`Quantos forem necessários`, `Apenas um, o título principal da página`, `Pelo menos três para mais keywords`, `Nenhum, H2 é suficiente`],
          correct: 1,
          feedback: `Apenas um H1 por página. Múltiplos H1s confundem o Google sobre o tópico principal. A entidade central deve estar nesse único H1.`
        }
      },
      {
        id: 'ch3-l3',
        icon: '🏷️',
        title: `Entidades na sua Escrita`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Mencionar entidades claramente é fundamental para que o Google as reconheça e conecte ao Knowledge Graph.

**Como declarar entidades de forma eficaz:**
• Na primeira menção: use o nome completo. 'Move Máquinas', não só 'Move'
• Com atributos: 'a Move Máquinas, empresa de locação de equipamentos industriais em Goiânia'
• Com relações: 'a Move Máquinas é distribuidora autorizada Clark no Centro-Oeste'
• No Schema Markup: reforce com JSON-LD Organization

Entidades declaradas explicitamente têm maior Entity Salience.`,
        keyTerms: [
          { term: `Declaração de Entidade`, def: `Mencionar uma entidade com seus atributos e relações de forma explícita e não ambígua` },
          { term: `Entity Salience`, def: `O grau de destaque de uma entidade no texto. Quanto mais central, maior a salience` },
          { term: `Desambiguação`, def: `Deixar claro qual entidade específica você está mencionando quando o nome é ambíguo` },
        ],
        quiz: {
          q: `Qual é a melhor forma de apresentar uma empresa pela primeira vez num artigo?`,
          opts: [`'A empresa'`, `'A Move Máquinas, empresa de locação de equipamentos industriais em Goiânia'`, `'Eles'`, `'O negócio'`],
          correct: 1,
          feedback: `Nome completo mais tipo de negócio mais localização é a declaração de entidade completa. Isso ajuda o Google a identificar e categorizar a entidade corretamente.`
        }
      },
      {
        id: 'ch3-l4',
        icon: '⭐',
        title: `Featured Snippets: Conquiste o Topo!`,
        level: 'avancado', levelLabel: 'Avançado',
        content: `Featured Snippets são as respostas destacadas que aparecem acima dos resultados orgânicos. Para conquistá-los, seu conteúdo precisa responder a pergunta de forma direta e bem estruturada.

**Tipos de Featured Snippets:**
• **Parágrafo:** resposta em 40 a 60 palavras
• **Lista:** passos ou itens numerados
• **Tabela:** comparações ou dados tabulares

**Fórmula para parágrafo snippet:**
H2 com a pergunta, parágrafo 1 com resposta direta em 40 a 60 palavras, detalhes depois.`,
        keyTerms: [
          { term: `Featured Snippet`, def: `Resposta destacada que aparece acima dos resultados orgânicos, extraída do conteúdo de uma página` },
          { term: `Position Zero`, def: `A posição acima do número 1 orgânico, ocupada pelo Featured Snippet` },
          { term: `Resposta Direta`, def: `Formato: pergunta no H2 mais resposta em 40 a 60 palavras no primeiro parágrafo da seção` },
        ],
        quiz: {
          q: `Qual estrutura maximiza as chances de conquistar um Featured Snippet de parágrafo?`,
          opts: [`Texto corrido sem subtítulos`, `Pergunta no H2 mais resposta direta em 40 a 60 palavras no primeiro parágrafo`, `Listas com mais de 20 itens`, `Tabelas com muitas colunas`],
          correct: 1,
          feedback: `O Google extrai esse padrão: identifica a pergunta no H2 e extrai a resposta direta do primeiro parágrafo. Clareza e concisão são essenciais.`
        }
      },
    ]
  },
  {
    icon: '📑',
    color: '#7c3aed',
    title: `Briefings de Conteúdo e Estratégia`,
    desc: `Um briefing bem feito economiza horas de retrabalho. Aprenda a criar guias de conteúdo que alinham SEO, intenção de busca e E-E-A-T antes de escrever a primeira palavra.`,
    lessons: [
      {
        id: 'ch4-l1',
        icon: '📝',
        title: `O que é um Briefing de Conteúdo?`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Um briefing de conteúdo é um documento que guia o escritor antes de começar o artigo. É o GPS do conteúdo. Sem ele, você pode criar algo excelente que ranqueia para a query errada.

**O que um bom briefing inclui:**
• Intenção de busca principal
• Entidade central e atributos
• Subtópicos obrigatórios (do mapa tópico)
• Termos de co-occurrence relevantes
• Tom e nível de expertise
• Comprimento estimado e estrutura de H2s`,
        keyTerms: [
          { term: `Briefing de Conteúdo`, def: `Um documento que define o que cobrir, como estruturar e para quem escrever antes de começar` },
          { term: `Subtópicos Obrigatórios`, def: `Os temas que PRECISAM aparecer na página para cobrir a intenção de busca completamente` },
          { term: `Tom de Voz`, def: `O estilo e nível de formalidade do conteúdo, deve refletir a expertise do autor e as expectativas do público` },
        ],
        quiz: {
          q: `Por que um briefing de conteúdo é importante antes de escrever?`,
          opts: [`Para impressionar o cliente`, `Para garantir que o conteúdo cubra a intenção certa, os subtópicos certos e a entidade central antes de começar`, `Para aumentar o número de palavras`, `Para escolher as imagens`],
          correct: 1,
          feedback: `O briefing evita retrabalho: garante alinhamento entre intenção de busca, entidades, estrutura e expertise antes da primeira palavra ser escrita.`
        }
      },
      {
        id: 'ch4-l2',
        icon: '🌉',
        title: `Pontes Contextuais e Links Internos`,
        level: 'avancado', levelLabel: 'Avançado',
        content: `Links internos não são só navegação. São **canais de transferência de autoridade semântica** entre páginas do mesmo site.

Pontes Contextuais são links que conectam conteúdos relacionados semanticamente, reforçando o cluster tópico.

**Regras para links internos eficazes:**
• Use anchor text descritivo, não 'clique aqui'
• Links de páginas fortes para páginas que precisam de autoridade
• Conecte sempre ao Root Seed Node (hub principal do cluster)
• Evite links de navegação genéricos como substitutos de links contextuais`,
        keyTerms: [
          { term: `Link Interno`, def: `Um link de uma página do seu site para outra página do mesmo site` },
          { term: `Anchor Text`, def: `O texto clicável de um link, deve descrever o destino, não ser genérico como 'clique aqui'` },
          { term: `Root Seed Node`, def: `A página pilar que define o universo semântico e distribui autoridade para os subtópicos` },
        ],
        quiz: {
          q: `Qual é o melhor anchor text para um link sobre aluguel de empilhadeira em Goiânia?`,
          opts: [`'Clique aqui'`, `'aluguel de empilhadeira em Goiânia'`, `'saiba mais'`, `'acesse o link'`],
          correct: 1,
          feedback: `Anchor text descritivo comunica ao Google o contexto semântico do destino. Textos genéricos como 'clique aqui' não transmitem nenhuma informação semântica.`
        }
      },
      {
        id: 'ch4-l3',
        icon: '🎓',
        title: `E-E-A-T: Experiência, Expertise, Autoridade, Confiança`,
        level: 'avancado', levelLabel: 'Avançado',
        content: `E-E-A-T é o framework do Google para avaliar a qualidade e confiabilidade de um conteúdo. Não é um algoritmo com pontuação. É o que os Quality Raters do Google usam como critério.

**Os 4 pilares:**
• **Experience:** você viveu o que está escrevendo?
• **Expertise:** você tem conhecimento técnico no domínio?
• **Authoritativeness:** outros especialistas te reconhecem?
• **Trustworthiness:** o site é transparente e preciso?

O primeiro 'E' (Experience) foi adicionado em 2022. O Google passou a valorizar experiência vivida além do conhecimento teórico.`,
        keyTerms: [
          { term: `E-E-A-T`, def: `Experience, Expertise, Authoritativeness, Trustworthiness: os quatro pilares de qualidade de conteúdo do Google` },
          { term: `Quality Rater`, def: `Avaliador humano contratado pelo Google para verificar a qualidade das páginas seguindo as diretrizes E-E-A-T` },
          { term: `Autoridade de Autor`, def: `O reconhecimento externo do autor como referência no domínio, construído por consistência e citações` },
        ],
        quiz: {
          q: `Qual pilar do E-E-A-T o Google considera mais crítico?`,
          opts: [`Expertise, ter o maior conhecimento técnico`, `Experience, ter experiência pessoal`, `Trustworthiness, ser confiável e transparente`, `Authoritativeness, ter mais backlinks`],
          correct: 2,
          feedback: `O Google afirma explicitamente que Trustworthiness é o mais crítico. Sem confiança, os outros pilares não sustentam o ranqueamento.`
        }
      },
    ]
  },
  {
    icon: '🤖',
    color: '#059669',
    title: `Agentes de IA e Ferramentas Avançadas`,
    desc: `A IA está transformando o SEO. Aprenda como agentes de IA, triples semânticos e Schema Markup trabalham juntos para fazer o Google entender seu conteúdo em profundidade.`,
    lessons: [
      {
        id: 'ch5-l1',
        icon: '🦾',
        title: `Agentes de IA para SEO: O que São?`,
        level: 'avancado', levelLabel: 'Avançado',
        content: `Agentes de IA são sistemas que executam tarefas de SEO de forma autônoma: pesquisa de keywords, análise de SERP, criação de briefings, auditoria de conteúdo.

**O que agentes de IA fazem bem:**
• Processar grandes volumes de dados rapidamente
• Identificar padrões em centenas de páginas
• Gerar briefings baseados em análise de SERP
• Sugerir links internos baseados em relevância semântica

**O que ainda precisa de humano:**
• Julgamento de qualidade editorial
• Experiência vivida (Experience do E-E-A-T)
• Estratégia de longo prazo`,
        keyTerms: [
          { term: `Agente de IA`, def: `Sistema de IA que executa tarefas autonomamente, podendo usar ferramentas e tomar decisões` },
          { term: `Automação SEO`, def: `Uso de ferramentas e IA para executar tarefas repetitivas de SEO sem intervenção manual constante` },
          { term: `Análise de SERP`, def: `Estudo dos resultados do Google para uma query para entender o que ranqueia e por quê` },
        ],
        quiz: {
          q: `Qual tarefa de SEO agentes de IA executam MELHOR que humanos?`,
          opts: [`Avaliar a qualidade editorial de um artigo`, `Processar e analisar grandes volumes de dados de SERP rapidamente`, `Construir relações para link building`, `Criar experiência vivida para E-E-A-T`],
          correct: 1,
          feedback: `Agentes de IA se destacam em velocidade e escala de processamento de dados. Julgamento qualitativo e relações humanas ainda requerem pessoas.`
        }
      },
      {
        id: 'ch5-l2',
        icon: '🔗',
        title: `Triples Sujeito-Predicado-Objeto`,
        level: 'avancado', levelLabel: 'Avançado',
        content: `Triples semânticos são a forma mais básica de conhecimento estruturado: **Sujeito, Predicado e Objeto**.

**Exemplos práticos:**
• Maturare é especialista em GEO, AEO e SEO
• Daniel Rios fundou a Maturare
• Clark S25 tem capacidade de 2.500 kg

LLMs extraem esses triples do seu conteúdo para construir knowledge graphs internos. Quanto mais triples explícitos, mais citável é o seu conteúdo.`,
        keyTerms: [
          { term: `Triple Semântico`, def: `Uma afirmação estruturada como Sujeito, Predicado e Objeto que descreve uma relação entre entidades` },
          { term: `EAV`, def: `Entity-Attribute-Value: a estrutura que descreve uma entidade por seus atributos e valores` },
          { term: `Knowledge Graph`, def: `Rede de entidades e relações que o Google usa para entender o mundo` },
        ],
        quiz: {
          q: `Qual destes é um triple semântico correto?`,
          opts: [`SEO é importante`, `Move Máquinas tem sede em Goiânia`, `Conteúdo bom ranqueia`, `Google é uma empresa`],
          correct: 1,
          feedback: `Sujeito (Move Máquinas) mais Predicado (tem sede em) mais Objeto (Goiânia) é o triple completo e específico. Os outros são afirmações vagas sem estrutura triple clara.`
        }
      },
      {
        id: 'ch5-l3',
        icon: '💻',
        title: `Schema Markup: Fale a Língua do Google!`,
        level: 'avancado', levelLabel: 'Avançado',
        content: `Schema Markup é código JSON-LD adicionado ao HTML que comunica ao Google o significado exato do conteúdo, não apenas as palavras, mas o que elas representam.

**Por que usar Schema Markup:**
• Habilita rich results (estrelas, FAQ, preços)
• Melhora a compreensão semântica da página
• Aumenta CTR em média 20 a 30%
• Reforça entidades e seus atributos para o Knowledge Graph

**Tipos mais comuns:**
Organization, LocalBusiness, Product, Article, FAQPage, HowTo, BreadcrumbList`,
        keyTerms: [
          { term: `Schema Markup`, def: `Código JSON-LD que comunica ao Google o significado exato do conteúdo de uma página` },
          { term: `Rich Results`, def: `Resultados visuais enriquecidos no Google (estrelas, preços, FAQs) habilitados pelo Schema Markup` },
          { term: `JSON-LD`, def: `O formato preferido pelo Google para Schema Markup, fica em uma tag script separada no HTML` },
        ],
        quiz: {
          q: `Qual é o principal benefício do Schema Markup para SEO?`,
          opts: [`Aumenta a velocidade do site`, `Comunica ao Google o significado exato do conteúdo, habilitando rich results e melhorando a compreensão semântica`, `Gera backlinks automaticamente`, `Reduz o bounce rate`],
          correct: 1,
          feedback: `Schema Markup é a comunicação direta com o Google: em vez de inferir o significado das palavras, você declara explicitamente o tipo de entidade e seus atributos.`
        }
      },
    ]
  },
  {
    icon: '🏅',
    color: '#b45309',
    title: `E-E-A-T e Autoridade de Autor`,
    desc: `O Google quer saber: quem está por trás deste conteúdo? Tem experiência real? É especialista? E-E-A-T transforma conteúdo anônimo em referência confiável.`,
    lessons: [
      {
        id: 'ch6-l1',
        icon: '🎓',
        title: `O que é E-E-A-T?`,
        level: 'iniciante', levelLabel: 'Iniciante',
        content: `E-E-A-T é o framework do Google para avaliar se um conteúdo merece ser ranqueado alto. Não é um score numérico. É um conjunto de sinais que os Quality Raters avaliam.

**Os 4 pilares:**
• **Experience:** você usou o produto? Visitou o lugar? Fez o procedimento?
• **Expertise:** você tem formação e conhecimento técnico?
• **Authoritativeness:** outros especialistas te reconhecem como referência?
• **Trustworthiness:** o site é transparente, seguro e preciso?

Conteúdo médico, financeiro e jurídico (YMYL) precisa de E-E-A-T muito alto.`,
        keyTerms: [
          { term: `E-E-A-T`, def: `Experience, Expertise, Authoritativeness, Trustworthiness: os quatro pilares de qualidade do Google` },
          { term: `YMYL`, def: `Your Money Your Life: conteúdo sobre saúde, finanças e segurança que o Google avalia com critérios mais rigorosos` },
          { term: `Quality Rater`, def: `Avaliador humano contratado pelo Google para verificar a qualidade das páginas` },
        ],
        quiz: {
          q: `Um artigo sobre 'como investir em ações' sem autor identificado tem E-E-A-T alto?`,
          opts: [`Sim, o conteúdo é o que importa`, `Não. Conteúdo financeiro (YMYL) sem autor identificado tem E-E-A-T muito baixo`, `Depende do número de palavras`, `Depende dos backlinks`],
          correct: 1,
          feedback: `Conteúdo financeiro é YMYL. O Google exige E-E-A-T muito alto. Sem autor identificado com expertise documentada, o conteúdo tem E-E-A-T baixo independente da qualidade.`
        }
      },
      {
        id: 'ch6-l2',
        icon: '✍️',
        title: `Construindo Autoridade de Autor`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Para o Google, o autor é uma entidade com atributos mensuráveis.

**Como construir autoridade de autor:**
• Página de autor dedicada com bio completa
• Schema markup Person com nome, cargo, especialidade
• Byline em todos os artigos
• Links para perfis verificáveis (LinkedIn, Lattes, CRO/CRM)
• Consistência de nome e foto em todas as plataformas
• Co-citação com outras fontes reconhecidas

Conteúdo sem autor identificado é tratado como baixo E-E-A-T por padrão.`,
        keyTerms: [
          { term: `Author Entity`, def: `O autor como entidade reconhecida pelo Google com atributos: nome, cargo, especialidade, publicações` },
          { term: `Schema Person`, def: `Schema Markup que declara formalmente o autor como entidade com seus atributos` },
          { term: `Byline`, def: `Assinatura do autor no artigo, elemento essencial para E-E-A-T em conteúdo editorial` },
        ],
        quiz: {
          q: `Um artigo excelente publicado como 'Equipe Maturare' tem E-E-A-T alto?`,
          opts: [`Sim, a qualidade do conteúdo compensa`, `Não. Sem autor identificado, o Google não consegue verificar Experience e Expertise`, `Depende do número de backlinks`, `Sim, se tiver Schema Organization`],
          correct: 1,
          feedback: `Author entity precisa de identidade. 'Equipe' não é uma entidade verificável. E-E-A-T fica baixo independente da qualidade do texto.`
        }
      },
      {
        id: 'ch6-l3',
        icon: '🔗',
        title: `Páginas de Corroboração: Prove que Você Existe!`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Páginas de corroboração são menções externas ao seu negócio ou autor que confirmam sua existência e autoridade para o Google.

**Exemplos de corroboração:**
• Perfil no LinkedIn com histórico profissional
• Menções em notícias ou publicações do setor
• Perfil no Google Business Profile
• Citações em outros sites do mesmo nicho
• Participação em podcasts ou eventos documentados

O Google cruza essas informações para validar que a entidade é real e confiável.`,
        keyTerms: [
          { term: `Corroboração`, def: `Menção ou referência externa que confirma a existência e credibilidade de uma entidade` },
          { term: `Co-citação`, def: `Quando seu site ou autor é mencionado junto com outras fontes reconhecidas no mesmo contexto` },
          { term: `NAP`, def: `Name, Address, Phone: a consistência desses dados em todos os perfis é fundamental para SEO local` },
        ],
        quiz: {
          q: `Por que um perfil LinkedIn completo ajuda o E-E-A-T de um autor?`,
          opts: [`Gera backlinks diretos para o site`, `Serve como corroboração externa que valida a expertise e experiência do autor para o Google`, `Aumenta o tráfego das redes sociais`, `Melhora o Page Speed`],
          correct: 1,
          feedback: `O LinkedIn é uma fonte de corroboração: o Google verifica se o autor existe, tem o histórico profissional declarado e é reconhecido no setor.`
        }
      },
      {
        id: 'ch6-l4',
        icon: '📊',
        title: `Assinaturas Estatísticas Únicas`,
        level: 'avancado', levelLabel: 'Avançado',
        content: `Assinaturas estatísticas únicas são dados exclusivos que só você possui: pesquisas próprias, casos de cliente, métricas reais da sua experiência.

**Por que importam para E-E-A-T:**
• Provam experiência vivida (o primeiro E)
• São incitáveis por IA, dados únicos são mais citáveis
• Diferenciam seu conteúdo de qualquer artigo genérico
• Aumentam a probabilidade de citação em AI Overview

**Exemplos:**
• 'Nos nossos clientes, o Schema Markup aumentou CTR em média 23%'
• 'Em 18 meses de GEO, registramos X citações em AI Overviews'`,
        keyTerms: [
          { term: `Dados Próprios`, def: `Informações exclusivas geradas pela sua experiência ou pesquisa, não encontradas em outros sites` },
          { term: `Information Gain`, def: `O valor informacional único que seu conteúdo adiciona além do que já existe na web` },
          { term: `Citabilidade`, def: `A probabilidade de uma IA generativa escolher seu conteúdo para compor uma resposta` },
        ],
        quiz: {
          q: `Por que dados próprios de clientes aumentam a citabilidade do conteúdo?`,
          opts: [`Porque são mais longos`, `Porque são únicos e verificáveis. A IA prefere claims específicos que não existem em outro lugar`, `Porque têm mais keywords`, `Porque o Google penaliza dados repetidos`],
          correct: 1,
          feedback: `Claims com dados próprios e específicos são mais citáveis: são verificáveis, únicos e demonstram experiência real, exatamente o que sistemas de IA buscam para grounding.`
        }
      },
    ]
  },
  {
    icon: '🔗',
    color: '#0f766e',
    title: `Estratégia de Linkagem Interna`,
    desc: `Links internos não são só navegação. São canais de transferência de autoridade e contexto semântico. A linkagem certa multiplica o poder de cada página do seu site.`,
    lessons: [
      {
        id: 'ch7-l1',
        icon: '🛣️',
        title: `Por que Links Internos Importam`,
        level: 'iniciante', levelLabel: 'Iniciante',
        content: `Links internos são um dos mecanismos mais subestimados do SEO. Eles fazem três coisas críticas:

• **Transferem autoridade** (PageRank) de páginas fortes para páginas que precisam crescer
• **Criam contexto semântico:** o Google usa o texto ao redor do link para entender o tópico da página de destino
• **Reduzem a distância semântica** entre páginas relacionadas no cluster tópico

Páginas sem links internos são ilhas semânticas: o Google não as conecta ao cluster e elas perdem potencial de ranqueamento.`,
        keyTerms: [
          { term: `PageRank`, def: `A métrica que mede a autoridade de uma página baseada nos links que ela recebe` },
          { term: `Ilha Semântica`, def: `Página sem links internos que o Google não consegue conectar ao cluster temático do site` },
          { term: `Transferência de Autoridade`, def: `O fluxo de PageRank de uma página para outra através de links internos` },
        ],
        quiz: {
          q: `Uma página com ótimo conteúdo mas sem links internos vai ranquear bem?`,
          opts: [`Sim, conteúdo é o único fator`, `Provavelmente não. Sem links internos o Google não a conecta ao cluster e ela recebe pouca autoridade`, `Depende do Page Speed`, `Sim, se tiver backlinks externos`],
          correct: 1,
          feedback: `Links internos são essenciais para distribuir autoridade e contexto semântico. Uma página isolada perde potencial mesmo com ótimo conteúdo.`
        }
      },
      {
        id: 'ch7-l2',
        icon: '⚓',
        title: `Anchor Text: As Palavras Certas para Linkar`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `O anchor text é o texto clicável de um link. Para o Google, ele é um sinal semântico: diz ao Google o que esperar na página de destino.

**Tipos de anchor text:**
• **Exato:** 'aluguel de empilhadeira em Goiânia' (forte, usar com moderação)
• **Parcial:** 'alugar empilhadeira' (bom equilíbrio)
• **Relacionado:** 'equipamentos industriais para locação' (contextual)
• **Genérico:** 'clique aqui', 'saiba mais' (fraco, evitar)

Variedade e naturalidade são chave. Anchor texts idênticos em todos os links parecem artificiais.`,
        keyTerms: [
          { term: `Anchor Text`, def: `O texto clicável de um link, comunica ao Google o tópico da página de destino` },
          { term: `Over-Optimization`, def: `Uso excessivo do mesmo anchor text exato, que pode parecer artificial e penalizar o site` },
          { term: `Anchor Text Diversificado`, def: `Variedade natural de textos de link para um mesmo destino, mais natural e seguro` },
        ],
        quiz: {
          q: `Você tem 50 páginas linkando para sua LP de empilhadeira. Qual abordagem de anchor text é mais segura?`,
          opts: [`Todas com 'aluguel de empilhadeira em Goiânia'`, `Variedade: 'equipamentos para locação', 'empilhadeira Clark', 'locação industrial Goiânia'`, `Todas com 'clique aqui'`, `Sem texto, só ícones`],
          correct: 1,
          feedback: `Variedade natural é mais segura e eficaz. Anchor texts idênticos em todos os links são sinal de otimização artificial que o Google penaliza.`
        }
      },
      {
        id: 'ch7-l3',
        icon: '🏛️',
        title: `Topic Clusters e Páginas Pilar`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Um Topic Cluster é um grupo de páginas inter-relacionadas cobrindo um tema: uma página pilar central e múltiplas páginas de cluster em subtópicos.

**A estrutura:**
• **Página Pilar:** cobre o tema principal amplamente
• **Páginas de Cluster:** aprofundam subtópicos específicos
• **Links Bidirecionais:** pilar para cluster e cluster para pilar

Cada página de cluster linka de volta ao pilar, e o pilar linka para todas as páginas de cluster. Isso cria um cluster semântico que o Google reconhece como autoridade.`,
        keyTerms: [
          { term: `Página Pilar`, def: `Página central que cobre o tema principal amplamente e linka para todas as páginas de cluster` },
          { term: `Página de Cluster`, def: `Página que aprofunda um subtópico específico e linka de volta para a página pilar` },
          { term: `Link Bidirecional`, def: `Quando página A linka para página B e página B linka de volta para página A` },
        ],
        quiz: {
          q: `Qual é o papel da página pilar no Topic Cluster?`,
          opts: [`Ter o maior número de palavras`, `Cobrir o tema principal amplamente e ser o hub central que conecta todas as páginas de cluster`, `Ser a página com mais backlinks externos`, `Ter o H1 mais longo`],
          correct: 1,
          feedback: `A página pilar é o hub semântico: cobre o tema amplamente, linka para todos os subtópicos e recebe links de volta. É o Root Seed Node do cluster.`
        }
      },
      {
        id: 'ch7-l4',
        icon: '🕸️',
        title: `Semantic Content Network (SCN)`,
        level: 'avancado', levelLabel: 'Avançado',
        content: `Uma Semantic Content Network é um conjunto de páginas tão bem interconectadas semanticamente que o Google as trata como uma única fonte de autoridade sobre um tema.

**Características de uma SCN forte:**
• Cada página linka contextualmente para 3 a 5 páginas relacionadas
• Anchor texts descritivos e variados
• Sem ilhas semânticas (toda página tem pelo menos um link interno)
• Hierarquia clara: pilar, clusters e suporte
• Breadcrumbs implementados para reforçar a hierarquia

A Move Máquinas tem uma SCN com 79 páginas todas interconectadas. Isso é Topical Authority na prática.`,
        keyTerms: [
          { term: `Semantic Content Network`, def: `Conjunto de páginas interconectadas semanticamente que o Google trata como fonte de autoridade sobre um tema` },
          { term: `Breadcrumb`, def: `Navegação hierárquica (Home, Categoria, Página) que reforça a estrutura semântica do site` },
          { term: `Grafo de Links Internos`, def: `O mapa de todas as conexões internas do site, revela clusters, ilhas e oportunidades de linkagem` },
        ],
        quiz: {
          q: `Uma SCN bem construída tem qual efeito no Topical Authority?`,
          opts: [`Nenhum efeito direto`, `Reforça o Topical Authority ao mostrar ao Google que o site cobre o tema de forma completa e interconectada`, `Aumenta o Page Speed`, `Reduz o Crawl Budget`],
          correct: 1,
          feedback: `Uma SCN coesa sinaliza ao Google que o site é uma fonte completa e confiável sobre o tema. É a expressão prática do Topical Authority em arquitetura de links.`
        }
      },
    ]
  },
  {
    icon: '⚙️',
    color: '#374151',
    title: `URLs e SEO Técnico Básico`,
    desc: `A base técnica do SEO determina se o Google consegue encontrar, rastrear e indexar seu conteúdo. Sem isso, o melhor conteúdo do mundo fica invisível.`,
    lessons: [
      {
        id: 'ch8-l1',
        icon: '🔗',
        title: `URLs: Como Nomear suas Páginas`,
        level: 'iniciante', levelLabel: 'Iniciante',
        content: `A URL é o endereço da página e também um sinal semântico para o Google e para o usuário.

**Boas práticas de URL:**
• Curta e descritiva: /aluguel-empilhadeira-goiania
• Apenas letras minúsculas, números e hífens
• Sem acentos ou caracteres especiais
• Hierarquia clara: /categoria/subcategoria/pagina
• Sem datas desnecessárias em URLs de conteúdo evergreen

**Evite:**
• /page?id=1234 (não descritivo)
• /aluguel_de_empilhadeira (underscores são ignorados pelo Google como separadores)`,
        keyTerms: [
          { term: `URL Slug`, def: `A parte da URL após o domínio que identifica a página específica` },
          { term: `URL Canônica`, def: `A URL 'oficial' de uma página quando existem versões duplicadas, declarada com rel=canonical` },
          { term: `Estrutura de URL`, def: `A hierarquia de pastas na URL que reflete a arquitetura do site` },
        ],
        quiz: {
          q: `Qual URL é melhor para uma página sobre aluguel de empilhadeira em Goiânia?`,
          opts: [`/page?id=452&cat=equipment`, `/aluguel-empilhadeira-goiania`, `/ALUGUEL_EMPILHADEIRA_GOIANIA`, `/2024/03/15/aluguel-de-empilhadeira`],
          correct: 1,
          feedback: `URL curta, descritiva, com hífens e letras minúsculas. Comunica o tópico claramente para o Google e para o usuário, sem parâmetros ou datas desnecessários.`
        }
      },
      {
        id: 'ch8-l2',
        icon: '🏷️',
        title: `Title Tags e Meta Descrições`,
        level: 'iniciante', levelLabel: 'Iniciante',
        content: `A title tag é o título que aparece na aba do navegador e nos resultados do Google. É um dos sinais de relevância mais importantes do SEO on-page.

**Boas práticas para Title Tag:**
• 50 a 60 caracteres para não cortar na SERP
• Entidade principal mais localização mais diferencial
• Comece com a keyword ou entidade principal
• Cada página com título único

**Meta Descrição** (150 a 160 chars):
• Não é fator de ranqueamento direto
• Afeta o CTR: uma boa descrição atrai mais cliques
• Inclua a proposta de valor e um CTA suave`,
        keyTerms: [
          { term: `Title Tag`, def: `O título HTML da página, aparece na aba do navegador, nos resultados do Google e é um sinal de relevância` },
          { term: `Meta Descrição`, def: `O resumo da página que aparece abaixo do título nos resultados, influencia o CTR mas não o ranking diretamente` },
          { term: `CTR`, def: `Click-Through Rate: porcentagem de pessoas que clicam no seu resultado em relação aos que o veem` },
        ],
        quiz: {
          q: `Qual é o comprimento ideal de uma title tag para não cortar na SERP?`,
          opts: [`Menos de 30 caracteres`, `50 a 60 caracteres`, `80 a 100 caracteres`, `Sem limite, quanto mais longa melhor`],
          correct: 1,
          feedback: `Google exibe aproximadamente 50 a 60 caracteres antes de cortar com '...'. Title tags muito longas são truncadas e perdem contexto na SERP.`
        }
      },
      {
        id: 'ch8-l3',
        icon: '🤖',
        title: `Rastreamento e Indexação: Como o Google te Encontra`,
        level: 'iniciante', levelLabel: 'Iniciante',
        content: `Antes de ranquear, o Google precisa encontrar, rastrear e indexar sua página. Esse processo tem três etapas:

• **Rastreamento (Crawling):** Googlebot visita sua página seguindo links
• **Indexação (Indexing):** Google analisa e armazena o conteúdo no seu índice
• **Ranqueamento (Ranking):** Google decide a posição para cada query

**O que bloqueia o rastreamento:**
• robots.txt mal configurado
• Páginas com noindex
• Site muito lento (Googlebot desiste)
• Links internos quebrados que isolam páginas`,
        keyTerms: [
          { term: `Crawl Budget`, def: `O número de páginas que o Googlebot está disposto a rastrear no seu site por período` },
          { term: `Googlebot`, def: `O robô do Google que visita páginas na web para indexá-las` },
          { term: `robots.txt`, def: `Arquivo que instrui os robôs de busca sobre quais páginas rastrear ou ignorar` },
        ],
        quiz: {
          q: `Uma página com conteúdo excelente mas bloqueada no robots.txt vai ranquear?`,
          opts: [`Sim, o conteúdo é o que importa`, `Não. Se o Googlebot não consegue rastrear, a página não é indexada e não ranqueia`, `Depende do Page Speed`, `Sim, se tiver backlinks`],
          correct: 1,
          feedback: `Sem rastreamento não há indexação, sem indexação não há ranqueamento. Configurações técnicas erradas tornam conteúdo excelente completamente invisível.`
        }
      },
      {
        id: 'ch8-l4',
        icon: '⚡',
        title: `Velocidade de Página e Core Web Vitals`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Core Web Vitals são métricas do Google que medem a experiência real do usuário na página. São fatores de ranqueamento desde 2021.

**As três métricas principais:**
• **LCP** (Largest Contentful Paint): velocidade de carregamento do maior elemento visível. Meta: menos de 2,5s
• **INP** (Interaction to Next Paint): responsividade a interações. Meta: menos de 200ms
• **CLS** (Cumulative Layout Shift): estabilidade visual. Meta: menos de 0,1

Sites lentos perdem ranking E usuários. Um atraso de 1 segundo reduz conversões em até 7%.`,
        keyTerms: [
          { term: `Core Web Vitals`, def: `Métricas do Google que medem experiência real: velocidade (LCP), interatividade (INP) e estabilidade visual (CLS)` },
          { term: `LCP`, def: `Largest Contentful Paint: tempo para o maior elemento visível carregar. Meta: abaixo de 2,5 segundos` },
          { term: `CLS`, def: `Cumulative Layout Shift: quanto o layout muda durante o carregamento. Meta: abaixo de 0,1` },
        ],
        quiz: {
          q: `Um site tem LCP de 5 segundos. Como isso afeta o SEO?`,
          opts: [`Não afeta, velocidade não é fator de ranqueamento`, `Prejudica o ranqueamento (Core Web Vitals são fatores de ranking) e aumenta a taxa de saída dos usuários`, `Aumenta o tempo na página`, `Melhora a segurança`],
          correct: 1,
          feedback: `LCP de 5s está na zona vermelha. Core Web Vitals são fatores de ranqueamento E afetam experiência do usuário. Usuários abandonam sites lentos antes de ler o conteúdo.`
        }
      },
    ]
  },
  {
    icon: '🧠',
    color: '#6d28d9',
    title: `NLP e Como o Google Lê Conteúdo`,
    desc: `O Google usa Processamento de Linguagem Natural para interpretar seu conteúdo como um humano faria. Entender isso muda completamente como você escreve para SEO.`,
    lessons: [
      {
        id: 'ch9-l1',
        icon: '🤖',
        title: `O que é NLP no SEO?`,
        level: 'iniciante', levelLabel: 'Iniciante',
        content: `NLP (Natural Language Processing) é a tecnologia que permite ao Google entender linguagem humana: não só as palavras, mas o contexto, a intenção e o significado por trás delas.

**O que NLP permite ao Google fazer:**
• Entender sinônimos e variações semânticas
• Identificar entidades e seus atributos
• Inferir a intenção de busca
• Detectar a qualidade e profundidade do conteúdo
• Extrair fatos (triples semânticos) do texto

Desde o algoritmo BERT (2019), o Google processa o contexto completo de uma frase, não só palavras isoladas.`,
        keyTerms: [
          { term: `NLP`, def: `Natural Language Processing: tecnologia que permite a computadores entender e processar linguagem humana` },
          { term: `BERT`, def: `Modelo de IA do Google que entende o contexto completo das palavras em uma frase` },
          { term: `Contexto Semântico`, def: `O significado de uma palavra ou frase baseado no contexto em que aparece` },
        ],
        quiz: {
          q: `O que mudou com o algoritmo BERT do Google em 2019?`,
          opts: [`O Google passou a indexar imagens melhor`, `O Google passou a entender o contexto completo das palavras em uma frase, não só palavras isoladas`, `O Google adicionou mais resultados por página`, `O Google começou a penalizar sites lentos`],
          correct: 1,
          feedback: `BERT foi uma revolução: o Google passou a entender 'banco' diferente em 'banco de peixe' e 'banco financeiro'. O contexto passou a importar tanto quanto as palavras.`
        }
      },
      {
        id: 'ch9-l2',
        icon: '🔢',
        title: `Tokens e Word Embeddings`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Para processar texto, o Google divide as palavras em **tokens** e as converte em **vetores matemáticos** (embeddings) que representam seu significado.

**Como funciona:**
• Texto é dividido em tokens (palavras ou partes de palavras)
• Cada token recebe um vetor numérico (embedding)
• Palavras com significado similar ficam próximas no espaço vetorial
• O Google compara o vetor do conteúdo com o vetor da query

**Por que isso importa:** 'Empilhadeira' e 'máquina de elevação de carga' ficam próximos no espaço vetorial. Conteúdo sobre um pode ranquear para o outro.`,
        keyTerms: [
          { term: `Token`, def: `Unidade básica de texto processada por um LLM, pode ser uma palavra, parte de palavra ou pontuação` },
          { term: `Embedding`, def: `Representação matemática do significado de uma palavra ou frase em um espaço vetorial` },
          { term: `Espaço Vetorial`, def: `Representação matemática onde palavras com significados próximos ficam geograficamente próximas` },
        ],
        quiz: {
          q: `Por que 'locação de empilhadeira' e 'aluguel de máquina de elevação' podem ranquear um para o outro?`,
          opts: [`Por terem o mesmo número de palavras`, `Porque seus embeddings (vetores semânticos) são próximos no espaço vetorial do Google`, `Por terem a mesma URL`, `Por acaso`],
          correct: 1,
          feedback: `Embeddings próximos significam semântica similar. O Google entende que 'locação' e 'aluguel' e 'empilhadeira' e 'máquina de elevação' são semanticamente equivalentes.`
        }
      },
      {
        id: 'ch9-l3',
        icon: '✏️',
        title: `Query Rewriting: O que o Google Realmente Busca`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Quando você digita uma query no Google, ele não a usa literalmente. O Google **reescreve** a query internamente para encontrar os resultados mais relevantes.

**Exemplos de query rewriting:**
• 'empilhadeira elétrica aluguel goiania' recebe adições: 'locação', 'Clark', 'preço', 'diária'
• 'implante dentário barato niterói' recebe adições: 'clínica', 'preço', 'Dr. Eric'

Isso significa que conteúdo rico em co-ocorrências e atributos naturais do domínio ranqueia para muito mais queries do que as palavras-chave literais usadas.`,
        keyTerms: [
          { term: `Query Rewriting`, def: `O processo onde o Google expande ou modifica a query do usuário para encontrar resultados mais relevantes` },
          { term: `Query Expansion`, def: `Adição de termos relacionados à query original pelo Google para ampliar os resultados relevantes` },
          { term: `Co-Occurrence`, def: `Termos que naturalmente aparecem juntos em conteúdo especializado, enriquecem o contexto semântico` },
        ],
        quiz: {
          q: `Se o Google faz Query Rewriting, o que isso significa para sua estratégia de conteúdo?`,
          opts: [`Você só precisa otimizar para a keyword exata`, `Conteúdo rico em termos naturais do domínio ranqueia para muito mais queries do que as palavras-chave literais`, `Keywords de cauda longa não funcionam mais`, `Você precisa criar uma página para cada variação`],
          correct: 1,
          feedback: `Query Rewriting significa que conteúdo profundo e natural supera conteúdo otimizado para keywords específicas. O Google encontra o que você sabe, não só o que você repetiu.`
        }
      },
      {
        id: 'ch9-l4',
        icon: '🥇',
        title: `Featured Snippets e Posição Zero`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Position Zero é a posição acima do número 1 orgânico, ocupada pelo Featured Snippet. É o equivalente ao gol de placa do SEO: aparecer antes do primeiro resultado orgânico.

**Como conquistar Position Zero:**
• Identifique queries com intenção 'o que é' ou 'como fazer'
• Formule o H2 como a pergunta exata
• Responda diretamente em 40 a 60 palavras no primeiro parágrafo
• Use listas para perguntas 'quais são' ou 'como'
• Use tabelas para comparações

O Featured Snippet pode trazer tráfego mesmo com menos cliques, pois o usuário lê a resposta na SERP.`,
        keyTerms: [
          { term: `Position Zero`, def: `A posição acima do primeiro resultado orgânico, ocupada pelo Featured Snippet` },
          { term: `Featured Snippet`, def: `Resposta destacada extraída de uma página pelo Google para responder diretamente a uma query` },
          { term: `Zero-Click Search`, def: `Busca onde o usuário obtém a resposta na SERP sem precisar clicar em nenhum site` },
        ],
        quiz: {
          q: `Você conseguiu o Featured Snippet para 'o que é GEO no marketing'. Mas o CTR da página caiu. Por quê?`,
          opts: [`O Featured Snippet prejudica o SEO`, `Usuários leem a resposta diretamente na SERP (zero-click) sem precisar clicar no site`, `O Google penalizou o site`, `A página ficou mais lenta`],
          correct: 1,
          feedback: `Featured Snippet pode causar zero-click: o usuário lê a resposta sem clicar. Mas ainda gera visibilidade de marca. Para queries transacionais, o CTR tende a ser maior.`
        }
      },
    ]
  },
  {
    icon: '📍',
    color: '#b91c1c',
    title: `SEO Local e Entidades Geográficas`,
    desc: `Para negócios locais, SEO geográfico é o caminho mais rápido para clientes qualificados. Localidades são entidades. Entidades bem otimizadas dominam a busca local.`,
    lessons: [
      {
        id: 'ch10-l1',
        icon: '🗺️',
        title: `O que é SEO Local?`,
        level: 'iniciante', levelLabel: 'Iniciante',
        content: `SEO Local é a otimização para aparecer nas buscas geográficas, quando alguém pesquisa 'perto de mim' ou inclui uma cidade na query.

**Os três fatores principais do SEO Local:**
• **Relevância:** seu negócio corresponde ao que foi buscado?
• **Distância:** quão perto o negócio está do usuário?
• **Proeminência:** quão reconhecido e confiável é o negócio?

**Resultados do SEO Local:**
• Pack Local (os 3 resultados no mapa do Google)
• Resultados orgânicos locais
• Knowledge Panel do negócio`,
        keyTerms: [
          { term: `SEO Local`, def: `Otimização para aparecer em buscas geográficas e no Google Maps` },
          { term: `Pack Local`, def: `Os 3 resultados com mapa que aparecem no Google para buscas locais, altamente visíveis` },
          { term: `Google Business Profile`, def: `O perfil gratuito do negócio no Google, essencial para SEO local` },
        ],
        quiz: {
          q: `Quais são os três fatores principais do algoritmo de SEO Local do Google?`,
          opts: [`Velocidade, design e backlinks`, `Relevância, distância e proeminência`, `Keywords, conteúdo e links`, `Schema, meta tags e URL`],
          correct: 1,
          feedback: `Relevância (o negócio corresponde ao que foi buscado), Distância (proximidade ao usuário) e Proeminência (reconhecimento e confiança) são os três fatores do Pack Local.`
        }
      },
      {
        id: 'ch10-l2',
        icon: '🌍',
        title: `Entidades Geográficas como Ativos de SEO`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Para o Google, cidades, bairros e regiões são entidades com atributos e relações. Incorporar essas entidades geográficas corretamente no conteúdo e no Schema é fundamental para SEO local.

**Como trabalhar entidades geográficas:**
• Mencione a cidade e região naturalmente no conteúdo
• Use Schema LocalBusiness com endereço completo
• Crie páginas específicas por cidade quando relevante
• Mencione pontos de referência locais reais
• Use o nome correto da cidade (Goiânia, não 'GO')

Para a Move Máquinas, cada LP de cidade é uma entidade geográfica: 'aluguel de empilhadeira em Aparecida de Goiânia'.`,
        keyTerms: [
          { term: `Entidade Geográfica`, def: `Uma localização real (cidade, bairro, região) que o Google reconhece como entidade com atributos` },
          { term: `Schema LocalBusiness`, def: `Schema Markup que declara formalmente o negócio local com endereço, telefone, horários e área de atuação` },
          { term: `LP de Cidade`, def: `Landing page dedicada a uma cidade específica, otimizada para queries locais daquela região` },
        ],
        quiz: {
          q: `Por que criar páginas específicas por cidade é melhor que uma página genérica 'atendemos todo o Brasil'?`,
          opts: [`Porque tem mais palavras`, `Porque cada página de cidade é uma entidade geográfica específica que o Google ranqueia para queries daquela região`, `Porque é mais barato`, `Porque o Google exige`],
          correct: 1,
          feedback: `Páginas de cidade criam entidades geográficas específicas. O Google ranqueia páginas relevantes para a localização do usuário. Generalismo não compete com especificidade local.`
        }
      },
      {
        id: 'ch10-l3',
        icon: '🏢',
        title: `Google Business Profile: Otimização`,
        level: 'iniciante', levelLabel: 'Iniciante',
        content: `O Google Business Profile é o perfil gratuito do negócio no Google. É o fator mais importante para aparecer no Pack Local.

**Elementos críticos do GBP:**
• Nome exato e consistente com o site
• Categoria principal correta (e categorias secundárias)
• Endereço completo e consistente com o site (NAP)
• Telefone e horários atualizados
• Descrição com termos do serviço e localização
• Fotos reais do negócio, equipe e produtos
• Responder todas as avaliações (boas e ruins)

GBP sem fotos e sem resposta a avaliações perde para concorrentes mais ativos.`,
        keyTerms: [
          { term: `Google Business Profile`, def: `Perfil gratuito do negócio no Google, gerencia como o negócio aparece no Maps e nas buscas locais` },
          { term: `NAP`, def: `Name, Address, Phone: deve ser idêntico em todos os perfis online para reforçar a entidade local` },
          { term: `Avaliações`, def: `Reviews no GBP: quantidade e qualidade influenciam o ranking no Pack Local` },
        ],
        quiz: {
          q: `Qual é o impacto de NAP inconsistente entre GBP e site?`,
          opts: [`Nenhum, são plataformas separadas`, `Cria confusão para o Google sobre qual informação é correta, prejudicando o ranking local`, `Aumenta o tráfego de diferentes fontes`, `Melhora a segurança do negócio`],
          correct: 1,
          feedback: `NAP inconsistente cria conflito de entidade: o Google não consegue confirmar que o GBP e o site são do mesmo negócio, prejudicando a proeminência no Pack Local.`
        }
      },
      {
        id: 'ch10-l4',
        icon: '📝',
        title: `Estratégia de Conteúdo Local`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Conteúdo local vai além de mencionar a cidade no título. É sobre criar conteúdo genuinamente útil para o público daquela região.

**Tipos de conteúdo local eficaz:**
• Guias específicos da cidade: 'Como contratar empresa de aluguel de equipamentos em Goiânia'
• Casos de cliente locais com nome da cidade
• Menções a eventos, polos industriais e características da região
• FAQ com perguntas típicas do público local
• Parceiros e certificações locais relevantes

**Regra de ouro:** conteúdo que só faz sentido para quem está naquela região tem alta relevância geográfica.`,
        keyTerms: [
          { term: `Conteúdo Local`, def: `Conteúdo especificamente relevante para usuários de uma região geográfica específica` },
          { term: `Relevância Geográfica`, def: `Grau de alinhamento entre o conteúdo e as necessidades e contexto de uma localização específica` },
          { term: `Polo Industrial`, def: `Concentração geográfica de empresas do mesmo setor, mencionar polos locais aumenta a relevância geográfica` },
        ],
        quiz: {
          q: `Qual conteúdo tem MAIOR relevância geográfica para SEO local em Goiânia?`,
          opts: [`Artigo genérico sobre 'benefícios do aluguel de equipamentos'`, `Guia 'Como alugar empilhadeira para obras na Região Metropolitana de Goiânia' com casos de cliente locais`, `Lista de equipamentos sem menção a localização`, `Artigo sobre história das empilhadeiras`],
          correct: 1,
          feedback: `Conteúdo com entidade geográfica específica e casos reais locais tem alta relevância geográfica. O Google entende que é relevante para buscas daquela região.`
        }
      },
    ]
  },
  {
    icon: '🔎',
    color: '#0369a1',
    title: `Pesquisa de Keywords Semântica`,
    desc: `A pesquisa de keywords semântica vai além do volume de busca. É sobre mapear intenções, agrupar queries por significado e cobrir o tema inteiro, não só as palavras-chave óbvias.`,
    lessons: [
      {
        id: 'ch11-l1',
        icon: '⚡',
        title: `Pesquisa de Keywords Tradicional vs. Semântica`,
        level: 'iniciante', levelLabel: 'Iniciante',
        content: `A pesquisa de keywords tradicional pergunta: 'qual keyword tem mais volume?'. A pesquisa semântica pergunta: 'qual intenção de busca existe e como meu conteúdo pode respondê-la melhor?'

**Diferença prática:**
• Tradicional: otimiza para 'aluguel empilhadeira' (volume 1.300/mês)
• Semântica: mapeia todo o cluster: tipos de empilhadeira, cidades, serviços, normas NR, custo vs. compra

A abordagem semântica captura 10x mais tráfego potencial porque cobre o tema inteiro, não só a keyword principal.`,
        keyTerms: [
          { term: `Volume de Busca`, def: `Quantidade média de vezes que uma keyword é pesquisada por mês` },
          { term: `Keyword de Cauda Longa`, def: `Queries mais específicas e longas: menor volume mas maior intenção e menor competição` },
          { term: `Relevância Tópica`, def: `Quanto uma keyword se alinha ao tema central do seu site, mais importante que volume isolado` },
        ],
        quiz: {
          q: `Qual abordagem captura mais tráfego potencial?`,
          opts: [`Otimizar intensamente uma única keyword de alto volume`, `Mapear o cluster completo cobrindo todas as intenções e subtópicos relacionados`, `Comprar tráfego pago para keywords caras`, `Copiar o conteúdo dos concorrentes`],
          correct: 1,
          feedback: `Cobertura semântica completa captura todas as variantes da intenção. Uma keyword principal pega uma fatia. O cluster inteiro pega o bolo.`
        }
      },
      {
        id: 'ch11-l2',
        icon: '❓',
        title: `People Also Ask (PAA): Mineração de Perguntas`,
        level: 'iniciante', levelLabel: 'Iniciante',
        content: `O 'Pessoas Também Perguntam' (PAA) do Google é uma mina de ouro para mapear as perguntas reais do seu público.

**Como usar PAA para SEO semântico:**
• Busque sua keyword principal no Google
• Expanda cada pergunta do PAA para ver as perguntas relacionadas
• Agrupe as perguntas por subtópico
• Use as perguntas como H2s nos seus artigos
• Responda cada uma diretamente (formato AEO)

As perguntas do PAA refletem as queries reais que usuários digitam. São fontes valiosas para Content Chunking.`,
        keyTerms: [
          { term: `PAA`, def: `People Also Ask ou Pessoas Também Perguntam: caixa de perguntas relacionadas nos resultados do Google` },
          { term: `Mineração de Perguntas`, def: `Processo de extrair perguntas reais do público a partir do PAA, fóruns e buscas relacionadas` },
          { term: `Query Funnel`, def: `Os estágios de intenção antes de uma decisão: Unaware, Problem Aware, Solution Aware, Product Aware` },
        ],
        quiz: {
          q: `Por que as perguntas do PAA são valiosas para SEO semântico?`,
          opts: [`Porque são mais longas`, `Porque refletem as perguntas reais que usuários digitam, perfeito alinhamento com intenção de busca`, `Porque têm mais volume de busca`, `Porque o Google as ranqueia automaticamente`],
          correct: 1,
          feedback: `PAA revela o que usuários realmente querem saber. Usar essas perguntas como H2s cria alinhamento perfeito entre conteúdo e intenção de busca.`
        }
      },
      {
        id: 'ch11-l3',
        icon: '📊',
        title: `Volume de Busca vs. Relevância Tópica`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Uma das maiores armadilhas do SEO é perseguir volume de busca sem considerar relevância tópica.

**O paradoxo do volume:**
• 'empilhadeira' tem 10.000 buscas/mês mas é disputada por grandes marcas internacionais
• 'aluguel de empilhadeira Clark em Aparecida de Goiânia' tem 30 buscas/mês mas converte 10x mais

**Regra Maturare:** para um negócio local, uma keyword de cauda longa com alta relevância tópica e intenção comercial vale mais que uma keyword genérica de alto volume sem conversão.

Sempre avalie: volume mais intenção mais relevância mais competição mais potencial de conversão.`,
        keyTerms: [
          { term: `Relevância Tópica`, def: `Alinhamento entre a keyword e o tema central do site. Keywords topicamente relevantes consolidam autoridade` },
          { term: `Intenção Comercial`, def: `Queries onde o usuário está próximo de uma decisão de compra. Alta prioridade para negócios locais` },
          { term: `Cauda Longa`, def: `Keywords específicas e longas com menor volume mas maior intenção e menor competição` },
        ],
        quiz: {
          q: `Para uma clínica odontológica em Niterói, qual keyword priorizar?`,
          opts: [`'dentista' (100.000 buscas/mês)`, `'implante dentário Niterói preço' (200 buscas/mês, alta intenção comercial)`, `'odontologia' (50.000 buscas/mês)`, `'dentes' (200.000 buscas/mês)`],
          correct: 1,
          feedback: `'Implante dentário Niterói preço' tem alta intenção comercial, relevância geográfica e o usuário está próximo da decisão. Volume menor mas conversão muito maior.`
        }
      },
      {
        id: 'ch11-l4',
        icon: '📚',
        title: `Semântica Lexical: Palavras que Viajam Juntas`,
        level: 'avancado', levelLabel: 'Avançado',
        content: `Semântica Lexical é o estudo de como as palavras se relacionam por significado. Para SEO, isso se traduz em co-ocorrências: palavras que naturalmente aparecem juntas em conteúdo especializado.

**Grupos semânticos relevantes:**
• Sinônimos: aluguel, locação, arrendamento
• Hiperônimos: máquina inclui empilhadeira inclui empilhadeira elétrica Clark S25
• Co-ocorrências: NR-35 com trabalho em altura com EPI com ancoragem com cesta

Conteúdo que usa naturalmente todo o vocabulário do domínio ativa Query Expansion. O Google ranqueia para muito mais queries.`,
        keyTerms: [
          { term: `Semântica Lexical`, def: `O estudo de como as palavras se relacionam por significado: sinônimos, antônimos, hiperônimos` },
          { term: `Hiperônimo`, def: `Uma categoria mais ampla que engloba um termo específico. Exemplo: 'máquina' é hiperônimo de 'empilhadeira'` },
          { term: `Campo Semântico`, def: `Conjunto de palavras relacionadas semanticamente que pertencem a um mesmo domínio de significado` },
        ],
        quiz: {
          q: `Por que usar 'locação', 'aluguel' e 'arrendamento' num mesmo artigo é bom para SEO semântico?`,
          opts: [`Porque aumenta o número de palavras`, `Porque são sinônimos que ampliam o campo semântico e ativam Query Expansion para mais variantes`, `Por acaso`, `Porque o Google exige sinônimos`],
          correct: 1,
          feedback: `Sinônimos e termos relacionados enriquecem o campo semântico. O Google usa esses sinais para expandir o ranqueamento para todas as variantes semânticas da intenção.`
        }
      },
    ]
  },
  {
    icon: '🔌',
    color: '#1e40af',
    title: `Link Building e SEO Off-Page`,
    desc: `Backlinks continuam sendo um dos sinais mais fortes do Google. Mas qualidade semântica supera quantidade. Um link relevante vale mais que cem irrelevantes.`,
    lessons: [
      {
        id: 'ch12-l1',
        icon: '🔗',
        title: `O que são Backlinks e Por que Importam`,
        level: 'iniciante', levelLabel: 'Iniciante',
        content: `Backlinks são links de outros sites apontando para o seu. Para o Google, cada backlink é um 'voto de confiança', um sinal de que outro site considera seu conteúdo valioso.

**Nem todos os backlinks são iguais:**
• Link de site relevante ao seu tema: alto valor
• Link de site de alta autoridade do mesmo setor: muito alto valor
• Link de site irrelevante ou de baixa qualidade: pouco ou nenhum valor
• Link de farm de links ou PBN: pode penalizar

**Qualidade é maior que quantidade:** 5 backlinks de sites relevantes e autoritários valem mais que 500 de sites aleatórios.`,
        keyTerms: [
          { term: `Backlink`, def: `Um link de outro site apontando para o seu, funciona como um voto de confiança para o Google` },
          { term: `Domain Authority`, def: `Métrica que estima a autoridade de um domínio baseada em quantidade e qualidade dos seus backlinks` },
          { term: `Link Juice`, def: `A autoridade transferida de um site para outro através de um backlink` },
        ],
        quiz: {
          q: `Qual backlink tem MAIOR valor para uma empresa de aluguel de equipamentos industriais?`,
          opts: [`Link de um site de receitas culinárias com DA 80`, `Link de uma associação de construtoras com DA 40`, `Link de um diretório de empresas genérico`, `Link de um blog de moda`],
          correct: 1,
          feedback: `Relevância temática é fundamental. Um link de associação de construtoras é semanticamente relevante para equipamentos industriais. Mesmo com DA menor, vale muito mais.`
        }
      },
      {
        id: 'ch12-l2',
        icon: '🛠️',
        title: `Tipos de Estratégia de Link Building`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Existem várias formas de conquistar backlinks. As melhores são as que resultam em links naturais e relevantes.

**Estratégias eficazes:**
• **Link Earning:** criar conteúdo tão bom que outros linkam naturalmente
• **Guest Posts:** escrever para outros sites do setor
• **Digital PR:** publicar dados originais e pesquisas que a mídia cita
• **Parceiros e fornecedores:** links de sites com quem você trabalha
• **Broken Link Building:** encontrar links quebrados e oferecer seu conteúdo como substituto

**Evitar:**
• Compra de links
• PBNs (Private Blog Networks)
• Link farms`,
        keyTerms: [
          { term: `Link Earning`, def: `Conquistar backlinks naturalmente criando conteúdo tão valioso que outros sites linkam espontaneamente` },
          { term: `Guest Post`, def: `Artigo publicado em outro site do setor com link de volta para o seu, troca de valor editorial` },
          { term: `Digital PR`, def: `Gerar cobertura de mídia com dados originais ou notícias relevantes que resultam em links editoriais` },
        ],
        quiz: {
          q: `Qual estratégia de link building é mais sustentável a longo prazo?`,
          opts: [`Comprar links de alta autoridade`, `Criar conteúdo com dados originais que outros sites naturalmente citam e linkam`, `Trocar links com todos os sites do setor`, `Usar serviços automatizados de link building`],
          correct: 1,
          feedback: `Links naturais conquistados por mérito editorial são os mais valiosos e sustentáveis. Não podem ser penalizados porque não foram manipulados.`
        }
      },
      {
        id: 'ch12-l3',
        icon: '🚦',
        title: `Links Nofollow vs. Dofollow`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Nem todo link transfere autoridade da mesma forma. O atributo rel='nofollow' instrui o Google a não seguir o link para fins de PageRank.

**Dofollow** (padrão): transfere PageRank e autoridade
**Nofollow** (rel='nofollow'): não transfere PageRank diretamente
**Sponsored** (rel='sponsored'): indica link pago
**UGC** (rel='ugc'): indica conteúdo gerado por usuário

**Mas nofollow ainda tem valor:**
• Tráfego de referência real
• Sinais de menção e corroboração
• Diversidade natural do perfil de links

Um perfil de links 100% dofollow parece artificial. Nofollow são esperados e saudáveis.`,
        keyTerms: [
          { term: `Dofollow`, def: `Link padrão que transfere PageRank e autoridade para a página de destino` },
          { term: `Nofollow`, def: `Link com rel=nofollow que não transfere PageRank diretamente, mas ainda tem valor de tráfego e menção` },
          { term: `Perfil de Links`, def: `O conjunto de todos os backlinks de um site, deve ser natural, diversificado e relevante` },
        ],
        quiz: {
          q: `Um site tem 100% dos backlinks como dofollow. Isso é um bom sinal?`,
          opts: [`Sim, mais PageRank transferido é sempre melhor`, `Não. Um perfil 100% dofollow parece artificial e pode ser sinal de link building manipulado`, `Sim, nofollow é sempre ruim`, `Não importa o tipo de link`],
          correct: 1,
          feedback: `Naturalmente, sites recebem uma mistura de dofollow e nofollow. Um perfil 100% dofollow é atípico e pode indicar link building artificial ao Google.`
        }
      },
      {
        id: 'ch12-l4',
        icon: '🧲',
        title: `Conteúdo que Conquista Links Naturalmente`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `O melhor link building é o que acontece sem que você precise pedir. Isso só ocorre quando seu conteúdo tem valor único que outros queiram referenciar.

**Tipos de conteúdo que naturalmente atraem links:**
• Pesquisas originais com dados exclusivos
• Guias definitivos que servem como referência do setor
• Ferramentas gratuitas úteis
• Estudos de caso com resultados reais
• Conteúdo que resolve um problema que ninguém resolve bem

A Maturare produz análises de GEO e AEO que profissionais de SEO referenciam. Esse é o modelo certo.`,
        keyTerms: [
          { term: `Linkable Asset`, def: `Conteúdo criado especificamente para atrair links: geralmente recursos únicos e de alto valor` },
          { term: `Information Gain`, def: `O valor informacional único que seu conteúdo adiciona além do que já existe, fator de citabilidade` },
          { term: `Hub de Conteúdo`, def: `Página central que consolida o melhor conteúdo sobre um tema, atrai links por ser referência` },
        ],
        quiz: {
          q: `Qual tipo de conteúdo tem maior potencial de atrair links naturalmente?`,
          opts: [`Artigo genérico sobre 'dicas de SEO'`, `Pesquisa original: 'Análise de 500 sites brasileiros: como GEO afeta citações em AI Overview'`, `Lista de ferramentas já conhecidas`, `Artigo de opinião sem dados`],
          correct: 1,
          feedback: `Pesquisa original com dados únicos é o mais poderoso linkable asset: jornalistas, blogs e especialistas citam e linkam porque a informação não existe em outro lugar.`
        }
      },
    ]
  },
  {
    icon: '🔄',
    color: '#065f46',
    title: `Atualização de Conteúdo e Recuperação`,
    desc: `O Google prefere conteúdo atualizado e relevante. Saber quando e como atualizar páginas, e como se recuperar de atualizações de algoritmo, é uma habilidade essencial.`,
    lessons: [
      {
        id: 'ch13-l1',
        icon: '📡',
        title: `Tipos de Atualizações do Algoritmo do Google`,
        level: 'iniciante', levelLabel: 'Iniciante',
        content: `O Google atualiza seu algoritmo centenas de vezes por ano. As mais impactantes são as Core Updates, atualizações amplas que podem mudar rankings significativamente.

**Principais tipos de atualização:**
• **Core Update:** revisão ampla dos fatores de ranqueamento, foco em qualidade e E-E-A-T
• **Helpful Content:** foco em conteúdo genuinamente útil para humanos vs. conteúdo para bots
• **Spam Update:** combate a técnicas de link spam e conteúdo manipulador
• **Page Experience:** velocidade, Core Web Vitals e experiência do usuário

Após uma Core Update, sites que perdem ranking geralmente têm problemas de E-E-A-T ou conteúdo raso.`,
        keyTerms: [
          { term: `Core Update`, def: `Atualização ampla do algoritmo do Google que pode mudar rankings significativamente` },
          { term: `Helpful Content`, def: `Conteúdo criado primariamente para ajudar pessoas, não para manipular rankings de busca` },
          { term: `Recuperação de Ranking`, def: `O processo de melhorar um site após queda de ranking causada por uma atualização de algoritmo` },
        ],
        quiz: {
          q: `Um site perdeu 40% do tráfego após uma Core Update. Qual é a primeira coisa a verificar?`,
          opts: [`Comprar mais backlinks rapidamente`, `Auditar a qualidade do conteúdo e os sinais de E-E-A-T do site`, `Mudar o design do site`, `Aumentar a velocidade de publicação`],
          correct: 1,
          feedback: `Core Updates focam em qualidade e E-E-A-T. Sites que caem geralmente têm conteúdo raso, autores não identificados ou afirmações sem embasamento.`
        }
      },
      {
        id: 'ch13-l2',
        icon: '🔍',
        title: `Auditoria de Conteúdo: Corrigindo o que Está Quebrado`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `Uma auditoria de conteúdo mapeia todas as páginas do site e classifica: o que manter, melhorar, consolidar ou remover.

**Metodologia de auditoria:**
• Inventariar todas as URLs
• Classificar por performance (tráfego, CTR, conversões)
• Identificar thin content e páginas sem tráfego há 6 meses ou mais
• Verificar canibalização entre páginas similares
• Consolidar ou redirecionar páginas redundantes

**Regra:** uma página ruim prejudica todo o site. Google avalia a qualidade média. Thin content contamina o Topical Authority geral.`,
        keyTerms: [
          { term: `Auditoria de Conteúdo`, def: `Processo de inventariar e avaliar todas as páginas do site para decidir o que manter, melhorar ou remover` },
          { term: `Thin Content`, def: `Conteúdo raso com pouca informação útil, prejudica o E-E-A-T geral do site` },
          { term: `Consolidação de Conteúdo`, def: `Unir várias páginas fracas em uma página forte, redirecionando as antigas com 301` },
        ],
        quiz: {
          q: `Um site tem 200 páginas mas 80 delas têm menos de 300 palavras e zero tráfego. O que fazer?`,
          opts: [`Não fazer nada, mais páginas é melhor`, `Auditar: consolidar, melhorar ou remover o thin content, ele prejudica o E-E-A-T geral do site`, `Adicionar imagens nessas páginas`, `Publicar mais páginas novas`],
          correct: 1,
          feedback: `Thin content arrasta a média de qualidade do site para baixo. O Google avalia o site como um todo. 80 páginas fracas contaminam as 120 boas.`
        }
      },
      {
        id: 'ch13-l3',
        icon: '🏥',
        title: `Recuperação Após uma Core Update`,
        level: 'avancado', levelLabel: 'Avançado',
        content: `Recuperar-se de uma Core Update leva tempo e exige trabalho real de qualidade. Não há atalho.

**Processo de recuperação:**
• Identifique as páginas mais afetadas (Google Search Console)
• Compare com os concorrentes que subiram na mesma update
• Audite E-E-A-T: autoria, fontes, profundidade
• Melhore ou consolide páginas com thin content
• Aguarde a próxima Core Update para ver o efeito (90 a 180 dias)

**O que NÃO fazer:** não publique conteúdo em massa para 'recuperar'. O Google quer qualidade, não quantidade. Publicar mais thin content piora o problema.`,
        keyTerms: [
          { term: `Search Console`, def: `Ferramenta gratuita do Google que mostra como o site aparece nas buscas, essencial para diagnosticar quedas` },
          { term: `Comparação com Concorrentes`, def: `Analisar quais sites subiram após a update para entender o que o Google passou a valorizar` },
          { term: `Melhoria de E-E-A-T`, def: `Processo de fortalecer Experience, Expertise, Authoritativeness e Trustworthiness do conteúdo` },
        ],
        quiz: {
          q: `Quanto tempo geralmente leva para um site se recuperar de uma Core Update após melhorias?`,
          opts: [`1 a 2 dias`, `1 a 2 semanas`, `90 a 180 dias (até a próxima Core Update)`, `Nunca, é permanente`],
          correct: 2,
          feedback: `O Google reavalia sites principalmente nas Core Updates. Melhorias feitas hoje serão refletidas na próxima Core Update, geralmente 3 a 6 meses de espera.`
        }
      },
      {
        id: 'ch13-l4',
        icon: '🌱',
        title: `Frescor de Conteúdo e Estratégia de Atualização`,
        level: 'intermediario', levelLabel: 'Intermediário',
        content: `O Google valoriza conteúdo atualizado, especialmente em temas sensíveis ao tempo (notícias, preços, normas, tecnologia).

**Tipos de conteúdo e frequência de atualização:**
• **Evergreen:** atualizar quando informações mudarem (anual ou conforme necessidade)
• **Sensível ao tempo:** atualizar mensalmente ou conforme mudanças do mercado
• **Páginas de produto e LP:** atualizar com novos depoimentos, casos e dados

**Como sinalizar atualização ao Google:**
• Atualizar a data de modificação do artigo
• Adicionar uma nota 'Atualizado em [data]: [o que mudou]'
• Adicionar novos dados ou casos reais
• Submeter a URL no Search Console após atualização`,
        keyTerms: [
          { term: `Frescor de Conteúdo`, def: `Quão recente e atualizado é o conteúdo, fator de ranqueamento especialmente em temas sensíveis ao tempo` },
          { term: `Conteúdo Evergreen`, def: `Conteúdo que permanece relevante ao longo do tempo sem precisar de atualizações frequentes` },
          { term: `Topical Freshness Score`, def: `Sinal que o Google usa para avaliar se o conteúdo de um site está atualizado em relação ao seu tópico` },
        ],
        quiz: {
          q: `Qual sinalização de atualização é mais eficaz para o Google?`,
          opts: [`Mudar apenas a data sem alterar o conteúdo`, `Adicionar dados novos, casos reais ou informações atualizadas E atualizar a data de modificação`, `Mudar o título do artigo`, `Adicionar mais imagens`],
          correct: 1,
          feedback: `O Google detecta mudanças reais de conteúdo, não só datas. Adicionar valor real (novos dados, casos) é a forma mais honesta e eficaz de sinalizar frescor.`
        }
      },
    ]
  },
  {
    icon: '🖊️',
    color: '#1e293b',
    title: `Escrita Semântica Avançada`,
    desc: `No nível avançado, cada frase serve a um propósito semântico. Aprenda as regras que separam conteúdo bom de conteúdo que a IA cita e o Google eleva ao topo.`,
    lessons: [
      {
        id: 'ch14-l1',
        icon: '🌊',
        title: `Integração de Discurso: Ideias que Fluem`,
        level: 'avancado', levelLabel: 'Avançado',
        content: `Integração de discurso é a capacidade de conectar ideias entre parágrafos e seções de forma que o conteúdo flua logicamente, como um raciocínio que o leitor e a IA conseguem seguir.

**Técnicas de integração:**
• **Ponte lexical:** retomar um termo do parágrafo anterior no início do próximo
• **Conectivos causais:** 'porque', 'portanto', 'como resultado'
• **Progressão temática:** cada sentença adiciona nova informação sobre o tema anterior

Conteúdo sem integração de discurso parece uma lista de fatos soltos. A IA generativa tem dificuldade em extrair respostas coerentes de conteúdo descontínuo.`,
        keyTerms: [
          { term: `Integração de Discurso`, def: `A conexão lógica e coerente entre parágrafos e seções de um texto` },
          { term: `Progressão Temática`, def: `Cada nova sentença adiciona informação sobre o tema da sentença anterior, mantém a coerência` },
          { term: `Coerência Textual`, def: `A qualidade de um texto onde todas as partes se conectam logicamente para um significado unificado` },
        ],
        quiz: {
          q: `Por que conteúdo com boa integração de discurso é mais citável por IA?`,
          opts: [`Porque é mais longo`, `Porque a IA consegue extrair um raciocínio coerente e completo, não só fatos soltos`, `Porque tem mais keywords`, `Porque carrega mais rápido`],
          correct: 1,
          feedback: `IA generativa extrai chunks coerentes para compor respostas. Conteúdo com fluxo lógico permite extrair blocos completos de raciocínio, muito mais citável.`
        }
      },
      {
        id: 'ch14-l2',
        icon: '🎯',
        title: `Modalidade e Certeza na Escrita`,
        level: 'avancado', levelLabel: 'Avançado',
        content: `Modalidade é o grau de certeza ou probabilidade expresso em uma afirmação. Para SEO e IA, afirmações com alta certeza e embasamento são mais citáveis.

**Escala de certeza:**
• **Alta certeza (preferido):** 'O Schema Markup aumenta o CTR em 20 a 30%'
• **Média certeza:** 'O Schema Markup pode aumentar o CTR'
• **Baixa certeza (evitar):** 'Alguns dizem que Schema pode ajudar'

Afirmações vagas e cheias de hedging ('pode ser', 'talvez', 'possivelmente') têm baixa citabilidade. A IA não consegue usá-las como grounding porque não são verificáveis.`,
        keyTerms: [
          { term: `Modalidade`, def: `O grau de certeza ou probabilidade expresso em uma afirmação: 'é' vs. 'pode ser' vs. 'talvez'` },
          { term: `Hedging`, def: `Uso excessivo de linguagem vaga e tentativa para evitar afirmações definitivas, reduz citabilidade` },
          { term: `Afirmação Factual`, def: `Afirmação de alta certeza e verificável, o tipo preferido por sistemas de IA para grounding` },
        ],
        quiz: {
          q: `Por que afirmações com alta certeza são mais citáveis por sistemas de IA?`,
          opts: [`Porque são mais curtas`, `Porque são verificáveis e podem ser usadas como grounding sem ambiguidade`, `Porque têm mais keywords`, `Por acaso`],
          correct: 1,
          feedback: `Sistemas de IA (RAG) preferem afirmações verificáveis para grounding. Afirmações vagas criam ambiguidade. A IA não sabe se pode confiar nelas como fato.`
        }
      },
      {
        id: 'ch14-l3',
        icon: '🗂️',
        title: `Grafo de Informação: Ordem Lógica dos Fatos`,
        level: 'avancado', levelLabel: 'Avançado',
        content: `Um grafo de informação é a estrutura lógica que organiza os fatos de um texto: do mais simples ao mais complexo, do conceito ao exemplo, da definição à aplicação.

**Ordem otimizada para SEO semântico:**
• **Definição:** o que é a entidade ou conceito
• **Atributos:** quais são suas características
• **Relações:** como se conecta a outras entidades
• **Processo:** como funciona ou é aplicado
• **Exemplos:** casos reais
• **Implicações:** o que isso significa na prática

Essa ordem reflete como o Google e os LLMs organizam conhecimento internamente. Conteúdo nessa ordem é mais facilmente processado.`,
        keyTerms: [
          { term: `Grafo de Informação`, def: `A estrutura lógica que organiza fatos de simples a complexo dentro de um conteúdo` },
          { term: `Progressão Lógica`, def: `Apresentação de informação em ordem que facilita a compreensão: definição, atributos, exemplos e aplicação` },
          { term: `Densidade Semântica`, def: `A quantidade de informação significativa por unidade de texto. Alta densidade é mais citável` },
        ],
        quiz: {
          q: `Por que um artigo deve começar com definição antes de exemplos?`,
          opts: [`Porque é convenção editorial`, `Porque reflete como o Google e LLMs organizam conhecimento: conceito antes de instância`, `Porque é mais fácil de escrever`, `Porque exemplos são menos importantes`],
          correct: 1,
          feedback: `LLMs e Knowledge Graphs organizam: entidade, atributos, relações e depois instâncias. Conteúdo nessa ordem é mais facilmente mapeado ao modelo de conhecimento interno do Google.`
        }
      },
      {
        id: 'ch14-l4',
        icon: '🧱',
        title: `Modelo Entidade-Atributo-Valor (EAV)`,
        level: 'avancado', levelLabel: 'Avançado',
        content: `O modelo EAV é a estrutura de dados mais fundamental para SEO semântico avançado. Todo conteúdo otimizável para IA pode ser reduzido a triples EAV.

**Estrutura EAV:**
Entidade mais Atributo mais Valor

**Exemplos práticos da Maturare:**
• Clark S25 tem capacidade máxima de 2.500 kg
• Move Máquinas tem sede em Goiânia, GO
• Maturare tem especialidade em GEO, AEO e SEO

**Como aplicar:** em cada seção do conteúdo, verifique se você está declarando triples EAV explícitos. Isso aumenta a citabilidade e a chance de aparecer em Knowledge Panels.`,
        keyTerms: [
          { term: `EAV`, def: `Entity-Attribute-Value: a estrutura que descreve uma entidade por seus atributos e valores específicos` },
          { term: `Triple EAV`, def: `Uma afirmação completa: Entidade mais Atributo mais Valor, a unidade básica de conhecimento estruturado` },
          { term: `Citabilidade`, def: `A probabilidade de um LLM escolher seu conteúdo para compor uma resposta, maximizada por triples EAV claros` },
        ],
        quiz: {
          q: `Transforme em triple EAV: 'A Maturare foi fundada em Goiânia por Daniel Rios'`,
          opts: [`Maturare é uma empresa boa`, `Maturare tem fundador Daniel Rios E Maturare tem sede em Goiânia`, `Daniel Rios tem empresa`, `Goiânia tem Maturare`],
          correct: 1,
          feedback: `Uma frase pode conter múltiplos triples EAV. Fundador e sede são dois atributos distintos da mesma entidade Maturare. Ambos devem ser declarados explicitamente.`
        }
      },
    ]
  },
];let _laCurrentChapter = null;
let _laCurrentLesson  = null;
let _laQuizAnswered   = false;
let _laInitDone       = false;

// ── Inicialização ────────────────────────────────────────────
function initLearnTab() {
  if (_laInitDone) { laUpdateAcademyProgress(); return; }
  _laInitDone = true;

  laRenderChapterList();
  laUpdateAcademyProgress();
  laBuildBrowseSelect();

  document.getElementById('la-back-to-academy')?.addEventListener('click', laGoAcademy);
  document.getElementById('la-back-to-chapter')?.addEventListener('click', laGoChapter);
  document.getElementById('la-btn-complete')?.addEventListener('click', laToggleComplete);
  document.getElementById('la-btn-next')?.addEventListener('click', laGoNextLesson);

  const search = document.getElementById('la-search');
  search?.addEventListener('input', () => laHandleSearch(search.value));

  const browse = document.getElementById('la-browse-select');
  browse?.addEventListener('change', () => {
    const idx = browse.value;
    if (idx === '') { laShowAllChapters(); return; }
    laOpenChapter(parseInt(idx));
  });
}

function laShowScreen(id) {
  ['la-screen-academy','la-screen-chapter','la-screen-lesson'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.style.display = s === id ? 'flex' : 'none';
  });
}

// ── Nível 1: Academia ────────────────────────────────────────
function laUpdateAcademyProgress() {
  const completed = laGetCompleted();
  let totalLessons = 0;
  LA_CHAPTERS.forEach(ch => { totalLessons += ch.lessons.length; });
  const done = completed.length;
  const pct  = totalLessons > 0 ? Math.round((done / totalLessons) * 100) : 0;

  document.getElementById('la-ring-pct').textContent = pct + '%';
  document.getElementById('la-done-num').textContent = done;
  document.getElementById('la-academy-progress').textContent =
    `${done}/${totalLessons} lições concluídas · Progresso salvo automaticamente.`;

  const fill = document.getElementById('la-ring-fill');
  const circ = 2 * Math.PI * 18;
  if (fill) fill.style.strokeDashoffset = circ - (circ * pct / 100);

  // Atualiza progresso dos cards de capítulo já renderizados
  LA_CHAPTERS.forEach((ch, ci) => {
    const done_ch = ch.lessons.filter((_, li) => laIsCompleted(ci, li)).length;
    const pct_ch  = ch.lessons.length > 0 ? Math.round((done_ch / ch.lessons.length) * 100) : 0;
    const bar  = document.querySelector(`[data-ch-bar="${ci}"]`);
    const pctEl= document.querySelector(`[data-ch-pct="${ci}"]`);
    const meta = document.querySelector(`[data-ch-meta="${ci}"]`);
    if (bar)   bar.style.width = pct_ch + '%';
    if (pctEl) { pctEl.textContent = pct_ch + '%'; pctEl.className = 'la-chapter-pct ' + (pct_ch===100?'done':pct_ch===0?'zero':'partial'); }
    if (meta)  meta.textContent = `${done_ch}/${ch.lessons.length} lições`;
  });
}

function laRenderChapterList(list) {
  const chapters = list !== undefined ? list : LA_CHAPTERS;
  const container = document.getElementById('la-chapters-list');
  const countEl   = document.getElementById('la-chapters-count');
  if (!container) return;
  if (countEl) countEl.textContent = LA_CHAPTERS.length + ' total';

  container.innerHTML = '';
  chapters.forEach((ch, ci) => {
    const realIdx = list ? LA_CHAPTERS.indexOf(ch) : ci;
    const doneCh  = ch.lessons.filter((_, li) => laIsCompleted(realIdx, li)).length;
    const pctCh   = ch.lessons.length > 0 ? Math.round((doneCh / ch.lessons.length) * 100) : 0;
    const pctClass = pctCh === 100 ? 'done' : pctCh === 0 ? 'zero' : 'partial';

    const card = document.createElement('div');
    card.className = 'la-chapter-card';
    card.innerHTML = `
      <div class="la-chapter-icon">${ch.icon}</div>
      <div class="la-chapter-info">
        <div class="la-chapter-title">${ch.title}</div>
        <div class="la-chapter-meta" data-ch-meta="${realIdx}">${doneCh}/${ch.lessons.length} lições</div>
        <div class="la-chapter-progress">
          <div class="la-chapter-progress-fill" data-ch-bar="${realIdx}" style="width:${pctCh}%"></div>
        </div>
      </div>
      <span class="la-chapter-pct ${pctClass}" data-ch-pct="${realIdx}">${pctCh}%</span>
    `;
    card.addEventListener('click', () => laOpenChapter(realIdx));
    container.appendChild(card);
  });
}

function laShowAllChapters() {
  laShowScreen('la-screen-academy');
  laRenderChapterList();
}

function laBuildBrowseSelect() {
  const sel = document.getElementById('la-browse-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Todos os Capítulos</option>';
  LA_CHAPTERS.forEach((ch, i) => {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = `${ch.icon} ${ch.title}`;
    sel.appendChild(opt);
  });
}

function laHandleSearch(query) {
  const q = query.trim().toLowerCase();
  const container = document.getElementById('la-chapters-list');
  const countEl   = document.getElementById('la-chapters-count');
  if (!q) { laRenderChapterList(); if (countEl) countEl.textContent = LA_CHAPTERS.length + ' total'; return; }

  // Busca em títulos de capítulos, lições e keyTerms
  const results = [];
  LA_CHAPTERS.forEach((ch, ci) => {
    ch.lessons.forEach((ls, li) => {
      const haystack = [
        ls.title, ch.title,
        ...(ls.keyTerms || []).map(k => k.term + ' ' + k.def),
        ls.content || ''
      ].join(' ').toLowerCase();
      if (haystack.includes(q)) results.push({ ch, ci, ls, li });
    });
  });

  container.innerHTML = '';
  if (countEl) countEl.textContent = results.length + ' resultado' + (results.length !== 1 ? 's' : '');
  if (!results.length) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Nenhum resultado encontrado.</div>';
    return;
  }
  results.forEach(({ ch, ci, ls, li }) => {
    const item = document.createElement('div');
    item.className = 'la-search-result-item';
    item.innerHTML = `
      <div class="la-search-result-title">${ls.icon} ${ls.title}</div>
      <div class="la-search-result-meta">${ch.icon} ${ch.title} · ${ls.levelLabel}</div>
    `;
    item.addEventListener('click', () => laOpenLesson(ci, li));
    container.appendChild(item);
  });
}

// ── Nível 2: Capítulo ────────────────────────────────────────
function laOpenChapter(chapterIdx) {
  _laCurrentChapter = chapterIdx;
  const ch = LA_CHAPTERS[chapterIdx];
  if (!ch) return;

  document.getElementById('la-browse-select').value = chapterIdx;
  document.getElementById('la-chapter-breadcrumb-name').textContent = `${ch.icon} ${ch.title}`;

  const hero = document.getElementById('la-chapter-hero');
  hero.style.background = ch.color;
  hero.innerHTML = `<div class="la-chapter-hero-title">${ch.icon} ${ch.title}</div><div>${ch.desc}</div>`;

  const list = document.getElementById('la-lessons-list');
  list.innerHTML = '';
  ch.lessons.forEach((ls, li) => {
    const done = laIsCompleted(chapterIdx, li);
    const row  = document.createElement('div');
    row.className = 'la-lesson-row' + (done ? ' completed' : '');
    row.innerHTML = `
      <div class="la-lesson-num">${done ? '✓' : li + 1}</div>
      <div class="la-lesson-icon">${ls.icon}</div>
      <div class="la-lesson-info">
        <div class="la-lesson-title">${ls.title}</div>
        <div class="la-lesson-meta">${ls.levelLabel} · ${(ls.keyTerms||[]).length} termos-chave</div>
      </div>
      <svg class="la-lesson-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
    `;
    row.addEventListener('click', () => laOpenLesson(chapterIdx, li));
    list.appendChild(row);
  });

  laShowScreen('la-screen-chapter');
}

function laGoAcademy() {
  document.getElementById('la-browse-select').value = '';
  laShowScreen('la-screen-academy');
  laUpdateAcademyProgress();
}

function laGoChapter() {
  if (_laCurrentChapter !== null) laOpenChapter(_laCurrentChapter);
}

// ── Nível 3: Lição ───────────────────────────────────────────
function laOpenLesson(chapterIdx, lessonIdx) {
  _laCurrentChapter = chapterIdx;
  _laCurrentLesson  = lessonIdx;
  _laQuizAnswered   = false;

  const ch = LA_CHAPTERS[chapterIdx];
  const ls = ch.lessons[lessonIdx];
  const done = laIsCompleted(chapterIdx, lessonIdx);

  // Breadcrumb
  document.getElementById('la-lesson-breadcrumb-title').textContent = `${ls.icon} ${ls.title}`;
  document.getElementById('la-lesson-breadcrumb-chapter').textContent = `${ch.icon} ${ch.title}`;
  const lvlBadge = document.getElementById('la-lesson-level-badge');
  lvlBadge.textContent = ls.levelLabel;
  lvlBadge.className = 'la-lesson-level-badge ' + ls.level;

  // Rodapé
  const btnComplete = document.getElementById('la-btn-complete');
  btnComplete.textContent = done ? '✓ Concluída' : '✓ Marcar como Concluída';
  btnComplete.className = 'la-btn-complete' + (done ? ' done' : '');

  const btnNext = document.getElementById('la-btn-next');
  const isLast  = lessonIdx >= ch.lessons.length - 1;
  btnNext.textContent = isLast ? 'Voltar ao Capítulo' : 'Próxima →';
  btnNext.disabled = false;

  // Corpo
  const body = document.getElementById('la-lesson-body');
  body.innerHTML = '';
  body.scrollTop = 0;

  // Card de conteúdo
  const contentCard = document.createElement('div');
  contentCard.className = 'la-lesson-content-card';
  let contentHtml = `<div class="la-lesson-content-title">${ls.icon} ${ls.title}</div>`;
  contentHtml += `<div class="la-lesson-content-text">${ls.content.replace(/\n/g, '<br>')}</div>`;
  if (ls.example) {
    contentHtml += `<div class="la-lesson-example-block"><span class="la-lesson-example-label">Exemplo prático</span><p class="la-lesson-example-text">${ls.example}</p></div>`;
  }
  contentCard.innerHTML = contentHtml;
  body.appendChild(contentCard);

  // Key Terms
  if (ls.keyTerms?.length) {
    const kt = document.createElement('div');
    kt.className = 'la-keyterms-card';
    kt.innerHTML = `<div class="la-keyterms-title">🔑 Termos-Chave</div>` +
      ls.keyTerms.map(k => `<div class="la-keyterm-row"><span class="la-keyterm-chip">${k.term}</span><span class="la-keyterm-def">${k.def}</span></div>`).join('');
    body.appendChild(kt);
  }

  // Quiz
  if (ls.quiz) {
    const qCard = document.createElement('div');
    qCard.className = 'la-quiz-card';
    qCard.id = 'la-quiz-card';
    qCard.innerHTML = `
      <div class="la-quiz-header">🧠 Quiz Rápido</div>
      <div class="la-quiz-question">${ls.quiz.q}</div>
      <div class="la-quiz-opts" id="la-quiz-opts-inner"></div>
      <div class="la-quiz-feedback" id="la-quiz-feedback-inner"></div>
    `;
    body.appendChild(qCard);

    const optsEl = qCard.querySelector('#la-quiz-opts-inner');
    ls.quiz.opts.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'la-quiz-opt';
      btn.textContent = opt;
      btn.addEventListener('click', () => laAnswerQuiz(i, ls.quiz, chapterIdx, lessonIdx));
      optsEl.appendChild(btn);
    });
  }

  // Padding bottom
  const pad = document.createElement('div');
  pad.style.height = '16px';
  body.appendChild(pad);

  laShowScreen('la-screen-lesson');
}

function laAnswerQuiz(chosen, quiz, chapterIdx, lessonIdx) {
  if (_laQuizAnswered) return;
  _laQuizAnswered = true;
  const correct = chosen === quiz.correct;

  const opts = document.querySelectorAll('#la-quiz-opts-inner .la-quiz-opt');
  opts.forEach((btn, i) => {
    btn.disabled = true;
    if (i === quiz.correct) btn.classList.add('correct');
    else if (i === chosen && !correct) btn.classList.add('wrong');
  });

  const fb = document.getElementById('la-quiz-feedback-inner');
  if (fb) {
    fb.style.display = 'block';
    fb.className = 'la-quiz-feedback ' + (correct ? 'correct' : 'wrong');
    fb.textContent = (correct ? '✓ ' : '✗ ') + quiz.feedback;
  }

  // Auto-marcar como concluída ao acertar
  if (correct) {
    laMarkCompleted(chapterIdx, lessonIdx);
    const btnComplete = document.getElementById('la-btn-complete');
    if (btnComplete) { btnComplete.textContent = '✓ Concluída'; btnComplete.className = 'la-btn-complete done'; }
  }
}

function laToggleComplete() {
  if (_laCurrentChapter === null || _laCurrentLesson === null) return;
  laMarkCompleted(_laCurrentChapter, _laCurrentLesson);
  const btn = document.getElementById('la-btn-complete');
  btn.textContent = '✓ Concluída';
  btn.className = 'la-btn-complete done';
}

function laGoNextLesson() {
  if (_laCurrentChapter === null || _laCurrentLesson === null) return;
  const ch = LA_CHAPTERS[_laCurrentChapter];
  if (_laCurrentLesson < ch.lessons.length - 1) {
    laOpenLesson(_laCurrentChapter, _laCurrentLesson + 1);
  } else {
    laOpenChapter(_laCurrentChapter);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('.topbar-btn[data-tab="learn"]')?.addEventListener('click', initLearnTab);
  // também inicializa se clicar via tab switching genérico
  document.addEventListener('la-init', initLearnTab);
});

// ══════════════════════════════════════════════════════════════
// BOB CHAT — aba dedicada, usa motor NIM existente
// ══════════════════════════════════════════════════════════════
(function() {

  // ── Persistência de conversas por URL ─────────────────────────
  const BOB_STORAGE_KEY = 'bob_conversations';
  const BOB_MAX_CONVS   = 20;

  function _convKey() {
    const url = graphData?.url || 'global';
    try { return new URL(url).origin + new URL(url).pathname; } catch { return url; }
  }

  function _loadConvs() {
    try { return JSON.parse(localStorage.getItem(BOB_STORAGE_KEY) || '{}'); } catch { return {}; }
  }

  function _saveConvs(convs) {
    try { localStorage.setItem(BOB_STORAGE_KEY, JSON.stringify(convs)); } catch {}
  }

  function _saveMsg(role, content) {
    const convs = _loadConvs();
    const key   = _convKey();
    if (!convs[key]) convs[key] = { title: graphData?.title || graphData?.url || 'Conversa', url: graphData?.url || '', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    convs[key].messages.push({ role, content, ts: Date.now() });
    convs[key].updatedAt = Date.now();
    const keys = Object.keys(convs).sort((a,b) => convs[b].updatedAt - convs[a].updatedAt);
    if (keys.length > BOB_MAX_CONVS) keys.slice(BOB_MAX_CONVS).forEach(k => delete convs[k]);
    _saveConvs(convs);
  }

  function _restoreConv() {
    const convs = _loadConvs();
    const conv  = convs[_convKey()];
    if (!conv?.messages?.length) return;
    const container = document.getElementById('bob-messages');
    if (!container) return;
    container.querySelectorAll('.bob-welcome,.bob-quick-label,.bob-chips').forEach(el => el.remove());
    _bobHistory.length = 0;
    conv.messages.forEach(m => {
      _bobHistory.push({ role: m.role, content: m.content });
      const div = document.createElement('div');
      div.className = `bob-msg bob-msg--${m.role}`;
      div.textContent = m.content;
      container.appendChild(div);
    });
    // Adiciona botão "Nova conversa" no topo
    const newBtn = document.createElement('button');
    newBtn.className = 'bob-new-conv-btn';
    newBtn.textContent = '+ Nova conversa';
    newBtn.addEventListener('click', () => {
      const convs2 = _loadConvs(); delete convs2[_convKey()]; _saveConvs(convs2);
      _bobHistory.length = 0;
      container.innerHTML = _welcomeHTML();
      _bindChips();
      container.removeChild(newBtn);
      _renderHistory();
    });
    container.insertBefore(newBtn, container.firstChild);
    container.scrollTop = container.scrollHeight;
  }

  function _welcomeHTML() {
    return `<div class="bob-welcome">
      <div class="bob-welcome-title">Olá! Eu sou o Bob 👋</div>
      <div class="bob-welcome-sub">Seu consultor de SEO, GEO e AEO da Maturare. Tenho acesso completo à análise desta página — headings, links, imagens, schema e score SEO.</div>
      <div class="bob-welcome-sub" style="margin-top:6px">Posso te ajudar a aparecer no topo do Google <strong>e</strong> a ser citado pelo ChatGPT, Gemini e Perplexity.</div>
    </div>

    <!-- Card 360° — oculto até o chip ser clicado -->
    <div class="bob-360-card" id="bob-360-card" style="display:none">
      <div class="bob-360-header">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
        <div>
          <div class="bob-360-title">Diagnóstico 360°</div>
          <div class="bob-360-sub">Responda 2 perguntas para personalizar a análise</div>
        </div>
      </div>
      <div class="bob-360-q-block">
        <label class="bob-360-q-label">1. Qual o objetivo desta página?</label>
        <div class="bob-360-chips" id="b360-q1-chips">
          <button class="b360-chip" data-val="Vender serviço">Vender serviço</button>
          <button class="b360-chip" data-val="Gerar lead">Gerar lead</button>
          <button class="b360-chip" data-val="Vender produto">Vender produto</button>
          <button class="b360-chip" data-val="Informar / Educar">Informar / Educar</button>
          <button class="b360-chip" data-val="Ranquear para keyword">Ranquear para keyword</button>
          <button class="b360-chip" data-val="Outro">Outro</button>
        </div>
        <input class="bob-360-input" id="b360-q1-custom" type="text" placeholder="Descreva o objetivo..." style="display:none">
      </div>
      <div class="bob-360-q-block">
        <label class="bob-360-q-label">2. Qual palavra-chave você quer ranquear?</label>
        <input class="bob-360-input" id="b360-q2-keyword" type="text"
          placeholder="ex: aluguel empilhadeira goiânia" autocomplete="off" spellcheck="false">
      </div>
      <button class="bob-360-run-btn" id="bob-360-run-btn">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        Gerar diagnóstico
      </button>
    </div>

    <div class="bob-quick-label">PERGUNTAS RÁPIDAS</div>
    <div class="bob-chips" id="bob-chips">
      <button class="bob-chip" data-q="Como fazer a IA recomendar minha empresa? O que preciso implementar para o ChatGPT, Gemini e Perplexity me mencionarem quando alguém pesquisar pelo meu produto ou serviço?">Como fazer a IA recomendar minha empresa?</button>
      <button class="bob-chip" data-q="Como ficar no topo do Google sem pagar por anúncios? Quais são os principais fatores que o Google usa para ranquear páginas organicamente?">Como ficar no topo do Google sem pagar por anúncios?</button>
      <button class="bob-chip" data-q="Minha página está visível para IAs como ChatGPT, Gemini e Perplexity? Analise os dados e me diga o que falta para ela ser citada e mencionada nas respostas dessas IAs.">Minha página está visível para IA?</button>
      <button class="bob-chip bob-chip--360" data-action="open360">Faça uma auditoria 360° da minha página</button>
      <button class="bob-chip" data-q="Por que itens como velocidade, imagens, títulos e parágrafos importam para SEO? Como cada um desses elementos afeta meu ranqueamento no Google e minha visibilidade para as IAs?">Por que velocidade, imagens e títulos importam para SEO?</button>
    </div>`;
  }

  function _renderHistory() {
    const convs = _loadConvs();
    // Destaques primeiro, depois por data desc
    const keys = Object.keys(convs).sort((a, b) => {
      const sa = convs[a].starred ? 1 : 0;
      const sb = convs[b].starred ? 1 : 0;
      if (sb !== sa) return sb - sa;
      return convs[b].updatedAt - convs[a].updatedAt;
    });
    const panel = document.getElementById('bob-history-panel');
    if (!panel) return;
    if (!keys.length) { panel.innerHTML = '<div class="bob-history-empty">Nenhuma conversa salva.</div>'; return; }
    panel.innerHTML = keys.map(k => {
      const c      = convs[k];
      const title  = (c.title || k).substring(0, 50);
      const dt     = new Date(c.updatedAt);
      const date   = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
      const time   = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const msgs   = c.messages.length;
      const isCur  = k === _convKey();
      const starred = !!c.starred;
      return `<div class="bob-history-item${isCur ? ' bob-history-item--active' : ''}${starred ? ' bob-history-item--starred' : ''}" data-key="${escHtml(k)}" data-url="${escHtml(c.url || '')}">
        <div class="bob-history-item-info">
          <div class="bob-history-item-title">
            ${starred ? '<span class="bob-star-badge" title="Destaque">★</span>' : ''}${escHtml(title)}
          </div>
          <div class="bob-history-item-meta">
            <span class="bhi-msgs">${msgs} msg${msgs !== 1 ? 's' : ''}</span>
            <span class="bhi-sep">·</span>
            <span class="bhi-date">${date}</span>
            <span class="bhi-sep">·</span>
            <span class="bhi-time">${time}</span>
          </div>
        </div>
        <div class="bob-history-actions">
          <button class="bob-history-star${starred ? ' bob-history-star--on' : ''}" data-key="${escHtml(k)}" title="${starred ? 'Remover destaque' : 'Marcar como destaque'}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="${starred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </button>
          <button class="bob-history-delete" data-key="${escHtml(k)}" title="Excluir">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </button>
        </div>
      </div>`;
    }).join('');

    panel.querySelectorAll('.bob-history-star').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const k = btn.dataset.key;
        const convs2 = _loadConvs();
        if (convs2[k]) convs2[k].starred = !convs2[k].starred;
        _saveConvs(convs2);
        _renderHistory();
      });
    });

    panel.querySelectorAll('.bob-history-delete').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const k = btn.dataset.key;
        if (k === _convKey()) {
          _bobHistory.length = 0;
          const c = document.getElementById('bob-messages');
          if (c) { c.innerHTML = _welcomeHTML(); _bindChips(); }
        }
        const convs2 = _loadConvs(); delete convs2[k]; _saveConvs(convs2);
        _renderHistory();
      });
    });
  }

  function _bindChips() {
    document.getElementById('bob-chips')?.addEventListener('click', e => {
      const chip = e.target.closest('.bob-chip');
      if (!chip) return;
      if (chip.dataset.action === 'open360') {
        // Esconde chips e label, mas mantém o card 360° visível
        document.getElementById('bob-chips').style.display = 'none';
        document.querySelector('#bob-messages .bob-quick-label')?.remove();
        bob360Open();
        return;
      }
      document.getElementById('bob-chips').style.display = 'none';
      document.querySelector('#bob-messages .bob-quick-label')?.remove();
      sendBobMessage(chip.dataset.q);
    });
    // Re-inicializar o card 360° sempre que os chips forem renderizados
    bob360Init();
  }

  const _bobHistory = [];

  function getBobKey()   { return localStorage.getItem('nim_api_key') || ''; }
  function isBobReady()  { return !!getBobKey() && localStorage.getItem('nim_key_validated') === '1'; }

  function updateBobStatus() {
    const dot   = document.querySelector('#bob-status-dot .bob-online-dot');
    const label = document.querySelector('#bob-status-dot .bob-online-label');
    const input = document.getElementById('bob-input');
    const sendBtn = document.getElementById('bob-send-btn');
    if (!dot || !label) return;

    if (isBobReady()) {
      dot.style.background = 'var(--green)';
      label.textContent = 'online';
      label.style.color = 'var(--green)';
      if (input) input.placeholder = 'Pergunte qualquer coisa ao Bob...';
    } else {
      dot.style.background = 'var(--yellow)';
      label.textContent = 'API não configurada';
      label.style.color = 'var(--yellow)';
      if (input) input.placeholder = 'Configure a API Key em Config para usar o Bob...';
    }
  }

  function getBobModel() {
    const custom = localStorage.getItem('nim_custom_model');
    if (custom) return custom;
    return document.getElementById('nim-model')?.value || 'nvidia/llama-3.1-nemotron-ultra-253b-v1';
  }

  // Parser de Markdown leve para o Bob — converte para HTML seguro
  function bobRenderMarkdown(text) {
    if (!text) return '';
    let html = text
      // Escapar HTML perigoso primeiro
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      // Blocos de código — remover completamente (Bob não deve mandar código no chat)
      .replace(/```[\s\S]*?```/g, '')
      // Cabeçalhos — simplificar para negrito com quebra, não <h1>/<h2>
      .replace(/^#{1,3} (.+)$/gm, '<strong class="bob-md-heading">$1</strong>')
      // Negrito **texto**
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Itálico *texto*
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Separador horizontal ---
      .replace(/^---+$/gm, '<hr class="bob-md-hr">')
      // Itens de lista - item ou * item ou 1. item
      .replace(/^[\-\*] (.+)$/gm, '<div class="bob-md-li">• $1</div>')
      .replace(/^\d+\. (.+)$/gm, '<div class="bob-md-li bob-md-li--num">$1</div>')
      // Tabelas Markdown — converter em texto simples
      .replace(/\|.+\|/g, (match) => {
        const cells = match.split('|').map(s => s.trim()).filter(Boolean);
        return cells.join(' · ');
      })
      .replace(/^[\|\-\s]+$/gm, '') // remover linhas separadoras de tabela
      // Links [texto](url) — mostrar só o texto
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      // Quebras de linha duplas → parágrafo
      .replace(/\n{2,}/g, '</p><p class="bob-md-p">')
      // Quebra simples → <br>
      .replace(/\n/g, '<br>');

    return `<p class="bob-md-p">${html}</p>`;
  }

  function appendBobMsg(role, text) {
    const container = document.getElementById('bob-messages');
    if (!container) return { textContent: '', innerHTML: '', classList: { add:()=>{}, remove:()=>{} } };
    const div = document.createElement('div');
    div.className = `bob-msg bob-msg--${role}`;
    if (role === 'assistant' && text) {
      div.innerHTML = bobRenderMarkdown(text);
    } else {
      div.textContent = text;
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  }

  function setBobHint(html) {
    const el = document.getElementById('bob-input-hint');
    if (!el) return;
    const last = el.querySelector('span:last-child');
    if (!last) return;
    if (html && html.includes('<')) {
      last.innerHTML = html;
    } else {
      last.textContent = html || 'Enter para enviar · Shift+Enter nova linha';
    }
  }

  // Muda para sub-aba Chat e dispara pergunta
  function askBob(text) {
    // Garante que o pane de chat está visível
    switchBobPane('chat');
    if (!text.trim()) return;
    const input = document.getElementById('bob-input');
    if (input) input.value = '';
    sendBobMessage(text);
  }

  function switchBobPane(pane) {
    document.querySelectorAll('.bob-subtab').forEach(b => b.classList.toggle('bob-subtab--active', b.dataset.bobtab === pane));
    document.getElementById('bob-pane-chat')?.classList.toggle('bob-pane--active', pane === 'chat');
    document.getElementById('bob-pane-learn')?.classList.toggle('bob-pane--active', pane === 'learn');
    document.getElementById('bob-pane-history')?.classList.toggle('bob-pane--active', pane === 'history');
    // Input visível só no chat
    const inputArea = document.querySelector('.bob-input-area');
    if (inputArea) inputArea.style.display = pane === 'chat' ? '' : 'none';
    // Renderiza lista ao entrar na aba de histórico
    if (pane === 'history') _renderHistory();
  }

  async function sendBobMessage(text) {
    if (!text.trim()) return;
    const key   = getBobKey();
    const model = getBobModel();

    if (!key) {
      appendBobMsg('assistant', '⚠️ Configure uma API Key em Config → NVIDIA NIM para conversar com o Bob.');
      return;
    }

    appendBobMsg('user', text);
    _bobHistory.push({ role: 'user', content: text });
    _saveMsg('user', text);

    const pageCtx = typeof window._bobBuildPageContext === 'function' ? window._bobBuildPageContext() : '';
    const systemPrompt = `Você é o Bob, consultor de SEO da agência Maturare. Fala com donos de negócio e gestores — não com programadores.

REGRAS DE COMUNICAÇÃO:
- Português brasileiro, linguagem de reunião de consultoria
- Sem siglas sem explicação (escreva "dados estruturados" não "schema JSON-LD")
- Sem tabelas markdown — use parágrafos curtos
- Sem listas com mais de 4 itens
- Máximo 300 palavras por resposta, salvo pedido explícito de relatório completo
- Consequências em linguagem de negócio: "clientes não te encontram", "Google desconfia", "perde vendas" — não "penalização de algoritmo"
- Sempre termine com UMA ação concreta e simples

${pageCtx ? `DADOS DA PÁGINA ANALISADA:\n${pageCtx}` : 'Nenhuma página analisada ainda.'}`;

    const replyDiv = appendBobMsg('assistant', '');
    const sendBtn  = document.getElementById('bob-send-btn');
    const inputEl  = document.getElementById('bob-input');
    if (sendBtn) sendBtn.disabled = true;
    if (inputEl) inputEl.disabled = true;

    // ── Loading: overlay centralizado dentro da bolha ─────────────
    const BOB_QUOTES = [
      '"Conteúdo é rei, mas contexto é o reino." — Gary Vaynerchuk',
      '"SEO não é sobre enganar o Google. É sobre ser o melhor resultado." — Rand Fishkin',
      '"A melhor forma de rankear é merecer rankear." — Dharmesh Shah',
      '"Se não está no Google, não existe." — Provérbio digital',
      '"Não escreva para motores de busca. Escreva para pessoas." — Matt Cutts',
      '"As IAs citam quem tem autoridade. Autoridade se constrói com conteúdo." — Maturare',
      '"Velocidade é um fator de ranqueamento. Usuários lentos são usuários perdidos." — Google',
      '"E-E-A-T não é um truque. É a reputação digital do seu negócio." — Search Central',
      '"GEO é o novo SEO: aparecer na IA antes de aparecer no Google." — Maturare',
      '"Schema markup é como você se apresenta ao algoritmo. Sem ele, você é genérico." — Maturare',
      '"Um H1 ruim custa mais caro do que uma campanha paga mal feita." — Provérbio SEO',
      '"Cada link interno é um voto de confiança. Use-os sabiamente." — Rand Fishkin',
    ];

    // Etapas do processo — aviso contextual por faixa de progresso
    const BOB_STEPS = [
      { until: 20, msg: 'Lendo os dados da página...' },
      { until: 40, msg: 'Organizando headings, links e imagens...' },
      { until: 60, msg: 'Consultando a API da NVIDIA...' },
      { until: 75, msg: 'Analisando schema e score SEO...' },
      { until: 88, msg: 'Preparando a resposta...' },
      { until: 99, msg: 'Quase lá, organizando os insights...' },
    ];

    // Cria o overlay de loading dentro da bolha
    const loadingEl = document.createElement('div');
    loadingEl.className = 'bob-loading-overlay';
    loadingEl.innerHTML = `
      <div class="bob-loading-step" id="bob-loading-step">${BOB_STEPS[0].msg}</div>
      <div class="bob-loading-pct" id="bob-loading-pct">3%</div>
      <div class="bob-loading-bar"><div class="bob-loading-fill" id="bob-loading-fill" style="width:3%"></div></div>
      <div class="bob-loading-quote" id="bob-loading-quote">${BOB_QUOTES[0]}</div>
    `;
    replyDiv.classList.add('bob-msg--loading');
    replyDiv.appendChild(loadingEl);

    let _quoteIdx = 0;
    let _progress = 3;
    // Fase 1: sobe rápido até 88% (saltos de 4-16%)
    // Fase 2: sobe devagar 1% a cada tick depois de 88% — nunca trava
    const _progressTarget = 99;

    const _loadingInterval = setInterval(() => {
      _quoteIdx = (_quoteIdx + 1) % BOB_QUOTES.length;
      const step = _progress < 88
        ? Math.floor(Math.random() * 12) + 4   // saltos rápidos
        : 1;                                     // 1% por tick após 88%
      _progress = Math.min(_progressTarget, _progress + step);
      const pctEl   = document.getElementById('bob-loading-pct');
      const fillEl  = document.getElementById('bob-loading-fill');
      const quoteEl = document.getElementById('bob-loading-quote');
      const stepEl  = document.getElementById('bob-loading-step');
      if (pctEl)   pctEl.textContent  = `${_progress}%`;
      if (fillEl)  fillEl.style.width = `${_progress}%`;
      if (quoteEl) quoteEl.textContent = BOB_QUOTES[_quoteIdx];
      if (stepEl) {
        const currentStep = BOB_STEPS.find(s => _progress <= s.until) || BOB_STEPS[BOB_STEPS.length - 1];
        stepEl.textContent = currentStep.msg;
      }
    }, 4500);

    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        ..._bobHistory.slice(-10),
      ];

      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'NVIDIA_API_STREAM',
          payload: { apiKey: key, model, messages, temperature: 0.5, maxTokens: 600 },
        });

        let fullText = '';
        let _firstChunk = true;
        const handler = (msg) => {
          // background.js envia NIM_STREAM_CHUNK com campo "chunk"
          if (msg.type === 'NIM_STREAM_CHUNK') {
            const delta = msg.chunk || msg.delta || '';
            fullText += delta;
            // Remove overlay no primeiro chunk
            if (_firstChunk) {
              _firstChunk = false;
              clearInterval(_loadingInterval);
              replyDiv.classList.remove('bob-msg--loading');
              replyDiv.innerHTML = '';
            }
            // Durante streaming: texto puro para performance
            replyDiv.textContent = fullText;
            const c = document.getElementById('bob-messages');
            if (c) c.scrollTop = c.scrollHeight;
          } else if (msg.type === 'NIM_STREAM_DONE') {
            chrome.runtime.onMessage.removeListener(handler);
            // Ao finalizar: renderizar com Markdown
            replyDiv.innerHTML = bobRenderMarkdown(fullText);
            if (c) c.scrollTop = c.scrollHeight;
            _bobHistory.push({ role: 'assistant', content: fullText });
            _saveMsg('assistant', fullText);
            resolve(fullText);
          } else if (msg.type === 'NIM_STREAM_ERROR') {
            chrome.runtime.onMessage.removeListener(handler);
            reject(new Error(msg.message || msg.error || 'Erro na API'));
          }
        };
        chrome.runtime.onMessage.addListener(handler);
      });

    } catch (err) {
      clearInterval(_loadingInterval);
      replyDiv.classList.remove('bob-msg--loading');
      replyDiv.innerHTML = '';
      replyDiv.textContent = `❌ Erro: ${err.message}`;
    } finally {
      clearInterval(_loadingInterval);
      replyDiv.classList.remove('bob-msg--loading');
      if (sendBtn) sendBtn.disabled = false;
      if (inputEl) { inputEl.disabled = false; inputEl.focus(); }
      setBobHint('');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const input   = document.getElementById('bob-input');
    const sendBtn = document.getElementById('bob-send-btn');

    const doSend = () => {
      const text = input?.value.trim();
      if (!text) return;
      if (input) { input.value = ''; input.style.height = 'auto'; }
      sendBobMessage(text);
    };

    sendBtn?.addEventListener('click', doSend);
    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });
    input?.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Sub-abas Chat | Perguntas Estratégicas
    document.querySelectorAll('.bob-subtab').forEach(btn => {
      btn.addEventListener('click', () => switchBobPane(btn.dataset.bobtab));
    });

    // Chips de perguntas rápidas
    document.getElementById('bob-chips')?.addEventListener('click', e => {
      const chip = e.target.closest('.bob-chip');
      if (!chip) return;

      // Chip especial: abre card 360° dentro do Bob
      if (chip.dataset.action === 'open360') {
        document.getElementById('bob-chips').style.display = 'none';
        document.querySelector('.bob-quick-label')?.remove();
        bob360Open();
        return;
      }

      document.getElementById('bob-chips').style.display = 'none';
      document.querySelector('.bob-quick-label')?.style && (document.querySelector('.bob-quick-label').style.display = 'none');
      sendBobMessage(chip.dataset.q);
    });

    // Inicializar card 360° embutido no Bob
    bob360Init();


    // Itens do pane Aprender — clica e abre chat com a pergunta
    document.getElementById('bob-pane-learn')?.addEventListener('click', e => {
      const item = e.target.closest('.bob-learn-item');
      if (!item) return;
      askBob(item.dataset.q);
    });

    // Badge modelo ativo
    const updateModelBadge = () => {
      const badge = document.getElementById('bob-model-badge');
      if (!badge) return;
      const model = getBobModel().split('/').pop();
      badge.textContent = model ? `⚡ ${model}` : '';
    };
    updateModelBadge();
    document.getElementById('nim-model')?.addEventListener('change', updateModelBadge);

    // Status inicial da API
    updateBobStatus();

    // Restaura histórico da conversa atual + render histórico salvo
    _restoreConv();
    _renderHistory();
    _bindChips();

    // Botão "Configurar API" quando não conectado — abre aba Config
    document.getElementById('bob-config-btn')?.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('.tab[data-tab="config"]')?.classList.add('active');
      document.getElementById('tab-config')?.classList.add('active');
      setTimeout(() => document.getElementById('nim-api-key')?.focus(), 100);
    });

    // Atualiza status quando voltar para aba Bob (pode ter configurado entretenimento)
    document.querySelector('.tab[data-tab="bob"]')?.addEventListener('click', () => {
      document.getElementById('topbar-bob-btn')?.classList.add('bob-visited');
      document.querySelector('.tab-bob-nav')?.classList.add('bob-visited');
      updateBobStatus();
    });

    // Também atualiza quando salva a key no Config
    document.getElementById('nim-save-btn')?.addEventListener('click', () => {
      setTimeout(updateBobStatus, 500);
    });
    document.getElementById('nim-test-btn')?.addEventListener('click', () => {
      setTimeout(updateBobStatus, 3000);
    });

    // ── Aba Histórico: nova conversa ─────────────────────────────
    document.getElementById('bob-new-chat-btn')?.addEventListener('click', () => {
      const convs = _loadConvs();
      delete convs[_convKey()];
      _saveConvs(convs);
      _bobHistory.length = 0;
      const container = document.getElementById('bob-messages');
      if (container) { container.innerHTML = _welcomeHTML(); _bindChips(); }
      switchBobPane('chat');
    });

    // Aba Histórico: clicar num item carrega a conversa no chat
    document.getElementById('bob-history-panel')?.addEventListener('click', e => {
      if (e.target.closest('.bob-history-delete')) return; // tratado por _renderHistory
      const item = e.target.closest('.bob-history-item');
      if (!item) return;
      const key = item.dataset.key;
      if (!key) return;
      const convs = _loadConvs();
      const conv  = convs[key];
      if (!conv?.messages?.length) return;
      const container = document.getElementById('bob-messages');
      if (!container) return;
      container.innerHTML = '';
      _bobHistory.length = 0;
      conv.messages.forEach(m => {
        _bobHistory.push({ role: m.role, content: m.content });
        const div = document.createElement('div');
        div.className = `bob-msg bob-msg--${m.role}`;
        div.textContent = m.content;
        container.appendChild(div);
      });
      container.scrollTop = container.scrollHeight;
      switchBobPane('chat');
    });
  });
})();
