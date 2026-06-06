// aio_dashboard.js — Visibility Dashboard for AIO Monitor

const STORAGE_KEY  = 'seo_aio_data';
const LAST_RUN_KEY = 'seo_aio_last_run';

const QUADRANT_CFG = {
  Q1: { label: 'Proteger',      desc: 'AIO + citado + top 3',     color: '#34d399', bg: '#065f46', badgeCls: 'badge-q1' },
  Q2: { label: 'Otimizar AIO',  desc: 'AIO mas não citado',        color: '#f59e0b', bg: '#78350f', badgeCls: 'badge-q2' },
  Q3: { label: 'Link Building', desc: 'AIO, não citado, fora top 5', color: '#818cf8', bg: '#1e1b4b', badgeCls: 'badge-q3' },
  Q4: { label: 'SEO Clássico',  desc: 'Sem AIO, sem posição',      color: '#f87171', bg: '#7f1d1d', badgeCls: 'badge-q4' },
};

let allData = [];
let lastRun = [];
let activeFilter = 'all';
let searchTerm = '';

function classifyQuery(appeared, domainMentioned, serpPosition) {
  if (appeared && domainMentioned && serpPosition && serpPosition <= 3) return 'Q1';
  if (appeared && domainMentioned) return 'Q1';
  if (appeared && !domainMentioned && serpPosition && serpPosition <= 5) return 'Q2';
  if (appeared && !domainMentioned) return 'Q3';
  return 'Q4';
}

// Ensure all records have quadrant
function enrichData(data) {
  return data.map(r => ({
    ...r,
    quadrant: r.quadrant || classifyQuery(r.appeared, r.domainMentioned, r.serpPosition),
  }));
}

function loadData() {
  chrome.storage.local.get([STORAGE_KEY, LAST_RUN_KEY], (d) => {
    allData = enrichData(d[STORAGE_KEY] || []);
    lastRun = d[LAST_RUN_KEY] || [];
    render();
  });
}

function render() {
  renderScores();
  renderQuadrants();
  renderCompetitors();
  renderTable();
  renderLastRunDate();
  renderDomainWarning();
}

function renderDomainWarning() {
  const existing = document.getElementById('domain-warning');
  if (existing) existing.remove();

  // Verifica se há resultados sem posição SERP ou sem citado definido
  const noDomain = allData.length > 0 && allData.every(r => !r.serpPosition && !r.domainMentioned);
  if (!noDomain) return;

  const warn = document.createElement('div');
  warn.id = 'domain-warning';
  warn.style.cssText = `
    background: #78350f33; border: 1px solid #92400e; border-radius: 8px;
    padding: 10px 14px; font-size: 11.5px; color: #fcd34d;
    display: flex; align-items: flex-start; gap: 8px; margin: 0 24px 0;
    max-width: 1152px; margin: -8px auto 0;
  `;
  warn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0;margin-top:1px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <span><b>Domínio não configurado durante a análise.</b> Os campos "Citado" e "Posição SERP" ficaram vazios porque o campo "Domínio a monitorar" estava em branco no painel flutuante. Configure o domínio (ex: <code style="background:#1c1917;padding:1px 5px;border-radius:3px;">movemaquinas.com.br</code>) antes de rodar a próxima análise.</span>
  `;
  document.getElementById('main').insertAdjacentElement('beforebegin', warn);
}

function renderLastRunDate() {
  if (!allData.length) return;
  const dates = allData.map(r => r.capturedAt).filter(Boolean).sort();
  const last = dates[dates.length - 1];
  if (last) {
    document.getElementById('last-run-date').textContent =
      new Date(last).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }
}

function renderScores() {
  const container = document.getElementById('scores-content');
  if (!allData.length) {
    container.innerHTML = '<div style="color:#52525b;font-size:11px;padding:8px 0;">Nenhuma análise encontrada.</div>';
    return;
  }

  const total      = allData.length;
  const withPos    = allData.filter(r => r.serpPosition).length;
  const withAIO    = allData.filter(r => r.appeared).length;
  const cited      = allData.filter(r => r.domainMentioned).length;
  const brandOnly  = allData.filter(r => r.brandMentionNoLink).length;

  const pctOrganic = total ? Math.round((withPos / total) * 100) : 0;
  const pctAIO     = total ? Math.round((withAIO / total) * 100) : 0;
  const pctCited   = total ? Math.round((cited / total) * 100) : 0;

  const visScore = total ? Math.round(
    (withPos / total) * 25 + (withAIO / total) * 35 +
    (cited / total) * 30 + (brandOnly / total) * 10
  ) : 0;
  const scoreColor = visScore >= 60 ? '#34d399' : visScore >= 35 ? '#f59e0b' : '#f87171';

  const prevOrganic = lastRun.filter(r => r.serpPosition).length;
  const prevAIO     = lastRun.filter(r => r.appeared).length;
  const prevCited   = lastRun.filter(r => r.domainMentioned).length;

  function deltaHTML(cur, prev, prevTotal) {
    if (!prevTotal) return '';
    const d = cur - prev;
    const cls = d > 0 ? 'pos' : d < 0 ? 'neg' : 'neu';
    const sign = d > 0 ? '▲+' : d < 0 ? '▼' : '=';
    return `<span class="score-delta ${cls}">${sign}${d}</span>`;
  }

  function metricHTML(label, num, tot, pct, barClass, dCur, dPrev) {
    return `
      <div class="score-metric">
        <div class="score-metric-header">
          <span class="score-metric-label">${label}</span>
          <div class="score-metric-right">
            <span class="score-pct" style="color:${pct >= 70 ? '#34d399' : pct >= 40 ? '#f59e0b' : '#f87171'}">${pct}%</span>
            <span class="score-fraction">${num}/${tot}</span>
            ${deltaHTML(dCur, dPrev, lastRun.length)}
          </div>
        </div>
        <div class="score-bar-bg">
          <div class="score-bar-fill ${barClass}" style="width:${pct}%"></div>
        </div>
      </div>`;
  }

  const aioRate = pctAIO;
  const aioRateColor = aioRate >= 50 ? '#34d399' : aioRate >= 25 ? '#f59e0b' : '#f87171';

  container.innerHTML =
    `<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0 10px;border-bottom:1px solid #27272a;margin-bottom:4px;">
      <div>
        <div style="font-size:10px;color:#52525b;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px;">Score de Visibilidade</div>
        <div style="font-size:9.5px;color:#52525b;">AIO em <b style="color:${aioRateColor};">${aioRate}%</b> das SERPs · Menção sem link: <b style="color:#818cf8;">${brandOnly}</b></div>
      </div>
      <span style="font-size:28px;font-weight:800;font-family:'SF Mono',monospace;color:${scoreColor};">${visScore}</span>
    </div>` +
    metricHTML('Presença Orgânica (SERP)', withPos, total, pctOrganic, 'organic', withPos, prevOrganic) +
    metricHTML('IA do Google (AIO)',        withAIO, total, pctAIO,     'aio',     withAIO, prevAIO) +
    metricHTML('Citado pela IA',            cited,   total, pctCited,   'cited',   cited,   prevCited);
}

function renderQuadrants() {
  const grid = document.getElementById('quadrant-grid');
  const counts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  allData.forEach(r => { if (counts[r.quadrant] !== undefined) counts[r.quadrant]++; });

  grid.innerHTML = Object.entries(QUADRANT_CFG).map(([q, cfg]) => `
    <div class="quadrant-card" style="background:${cfg.bg}22;border:1px solid ${cfg.bg}55;">
      <div class="quadrant-label" style="color:${cfg.color};">${q} — ${cfg.label}</div>
      <div class="quadrant-desc" style="color:${cfg.color};">${cfg.desc}</div>
      <div class="quadrant-count" style="color:${cfg.color};">${counts[q]}</div>
    </div>
  `).join('');
}

function renderCompetitors() {
  const container = document.getElementById('competitor-list');

  // Collect all domains cited in AIO, excluding target
  const domainCounts = {};
  allData.forEach(r => {
    if (!r.appeared || !r.citedUrls) return;
    r.citedUrls.forEach(url => {
      try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        domainCounts[host] = (domainCounts[host] || 0) + 1;
      } catch (_) {}
    });
  });

  const sorted = Object.entries(domainCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (!sorted.length) {
    container.innerHTML = '<div style="color:#52525b;font-size:11px;padding:4px 0;">Nenhum concorrente detectado ainda.</div>';
    return;
  }

  const max = sorted[0][1];
  container.innerHTML = sorted.map(([domain, count], i) => `
    <div class="competitor-item">
      <span class="competitor-rank">#${i + 1}</span>
      <span class="competitor-domain" title="${domain}">${domain}</span>
      <div class="competitor-bar-bg">
        <div class="competitor-bar-fill" style="width:${Math.round((count / max) * 100)}%"></div>
      </div>
      <span class="competitor-count">${count}×</span>
    </div>
  `).join('');
}

function renderTable() {
  const emptyEl = document.getElementById('empty-state');
  const tableEl = document.getElementById('query-table');
  const tbody   = document.getElementById('table-body');

  let filtered = allData;

  if (activeFilter !== 'all') {
    filtered = filtered.filter(r => r.quadrant === activeFilter);
  }

  if (searchTerm) {
    const s = searchTerm.toLowerCase();
    filtered = filtered.filter(r => r.query.toLowerCase().includes(s));
  }

  if (!filtered.length) {
    emptyEl.style.display = 'flex';
    tableEl.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  tableEl.style.display = 'table';

  tbody.innerHTML = '';
  filtered.forEach((r, i) => {
    const cfg = QUADRANT_CFG[r.quadrant] || QUADRANT_CFG.Q4;
    const date = r.capturedAt
      ? new Date(r.capturedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : '—';

    const aioBadge = r.appeared
      ? '<span class="badge badge-aio-yes">Sim</span>'
      : '<span class="badge badge-aio-no">Não</span>';

    const citedBadge = r.domainMentioned
      ? '<span class="badge badge-cited">Citado</span>'
      : '<span class="badge badge-aio-no">—</span>';

    const posBadge = r.serpPosition
      ? `<span class="badge badge-pos">#${r.serpPosition}</span>`
      : '<span class="badge badge-pos-none">—</span>';

    const qBadge = `<span class="badge ${cfg.badgeCls}">${r.quadrant} ${cfg.label}</span>`;

    const aioText = r.textFull || r.text || '';
    const aioPreview = aioText ? aioText.substring(0, 80) + (aioText.length > 80 ? '…' : '') : '';
    const aioTextCell = aioText
      ? `<td class="td-aio-text" title="Clique para ver texto completo">${escHtml(aioPreview)}</td>`
      : `<td class="td-aio-empty">—</td>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-query" title="${escHtml(r.query)}">${escHtml(r.query)}</td>
      <td>${qBadge}</td>
      <td>${aioBadge}</td>
      <td>${citedBadge}</td>
      <td>${posBadge}</td>
      ${aioTextCell}
      <td style="color:#52525b;font-size:10.5px;">${date}</td>
      <td>
        <button class="btn-del-row" title="Excluir esta query" data-query="${escHtml(r.query)}" data-captured="${escHtml(r.capturedAt || '')}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
          </svg>
        </button>
      </td>`;

    if (aioText) {
      tr.querySelector('.td-aio-text').addEventListener('click', () => openAIOModal(r));
    }

    tr.querySelector('.btn-del-row').addEventListener('click', (e) => {
      const btn = e.currentTarget;
      deleteRecord(btn.dataset.query, btn.dataset.captured);
    });

    tbody.appendChild(tr);
  });
}

function openAIOModal(r) {
  document.getElementById('aio-modal-query').textContent = r.query;
  document.getElementById('aio-modal-body').textContent = r.textFull || r.text || '';

  const sourcesEl = document.getElementById('aio-modal-sources');
  const sources = r.sources || [];
  if (sources.length) {
    sourcesEl.innerHTML = `<div style="font-size:10px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Fontes citadas (${sources.length})</div>` +
      sources.map(s => `<div class="aio-source-item"><a href="${escHtml(s.url)}" target="_blank">${escHtml(s.domain || s.url)}</a>${s.title ? ' — ' + escHtml(s.title.substring(0, 60)) : ''}</div>`).join('');
  } else {
    sourcesEl.innerHTML = '';
  }

  document.getElementById('aio-modal-bg').classList.add('open');
}

function deleteRecord(query, capturedAt) {
  allData = allData.filter(r => !(r.query === query && (r.capturedAt || '') === capturedAt));
  chrome.storage.local.set({ [STORAGE_KEY]: allData }, () => render());
}

function clearAll() {
  if (!confirm('Limpar TODOS os resultados do dashboard?')) return;
  allData = [];
  chrome.storage.local.remove([STORAGE_KEY, LAST_RUN_KEY], () => render());
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function exportCSV() {
  if (!allData.length) { alert('Nenhum dado para exportar.'); return; }
  const header = [
    'query', 'quadrante', 'ai_overview', 'citado', 'mencao_sem_link',
    'posicao_serp', 'url_serp',
    'fontes_urls', 'fontes_titulos', 'fontes_dominios', 'texto_aio', 'capturado_em',
  ];
  const rows = allData.map(r => {
    const sources = r.sources || [];
    return [
      r.query,
      r.quadrant || '',
      r.appeared ? 'Sim' : 'Não',
      r.domainMentioned ? 'Sim' : 'Não',
      r.brandMentionNoLink ? 'Sim' : 'Não',
      r.serpPosition || '',
      r.serpUrl || '',
      sources.map(s => s.url).join(' | ') || (r.citedUrls || []).join(' | '),
      sources.map(s => s.title).join(' | '),
      sources.map(s => s.domain).join(' | '),
      r.textFull || r.text || '',
      r.capturedAt || '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`);
  });

  const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `visibilidade_aio_${Date.now()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Events ───────────────────────────────────────────────────────────────────

document.getElementById('btn-refresh').addEventListener('click', loadData);
document.getElementById('btn-export-all').addEventListener('click', exportCSV);
document.getElementById('btn-clear-all').addEventListener('click', clearAll);

document.getElementById('aio-modal-close').addEventListener('click', () => {
  document.getElementById('aio-modal-bg').classList.remove('open');
});
document.getElementById('aio-modal-bg').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) document.getElementById('aio-modal-bg').classList.remove('open');
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderTable();
  });
});

document.getElementById('search-query').addEventListener('input', (e) => {
  searchTerm = e.target.value.trim();
  renderTable();
});

// ── Init ─────────────────────────────────────────────────────────────────────

if (typeof chrome !== 'undefined' && chrome.storage) {
  loadData();
} else {
  document.getElementById('empty-state').style.display = 'flex';
}
