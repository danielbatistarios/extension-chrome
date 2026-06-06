(() => {
  function analyze() {
    const url = location.href;
    const domain = location.hostname;

    // --- TITLE ---
    const titleEl = document.querySelector('title');
    const title = titleEl ? titleEl.textContent.trim() : '';
    const titleLen = title.length;

    // --- META DESCRIPTION ---
    const metaDesc = document.querySelector('meta[name="description"]');
    const description = metaDesc ? metaDesc.getAttribute('content')?.trim() || '' : '';
    const descLen = description.length;

    // --- CANONICAL ---
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    const canonical = canonicalEl ? canonicalEl.getAttribute('href') || '' : '';

    // --- META ROBOTS ---
    const robotsEl = document.querySelector('meta[name="robots"]');
    const robots = robotsEl ? robotsEl.getAttribute('content')?.toLowerCase() || '' : '';
    const isNoindex = robots.includes('noindex');
    const isNofollow = robots.includes('nofollow');

    // --- HEADINGS ---
    const h1Els = [...document.querySelectorAll('h1')];
    const h2Els = [...document.querySelectorAll('h2')];
    const h3Els = [...document.querySelectorAll('h3')];
    const h4Els = [...document.querySelectorAll('h4')];
    const h5Els = [...document.querySelectorAll('h5')];
    const h6Els = [...document.querySelectorAll('h6')];

    const h1Count = h1Els.length;
    const h1Text = h1Els.map(el => el.textContent.trim()).filter(Boolean);

    // --- OG TAGS ---
    const og = {
      title: document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '',
      description: document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '',
      image: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '',
      url: document.querySelector('meta[property="og:url"]')?.getAttribute('content') || '',
      type: document.querySelector('meta[property="og:type"]')?.getAttribute('content') || '',
    };

    // --- TWITTER CARDS ---
    const twitter = {
      card: document.querySelector('meta[name="twitter:card"]')?.getAttribute('content') || '',
      title: document.querySelector('meta[name="twitter:title"]')?.getAttribute('content') || '',
      description: document.querySelector('meta[name="twitter:description"]')?.getAttribute('content') || '',
      image: document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') || '',
    };

    // --- HREFLANG ---
    const hreflangs = [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(el => ({
      lang: el.getAttribute('hreflang'),
      href: el.getAttribute('href'),
    }));

    // --- IMAGES ---
    const images = [...document.querySelectorAll('img')];
    const imgTotal = images.length;
    const imgNoAlt = images.filter(img => !img.getAttribute('alt') || img.getAttribute('alt').trim() === '').length;
    const imgEmptyAlt = images.filter(img => img.getAttribute('alt') === '').length;

    // --- LINKS ---
    const links = [...document.querySelectorAll('a[href]')];
    const internalLinks = links.filter(a => {
      try {
        const href = new URL(a.getAttribute('href'), url);
        return href.hostname === domain;
      } catch { return false; }
    });
    const externalLinks = links.filter(a => {
      try {
        const href = new URL(a.getAttribute('href'), url);
        return href.hostname !== domain && href.hostname !== '';
      } catch { return false; }
    });
    const nofollowLinks = links.filter(a => (a.getAttribute('rel') || '').includes('nofollow'));

    // --- JSON-LD / SCHEMA ---
    const jsonldScripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    const schemas = jsonldScripts.map(el => {
      try {
        const parsed = JSON.parse(el.textContent);
        const types = [];
        const collect = (node) => {
          if (!node) return;
          if (node['@type']) types.push(Array.isArray(node['@type']) ? node['@type'].join(', ') : node['@type']);
          if (node['@graph']) node['@graph'].forEach(collect);
        };
        collect(parsed);
        return { valid: true, types };
      } catch {
        return { valid: false, types: [] };
      }
    });

    // --- VIEWPORT ---
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    const hasViewport = !!viewportMeta;

    // --- CHARSET ---
    const charsetMeta = document.querySelector('meta[charset]') || document.querySelector('meta[http-equiv="Content-Type"]');
    const hasCharset = !!charsetMeta;

    // --- LANG ATTRIBUTE ---
    const htmlLang = document.documentElement.getAttribute('lang') || '';

    // --- WORD COUNT ---
    const bodyText = document.body ? document.body.innerText : '';
    const wordCount = bodyText.split(/\s+/).filter(w => w.length > 2).length;

    // --- CORE WEB VITALS via PerformanceAPI ---
    let lcp = null, fid = null, cls = null, fcp = null, ttfb = null;
    try {
      const navEntry = performance.getEntriesByType('navigation')[0];
      if (navEntry) ttfb = Math.round(navEntry.responseStart - navEntry.requestStart);

      const paintEntries = performance.getEntriesByType('paint');
      const fcpEntry = paintEntries.find(e => e.name === 'first-contentful-paint');
      if (fcpEntry) fcp = Math.round(fcpEntry.startTime);
    } catch {}

    // --- SCORE CALCULATION ---
    let score = 100;
    const issues = [];
    const warnings = [];
    const passes = [];

    // Title checks
    if (!title) { score -= 15; issues.push('Title ausente'); }
    else if (titleLen < 30) { score -= 8; warnings.push(`Title muito curto (${titleLen} chars)`); }
    else if (titleLen > 60) { score -= 5; warnings.push(`Title muito longo (${titleLen} chars)`); }
    else passes.push('Title dentro do tamanho ideal');

    // Meta description checks
    if (!description) { score -= 10; issues.push('Meta description ausente'); }
    else if (descLen < 70) { score -= 5; warnings.push(`Meta description curta (${descLen} chars)`); }
    else if (descLen > 160) { score -= 3; warnings.push(`Meta description longa (${descLen} chars)`); }
    else passes.push('Meta description no tamanho ideal');

    // H1 checks
    if (h1Count === 0) { score -= 12; issues.push('H1 ausente'); }
    else if (h1Count > 1) { score -= 8; warnings.push(`Múltiplos H1 (${h1Count})`); }
    else passes.push('H1 único e presente');

    // Canonical
    if (!canonical) { score -= 5; warnings.push('Canonical ausente'); }
    else passes.push('Canonical presente');

    // Noindex
    if (isNoindex) { score -= 20; issues.push('Página com noindex (não será indexada)'); }

    // Images without alt
    if (imgNoAlt > 0) {
      const penalty = Math.min(imgNoAlt * 2, 10);
      score -= penalty;
      warnings.push(`${imgNoAlt} imagem(ns) sem atributo alt`);
    } else if (imgTotal > 0) passes.push('Todas as imagens têm alt');

    // Schema
    if (schemas.length === 0) { score -= 5; warnings.push('Sem dados estruturados (JSON-LD)'); }
    else passes.push(`Schema presente: ${schemas.flatMap(s => s.types).join(', ')}`);

    // OG tags
    if (!og.title || !og.description || !og.image) {
      score -= 5;
      warnings.push('OG tags incompletas (afeta compartilhamento social)');
    } else passes.push('OG tags completas');

    // Viewport
    if (!hasViewport) { score -= 8; issues.push('Meta viewport ausente (mobile)'); }
    else passes.push('Meta viewport presente');

    // HTML lang
    if (!htmlLang) { score -= 3; warnings.push('Atributo lang ausente na tag <html>'); }
    else passes.push(`Lang definido: ${htmlLang}`);

    // Hreflang
    if (hreflangs.length > 0) passes.push(`Hreflang: ${hreflangs.length} idioma(s)`);

    score = Math.max(0, Math.min(100, score));

    let grade = 'A';
    if (score < 90) grade = 'B';
    if (score < 75) grade = 'C';
    if (score < 60) grade = 'D';
    if (score < 40) grade = 'F';

    return {
      url, score, grade,
      title, titleLen,
      description, descLen,
      canonical, robots, isNoindex, isNofollow,
      htmlLang,
      h1Count, h1Text,
      h2Count: h2Els.length,
      h3Count: h3Els.length,
      h4Count: h4Els.length,
      h5Count: h5Els.length,
      h6Count: h6Els.length,
      og, twitter, hreflangs,
      imgTotal, imgNoAlt, imgEmptyAlt,
      internalLinks: internalLinks.length,
      externalLinks: externalLinks.length,
      nofollowLinks: nofollowLinks.length,
      totalLinks: links.length,
      schemas,
      hasViewport, hasCharset, wordCount,
      cwv: { lcp, fid, cls, fcp, ttfb },
      issues, warnings, passes,
    };
  }

  return analyze();
})();
