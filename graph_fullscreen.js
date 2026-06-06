// Renderizar grafo em tela cheia
(async () => {
  try {
    const stored = await chrome.storage.local.get('seo_graph_fullscreen');
    if (!stored.seo_graph_fullscreen) {
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#e2e8f0">Nenhum dado para visualizar</div>';
      return;
    }

    const data = stored.seo_graph_fullscreen;
    // raw pode vir como objeto JS ou string JSON — normaliza para objeto
    const schemas = (data.schemas || [])
      .map(s => ({
        ...s,
        raw: typeof s.raw === 'string' ? (() => { try { return JSON.parse(s.raw); } catch(_) { return null; } })() : s.raw
      }))
      .filter(s => s.raw);

    if (schemas.length === 0) {
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#e2e8f0">Nenhum schema para visualizar</div>';
      return;
    }

    renderFullscreenGraph(schemas);
  } catch (err) {
    console.error('Error loading fullscreen graph:', err);
  }
})();

function renderFullscreenGraph(schemas) {
  const canvas = document.getElementById('graph-fullscreen-canvas');
  const infoEl = document.getElementById('graph-fullscreen-info');

  const MAX_NODES = 1200;
  const MAX_LINKS = 2500;

  const nodes = new Map();
  const links = [];
  const idToNodeId = new Map();
  const unresolvedLinks = [];
  let _nc = 0;

  function makeNodeId(obj) {
    const atId = obj && obj['@id'];
    if (atId && typeof atId === 'string' && atId.trim()) return 'id::' + atId.trim();
    return 'n::' + (_nc++);
  }

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
    const keys = Object.keys(obj);
    if (keys.length === 1 && keys[0] === '@id') {
      if (atId && parentId) unresolvedLinks.push({ sourceId: parentId, targetAtId: atId.trim(), label: edgeLabel });
      return;
    }

    const nodeId = makeNodeId(obj);

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

    const TOOLTIP_PROPS = ['name','url','description','telephone','email','addressLocality','streetAddress','ratingValue','addressRegion','postalCode'];
    TOOLTIP_PROPS.forEach(p => {
      if (obj[p] && typeof obj[p] === 'string') node.props[p] = truncate(obj[p], 70);
    });

    nodes.set(nodeId, node);
    if (atId) idToNodeId.set(atId.trim(), nodeId);
    if (parentId) links.push({ sourceId: parentId, targetId: nodeId, label: edgeLabel });

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

  function createScriptRoot(index, scriptObj) {
    const types = scriptObj['@graph']
      ? [...new Set(scriptObj['@graph'].map(n => n['@type']).filter(Boolean).flat())]
      : (scriptObj['@type'] ? [].concat(scriptObj['@type']) : []);
    const label = types.slice(0,2).join(' + ') || `Script ${index + 1}`;
    const rootId = `script-root-${index}`;
    nodes.set(rootId, {
      id: rootId, type: types[0] || null,
      label: truncate(label, 40), fullType: types, atId: null,
      depth: -1, radius: 16, color: '#4b5563', props: {}, isRoot: true,
    });
    return rootId;
  }

  function processJsonLd(obj, scriptIndex) {
    if (Array.isArray(obj)) { obj.forEach((i, idx) => processJsonLd(i, idx)); return; }
    if (!obj || typeof obj !== 'object') return;
    const rootId = createScriptRoot(scriptIndex, obj);
    if (obj['@graph']) { obj['@graph'].forEach(i => collectNodes(i, rootId, '@graph', 0)); }
    else { collectNodes(obj, rootId, 'schema', 0); }
  }

  schemas.forEach((s, i) => processJsonLd(typeof s.raw === 'string' ? JSON.parse(s.raw) : s.raw, i));

  unresolvedLinks.forEach(ul => {
    const targetId = idToNodeId.get(ul.targetAtId);
    if (targetId && links.length < MAX_LINKS) links.push({ sourceId: ul.sourceId, targetId, label: ul.label });
  });

  links.forEach(l => {
    if (l.targetAtId) {
      const t = idToNodeId.get(l.targetAtId);
      if (t) { l.targetId = t; delete l.targetAtId; }
    }
  });

  const validLinks = links.filter(l => l.sourceId && l.targetId)
    .map(l => ({ source: l.sourceId, target: l.targetId, label: l.label }));
  const nodesArray = Array.from(nodes.values());

  const typeCounts = {};
  nodesArray.forEach(n => { if (n.type) typeCounts[n.type] = (typeCounts[n.type] || 0) + 1; });
  const topTypes = Object.entries(typeCounts).sort((a,b) => b[1]-a[1]).slice(0,3).map(([t,c]) => `${t}(${c})`).join(' · ');
  infoEl.textContent = `${nodesArray.length} nós · ${validLinks.length} conexões · ${topTypes}`;

  if (nodesArray.length === 0) {
    canvas.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#94a3b8">Nenhum schema para visualizar</div>';
    return;
  }

  const W = window.innerWidth;
  const H = window.innerHeight - 56;

  canvas.innerHTML = '';
  const svg = d3.select('#graph-fullscreen-canvas')
    .append('svg')
    .attr('width', W)
    .attr('height', H);

  svg.append('defs').append('marker')
    .attr('id', 'arrow-fullscreen')
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
    .data(validLinks)
    .join('line')
    .attr('stroke', '#2d3748')
    .attr('stroke-width', 1.5)
    .attr('marker-end', 'url(#arrow-fullscreen)');

  const linkLabel = g.append('g')
    .selectAll('text')
    .data(validLinks.filter(l => l.label && l.label !== '@graph' && l.label !== 'schema'))
    .join('text')
    .attr('font-size', 9)
    .attr('fill', '#475569')
    .attr('text-anchor', 'middle')
    .attr('pointer-events', 'none')
    .text(d => truncate(d.label, 16));

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

  const tooltip = document.getElementById('graph-fullscreen-tooltip');

  function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  node.on('mouseenter', (event, d) => {
    const lines = [];
    if (d.fullType) {
      const t = Array.isArray(d.fullType) ? d.fullType.join(', ') : d.fullType;
      lines.push(`<div class="graph-fullscreen-tooltip-type">${t}</div>`);
    }
    if (d.atId) lines.push(`<div class="graph-fullscreen-tooltip-id">${d.atId}</div>`);
    Object.entries(d.props).forEach(([k, v]) => {
      lines.push(`<div class="graph-fullscreen-tooltip-prop"><span>${k}:</span> ${escHtml(v)}</div>`);
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

  const chargeStrength = Math.max(-800, -300 - nodesArray.length * 25);
  const linkDist = Math.max(100, Math.min(220, W / Math.max(nodesArray.length, 5)));

  const simulation = d3.forceSimulation(nodesArray)
    .force('link', d3.forceLink(validLinks)
      .id(d => d.id)
      .distance(d => {
        const src = d.source && typeof d.source === 'object' ? d.source : {};
        return src.isRoot ? linkDist * 1.5 : linkDist;
      })
    )
    .force('charge', d3.forceManyBody().strength(chargeStrength))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide(d => d.radius + 22))
    .force('x', d3.forceX(W / 2).strength(0.03))
    .force('y', d3.forceY(H / 2).strength(0.03))
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

  const pauseBtn = document.getElementById('graph-fullscreen-pause');
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

  document.getElementById('graph-fullscreen-reset').addEventListener('click', () => {
    svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
  });

  const slidersPanel = document.getElementById('graph-fullscreen-sliders');
  const slidersBtn = document.getElementById('graph-fullscreen-sliders-toggle');
  if (slidersBtn && slidersPanel) {
    slidersBtn.addEventListener('click', () => {
      const open = slidersPanel.classList.contains('visible');
      slidersPanel.classList.toggle('visible', !open);
      slidersBtn.classList.toggle('active', !open);
    });
  }

  function applySliders() {
    const linkDist = +document.getElementById('fsl-link-dist').value;
    const nodeSize = +document.getElementById('fsl-node-size').value;
    const charge = +document.getElementById('fsl-charge').value;
    const fontSize = +document.getElementById('fsl-font').value;
    const maxDepth = +document.getElementById('fsl-depth').value;

    document.getElementById('fsl-link-dist-val').textContent = linkDist;
    document.getElementById('fsl-node-size-val').textContent = nodeSize;
    document.getElementById('fsl-charge-val').textContent = charge;
    document.getElementById('fsl-font-val').textContent = fontSize;
    document.getElementById('fsl-depth-val').textContent = maxDepth;

    simulation.force('link').distance(linkDist);
    simulation.force('charge').strength(charge);

    node.each(function(d) {
      const visible = d.depth === 0 || d.depth <= maxDepth;
      d3.select(this).style('display', visible ? null : 'none');
      d3.select(this).select('circle').attr('r', d.radius * (nodeSize / 10));
    });

    linkLabel.attr('font-size', fontSize);
  }

  ['fsl-link-dist', 'fsl-node-size', 'fsl-charge', 'fsl-font', 'fsl-depth'].forEach(id => {
    document.getElementById(id).addEventListener('input', applySliders);
  });
}