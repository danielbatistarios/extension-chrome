// ── Data ────────────────────────────────────────────────────────────────────

let allItems = [];
let treeData = null;

// ── Build Tree ───────────────────────────────────────────────────────────────

function buildTree(items) {
  if (!items.length) return null;

  const query = items[0].query || 'Busca';

  const root = {
    id: '__root__',
    label: query,
    level: 0,
    answer: '',
    sourceUrl: '',
    children: [],
    collapsed: false,
  };

  const sorted = [...items].sort((a, b) => (a.level || 1) - (b.level || 1));

  const nodeMap = new Map();
  nodeMap.set('__root__', root);

  sorted.forEach((item, idx) => {
    const node = {
      id: 'n' + idx,
      label: item.question,
      level: item.level || 1,
      answer: item.answer || '',
      sourceUrl: item.sourceUrl || '',
      parentQuestion: item.parentQuestion || '',
      children: [],
      collapsed: false,
    };
    nodeMap.set(item.question, node);
  });

  nodeMap.forEach((node, key) => {
    if (key === '__root__') return;

    let parent = null;
    if (node.parentQuestion && nodeMap.has(node.parentQuestion)) {
      parent = nodeMap.get(node.parentQuestion);
    }

    if (!parent) {
      if (node.level <= 1) {
        parent = root;
      } else {
        const candidates = [...nodeMap.values()].filter(n => n.level === node.level - 1 && n !== root);
        parent = candidates[candidates.length - 1] || root;
      }
    }

    parent.children.push(node);
  });

  return root;
}

// ── Layout ───────────────────────────────────────────────────────────────────

const NODE_H = 36;
const LEVEL_W = 280;
const ROOT_X = 80;
const LABEL_MAX = 36;

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function layout(node, x, yStart) {
  const visibleChildren = node.collapsed ? [] : node.children;

  if (!visibleChildren.length) {
    node.x = x;
    node.y = yStart + NODE_H / 2;
    node._height = NODE_H;
    return;
  }

  let cy = yStart;
  visibleChildren.forEach(child => {
    layout(child, x + LEVEL_W, cy);
    cy += child._height;
  });

  const firstY = visibleChildren[0].y;
  const lastY = visibleChildren[visibleChildren.length - 1].y;
  node.x = x;
  node.y = (firstY + lastY) / 2;
  node._height = cy - yStart;
}

// ── SVG Renderer ─────────────────────────────────────────────────────────────

const svg = document.getElementById('tree-svg');
const g = document.getElementById('tree-root-g');
const tooltip = document.getElementById('tooltip');

let vpX = 0, vpY = 0, vpScale = 1;
let isDragging = false, dragStartX, dragStartY, dragVpX, dragVpY;

function applyTransform() {
  g.setAttribute('transform', `translate(${vpX},${vpY}) scale(${vpScale})`);
}

function fitView() {
  const svgRect = svg.getBoundingClientRect();
  if (!treeData) return;

  const xs = [], ys = [];
  function collect(n) {
    xs.push(n.x); ys.push(n.y);
    if (!n.collapsed) n.children.forEach(collect);
  }
  collect(treeData);

  if (!xs.length) return;

  const minX = Math.min(...xs) - 20;
  const maxX = Math.max(...xs) + LEVEL_W;
  const minY = Math.min(...ys) - 30;
  const maxY = Math.max(...ys) + 30;

  const contentW = maxX - minX;
  const contentH = maxY - minY;

  const scaleX = svgRect.width / contentW;
  const scaleY = svgRect.height / contentH;
  vpScale = Math.min(scaleX, scaleY, 1.2) * 0.92;

  vpX = (svgRect.width - contentW * vpScale) / 2 - minX * vpScale;
  vpY = (svgRect.height - contentH * vpScale) / 2 - minY * vpScale;

  applyTransform();
}

const LEVEL_COLORS = ['#7c3aed', '#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
function levelColor(lv) { return LEVEL_COLORS[Math.min(lv, LEVEL_COLORS.length - 1)]; }

function render() {
  g.innerHTML = '';
  if (!treeData) return;

  layout(treeData, ROOT_X, 20);

  function drawLinks(node) {
    if (node.collapsed) return;
    node.children.forEach(child => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const mx = (node.x + 20 + child.x - 20) / 2;
      path.setAttribute('d',
        `M${node.x + 20},${node.y} C${mx},${node.y} ${mx},${child.y} ${child.x - 20},${child.y}`
      );
      path.setAttribute('class', 'link');
      path.setAttribute('stroke', levelColor(child.level));
      g.appendChild(path);
      drawLinks(child);
    });
  }

  function drawNode(node) {
    const grp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    grp.setAttribute('transform', `translate(${node.x},${node.y})`);
    grp.style.cursor = 'default';

    const r = node.level === 0 ? 10 : 7;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', r);
    circle.setAttribute('cx', 0);
    circle.setAttribute('cy', 0);
    circle.setAttribute('fill', levelColor(node.level));
    circle.setAttribute('class', 'node-circle');
    grp.appendChild(circle);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', r + 8);
    text.setAttribute('y', 0);
    text.setAttribute('class', `node-label ${node.level === 0 ? 'root-label' : 'level' + node.level}`);
    text.textContent = truncate(node.label, node.level === 0 ? 28 : LABEL_MAX);
    grp.appendChild(text);

    if (node.children.length > 0) {
      const tg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      tg.setAttribute('transform', `translate(${r + 6 + 8 + Math.min(node.label.length, LABEL_MAX) * 6.8}, 0)`);
      tg.style.cursor = 'pointer';

      const tc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      tc.setAttribute('r', 8);
      tc.setAttribute('fill', '#27272a');
      tc.setAttribute('class', 'toggle-circle');
      tg.appendChild(tc);

      const tt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      tt.setAttribute('class', 'toggle-text');
      tt.textContent = node.collapsed ? '+' : '−';
      tt.setAttribute('y', 1);
      tg.appendChild(tt);

      tg.addEventListener('click', (e) => {
        e.stopPropagation();
        node.collapsed = !node.collapsed;
        render();
        fitView();
      });
      grp.appendChild(tg);
    }

    if (node.level > 0) {
      grp.addEventListener('mouseenter', (e) => showTooltip(node, e));
      grp.addEventListener('mouseleave', hideTooltip);
      grp.addEventListener('mousemove', (e) => moveTooltip(e));
    }

    g.appendChild(grp);

    if (!node.collapsed) node.children.forEach(drawNode);
  }

  drawLinks(treeData);
  drawNode(treeData);
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

function showTooltip(node, e) {
  document.getElementById('tt-q').textContent = node.label;
  document.getElementById('tt-a').textContent = node.answer || '(sem resposta capturada)';
  const urlEl = document.getElementById('tt-url');
  if (node.sourceUrl) {
    urlEl.href = node.sourceUrl;
    urlEl.textContent = node.sourceUrl.replace(/^https?:\/\//, '').substring(0, 55);
    urlEl.style.display = 'block';
  } else {
    urlEl.style.display = 'none';
  }
  document.getElementById('tt-level').textContent = `Nível ${node.level}`;
  tooltip.style.display = 'block';
  moveTooltip(e);
}

function hideTooltip() {
  tooltip.style.display = 'none';
}

function moveTooltip(e) {
  const wrap = document.getElementById('canvas-wrap');
  const rect = wrap.getBoundingClientRect();
  let tx = e.clientX - rect.left + 16;
  let ty = e.clientY - rect.top + 16;
  if (tx + 380 > rect.width) tx = e.clientX - rect.left - 380;
  if (ty + 200 > rect.height) ty = e.clientY - rect.top - 200;
  tooltip.style.left = tx + 'px';
  tooltip.style.top = ty + 'px';
}

// ── Pan & Zoom ───────────────────────────────────────────────────────────────

const wrap = document.getElementById('canvas-wrap');

wrap.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  isDragging = true;
  dragStartX = e.clientX; dragStartY = e.clientY;
  dragVpX = vpX; dragVpY = vpY;
  wrap.classList.add('grabbing');
});
window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  vpX = dragVpX + e.clientX - dragStartX;
  vpY = dragVpY + e.clientY - dragStartY;
  applyTransform();
});
window.addEventListener('mouseup', () => {
  isDragging = false;
  wrap.classList.remove('grabbing');
});

wrap.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.12 : 0.89;
  const rect = wrap.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  vpX = mx - (mx - vpX) * factor;
  vpY = my - (my - vpY) * factor;
  vpScale *= factor;
  vpScale = Math.max(0.1, Math.min(vpScale, 5));
  applyTransform();
}, { passive: false });

// ── Controls ─────────────────────────────────────────────────────────────────

function setAllCollapsed(val) {
  function walk(node) {
    if (node.level > 0) node.collapsed = val;
    node.children.forEach(walk);
  }
  walk(treeData);
  render();
  fitView();
}

document.getElementById('btn-expand-all').addEventListener('click', () => setAllCollapsed(false));
document.getElementById('btn-collapse-all').addEventListener('click', () => setAllCollapsed(true));
document.getElementById('btn-fit').addEventListener('click', fitView);

document.getElementById('btn-export').addEventListener('click', () => {
  const header = ['query', 'nivel', 'pergunta_pai', 'pergunta', 'resposta', 'url_fonte', 'capturado_em'];
  const rows = allItems.map(item =>
    [item.query, item.level || 1, item.parentQuestion || '', item.question, item.answer, item.sourceUrl, item.capturedAt]
      .map(v => `"${String(v || '').replace(/"/g, '""')}"`)
  );
  const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `paa_${(allItems[0]?.query || 'export').replace(/\s+/g, '_').substring(0, 40)}_${Date.now()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// ── Init ─────────────────────────────────────────────────────────────────────

function loadAndRender(items) {
  allItems = items;
  const emptyEl = document.getElementById('empty-state');

  if (!items.length) {
    emptyEl.style.display = 'flex';
    return;
  }
  emptyEl.style.display = 'none';

  const query = items[0]?.query || '—';
  document.getElementById('query-text').textContent = query;
  document.getElementById('node-count').textContent = `${items.length} perguntas`;

  treeData = buildTree(items);
  render();
  requestAnimationFrame(() => { requestAnimationFrame(fitView); });
}

function init() {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    document.getElementById('empty-state').style.display = 'flex';
    document.querySelector('#empty-state span').textContent = 'Erro: chrome.storage não disponível.';
    return;
  }

  chrome.storage.local.get('seo_paa_data', (data) => {
    const items = data['seo_paa_data'] || [];

    if (!items.length) {
      setTimeout(() => {
        chrome.storage.local.get('seo_paa_data', (data2) => {
          loadAndRender(data2['seo_paa_data'] || []);
        });
      }, 800);
      return;
    }

    loadAndRender(items);
  });
}

init();
