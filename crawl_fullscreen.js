// SEO Analyzer — Site Crawler Fullscreen
// Crawl BFS multi-nível via fetch silencioso + comparação com sitemap.xml

// ── Estado global ─────────────────────────────────────────────────────────────
let visited    = new Map();   // pathname → { depth, links[], inLinks, parentUrl }
let sitemapUrls = new Set();  // pathnames do sitemap.xml
let crawlStopped = false;
let simulation = null;

// ── Classificação de âncoras (idêntica ao links_fullscreen.js) ────────────────
const RUIM_SET = new Set([
  'clique aqui','clique','aqui','saiba mais','leia mais','veja mais','ver mais',
  'acesse','acesse aqui','link','more','click here','read more','here',
  'ver','veja','mais','continue','continuar','download','baixar','abrir','open',
]);

const ANCHOR_COLORS = {
  phrase:   '#34d399',
  exact:    '#6ee7b7',
  branded:  '#a78bfa',
  ruim:     '#f87171',
  nofollow: '#636882',
  image:    '#636882',
};

function classifyAnchorType(text, nofollow) {
  const t = (text || '').trim();
  const tl = t.toLowerCase();
  if (nofollow)                                                             return 'nofollow';
  if (!t)                                                                   return 'image';
  if (RUIM_SET.has(tl) || /^[\d\s\W]+$/.test(t) || t.length <= 2)        return 'ruim';
  if (/^[A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ][a-záéíóúãõâêîôûç]+$/.test(t) && !t.includes(' ')) return 'branded';
  if (t.split(/\s+/).length >= 4)                                          return 'phrase';
  if (t.split(/\s+/).length >= 2)                                          return 'exact';
  return 'branded';
}

// ── Fetch: extrai links de uma URL via HTML estático ─────────────────────────
async function fetchAndExtractLinks(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res || !res.ok) return [];
    const html = await res.text();
    const doc  = new DOMParser().parseFromString(html, 'text/html');
    const origin = new URL(url).origin;
    const results = [];
    doc.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
      try {
        const resolved = new URL(href, url);
        if (resolved.origin !== origin) return;
        const pathname = resolved.pathname + (resolved.search || '');
        const anchor = (a.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 200);
        const rel = a.getAttribute('rel') || '';
        results.push({
          href: pathname,
          anchor,
          nofollow: rel.includes('nofollow'),
        });
      } catch {}
    });
    return results;
  } catch {
    return [];
  }
}

// ── Fetch: sitemap.xml ────────────────────────────────────────────────────────
async function fetchSitemap(origin) {
  try {
    const res = await fetch(`${origin}/sitemap.xml`, { cache: 'no-store' });
    if (!res || !res.ok) return new Set();
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const locs = [...doc.querySelectorAll('loc')].map(loc => {
      try { return new URL(loc.textContent.trim()).pathname; } catch { return null; }
    }).filter(Boolean);
    updateSitemapInfo(locs.length);
    return new Set(locs);
  } catch {
    return new Set();
  }
}

// ── BFS Crawler ───────────────────────────────────────────────────────────────
async function startCrawl(startUrl, maxDepth, maxPages) {
  visited.clear();
  sitemapUrls.clear();
  crawlStopped = false;

  const origin = new URL(startUrl).origin;
  const startPath = new URL(startUrl).pathname;

  // Busca sitemap em paralelo com o crawl
  const sitemapPromise = fetchSitemap(origin);

  const queue = [{ url: startUrl, path: startPath, depth: 0, parentPath: null }];
  const queued = new Set([startPath]);

  setProgress(0, 'Buscando sitemap e primeira página...');

  while (queue.length > 0 && visited.size < maxPages && !crawlStopped) {
    const { url, path, depth, parentPath } = queue.shift();

    if (visited.has(path)) continue;

    setProgress(
      Math.min((visited.size / maxPages) * 100, 95),
      `Crawlando: ${path} (${visited.size + 1} / ~${Math.min(queue.length + visited.size + 1, maxPages)})`
    );

    const links = await fetchAndExtractLinks(url);

    // Deduplica links por href
    const seen = new Set();
    const uniqueLinks = links.filter(l => {
      if (seen.has(l.href)) return false;
      seen.add(l.href);
      return true;
    });

    visited.set(path, { depth, links: uniqueLinks, parentPath, inLinks: 0 });

    if (depth < maxDepth) {
      uniqueLinks.forEach(l => {
        if (!queued.has(l.href) && !visited.has(l.href)) {
          queued.add(l.href);
          queue.push({ url: origin + l.href, path: l.href, depth: depth + 1, parentPath: path });
        }
      });
    }

    updateStats();
    // Atualiza grafo progressivamente a cada 5 páginas
    if (visited.size % 5 === 0) renderCrawlGraph(false);
  }

  sitemapUrls = await sitemapPromise;

  // Conta inLinks: quantas páginas apontam para cada destino
  visited.forEach(data => {
    data.links.forEach(l => {
      if (visited.has(l.href)) {
        visited.get(l.href).inLinks++;
      }
    });
  });

  setProgress(100, `Concluído — ${visited.size} páginas crawladas`);
  updateStats();
  renderCrawlGraph(true);
  onCrawlFinished();
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function setProgress(pct, text) {
  const fill = document.getElementById('cf-progress-fill');
  const label = document.getElementById('cf-progress-text');
  if (fill) fill.style.width = pct + '%';
  if (label) label.textContent = text;
}

function updateSitemapInfo(count) {
  const el = document.getElementById('cf-sitemap-info');
  if (el) el.innerHTML = count > 0
    ? `Sitemap encontrado com <strong style="color:#fbbf24">${count} URLs</strong>. Comparando com links encontrados no crawl.`
    : `Sitemap não encontrado em <code>/sitemap.xml</code>. Páginas órfãs não serão detectadas.`;
  const statSitemap = document.getElementById('stat-sitemap');
  if (statSitemap) statSitemap.textContent = count;
}

function updateStats() {
  const pages = visited.size;
  let totalLinks = 0;
  visited.forEach(d => { totalLinks += d.links.length; });

  const linkedPaths = new Set([...visited.values()].flatMap(d => d.links.map(l => l.href)));
  const orphans = [...sitemapUrls].filter(u => !linkedPaths.has(u) && !visited.has(u)).length;

  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('stat-pages', pages);
  el('stat-links', totalLinks);
  el('stat-orphans', orphans);
  if (sitemapUrls.size > 0) el('stat-sitemap', sitemapUrls.size);
}

function onCrawlFinished() {
  document.getElementById('cf-start-btn').disabled = false;
  document.getElementById('cf-start-btn').innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
    Recrawlar`;
  document.getElementById('cf-stop-btn').classList.remove('visible');
  document.getElementById('cf-pause-btn').style.display = '';
  document.getElementById('cf-reset-btn').style.display = '';
}

// ── Nó cor por tipo ───────────────────────────────────────────────────────────
function nodeColor(path, depth, isOrphan, inLinks) {
  if (depth === 0)          return '#7c74ff'; // origem
  if (isOrphan)             return '#f87171'; // órfã
  if (inLinks === 0)        return '#fbbf24'; // isolada (sem links recebidos)
  if (depth === 1)          return '#34d399'; // L1
  return '#6ee7b7';                           // L2+
}

function nodeTypeLabel(depth, isOrphan, inLinks) {
  if (depth === 0)   return 'Origem';
  if (isOrphan)      return 'Órfã';
  if (inLinks === 0) return 'Isolada';
  if (depth === 1)   return 'Nível 1';
  return `Nível ${depth}`;
}

// ── Grafo D3 ──────────────────────────────────────────────────────────────────
function renderCrawlGraph(final) {
  if (typeof d3 === 'undefined') return;
  if (visited.size === 0) return;

  // Conjunto de paths que recebem links
  const linkedPaths = new Set([...visited.values()].flatMap(d => d.links.map(l => l.href)));
  const orphanPaths = new Set([...sitemapUrls].filter(u => !linkedPaths.has(u) && !visited.has(u)));

  // ── Construir nós ──────────────────────────────────────────────
  const nodeMap = new Map(); // path → node obj

  // Páginas crawladas
  visited.forEach((data, path) => {
    const isOrphan = orphanPaths.has(path);
    const label = path.replace(/\/index\.html?$/, '').replace(/\/$/, '').split('/').pop() || '/';
    nodeMap.set(path, {
      id: path, path, label, depth: data.depth,
      isOrphan, inLinks: data.inLinks || 0,
      color: nodeColor(path, data.depth, isOrphan, data.inLinks || 0),
      anchors: [...new Set(data.links.flatMap(l => l.anchor ? [l.anchor] : []))].slice(0, 3),
    });
  });

  // Páginas órfãs do sitemap (não crawladas)
  orphanPaths.forEach(path => {
    if (!nodeMap.has(path)) {
      const label = path.replace(/\/index\.html?$/, '').replace(/\/$/, '').split('/').pop() || path;
      nodeMap.set(path, {
        id: path, path, label, depth: 99,
        isOrphan: true, inLinks: 0,
        color: '#f87171', anchors: [],
      });
    }
  });

  // ── Construir arestas ──────────────────────────────────────────
  const seenEdge = new Set();
  const edges = [];
  visited.forEach((data, srcPath) => {
    data.links.forEach(l => {
      if (!nodeMap.has(l.href)) return;
      const key = srcPath + '→' + l.href;
      if (seenEdge.has(key)) return;
      seenEdge.add(key);
      edges.push({
        source: srcPath,
        target: l.href,
        anchor: l.anchor,
        nofollow: l.nofollow,
        type: classifyAnchorType(l.anchor, l.nofollow),
      });
    });
  });

  const nodes = [...nodeMap.values()];
  const infoEl = document.getElementById('cf-info-nodes');
  if (infoEl) infoEl.textContent = `${nodes.length} nós · ${edges.length} arestas`;

  // ── Renderizar SVG ────────────────────────────────────────────
  const canvas = document.getElementById('cf-canvas');
  const W = canvas.offsetWidth || 800;
  const H = canvas.offsetHeight || 600;

  // Remove SVG anterior mas preserva simulação se não for final
  if (simulation) { simulation.stop(); simulation = null; }
  canvas.innerHTML = '';

  const svg = d3.select('#cf-canvas')
    .append('svg')
    .attr('width', W).attr('height', H);

  svg.append('defs').append('marker')
    .attr('id', 'cf-arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 20).attr('refY', 0)
    .attr('markerWidth', 5).attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#2d3748');

  const g = svg.append('g');

  const zoom = d3.zoom()
    .scaleExtent([0.1, 6])
    .on('zoom', e => g.attr('transform', e.transform));
  svg.call(zoom);

  const strokeW = +document.getElementById('cfs-stroke').value;
  const nodeR   = +document.getElementById('cfs-node').value;
  const fontSize = +document.getElementById('cfs-font').value;

  const link = g.append('g').selectAll('line').data(edges).join('line')
    .attr('stroke', d => ANCHOR_COLORS[d.type] || '#3b82f6')
    .attr('stroke-width', strokeW)
    .attr('stroke-opacity', 0.5)
    .attr('stroke-dasharray', d => d.nofollow ? '4 3' : null)
    .attr('marker-end', 'url(#cf-arrow)');

  const node = g.append('g').selectAll('g').data(nodes).join('g')
    .attr('cursor', 'grab');

  node.append('circle')
    .attr('r', d => d.depth === 0 ? nodeR * 2 : nodeR)
    .attr('fill', d => d.color)
    .attr('fill-opacity', 0.85)
    .attr('stroke', d => d.color)
    .attr('stroke-width', 1.5)
    .attr('stroke-opacity', 0.5);

  node.append('text')
    .attr('y', d => (d.depth === 0 ? nodeR * 2 : nodeR) + fontSize + 2)
    .attr('text-anchor', 'middle')
    .attr('font-size', fontSize)
    .attr('fill', '#94a3b8')
    .attr('pointer-events', 'none')
    .text(d => d.label.length > 20 ? d.label.slice(0, 19) + '…' : d.label);

  // Tooltip
  const tooltip = document.getElementById('cf-tooltip');
  node.on('mouseenter', (event, d) => {
    const typeLabel = nodeTypeLabel(d.depth, d.isOrphan, d.inLinks);
    const anchorsHtml = d.anchors.slice(0, 3).map(a =>
      `<div class="cft-anchor">"${escHtml(a)}"</div>`).join('');
    tooltip.innerHTML = `
      <div class="cft-type" style="color:${d.color}">${typeLabel}</div>
      <div class="cft-url">${escHtml(d.path)}</div>
      <div class="cft-depth">Profundidade: ${d.depth === 99 ? 'órfã' : d.depth} · Links recebidos: ${d.inLinks}</div>
      ${anchorsHtml ? `<div class="cft-anchors">${anchorsHtml}</div>` : ''}
    `;
    tooltip.classList.add('visible');
  });
  node.on('mousemove', event => {
    const rect = canvas.getBoundingClientRect();
    tooltip.style.left = (event.clientX - rect.left + 14) + 'px';
    tooltip.style.top  = (event.clientY - rect.top  - 10) + 'px';
  });
  node.on('mouseleave', () => tooltip.classList.remove('visible'));

  // Drag
  let paused = false;
  const pauseBtn = document.getElementById('cf-pause-btn');

  node.call(d3.drag()
    .on('start', (event, d) => {
      if (!paused && simulation) simulation.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
    })
    .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
    .on('end', (event, d) => {
      if (!paused && simulation) simulation.alphaTarget(0);
      if (!paused) { d.fx = null; d.fy = null; }
    })
  );

  const dist = +document.getElementById('cfs-dist').value;
  const charge = +document.getElementById('cfs-charge').value;

  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges).id(d => d.id).distance(dist))
    .force('charge', d3.forceManyBody().strength(charge))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide(d => d.depth === 0 ? nodeR * 3 : nodeR + 8))
    .on('tick', () => {
      link
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

  // Pause/resume
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
      setTimeout(() => { if (simulation) simulation.alphaTarget(0); }, 1500);
      pauseBtn.classList.remove('active');
      pauseBtn.title = 'Pausar simulação';
      pauseBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    }
  }, { once: false });

  document.getElementById('cf-reset-btn').addEventListener('click', () => {
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
  }, { once: false });

  // Sliders
  function applySliders() {
    const dist   = +document.getElementById('cfs-dist').value;
    const stroke = +document.getElementById('cfs-stroke').value;
    const nR     = +document.getElementById('cfs-node').value;
    const charge = +document.getElementById('cfs-charge').value;
    const font   = +document.getElementById('cfs-font').value;

    document.getElementById('cfs-dist-val').textContent   = dist;
    document.getElementById('cfs-stroke-val').textContent = stroke;
    document.getElementById('cfs-node-val').textContent   = nR;
    document.getElementById('cfs-charge-val').textContent = charge;
    document.getElementById('cfs-font-val').textContent   = font;

    if (simulation) {
      simulation.force('link').distance(dist);
      simulation.force('charge').strength(charge);
      simulation.alphaTarget(0.2).restart();
      setTimeout(() => { if (simulation) simulation.alphaTarget(0); }, 600);
    }

    link.attr('stroke-width', stroke);
    node.select('circle').attr('r', d => d.depth === 0 ? nR * 2 : nR);
    node.select('text').attr('font-size', font)
      .attr('y', d => (d.depth === 0 ? nR * 2 : nR) + font + 2);
  }

  ['cfs-dist','cfs-stroke','cfs-node','cfs-charge','cfs-font'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.removeEventListener('input', el._handler);
    el._handler = applySliders;
    el.addEventListener('input', applySliders);
  });
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Entry point ───────────────────────────────────────────────────────────────
(async () => {
  const stored = await chrome.storage.local.get('seo_crawl_start');
  const data   = stored.seo_crawl_start;

  const startUrlEl = document.getElementById('cf-start-url');
  if (data && data.startUrl) {
    startUrlEl.textContent = data.startUrl;
  } else {
    startUrlEl.textContent = 'Nenhuma URL — abra a extensão na página do site e clique em "Ver mapa do site"';
  }

  // Profundidade slider
  const depthSlider = document.getElementById('cf-depth-slider');
  const depthVal    = document.getElementById('cf-depth-val');
  depthSlider.addEventListener('input', () => { depthVal.textContent = depthSlider.value; });

  // Sliders init values
  ['cfs-dist','cfs-stroke','cfs-node','cfs-charge','cfs-font'].forEach(id => {
    const el  = document.getElementById(id);
    const val = document.getElementById(id + '-val');
    if (el && val) val.textContent = el.value;
  });

  // Sliders toggle
  const slidersPanel = document.getElementById('cf-sliders');
  const slidersBtn   = document.getElementById('cf-sliders-toggle');
  slidersBtn.addEventListener('click', () => {
    const open = slidersPanel.classList.contains('visible');
    slidersPanel.classList.toggle('visible', !open);
    slidersBtn.classList.toggle('active', !open);
  });

  // Start button
  document.getElementById('cf-start-btn').addEventListener('click', async () => {
    if (!data || !data.startUrl) {
      alert('Nenhuma URL de início. Abra a extensão em uma página do site e clique em "Ver mapa do site".');
      return;
    }
    const maxDepth = +document.getElementById('cf-depth-slider').value;
    const maxPages = +document.getElementById('cf-limit-select').value;

    // Reset UI
    visited.clear();
    sitemapUrls.clear();
    crawlStopped = false;
    document.getElementById('cf-start-btn').disabled = true;
    document.getElementById('cf-start-btn').innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Crawlando...`;
    document.getElementById('cf-stop-btn').classList.add('visible');
    document.getElementById('cf-progress-wrap').classList.add('visible');
    document.getElementById('cf-pause-btn').style.display = 'none';
    document.getElementById('cf-reset-btn').style.display = 'none';
    document.getElementById('stat-pages').textContent    = '0';
    document.getElementById('stat-links').textContent    = '0';
    document.getElementById('stat-orphans').textContent  = '0';
    document.getElementById('stat-sitemap').textContent  = '—';

    await startCrawl(data.startUrl, maxDepth, maxPages);
  });

  // Stop button
  document.getElementById('cf-stop-btn').addEventListener('click', () => {
    crawlStopped = true;
    document.getElementById('cf-stop-btn').classList.remove('visible');
    setProgress(100, 'Crawl interrompido pelo usuário');
    updateStats();
    renderCrawlGraph(true);
    onCrawlFinished();
  });
})();
