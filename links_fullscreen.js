(async () => {
  const stored = await chrome.storage.local.get('seo_links_fullscreen');
  if (!stored.seo_links_fullscreen) {
    document.getElementById('lf-canvas-area').innerHTML =
      '<div class="lf-empty"><p>Nenhum dado encontrado.<br>Abra a extensão e clique em "Ver mapa completo".</p></div>';
    return;
  }
  const { linkNodes, pageUrl } = stored.seo_links_fullscreen;
  renderJuiceFullscreen(linkNodes, pageUrl);
  initViewToggle(linkNodes, pageUrl);
})();

// ── Classificação ────────────────────────────────────────────────────────────
const RUIM_SET = new Set([
  'clique aqui','clique','aqui','saiba mais','leia mais','veja mais','ver mais',
  'acesse','acesse aqui','link','more','click here','read more','here',
  'ver','veja','mais','continue','continuar','download','baixar','abrir','open',
]);

const TYPE_META = {
  phrase:   { label: 'Frase',    color: '#34d399', bg: 'rgba(52,211,153,.18)',  icon: '★★★★★', stars: 5, desc: '4+ palavras — máximo contexto semântico' },
  exact:    { label: 'Exata',    color: '#6ee7b7', bg: 'rgba(52,211,153,.12)',  icon: '★★★★',  stars: 4, desc: '2-3 palavras com keyword clara' },
  branded:  { label: 'Marca',    color: '#a78bfa', bg: 'rgba(124,116,255,.15)', icon: '★★★',   stars: 3, desc: 'Nome de marca sem descrever o conteúdo' },
  ruim:     { label: 'Ruim',     color: '#f87171', bg: 'rgba(248,113,113,.15)', icon: '★',     stars: 1, desc: 'Genérica — zero contexto para o Google' },
  nofollow: { label: 'Nofollow', color: '#636882', bg: 'rgba(99,104,130,.2)',   icon: '⛔',    stars: 0, desc: 'Não transfere PageRank' },
  image:    { label: 'Imagem',   color: '#636882', bg: 'rgba(99,104,130,.15)',  icon: '🖼',    stars: 0, desc: 'Link de imagem sem texto alternativo' },
};

function classifyAnchor(text, nofollow) {
  const t = (text || '').trim();
  const tl = t.toLowerCase();
  if (nofollow)                                                              return TYPE_META.nofollow;
  if (!t)                                                                    return TYPE_META.image;
  if (RUIM_SET.has(tl) || /^[\d\s\W]+$/.test(t) || t.length <= 2)         return TYPE_META.ruim;
  if (/^[A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][a-záéíóúãõâêîôûç]+$/.test(t) && !t.includes(' ')) return TYPE_META.branded;
  if (t.split(/\s+/).length >= 4)                                           return TYPE_META.phrase;
  if (t.split(/\s+/).length >= 2)                                           return TYPE_META.exact;
  return TYPE_META.branded;
}

// ── SVG helpers ──────────────────────────────────────────────────────────────
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

// ── Copo SVG ─────────────────────────────────────────────────────────────────
function makeCup({ cx, cy, w, h, liquidPct, color, valueText, sublabel, isSource, nofollow }) {
  const bevel = w * 0.13;
  const pad   = 2;
  const liqH  = Math.max(0, Math.min(1, liquidPct)) * (h - 6);
  const liqY  = cy + h / 2 - 3 - liqH;
  const top   = cy - h / 2;
  const bot   = cy + h / 2;
  const left  = cx - w / 2;
  const right = cx + w / 2;
  const pts   = `${left+bevel},${top} ${right-bevel},${top} ${right-pad},${bot} ${left+pad},${bot}`;

  const g = el('g', { class: 'cup-group' });
  const defs = el('defs');

  const clipId = `c${Math.round(cx)}_${Math.round(cy)}`;
  const clip = el('clipPath', { id: clipId });
  clip.appendChild(el('polygon', { points: pts }));
  defs.appendChild(clip);

  const gId = `g${Math.round(cx)}_${Math.round(cy)}`;
  const grad = el('linearGradient', { id: gId, x1:'0', y1:'0', x2:'1', y2:'0' });
  grad.appendChild(el('stop', { offset:'0%',   'stop-color': color, 'stop-opacity':'0.7' }));
  grad.appendChild(el('stop', { offset:'50%',  'stop-color': color }));
  grad.appendChild(el('stop', { offset:'100%', 'stop-color': color, 'stop-opacity':'0.7' }));
  defs.appendChild(grad);
  g.appendChild(defs);

  // Corpo
  g.appendChild(el('polygon', {
    class: 'cup-body-main', points: pts,
    fill: isSource ? '#1e1b3a' : '#1e2035',
    stroke: isSource ? '#7c74ff' : color,
    'stroke-width': isSource ? '2' : '1.5',
  }));

  // Líquido
  if (liqH > 0) {
    g.appendChild(el('rect', {
      x: left + pad, y: liqY, width: w - pad*2, height: liqH,
      fill: `url(#${gId})`,
      'clip-path': `url(#${clipId})`,
    }));
  }

  // Reflexo
  g.appendChild(el('rect', {
    x: left + bevel + 3, y: top + 4, width: 4, height: h * 0.5,
    fill: 'rgba(255,255,255,0.07)',
    'clip-path': `url(#${clipId})`,
  }));

  // Borda superior
  g.appendChild(el('line', {
    x1: left+bevel, y1: top, x2: right-bevel, y2: top,
    stroke: isSource ? '#9b95ff' : color,
    'stroke-width': isSource ? '2.5' : '2',
    'stroke-linecap': 'round', opacity: '0.8',
  }));

  // Valor
  if (liqH > 14 && valueText) {
    g.appendChild(el('text', {
      x: cx, y: liqY + liqH / 2,
      'font-size': isSource ? '13' : '10', 'font-weight': '700',
      fill: '#fff', 'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'pointer-events': 'none',
    }, valueText));
  }

  // Label abaixo
  if (sublabel) {
    const short = sublabel.length > 16 ? sublabel.substring(0, 15) + '…' : sublabel;
    g.appendChild(el('text', {
      x: cx, y: bot + 16,
      'font-size': isSource ? '13' : '11', 'font-weight': isSource ? '700' : '500',
      fill: isSource ? '#c4bfff' : nofollow ? '#636882' : '#a8adc4',
      'text-anchor': 'middle',
    }, short));

    // badge de % abaixo do label (destinos)
    if (!isSource) {
      g.appendChild(el('text', {
        x: cx, y: bot + 29,
        'font-size': '9.5', fill: nofollow ? '#636882' : '#f97316',
        'text-anchor': 'middle', 'font-family': 'monospace',
      }, valueText));
    }
  }

  // Tag nofollow
  if (nofollow && !isSource) {
    const tw = 44, th = 13;
    const nr = el('rect', { x: cx - tw/2, y: top - th - 4, width: tw, height: th, rx: '3', fill: 'rgba(248,113,113,.15)' });
    g.appendChild(nr);
    g.appendChild(el('text', {
      x: cx, y: top - th/2 - 4,
      'font-size': '8', 'font-weight': '700', fill: '#f87171',
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
    }, '⛔ nofollow'));
  }

  return g;
}

// ── Linha de conexão com pill de âncora ──────────────────────────────────────
function makeConnection(x1, y1, x2, y2, anchor, nofollow, lineIdx, totalLines) {
  const g = el('g');
  const cls = classifyAnchor(anchor, nofollow);
  const lineColor = nofollow ? '#f87171' : '#f97316';
  const lineOpacity = nofollow ? 0.3 : 0.7;

  // Offset lateral para separar linhas do mesmo destino
  const offset = (lineIdx - (totalLines - 1) / 2) * 14;
  const mx = (x1 + x2) / 2 + offset;
  const my = (y1 * 0.3 + y2 * 0.7);

  const d = `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;

  g.appendChild(el('path', {
    d, fill: 'none', stroke: lineColor,
    'stroke-width': nofollow ? '1' : '1.5',
    'stroke-dasharray': nofollow ? '4 4' : '6 4',
    'stroke-dashoffset': '0',
    opacity: String(lineOpacity),
    style: nofollow ? '' : 'animation: flow 1.4s linear infinite',
  }));

  // Seta
  const angle = Math.atan2(y2 - my, x2 - mx);
  const r = 7;
  const ax = x2 - Math.cos(angle) * r;
  const ay = y2 - Math.sin(angle) * r;
  g.appendChild(el('polygon', {
    points: `${ax},${ay} ${ax-Math.cos(angle-.5)*9},${ay-Math.sin(angle-.5)*9} ${ax-Math.cos(angle+.5)*9},${ay-Math.sin(angle+.5)*9}`,
    fill: lineColor, opacity: String(lineOpacity + .1),
  }));

  // ── Pill âncora — no meio da linha ─────────────────────────────────────────
  if (anchor) {
    // Ponto ~50% da curva de Bezier quadrática
    const t = 0.5;
    const pillX = (1-t)*(1-t)*x1 + 2*(1-t)*t*mx + t*t*x2;
    const pillY = (1-t)*(1-t)*y1 + 2*(1-t)*t*my + t*t*y2;

    const typeKey = nofollow ? 'nofollow' : Object.keys(TYPE_META).find(k => TYPE_META[k] === cls) || 'branded';
    const pillColor = cls.color;
    const pillBg    = cls.bg;

    const short = anchor.length > 24 ? anchor.substring(0, 23) + '…' : anchor;
    const pillW = Math.min(short.length * 6.5 + 28, 200);
    const pillH = 20;

    // Fundo da pill
    g.appendChild(el('rect', {
      x: pillX - pillW/2, y: pillY - pillH/2,
      width: pillW, height: pillH,
      rx: '10', ry: '10',
      fill: '#0d0e1a', stroke: pillColor, 'stroke-width': '1',
      opacity: '0.95',
    }));

    // Dot de tipo
    g.appendChild(el('circle', {
      cx: pillX - pillW/2 + 11, cy: pillY,
      r: '4', fill: pillColor,
    }));

    // Texto da âncora
    g.appendChild(el('text', {
      x: pillX - pillW/2 + 20, y: pillY,
      'font-size': '9', 'font-weight': '600',
      fill: '#edf0f7', 'text-anchor': 'start', 'dominant-baseline': 'middle',
      'pointer-events': 'none',
    }, short));
  }

  return g;
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderJuiceFullscreen(linkNodes, pageUrl) {
  const svg      = document.getElementById('lf-svg');
  const urlEl    = document.getElementById('lf-url');
  const statsEl  = document.getElementById('lf-stats');
  const orphanEl = document.getElementById('lf-orphan-info');

  if (urlEl) urlEl.textContent = pageUrl || '—';

  let rootPath = '/';
  try { rootPath = new URL(pageUrl).pathname || '/'; } catch {}

  // Monta mapa de destinos
  const destMap = new Map();
  linkNodes.forEach(l => {
    if (!l.isInternal || !l.href) return;
    let p = l.href;
    try { p = new URL(l.href.startsWith('http') ? l.href : 'http://x' + l.href).pathname; } catch {}
    if (!p || p === rootPath || p === '/') return;
    if (!destMap.has(p)) destMap.set(p, { count: 0, nofollow: true, links: [] });
    const d = destMap.get(p);
    d.count++;
    if (!l.nofollow) d.nofollow = false;
    d.links.push({ anchor: (l.anchor || '').trim(), nofollow: !!l.nofollow });
  });

  const dests = [...destMap.entries()].sort((a, b) => b[1].count - a[1].count);
  const totalLinks = dests.reduce((s, [, d]) => s + d.count, 0);
  if (statsEl) statsEl.textContent = `${dests.length} páginas · ${totalLinks} links`;

  if (!dests.length) {
    document.getElementById('lf-canvas-area').innerHTML =
      '<div class="lf-empty"><p>Nenhum link interno encontrado.</p></div>';
    return;
  }

  // ── Score geral ──────────────────────────────────────────────────────────
  const WEIGHTS = { phrase:1, exact:.85, branded:.5, ruim:0, nofollow:.1, image:.2 };
  const allAnchors = linkNodes.filter(l => l.isInternal).map(l => classifyAnchor((l.anchor||'').trim(), l.nofollow));
  const scoreRaw = allAnchors.length
    ? allAnchors.reduce((s, c) => {
        const k = Object.keys(TYPE_META).find(k => TYPE_META[k] === c) || 'branded';
        return s + (WEIGHTS[k] ?? 0.5);
      }, 0) / allAnchors.length * 100
    : 100;
  const score = Math.round(scoreRaw);
  const scoreCls = score >= 70 ? 'good' : score >= 45 ? 'warn' : 'bad';

  const sbScore = document.getElementById('sb-score');
  const sbBadge = document.getElementById('sb-badge');
  const sbBar   = document.getElementById('sb-bar');
  const sbTypes = document.getElementById('sb-types');
  if (sbScore) { sbScore.textContent = score; sbScore.className = `score-big score-big--${scoreCls}`; }
  if (sbBadge) {
    sbBadge.textContent = score >= 70 ? 'Bom' : score >= 45 ? 'Regular' : 'Ruim';
    sbBadge.className   = `score-badge score-badge--${scoreCls}`;
  }
  if (sbBar) {
    sbBar.style.width = score + '%';
    sbBar.style.background = score >= 70 ? '#34d399' : score >= 45 ? '#fbbf24' : '#f87171';
  }

  // Contagem por tipo
  if (sbTypes) {
    const counts = {};
    allAnchors.forEach(c => {
      const k = Object.keys(TYPE_META).find(k => TYPE_META[k] === c) || 'branded';
      counts[k] = (counts[k] || 0) + 1;
    });
    sbTypes.innerHTML = Object.entries(counts)
      .sort((a, b) => (TYPE_META[b[0]]?.stars||0) - (TYPE_META[a[0]]?.stars||0))
      .map(([k, n]) => `
        <div class="anchor-type-row">
          <div class="anchor-type-left">
            <div class="anchor-type-dot" style="background:${TYPE_META[k]?.color}"></div>
            <span class="anchor-type-name">${TYPE_META[k]?.label}</span>
          </div>
          <span class="anchor-type-count">${n}×</span>
        </div>`).join('');
  }

  // ── AI button ──────────────────────────────────────────────────────────────
  const aiBtn  = document.getElementById('ai-main-btn');
  const aiOpts = document.getElementById('ai-options');
  aiBtn?.addEventListener('click', e => { e.stopPropagation(); aiOpts.classList.toggle('open'); });
  document.addEventListener('click', () => aiOpts?.classList.remove('open'));
  aiOpts?.querySelectorAll('[data-ai]').forEach(opt => {
    opt.addEventListener('click', () => {
      aiOpts.classList.remove('open');
      sendToAI(opt.dataset.ai, linkNodes, pageUrl);
    });
  });

  // ── Layout SVG ────────────────────────────────────────────────────────────
  const MAX_PER_ROW = 7;
  const CUP_W_SRC = 90, CUP_H_SRC = 100;
  const CUP_W = 68, CUP_H = 68;
  const GAP_X = 24, GAP_Y = 110, ROW_GAP = 90;
  const PAD_X = 60, PAD_Y = 40;

  const cols  = Math.min(dests.length, MAX_PER_ROW);
  const rows  = Math.ceil(dests.length / MAX_PER_ROW);
  const svgW  = Math.max(cols * (CUP_W + GAP_X) - GAP_X + PAD_X * 2, 600);
  const svgH  = PAD_Y + CUP_H_SRC + GAP_Y + rows * (CUP_H + ROW_GAP) + 60;

  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
  svg.setAttribute('width',  String(svgW));
  svg.setAttribute('height', String(svgH));
  svg.style.minWidth = svgW + 'px';

  // Animação flow
  const style = document.createElementNS(NS, 'style');
  style.textContent = '@keyframes flow { to { stroke-dashoffset: -20; } }';
  svg.appendChild(style);

  const linesG = el('g'); svg.appendChild(linesG);
  const cupsG  = el('g'); svg.appendChild(cupsG);

  // Source cup
  const srcX = svgW / 2;
  const srcY = PAD_Y + CUP_H_SRC / 2;
  const srcBotY = srcY + CUP_H_SRC / 2;
  cupsG.appendChild(makeCup({
    cx: srcX, cy: srcY, w: CUP_W_SRC, h: CUP_H_SRC,
    liquidPct: 1, color: '#7c74ff', valueText: '100%',
    sublabel: 'Esta página', isSource: true,
  }));

  // Dest cups
  dests.forEach(([path, d], idx) => {
    const row = Math.floor(idx / MAX_PER_ROW);
    const col = idx % MAX_PER_ROW;
    const rowItems = Math.min(dests.length - row * MAX_PER_ROW, MAX_PER_ROW);
    const rowStartX = svgW / 2 - ((rowItems - 1) * (CUP_W + GAP_X)) / 2;
    const cx = rowStartX + col * (CUP_W + GAP_X);
    const cy = srcBotY + GAP_Y + CUP_H / 2 + row * (CUP_H + ROW_GAP);
    const topY = cy - CUP_H / 2;

    const pct = totalLinks > 0 ? d.count / totalLinks : 0;
    const pctLabel = Math.round(pct * 100) + '%';
    const label = path.replace(/^\/|\/$/g, '').split('/').pop() || path;

    // Linhas: máx 2 âncoras distintas por destino na visualização
    const unique = [];
    const seenA = new Set();
    d.links.forEach(l => {
      const k = (l.anchor || '') + '|' + l.nofollow;
      if (!seenA.has(k)) { seenA.add(k); unique.push(l); }
    });
    unique.slice(0, 2).forEach((l, li) => {
      linesG.appendChild(makeConnection(srcX, srcBotY, cx, topY, l.anchor, l.nofollow, li, Math.min(unique.length, 2)));
    });

    // Copo
    const cup = makeCup({
      cx, cy, w: CUP_W, h: CUP_H,
      liquidPct: d.nofollow ? pct * 0.15 : pct,
      color: d.nofollow ? '#374151' : '#f97316',
      valueText: d.nofollow ? '0%' : pctLabel,
      sublabel: label, nofollow: d.nofollow,
    });
    cup.style.cursor = 'pointer';
    cup.addEventListener('click', () => openPanel(path, d, pct));
    cupsG.appendChild(cup);
  });

  // nofollow count
  const nfCount = dests.filter(([,d]) => d.nofollow).length;
  if (orphanEl && nfCount > 0) {
    orphanEl.innerHTML = `<span style="color:#f87171">⛔ ${nfCount} página${nfCount>1?'s':''} nofollow — não recebem PageRank</span>`;
  }

  // ── Painel lateral ────────────────────────────────────────────────────────
  const panel = document.getElementById('lf-panel');
  document.getElementById('panel-close')?.addEventListener('click', () => panel.classList.remove('open'));

  function openPanel(path, d, pct) {
    const label = path.replace(/^\/|\/$/g, '') || '/';
    document.getElementById('panel-title').textContent = label;
    document.getElementById('panel-url').textContent = path;

    const barEl = document.getElementById('panel-juice-bar');
    const pctEl = document.getElementById('panel-juice-pct');
    if (barEl) barEl.style.width = (d.nofollow ? 0 : Math.round(pct * 100)) + '%';
    if (pctEl) pctEl.textContent = d.nofollow ? '⛔ nofollow' : Math.round(pct * 100) + '%';
    if (barEl) barEl.style.background = d.nofollow ? '#f87171' : '#f97316';

    const body = document.getElementById('panel-body');
    body.innerHTML = '';

    // Agrupa âncoras por texto+nofollow
    const aMap = new Map();
    d.links.forEach(l => {
      const k = (l.anchor || '') + '|' + l.nofollow;
      if (!aMap.has(k)) aMap.set(k, { anchor: l.anchor, nofollow: l.nofollow, count: 0 });
      aMap.get(k).count++;
    });

    const sorted = [...aMap.values()].sort((a, b) => b.count - a.count);

    if (!sorted.length) {
      body.innerHTML = '<div class="panel-empty">Nenhuma âncora encontrada.</div>';
    } else {
      sorted.forEach(({ anchor, nofollow, count }) => {
        const cls = classifyAnchor(anchor, nofollow);
        const typeKey = nofollow ? 'nofollow' : Object.keys(TYPE_META).find(k => TYPE_META[k] === cls) || 'branded';
        const meta = TYPE_META[typeKey];
        const isEmpty = !anchor;

        const TIPS = {
          ruim:     '⚠ Substitua por texto descritivo. "Clique aqui" não transmite nenhum contexto ao Google — o crawler não sabe o que vai encontrar na próxima página.',
          branded:  '💡 Só o nome da marca não descreve o tema. Tente: "' + (anchor||'Marca') + ' — [serviço ou produto]" para passar mais contexto.',
          nofollow: '⛔ Este link não transfere PageRank. Se a página destino é importante para o negócio, remova o nofollow.',
          image:    '🖼 Link de imagem sem texto. Adicione alt text descritivo na imagem para que o Google entenda o contexto do link.',
        };

        const WHAT_IS = {
          phrase:   '✅ Âncora de frase — 4+ palavras descrevendo o destino. Máximo de contexto semântico passado ao Google.',
          exact:    '✅ Âncora exata — 2-3 palavras com keyword. Sinal preciso sobre o tema da página destino.',
          branded:  '🔶 Âncora de marca — o Google reconhece a entidade, mas não entende o que a página destino oferece especificamente.',
          ruim:     '❌ Âncora ruim — "clique aqui", "saiba mais" etc. não dizem nada ao Google sobre o tema da próxima página.',
          nofollow: '⛔ Nofollow — o link existe para o usuário, mas o Google não passa PageRank por ele.',
          image:    '⚪ Link de imagem — sem texto âncora. O Google usa o atributo alt da imagem como âncora.',
        };

        const card = document.createElement('div');
        card.className = `panel-anchor-card pac--${typeKey}`;
        card.innerHTML = `
          <div class="pac-anchor${isEmpty ? ' pac-anchor--empty' : ''}">
            ${isEmpty ? '(sem texto — link de imagem)' : escXml(anchor)}
          </div>
          <div class="pac-meta">
            <span class="pac-type-badge ptb--${typeKey}">
              ${meta.icon} ${meta.label}
            </span>
            <span class="pac-follow-badge pac-follow-badge--${nofollow ? 'nofollow' : 'follow'}">
              ${nofollow ? '⛔ nofollow' : '✓ dofollow'}
            </span>
            <span class="pac-count">${count}×</span>
          </div>
          <div class="pac-what-is">${WHAT_IS[typeKey] || ''}</div>
          ${TIPS[typeKey] ? `<div class="pac-tip">${TIPS[typeKey]}</div>` : ''}
        `;
        body.appendChild(card);
      });
    }

    panel.classList.add('open');
  }
}

function escXml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Grafo D3 de links internos ────────────────────────────────────────────────

function initViewToggle(linkNodes, pageUrl) {
  const btnCups  = document.getElementById('btn-view-cups');
  const btnGraph = document.getElementById('btn-view-graph');
  const cupsArea = document.getElementById('lf-canvas-area');
  const graphArea = document.getElementById('lf-graph-area');
  const graphControls = document.getElementById('lf-graph-controls');
  const titleEl = document.getElementById('lf-title-text');
  const infoBar = document.querySelector('.lf-info-bar');

  let graphBuilt = false;

  btnCups.addEventListener('click', () => {
    btnCups.classList.add('lf-toggle-btn--active');
    btnGraph.classList.remove('lf-toggle-btn--active');
    cupsArea.style.display = '';
    graphArea.style.display = 'none';
    graphControls.style.display = 'none';
    titleEl.textContent = 'Distribuição de Link Juice — Copos de Autoridade';
    if (infoBar) infoBar.textContent = 'Clique em qualquer copo para ver as âncoras em detalhe · Scroll para navegar';
  });

  btnGraph.addEventListener('click', () => {
    btnGraph.classList.add('lf-toggle-btn--active');
    btnCups.classList.remove('lf-toggle-btn--active');
    cupsArea.style.display = 'none';
    graphArea.style.display = '';
    graphControls.style.display = 'flex';
    titleEl.textContent = 'Grafo de Links Internos';
    if (infoBar) infoBar.textContent = 'Arraste nós para reorganizar · Scroll para zoom · Clique para detalhes';

    if (!graphBuilt) {
      graphBuilt = true;
      renderD3LinksGraph(linkNodes, pageUrl);
    }
  });
}

function renderD3LinksGraph(linkNodes, pageUrl) {
  if (typeof d3 === 'undefined') {
    document.getElementById('lf-graph-canvas').innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#636882;font-size:13px">D3 não carregado</div>';
    return;
  }

  const canvas = document.getElementById('lf-graph-canvas');
  const tooltip = document.getElementById('lf-graph-tooltip');
  const W = canvas.offsetWidth || window.innerWidth - 280;
  const H = canvas.offsetHeight || window.innerHeight - 56;

  // ── Montar grafo: nó por URL ──────────────────────────────────
  const ANCHOR_COLORS = {
    phrase:   '#34d399',
    exact:    '#6ee7b7',
    branded:  '#a78bfa',
    ruim:     '#f87171',
    nofollow: '#636882',
    image:    '#636882',
  };

  const nodeMap = new Map(); // href → { id, href, label, count, anchors, bestColor }
  const edgeList = [];

  // Nó da página atual
  let sourceLabel = pageUrl;
  try { sourceLabel = new URL(pageUrl).pathname || '/'; } catch {}
  nodeMap.set('__source__', { id: '__source__', href: pageUrl, label: sourceLabel, count: 999, anchors: [], bestColor: '#7c74ff', isSource: true });

  linkNodes.filter(l => l.isInternal && l.href && l.href !== pageUrl && l.href !== '/').forEach(l => {
    const href = l.href;
    if (!nodeMap.has(href)) {
      let label = href;
      try { label = new URL(href.startsWith('http') ? href : 'http://x' + href).pathname; } catch {}
      label = label.replace(/\/index\.html?$/, '').replace(/\/$/, '').split('/').pop() || href;
      nodeMap.set(href, { id: href, href, label, count: 0, anchors: [], bestColor: '#a78bfa' });
    }
    const n = nodeMap.get(href);
    n.count++;
    const meta = classifyAnchor(l.anchor, l.nofollow);
    if (!n.anchors.includes(l.anchor)) n.anchors.push(l.anchor);
    // Cor pelo melhor tipo de âncora recebida
    const priority = { phrase: 5, exact: 4, branded: 3, image: 2, ruim: 1, nofollow: 0 };
    const existingPri = priority[Object.entries(ANCHOR_COLORS).find(([,c]) => c === n.bestColor)?.[0]] ?? -1;
    const newKey = Object.keys(TYPE_META).find(k => TYPE_META[k] === meta) || 'branded';
    if ((priority[newKey] ?? 0) > existingPri) n.bestColor = ANCHOR_COLORS[newKey] || '#a78bfa';

    edgeList.push({ source: '__source__', target: href, anchor: l.anchor || '', meta, nofollow: l.nofollow });
  });

  const nodes = Array.from(nodeMap.values());
  // Deduplica arestas por source+target+anchor
  const seenEdge = new Set();
  const edges = edgeList.filter(e => {
    const k = e.source + '||' + e.target + '||' + e.anchor;
    if (seenEdge.has(k)) return false;
    seenEdge.add(k);
    return true;
  });

  if (nodes.length <= 1) {
    canvas.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#636882;font-size:13px">Nenhum link interno encontrado</div>';
    return;
  }

  canvas.innerHTML = '';
  const svg = d3.select('#lf-graph-canvas')
    .append('svg')
    .attr('width', W)
    .attr('height', H);

  // Marker de seta
  svg.append('defs').append('marker')
    .attr('id', 'lf-arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 22)
    .attr('refY', 0)
    .attr('markerWidth', 5)
    .attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#2d3748');

  const g = svg.append('g');

  const zoom = d3.zoom()
    .scaleExtent([0.15, 5])
    .on('zoom', (e) => g.attr('transform', e.transform));
  svg.call(zoom);

  let strokeW = 2;

  const link = g.append('g')
    .selectAll('line')
    .data(edges)
    .join('line')
    .attr('stroke', d => d.nofollow ? '#4b5563' : (d.meta?.color || '#3b82f6'))
    .attr('stroke-width', strokeW)
    .attr('stroke-opacity', 0.6)
    .attr('stroke-dasharray', d => d.nofollow ? '4 3' : null)
    .attr('marker-end', 'url(#lf-arrow)');

  const node = g.append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('cursor', 'grab');

  node.append('circle')
    .attr('r', d => d.isSource ? 18 : Math.max(7, Math.min(16, 7 + d.count * 1.5)))
    .attr('fill', d => d.bestColor)
    .attr('fill-opacity', 0.85)
    .attr('stroke', d => d.bestColor)
    .attr('stroke-width', 1.5)
    .attr('stroke-opacity', 0.4);

  node.append('text')
    .attr('y', d => (d.isSource ? 18 : Math.max(7, Math.min(16, 7 + d.count * 1.5))) + 12)
    .attr('text-anchor', 'middle')
    .attr('font-size', 10)
    .attr('fill', '#94a3b8')
    .attr('pointer-events', 'none')
    .text(d => d.label.length > 18 ? d.label.slice(0, 17) + '…' : d.label);

  // Tooltip
  node.on('mouseenter', (event, d) => {
    const anchorsPreview = d.anchors.slice(0, 3).map(a => `<div class="lgt-anchor">"${escXml(a || '(sem texto)')}"</div>`).join('');
    tooltip.innerHTML = `
      <div class="lgt-url">${escXml(d.href)}</div>
      <div class="lgt-count">${d.isSource ? 'Página atual' : `${d.count} link${d.count !== 1 ? 's' : ''} recebido${d.count !== 1 ? 's' : ''}`}</div>
      ${anchorsPreview ? `<div class="lgt-anchors">${anchorsPreview}</div>` : ''}
    `;
    tooltip.classList.add('visible');
  });
  node.on('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    tooltip.style.left = (event.clientX - rect.left + 14) + 'px';
    tooltip.style.top  = (event.clientY - rect.top  - 10) + 'px';
  });
  node.on('mouseleave', () => tooltip.classList.remove('visible'));

  // Drag
  let paused = false;
  node.call(d3.drag()
    .on('start', (event, d) => {
      if (!paused) simulation.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
    })
    .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
    .on('end', (event, d) => {
      if (!paused) simulation.alphaTarget(0);
      if (!paused) { d.fx = null; d.fy = null; }
    })
  );

  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges).id(d => d.id).distance(120))
    .force('charge', d3.forceManyBody().strength(-250))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide(d => d.isSource ? 30 : 20))
    .on('tick', () => {
      link
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

  // ── Controles ─────────────────────────────────────────────────
  const pauseBtn = document.getElementById('lf-pause-btn');
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    if (paused) {
      simulation.stop();
      nodes.forEach(d => { d.fx = d.x; d.fy = d.y; });
      pauseBtn.classList.add('active');
      pauseBtn.title = 'Retomar simulação';
      pauseBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    } else {
      nodes.forEach(d => { d.fx = null; d.fy = null; });
      simulation.alphaTarget(0.3).restart();
      setTimeout(() => simulation.alphaTarget(0), 1500);
      pauseBtn.classList.remove('active');
      pauseBtn.title = 'Pausar simulação';
      pauseBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    }
  });

  document.getElementById('lf-reset-btn').addEventListener('click', () => {
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
  });

  const slidersPanel = document.getElementById('lf-sliders-panel');
  const slidersBtn   = document.getElementById('lf-sliders-toggle');
  slidersBtn.addEventListener('click', () => {
    const open = slidersPanel.classList.contains('visible');
    slidersPanel.classList.toggle('visible', !open);
    slidersBtn.classList.toggle('active', !open);
  });

  function applySliders() {
    const dist   = +document.getElementById('lfs-dist').value;
    const stroke = +document.getElementById('lfs-stroke').value;
    const nodeR  = +document.getElementById('lfs-node').value;
    const charge = +document.getElementById('lfs-charge').value;
    const font   = +document.getElementById('lfs-font').value;

    document.getElementById('lfs-dist-val').textContent   = dist;
    document.getElementById('lfs-stroke-val').textContent = stroke;
    document.getElementById('lfs-node-val').textContent   = nodeR;
    document.getElementById('lfs-charge-val').textContent = charge;
    document.getElementById('lfs-font-val').textContent   = font;

    simulation.force('link').distance(dist);
    simulation.force('charge').strength(charge);
    simulation.alphaTarget(0.2).restart();
    setTimeout(() => simulation.alphaTarget(0), 800);

    link.attr('stroke-width', stroke);
    node.select('circle').attr('r', d => d.isSource ? nodeR * 1.5 : nodeR);
    node.select('text').attr('font-size', font).attr('y', d => (d.isSource ? nodeR * 1.5 : nodeR) + font + 2);
  }

  ['lfs-dist','lfs-stroke','lfs-node','lfs-charge','lfs-font'].forEach(id => {
    document.getElementById(id).addEventListener('input', applySliders);
  });
}

function sendToAI(ai, linkNodes, pageUrl) {
  const internal = linkNodes.filter(l => l.isInternal);
  const RUIM = new Set(['clique aqui','aqui','saiba mais','leia mais','ver mais','acesse','more','here']);
  const destMap = new Map();
  internal.forEach(l => {
    let p = l.href;
    try { p = new URL(l.href.startsWith('http') ? l.href : 'http://x' + l.href).pathname; } catch {}
    if (!destMap.has(p)) destMap.set(p, []);
    destMap.get(p).push(l);
  });

  const lines = [...destMap.entries()].map(([path, ls]) => {
    const anchors = [...new Set(ls.map(l => l.anchor || '(sem texto)'))];
    const nf = ls.some(l => l.nofollow) ? ' [nofollow]' : '';
    return `- ${path}${nf}\n  Âncoras: ${anchors.map(a => `"${a}"`).join(', ')}`;
  }).join('\n');

  const prompt = `Você é especialista em SEO e linkagem interna. Analise os links internos desta página.\n\n**URL:** ${pageUrl}\n**Total interno:** ${internal.length}\n\n## Destinos e âncoras\n${lines}\n\n## Análise pedida:\n1. Identifique âncoras genéricas (clique aqui, saiba mais) e sugira textos descritivos com keywords\n2. Aponte páginas estratégicas que recebem poucos links ou âncoras ruins\n3. Links nofollow internos desnecessários\n4. Sugira as 3 melhores âncoras para cada destino importante\n\nSeja específico: mostre âncora atual → âncora ideal.`;

  const encoded = encodeURIComponent(prompt);
  const urls = {
    claude:     `https://claude.ai/new?q=${encoded}`,
    chatgpt:    `https://chatgpt.com/?q=${encoded}`,
    gemini:     `https://gemini.google.com/app?q=${encoded}`,
    perplexity: `https://www.perplexity.ai/?q=${encoded}`,
  };
  if (urls[ai]) window.open(urls[ai], '_blank');
}
