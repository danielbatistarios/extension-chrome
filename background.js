// SEO Analyzer — Background Service Worker
// Handles: badge, session cache per tab, image header interception, side panel toggle

// Abre/fecha o side panel ao clicar no ícone da extensão
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// ── Onboarding: abre tela de seleção de idioma na primeira instalação ─────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Salva data de instalação para calcular install_age_days no uninstall
    chrome.storage.local.set({ seo_install_date: Date.now(), seo_scan_count: 0 });
    chrome.storage.sync.get(['seo_onboarding_done'], (result) => {
      if (!result.seo_onboarding_done) {
        chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
      }
    });
  }
  // Atualiza URL de desinstalação sempre (install + update), usando dados salvos
  _refreshUninstallURL();
});

function _refreshUninstallURL() {
  const { version } = chrome.runtime.getManifest();
  chrome.storage.local.get(['seo_install_date', 'seo_scan_count'], (data) => {
    const installDate = data.seo_install_date || Date.now();
    const scanCount   = data.seo_scan_count   || 0;
    const ageDays     = Math.floor((Date.now() - installDate) / 86400000);
    const url = `https://tally.so/r/WOqdyL?extension_version=${version}&install_age_days=${ageDays}&number_of_scans=${scanCount}`;
    chrome.runtime.setUninstallURL(url);
  });
}


// ── Image header cache (URL → {contentLength, contentType}) ──────
// Mesma técnica do Imageye: intercepta respostas HTTP de imagens
const _imgHeaders = new Map();

chrome.webRequest.onCompleted.addListener(
  (details) => {
    const headers = details.responseHeaders || [];
    const getHeader = (name) => {
      const h = headers.find(h => h.name.toLowerCase() === name);
      return h ? h.value : null;
    };
    const contentLength = getHeader('content-length');
    const contentType   = getHeader('content-type');
    if (contentLength || contentType) {
      _imgHeaders.set(details.url, { contentLength, contentType });
      // Limpa entradas antigas se mapa crescer demais
      if (_imgHeaders.size > 2000) {
        const firstKey = _imgHeaders.keys().next().value;
        _imgHeaders.delete(firstKey);
      }
    }
  },
  { urls: ['<all_urls>'], types: ['image'] },
  ['responseHeaders']
);

function badgeColor(score) {
  if (score >= 80) return '#15803d';
  if (score >= 60) return '#ca8a04';
  if (score >= 40) return '#ea580c';
  return '#b91c1c';
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '', tabId });
    chrome.storage.session.remove(`seo_${tabId}`).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.action === 'openDashboard') {
    chrome.tabs.create({ url: chrome.runtime.getURL('aio_dashboard.html') });
    sendResponse({ ok: true });

  } else if (msg.action === 'openGraphFullscreen') {
    chrome.tabs.create({ url: chrome.runtime.getURL('graph_fullscreen.html') });
    sendResponse({ ok: true });

  } else if (msg.action === 'openLinksFullscreen') {
    chrome.tabs.create({ url: chrome.runtime.getURL('links_fullscreen.html') });
    sendResponse({ ok: true });

  } else if (msg.action === 'openCrawlFullscreen') {
    chrome.tabs.create({ url: chrome.runtime.getURL('crawl_fullscreen.html') });
    sendResponse({ ok: true });

  } else if (msg.type === 'openMindmap') {
    chrome.tabs.create({ url: chrome.runtime.getURL('paa_mindmap.html') });
    sendResponse({ ok: true });

  } else if (msg.type === 'setBadge') {
    if (msg.score != null) {
      chrome.action.setBadgeText({ text: String(msg.score), tabId: msg.tabId });
      chrome.action.setBadgeBackgroundColor({ color: badgeColor(msg.score), tabId: msg.tabId });
    }
    sendResponse({ ok: true });

  } else if (msg.type === 'getCache') {
    chrome.storage.session.get(`seo_${msg.tabId}`)
      .then(res => sendResponse({ data: res[`seo_${msg.tabId}`] || null }))
      .catch(() => sendResponse({ data: null }));
    return true;

  } else if (msg.type === 'setCache') {
    chrome.storage.session.set({ [`seo_${msg.tabId}`]: msg.data })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    // Incrementa contador de scans e atualiza URL de desinstalação
    chrome.storage.local.get(['seo_scan_count'], (data) => {
      const next = (data.seo_scan_count || 0) + 1;
      chrome.storage.local.set({ seo_scan_count: next }, _refreshUninstallURL);
    });
    return true;

  } else if (msg.action === 'getImgHeaders') {
    // Retorna headers já interceptados para uma lista de URLs
    const result = {};
    (msg.urls || []).forEach(url => {
      if (_imgHeaders.has(url)) result[url] = _imgHeaders.get(url);
    });
    sendResponse({ headers: result });

  } else if (msg.action === 'fetchImgSize') {
    // Fallback: faz HEAD request para obter content-length de uma URL
    fetch(msg.url, { method: 'HEAD', cache: 'no-store' })
      .then(r => {
        const cl = r.headers.get('content-length');
        const ct = r.headers.get('content-type');
        sendResponse({ contentLength: cl, contentType: ct });
      })
      .catch(() => sendResponse({ contentLength: null, contentType: null }));
    return true; // async

  } else if (msg.action === 'checkLinkStatus') {
    // Verifica status HTTP seguindo redirects manualmente (sem restrição CORS no background)
    (async () => {
      const url = msg.url;
      if (!url || url.startsWith('tel:') || url.startsWith('mailto:')) {
        sendResponse({ codes: null }); return;
      }
      const codes = [];
      let current = url;
      let hops = 0;
      try {
        while (hops < 5) {
          const r = await fetch(current, { method: 'HEAD', cache: 'no-store', redirect: 'manual' });
          const status = r.status;
          codes.push(status);
          if (status >= 300 && status < 400) {
            const loc = r.headers.get('location');
            if (loc) { current = new URL(loc, current).href; hops++; continue; }
          }
          break;
        }
        sendResponse({ codes: codes.length ? codes : null });
      } catch (_) {
        // Fallback: GET follow para obter pelo menos o código final
        try {
          const r = await fetch(url, { method: 'GET', redirect: 'follow', cache: 'no-store' });
          sendResponse({ codes: [r.status] });
        } catch (_2) {
          sendResponse({ codes: null });
        }
      }
    })();
    return true; // async

  } else if (msg.action === 'downloadImage') {
    chrome.downloads.download({
      url:            msg.url,
      filename:       msg.filename || undefined,
      conflictAction: 'uniquify',
    }, (id) => sendResponse({ id }));
    return true; // async

  } else if (msg.action === 'startIndexCrawl') {
    startIndexCrawl(msg.domain, msg.query);
    sendResponse({ ok: true });

  } else if (msg.action === 'stopIndexCrawl') {
    stopIndexCrawl();
    sendResponse({ ok: true });

  } else if (msg.type === 'NVIDIA_API_CALL') {
    handleNvidiaApiCall(msg.payload, sendResponse);
    return true;

  } else if (msg.type === 'NVIDIA_API_STREAM') {
    handleNvidiaApiStream(msg.payload, sender);
    return true;
  }

  return true; // mantém canal aberto para respostas assíncronas
});

// ══════════════════════════════════════════════════════════════
// NVIDIA NIM — chat/completions (OpenAI-compatible)
// ══════════════════════════════════════════════════════════════

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

async function handleNvidiaApiCall(payload, sendResponse) {
  try {
    const { apiKey, model, messages, temperature, maxTokens } = payload;
    const response = await fetch(NVIDIA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: temperature || 0.6,
        max_tokens:  maxTokens  || 2048,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      sendResponse({ error: true, message: err.message || err.error?.message || `HTTP ${response.status}` });
      return;
    }
    const data    = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    sendResponse({ success: true, content });
  } catch (err) {
    sendResponse({ error: true, message: err.message });
  }
}

async function handleNvidiaApiStream(payload, sender) {
  const { apiKey, model, messages, temperature, maxTokens } = payload;
  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});

  try {
    const response = await fetch(NVIDIA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: temperature || 0.6,
        max_tokens:  maxTokens  || 2048,
        stream: true,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      send({ type: 'NIM_STREAM_ERROR', message: err.message || `HTTP ${response.status}` });
      return;
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) { send({ type: 'NIM_STREAM_DONE' }); break; }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') { send({ type: 'NIM_STREAM_DONE' }); return; }
        try {
          const parsed = JSON.parse(data);
          const chunk  = parsed.choices?.[0]?.delta?.content || '';
          if (chunk) send({ type: 'NIM_STREAM_CHUNK', chunk });
        } catch {}
      }
    }
  } catch (err) {
    send({ type: 'NIM_STREAM_ERROR', message: err.message });
  }
}

// ══════════════════════════════════════════════════════════════
// INDEX CRAWL — controle de paginação (site: query)
// Background sobrevive ao popup fechado.
// A aba do Google fica visível com overlay de progresso.
// ══════════════════════════════════════════════════════════════

const IDX_KEY = 'seo_index_data';

let _idxTabId     = null;
let _idxDomain    = '';
let _idxQuery     = '';
let _idxAccum     = [];
let _idxPage      = 0;
let _idxActive    = false;
let _idxPageTimer = null;

function idxLog(...args) {
  console.log('[IDX]', ...args);
}

function stopIndexCrawl() {
  idxLog('stop requested');
  _idxActive = false;
  clearTimeout(_idxPageTimer);
  if (_idxTabId !== null) {
    chrome.tabs.remove(_idxTabId, () => { chrome.runtime.lastError; });
    _idxTabId = null;
  }
}

function saveProgress(done) {
  chrome.storage.local.set({
    [IDX_KEY]: {
      domain: _idxDomain, query: _idxQuery,
      page: _idxPage, accumulated: _idxAccum,
      total: _idxAccum.length, done, ts: Date.now(),
    }
  });
}

function goToPage(start) {
  if (!_idxActive) return;
  idxLog('goToPage start=', start, 'tabId=', _idxTabId);

  const url = `https://www.google.com/search?q=${encodeURIComponent(_idxQuery)}&start=${start}&num=10`;

  const openNew = () => {
    chrome.tabs.create({ url, active: true }, t => {
      _idxTabId = t.id;
      idxLog('created tab', _idxTabId);
    });
  };

  if (_idxTabId === null) {
    openNew();
  } else {
    chrome.tabs.get(_idxTabId, tab => {
      if (chrome.runtime.lastError || !tab) {
        idxLog('tab gone, opening new');
        _idxTabId = null;
        openNew();
      } else {
        chrome.tabs.update(_idxTabId, { url, active: true });
        idxLog('navigated tab', _idxTabId, 'to start=', start);
      }
    });
  }

  // Timeout generoso — Google pode ser lento
  clearTimeout(_idxPageTimer);
  _idxPageTimer = setTimeout(() => {
    if (!_idxActive) return;
    idxLog('timeout on page, accumulated so far:', _idxAccum.length);
    // Não fecha — salva o que tem e finaliza graciosamente
    finishCrawl();
  }, 45000);
}

function finishCrawl() {
  idxLog('finishCrawl, total URLs:', _idxAccum.length);
  _idxActive = false;
  clearTimeout(_idxPageTimer);
  saveProgress(true);
  if (_idxTabId !== null) {
    chrome.tabs.remove(_idxTabId, () => { chrome.runtime.lastError; });
    _idxTabId = null;
  }
}

function startIndexCrawl(domain, query) {
  idxLog('startIndexCrawl domain=', domain, 'query=', query);
  stopIndexCrawl();
  _idxDomain = domain;
  _idxQuery  = query;
  _idxAccum  = [];
  _idxPage   = 0;
  _idxActive = true;
  _idxTabId  = null;

  chrome.storage.local.remove(IDX_KEY);
  chrome.storage.local.set({
    [IDX_KEY]: { domain, query, page: 0, accumulated: [], total: 0, done: false, ts: Date.now() }
  });

  goToPage(0);
}

// Se o usuário fechar a aba manualmente — não finaliza, reabre
chrome.tabs.onRemoved.addListener((tabId) => {
  if (!_idxActive || tabId !== _idxTabId) return;
  idxLog('tab closed by user, resuming on new tab');
  _idxTabId = null;
  // Reabre na mesma página onde estava
  goToPage(_idxPage * 10);
});

// Escuta o extractor via storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes['seo_index_page']) return;
  if (!_idxActive) return;

  const pd = changes['seo_index_page'].newValue;
  idxLog('storage update domain=', pd?.domain, 'expected=', _idxDomain, 'urls=', pd?.urls?.length, 'confirmedEmpty=', pd?.confirmedEmpty);

  // Compara domínios de forma flexível (com ou sem www)
  if (!pd || !pd.domain) return;
  const normalize = d => d.replace(/^www\./, '').toLowerCase();
  if (normalize(pd.domain) !== normalize(_idxDomain)) return;

  clearTimeout(_idxPageTimer);

  // Acumula URLs únicas
  const seen = new Set(_idxAccum.map(r => r.url));
  (pd.urls || []).forEach(r => {
    if (!seen.has(r.url)) { _idxAccum.push(r); seen.add(r.url); }
  });

  _idxPage = pd.page;
  saveProgress(false);

  if (pd.confirmedEmpty) {
    idxLog('confirmed empty — finishing');
    finishCrawl();
  } else {
    idxLog('advancing to page', pd.page + 1);
    goToPage((pd.page + 1) * 10);
  }
});
