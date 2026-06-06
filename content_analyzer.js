// content_analyzer.js — SEO/AEO/GEO Content Analysis Engine
// Injected via chrome.scripting.executeScript into active tab
// Returns comprehensive analysis across 16 categories

(() => {
  'use strict';

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  function parseJSON_LD() {
    const schemas = [];
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');

    scripts.forEach((script) => {
      try {
        const raw = script.textContent.trim();
        const parsed = JSON.parse(raw);
        // Extrai tipos: array raiz, @graph, ou objeto simples
        let types = [];
        if (Array.isArray(parsed)) {
          types = parsed.flatMap(p =>
            p['@graph'] ? p['@graph'].map(n => n['@type']).filter(Boolean).flat()
                        : [p['@type']].filter(Boolean)
          );
        } else if (parsed['@graph']) {
          types = parsed['@graph'].flatMap(n => [].concat(n['@type'] || [])).filter(Boolean);
        } else {
          types = [].concat(parsed['@type'] || []).filter(Boolean);
        }
        types = [...new Set(types)]; // deduplica tipos dentro do mesmo script

        const ids = (() => {
          const collect = (obj) => {
            const result = [];
            if (obj['@id']) result.push(obj['@id']);
            if (obj.sameAs) {
              if (Array.isArray(obj.sameAs)) result.push(...obj.sameAs);
              else result.push(obj.sameAs);
            }
            Object.values(obj).forEach(val => {
              if (val && typeof val === 'object' && val['@id']) {
                result.push(val['@id']);
              }
            });
            return result;
          };
          return Array.isArray(parsed) ? parsed.flatMap(collect) : collect(parsed);
        })();

        // Se tem @graph, cria uma entrada por nó filho para validação individual
        if (parsed['@graph'] && Array.isArray(parsed['@graph'])) {
          parsed['@graph'].forEach(node => {
            if (!node || typeof node !== 'object') return;
            const nodeTypes = [].concat(node['@type'] || []).filter(Boolean);
            try {
              schemas.push({
                valid: true,
                types: nodeTypes,
                ids,
                raw: JSON.stringify(node),
                error: null
              });
            } catch (_) {}
          });
        } else {
          schemas.push({
            valid: true,
            types,
            ids,
            raw: JSON.stringify(parsed),
            error: null
          });
        }
      } catch (e) {
        schemas.push({
          valid: false,
          types: [],
          ids: [],
          raw: script.textContent.substring(0, 100),
          error: e.message
        });
      }
    });

    return schemas;
  }

  function countMicrodata() {
    const itemscopes = document.querySelectorAll('[itemscope]').length;
    const itemtypes = document.querySelectorAll('[itemtype]').length;
    const itemprops = document.querySelectorAll('[itemprop]').length;
    return { itemscopes, itemtypes, itemprops };
  }

  function estimateReadingTime(text) {
    const words = text.split(/\s+/).length;
    const avgWordsPerMin = 200;
    return Math.ceil(words / avgWordsPerMin);
  }

  function detectPageType(text, schemas) {
    const types = new Set();
    schemas.forEach(s => s.types.forEach(t => types.add(t)));

    if (types.has('Article') || types.has('BlogPosting')) return 'article';
    if (types.has('Product')) return 'product';
    if (types.has('FAQPage')) return 'faq';
    if (types.has('LocalBusiness')) return 'local';
    if (types.has('Organization')) return 'org';

    if (document.querySelector('main article')) return 'article';
    if (document.querySelector('[itemtype*="Product"]')) return 'product';

    return 'generic';
  }

  function extractText(el) {
    return el ? el.innerText || el.textContent || '' : '';
  }

  function countTextElements(selector) {
    return document.querySelectorAll(selector).length;
  }

  function sumTextLength(selector) {
    let total = 0;
    document.querySelectorAll(selector).forEach(el => {
      total += (el.innerText || el.textContent || '').length;
    });
    return total;
  }

  function getTextContent() {
    const main = document.querySelector('main') || document.querySelector('article') || document.body;
    return (main.innerText || main.textContent || '').trim();
  }

  // ============================================================================
  // 16 ANALYSIS FUNCTIONS
  // ============================================================================

  function checkStructuredData(schemas) {
    const checks = [];
    const score = (() => {
      let base = 0;

      // Check 1: JSON-LD presence
      if (schemas.length === 0) {
        checks.push({ status: 'fail', label: 'JSON-LD Not Found', detail: 'No JSON-LD schema detected.' });
        return 10;
      } else {
        checks.push({ status: 'pass', label: 'JSON-LD Present', detail: `${schemas.length} schema(s) found.` });
        base += 15;
      }

      // Check 2: Parse validity
      const validSchemas = schemas.filter(s => s.valid);
      if (validSchemas.length !== schemas.length) {
        checks.push({ status: 'warn', label: 'Schema Parse Errors', detail: `${schemas.length - validSchemas.length} invalid schema(s).` });
        base += 8;
      } else {
        checks.push({ status: 'pass', label: 'All Schemas Valid', detail: 'All JSON-LD blocks parse correctly.' });
        base += 15;
      }

      // Check 3: @type coverage
      const types = new Set();
      validSchemas.forEach(s => s.types.forEach(t => types.add(t)));
      const criticalTypes = ['Article', 'BlogPosting', 'Product', 'FAQPage', 'LocalBusiness', 'Organization', 'WebSite', 'WebPage'];
      const hasCritical = Array.from(types).some(t => criticalTypes.includes(t));

      if (hasCritical) {
        checks.push({ status: 'pass', label: `@type Coverage (${Array.from(types).join(', ')})`, detail: 'Found critical schema type(s).' });
        base += 15;
      } else if (types.size > 0) {
        checks.push({ status: 'warn', label: `@type Found (${Array.from(types).join(', ')})`, detail: 'Non-critical types detected.' });
        base += 10;
      } else {
        checks.push({ status: 'fail', label: 'No @type Found', detail: 'Schema missing type information.' });
      }

      // Check 4: Required properties
      const hasRequiredProps = validSchemas.some(s => {
        const raw = s.raw;
        return (raw.includes('headline') || raw.includes('name')) &&
               (raw.includes('author') || raw.includes('creator'));
      });

      if (hasRequiredProps) {
        checks.push({ status: 'pass', label: 'Required Properties Present', detail: 'headline/name + author detected.' });
        base += 12;
      } else {
        checks.push({ status: 'warn', label: 'Limited Required Properties', detail: 'Missing headline or author.' });
        base += 5;
      }

      // Check 5: Recommended properties
      const hasRecommended = validSchemas.some(s => {
        const raw = s.raw;
        return raw.includes('image') && raw.includes('description');
      });

      if (hasRecommended) {
        checks.push({ status: 'pass', label: 'Recommended Properties Present', detail: 'image + description found.' });
        base += 10;
      } else {
        checks.push({ status: 'info', label: 'Recommended Properties', detail: 'image or description missing.' });
        base += 5;
      }

      // Check 6: @id usage
      let hasIds = false;
      validSchemas.forEach(s => {
        if (s.ids.length > 0) hasIds = true;
      });

      if (hasIds) {
        checks.push({ status: 'pass', label: '@id / sameAs Usage', detail: `${validSchemas.reduce((acc, s) => acc + s.ids.length, 0)} entity IDs found.` });
        base += 10;
      } else {
        checks.push({ status: 'info', label: 'No @id / sameAs', detail: 'Entity linking not configured.' });
        base += 3;
      }

      // Check 7: Speakable
      const hasSpeakable = validSchemas.some(s => s.raw.includes('speakable'));
      if (hasSpeakable) {
        checks.push({ status: 'pass', label: 'Speakable Content', detail: 'Voice assistant optimization detected.' });
        base += 5;
      }

      // Check 8: Multiple types
      const schemaTypes = new Set();
      validSchemas.forEach(s => s.types.forEach(t => schemaTypes.add(t)));
      if (schemaTypes.size >= 2) {
        checks.push({ status: 'pass', label: 'Multiple Schema Types', detail: `${schemaTypes.size} types for comprehensive coverage.` });
        base += 5;
      }

      // Check 9: Microdata
      const microdata = countMicrodata();
      if (microdata.itemscopes > 0) {
        checks.push({ status: 'info', label: 'Microdata Detected', detail: `${microdata.itemscopes} itemscope(s) found (legacy format).` });
        base += 2;
      }

      return Math.min(base, 100);
    })();

    return { category: 'Structured Data & Schema', score, checks };
  }

  function checkSemanticHTML() {
    const checks = [];
    let base = 0;

    // Single H1 check
    const h1s = document.querySelectorAll('h1');
    if (h1s.length === 1) {
      checks.push({ status: 'pass', label: 'Single H1 Present', detail: 'Exactly one H1 found.' });
      base += 20;
    } else if (h1s.length === 0) {
      checks.push({ status: 'fail', label: 'No H1 Found', detail: 'Page is missing H1 tag.' });
      base += 0;
    } else {
      checks.push({ status: 'warn', label: `Multiple H1s (${h1s.length})`, detail: 'Page has multiple H1 tags.' });
      base += 5;
    }

    // Heading hierarchy
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    let hierarchyGood = true;
    let lastLevel = 0;
    headings.forEach(h => {
      const level = parseInt(h.tagName[1]);
      if (level > lastLevel + 1) hierarchyGood = false;
      lastLevel = level;
    });

    if (hierarchyGood) {
      checks.push({ status: 'pass', label: 'Proper Heading Hierarchy', detail: 'No skipped heading levels.' });
      base += 15;
    } else {
      checks.push({ status: 'warn', label: 'Heading Hierarchy Issues', detail: 'Skipped heading levels detected.' });
      base += 5;
    }

    // Semantic tags
    const semanticTags = [
      { sel: 'main', name: 'main' },
      { sel: 'article', name: 'article' },
      { sel: 'section', name: 'section' },
      { sel: 'nav', name: 'nav' },
      { sel: 'aside', name: 'aside' },
      { sel: 'header', name: 'header' },
      { sel: 'footer', name: 'footer' },
      { sel: 'figure', name: 'figure' },
      { sel: 'time', name: 'time' },
      { sel: 'address', name: 'address' }
    ];

    const foundTags = semanticTags.filter(t => document.querySelector(t.sel));
    const detail = foundTags.length > 0 ? foundTags.map(t => t.name).join(', ') : 'None';

    if (foundTags.length >= 5) {
      checks.push({ status: 'pass', label: `Semantic Tags (${foundTags.length}/10)`, detail });
      base += 15;
    } else if (foundTags.length >= 2) {
      checks.push({ status: 'info', label: `Semantic Tags (${foundTags.length}/10)`, detail });
      base += 8;
    } else {
      checks.push({ status: 'warn', label: `Minimal Semantic Tags (${foundTags.length}/10)`, detail });
      base += 3;
    }

    // Word count
    const textContent = getTextContent();
    const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;

    if (wordCount >= 300 && wordCount <= 2000) {
      checks.push({ status: 'pass', label: `Good Word Count (${wordCount})`, detail: 'Content length is appropriate.' });
      base += 15;
    } else if (wordCount < 300) {
      checks.push({ status: 'warn', label: `Low Word Count (${wordCount})`, detail: 'Content may be too thin.' });
      base += 3;
    } else {
      checks.push({ status: 'info', label: `High Word Count (${wordCount})`, detail: 'Very comprehensive content.' });
      base += 10;
    }

    // Flesch-Kincaid approximation (simplified)
    const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = wordCount / Math.max(sentences.length, 1);

    if (avgSentenceLength >= 10 && avgSentenceLength <= 20) {
      checks.push({ status: 'pass', label: 'Readable Sentence Length', detail: `Avg ${avgSentenceLength.toFixed(1)} words/sentence.` });
      base += 10;
    } else if (avgSentenceLength > 25) {
      checks.push({ status: 'warn', label: 'Long Sentences', detail: `Avg ${avgSentenceLength.toFixed(1)} words/sentence.` });
      base += 3;
    } else {
      checks.push({ status: 'info', label: `Short Sentences (${avgSentenceLength.toFixed(1)})`, detail: 'May lack depth.' });
      base += 5;
    }

    // Content-to-code ratio
    const allText = document.body.innerText || document.body.textContent || '';
    const ratio = allText.length / (document.documentElement.outerHTML || '').length;

    if (ratio > 0.3) {
      checks.push({ status: 'pass', label: 'Good Content Ratio', detail: `${(ratio * 100).toFixed(1)}% content vs markup.` });
      base += 10;
    } else if (ratio > 0.15) {
      checks.push({ status: 'info', label: `Content Ratio (${(ratio * 100).toFixed(1)}%)`, detail: 'Moderate amount of markup.' });
      base += 5;
    } else {
      checks.push({ status: 'warn', label: `Low Content Ratio (${(ratio * 100).toFixed(1)}%)`, detail: 'Heavy markup relative to content.' });
      base += 2;
    }

    return { category: 'Semantic HTML', score: Math.min(base, 100), checks };
  }

  function checkAccessibility() {
    const checks = [];
    let base = 0;

    // html[lang]
    const htmlLang = document.documentElement.getAttribute('lang');
    if (htmlLang) {
      checks.push({ status: 'pass', label: 'Language Declaration', detail: `lang="${htmlLang}"` });
      base += 15;
    } else {
      checks.push({ status: 'warn', label: 'No Language Declaration', detail: 'Missing html[lang] attribute.' });
      base += 3;
    }

    // Skip links
    const skipLink = document.querySelector('a[href^="#main"], a[href^="#content"], .skip-link');
    if (skipLink) {
      checks.push({ status: 'pass', label: 'Skip Links Present', detail: 'Keyboard navigation accessible.' });
      base += 10;
    } else {
      checks.push({ status: 'info', label: 'No Skip Links', detail: 'Consider adding skip-to-content link.' });
      base += 3;
    }

    // Image alt completeness
    const images = document.querySelectorAll('img');
    const imgsWithAlt = Array.from(images).filter(img => img.hasAttribute('alt') && img.getAttribute('alt').length > 0);
    const altRatio = images.length > 0 ? (imgsWithAlt.length / images.length * 100).toFixed(0) : 100;

    if (altRatio === '100') {
      checks.push({ status: 'pass', label: 'Image Alt Text 100%', detail: 'All images have descriptive alt.' });
      base += 20;
    } else if (altRatio >= 80) {
      checks.push({ status: 'warn', label: `Image Alt ${altRatio}%`, detail: `${images.length - imgsWithAlt.length} images missing alt.` });
      base += 10;
    } else {
      checks.push({ status: 'fail', label: `Low Alt Text (${altRatio}%)`, detail: `${images.length - imgsWithAlt.length} images missing alt.` });
      base += 2;
    }

    // ARIA landmarks
    const landmarks = document.querySelectorAll('[role="main"], [role="navigation"], [role="search"], main, nav').length;
    if (landmarks >= 2) {
      checks.push({ status: 'pass', label: `ARIA Landmarks (${landmarks})`, detail: 'Proper document landmarks.' });
      base += 15;
    } else if (landmarks === 1) {
      checks.push({ status: 'info', label: 'Minimal Landmarks', detail: 'Consider adding more structure.' });
      base += 5;
    } else {
      checks.push({ status: 'warn', label: 'No Landmarks', detail: 'No main or nav elements.' });
      base += 2;
    }

    // Link text quality
    const links = document.querySelectorAll('a[href]');
    const genericLinks = Array.from(links).filter(a => {
      const text = a.innerText.toLowerCase();
      return /^(click here|read more|here|link|more|learn more)$/.test(text.trim());
    });

    const linkQuality = links.length > 0 ? ((links.length - genericLinks.length) / links.length * 100).toFixed(0) : 100;
    if (linkQuality >= 90) {
      checks.push({ status: 'pass', label: 'Descriptive Link Text', detail: 'Most links are descriptive.' });
      base += 10;
    } else if (linkQuality >= 70) {
      checks.push({ status: 'warn', label: `Generic Links (${100 - linkQuality}%)`, detail: `${genericLinks.length} generic anchor texts found.` });
      base += 5;
    } else {
      checks.push({ status: 'info', label: 'Many Generic Links', detail: 'Improve link text specificity.' });
      base += 2;
    }

    // Form labels
    const inputs = document.querySelectorAll('input, textarea, select');
    const labelsOk = Array.from(inputs).filter(inp => {
      const id = inp.id;
      if (!id) return false;
      return document.querySelector(`label[for="${id}"]`) !== null;
    });

    const labelRatio = inputs.length > 0 ? (labelsOk.length / inputs.length * 100).toFixed(0) : 100;
    if (labelRatio === '100') {
      checks.push({ status: 'pass', label: 'Form Labels 100%', detail: 'All inputs properly labeled.' });
      base += 10;
    } else if (labelRatio > 0) {
      checks.push({ status: 'warn', label: `Form Labels (${labelRatio}%)`, detail: `${inputs.length - labelsOk.length} inputs unlabeled.` });
      base += 3;
    } else if (inputs.length === 0) {
      checks.push({ status: 'info', label: 'No Forms', detail: 'Page has no input elements.' });
      base += 8;
    } else {
      checks.push({ status: 'fail', label: 'Forms Not Labeled', detail: 'No proper input labels found.' });
      base += 1;
    }

    return { category: 'Accessibility for Agents', score: Math.min(base, 100), checks };
  }

  function checkInternalLinking() {
    const checks = [];
    let base = 0;

    const links = document.querySelectorAll('a[href]');
    const currentHost = window.location.hostname;

    let internal = 0;
    let external = 0;
    let nofollow = 0;

    links.forEach(link => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

      try {
        const url = new URL(href, window.location.origin);
        if (url.hostname === currentHost) {
          internal++;
          if (link.getAttribute('rel')?.includes('nofollow')) nofollow++;
        } else {
          external++;
        }
      } catch {
        if (href.startsWith('/') || !href.startsWith('http')) {
          internal++;
          if (link.getAttribute('rel')?.includes('nofollow')) nofollow++;
        } else {
          external++;
        }
      }
    });

    // Internal vs external
    if (internal > 0 && external > 0) {
      const internalRatio = (internal / (internal + external) * 100).toFixed(0);
      checks.push({ status: 'pass', label: `Internal Links (${internal})`, detail: `${internalRatio}% of links are internal.` });
      base += 15;
    } else if (internal > 0) {
      checks.push({ status: 'pass', label: `Internal Links (${internal})`, detail: 'Page links to other internal pages.' });
      base += 15;
    } else {
      checks.push({ status: 'warn', label: 'No Internal Links', detail: 'Page should link to other internal pages.' });
      base += 2;
    }

    // Nofollow on internal
    if (nofollow > 0) {
      checks.push({ status: 'warn', label: `Nofollow Internal (${nofollow})`, detail: 'Internal links should not have rel="nofollow".' });
      base += 3;
    } else {
      checks.push({ status: 'pass', label: 'No Nofollow Internal', detail: 'Internal links are properly followed.' });
      base += 10;
    }

    // Nav element
    const nav = document.querySelector('nav');
    if (nav) {
      const navLinks = nav.querySelectorAll('a[href]').length;
      checks.push({ status: 'pass', label: `Navigation Element (${navLinks} links)`, detail: 'Proper nav structure present.' });
      base += 15;
    } else {
      checks.push({ status: 'warn', label: 'No <nav> Element', detail: 'Consider wrapping navigation in <nav>.' });
      base += 3;
    }

    // Breadcrumbs
    const breadcrumb = document.querySelector('nav[aria-label*="breadcrumb"], .breadcrumb, [role="navigation"][aria-label*="breadcrumb"]');
    if (breadcrumb) {
      const crumbs = breadcrumb.querySelectorAll('a').length;
      checks.push({ status: 'pass', label: `Breadcrumbs (${crumbs})`, detail: 'Navigation path clearly marked.' });
      base += 12;
    } else {
      checks.push({ status: 'info', label: 'No Breadcrumbs', detail: 'Consider adding breadcrumb navigation.' });
      base += 3;
    }

    // Anchor text quality (generic anchors in internal links)
    const internalAnchors = Array.from(links).filter(a => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('http')) return false;
      try {
        const url = new URL(href, window.location.origin);
        return url.hostname === currentHost;
      } catch {
        return href.startsWith('/') || !href.startsWith('http');
      }
    });

    const goodAnchorText = internalAnchors.filter(a => {
      const text = a.innerText.toLowerCase().trim();
      return !(/^(click|here|more|link)$/i.test(text));
    });

    const anchorQuality = internalAnchors.length > 0 ? (goodAnchorText.length / internalAnchors.length * 100).toFixed(0) : 100;
    if (anchorQuality >= 85) {
      checks.push({ status: 'pass', label: 'Internal Anchor Text Quality', detail: 'Links use descriptive text.' });
      base += 10;
    } else {
      checks.push({ status: 'info', label: `Generic Internal Anchors (${100 - anchorQuality}%)`, detail: 'Improve internal link descriptions.' });
      base += 3;
    }

    // Footer links
    const footer = document.querySelector('footer');
    const footerLinks = footer ? footer.querySelectorAll('a[href]').length : 0;
    if (footerLinks > 0) {
      checks.push({ status: 'pass', label: `Footer Links (${footerLinks})`, detail: 'Footer contains navigation links.' });
      base += 8;
    }

    return { category: 'Internal Linking', score: Math.min(base, 100), checks };
  }

  function checkMeta() {
    const checks = [];
    let base = 0;

    // Title
    const title = document.querySelector('title');
    const titleText = title ? title.innerText : '';
    const titleLen = titleText.length;

    if (titleLen >= 10 && titleLen <= 70) {
      checks.push({ status: 'pass', label: `Title Length (${titleLen})`, detail: 'Title is within optimal range.' });
      base += 15;
    } else if (titleLen > 0) {
      checks.push({ status: 'warn', label: `Title Length (${titleLen})`, detail: titleLen < 10 ? 'Title too short' : 'Title may be truncated' });
      base += 5;
    } else {
      checks.push({ status: 'fail', label: 'No Title', detail: 'Page is missing title tag.' });
      base += 0;
    }

    // Description
    const desc = document.querySelector('meta[name="description"]');
    const descText = desc ? desc.getAttribute('content') : '';
    const descLen = descText.length;

    if (descLen >= 50 && descLen <= 160) {
      checks.push({ status: 'pass', label: `Description Length (${descLen})`, detail: 'Description is within optimal range.' });
      base += 15;
    } else if (descLen > 0) {
      checks.push({ status: 'warn', label: `Description Length (${descLen})`, detail: descLen < 50 ? 'Too short' : 'May be truncated in SERP' });
      base += 5;
    } else {
      checks.push({ status: 'fail', label: 'No Description', detail: 'Missing meta description.' });
      base += 0;
    }

    // Canonical
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      const href = canonical.getAttribute('href');
      checks.push({ status: 'pass', label: 'Canonical Tag Present', detail: `href="${href}"` });
      base += 15;
    } else {
      checks.push({ status: 'warn', label: 'No Canonical', detail: 'Missing canonical tag (risky for pagination).' });
      base += 5;
    }

    // OG tags
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    const ogType = document.querySelector('meta[property="og:type"]');

    const ogCount = [ogTitle, ogDesc, ogImage, ogType].filter(x => x).length;

    if (ogCount === 4) {
      checks.push({ status: 'pass', label: 'OG Tags Complete', detail: 'All essential OG tags present.' });
      base += 15;
    } else if (ogCount >= 2) {
      checks.push({ status: 'info', label: `OG Tags (${ogCount}/4)`, detail: 'Partial social sharing support.' });
      base += 8;
    } else {
      checks.push({ status: 'warn', label: 'Missing OG Tags', detail: 'No Open Graph metadata found.' });
      base += 2;
    }

    // Twitter Card
    const twCard = document.querySelector('meta[name="twitter:card"]');
    if (twCard) {
      checks.push({ status: 'pass', label: 'Twitter Card', detail: `card="${twCard.getAttribute('content')}"` });
      base += 8;
    } else {
      checks.push({ status: 'info', label: 'No Twitter Card', detail: 'Consider adding Twitter Card tags.' });
      base += 2;
    }

    // Hreflang
    const hreflangs = document.querySelectorAll('link[rel="alternate"][hreflang]');
    if (hreflangs.length > 0) {
      checks.push({ status: 'pass', label: `Hreflang Tags (${hreflangs.length})`, detail: 'Multi-language or regional support.' });
      base += 10;
    } else {
      checks.push({ status: 'info', label: 'No Hreflang', detail: 'Not necessary unless multi-language.' });
      base += 5;
    }

    // Viewport
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      checks.push({ status: 'pass', label: 'Viewport Meta', detail: 'Mobile responsiveness declared.' });
      base += 10;
    } else {
      checks.push({ status: 'fail', label: 'No Viewport Meta', detail: 'Missing responsive design declaration.' });
      base += 1;
    }

    return { category: 'Meta & Discoverability', score: Math.min(base, 100), checks };
  }

  function checkMachineReadability() {
    const checks = [];
    let base = 0;

    // DOM text content (SSR check)
    const mainText = getTextContent();
    if (mainText.length > 100) {
      checks.push({ status: 'pass', label: 'Server-Rendered Content', detail: `${mainText.length} chars of text found.` });
      base += 20;
    } else if (mainText.length > 0) {
      checks.push({ status: 'warn', label: 'Minimal Text Content', detail: 'Content may be client-rendered (SPA).' });
      base += 5;
    } else {
      checks.push({ status: 'fail', label: 'No Text Content', detail: 'Page appears to be pure client-rendered.' });
      base += 0;
    }

    // SPA framework detection
    const hasSPA = !!document.querySelector('[data-reactroot], [data-v-app], [ng-app], [ng-version]');
    if (hasSPA && mainText.length > 100) {
      checks.push({ status: 'info', label: 'SPA Framework Detected', detail: 'Page uses React/Vue/Angular but has server content.' });
      base += 10;
    } else if (hasSPA) {
      checks.push({ status: 'warn', label: 'SPA Without Server Content', detail: 'Page is purely client-rendered.' });
      base += 2;
    } else {
      checks.push({ status: 'pass', label: 'Traditional HTML', detail: 'Page is server-rendered (good).' });
      base += 10;
    }

    // Robots meta
    const robotsMeta = document.querySelector('meta[name="robots"]');
    const robotsContent = robotsMeta ? robotsMeta.getAttribute('content') : '';
    const isNoindex = robotsContent.includes('noindex');

    if (!robotsMeta) {
      checks.push({ status: 'pass', label: 'No Robots Restrictions', detail: 'Default indexing allowed.' });
      base += 15;
    } else if (isNoindex) {
      checks.push({ status: 'fail', label: 'Noindex Meta Found', detail: 'Page is not indexed by search engines.' });
      base += 0;
    } else {
      checks.push({ status: 'pass', label: `Robots: "${robotsContent}"`, detail: 'Custom robots directive.' });
      base += 10;
    }

    // AI bot meta tags
    const aiMeta = robotsContent.includes('GPTBot') || robotsContent.includes('ClaudeBot') || robotsContent.includes('ChatGPT-User') || robotsContent.includes('Anthropic-AI');
    const aiPolicy = document.querySelector('meta[name="ai-content-policy"]');

    if (aiMeta || aiPolicy) {
      const policy = aiMeta ? robotsContent : aiPolicy.getAttribute('content');
      checks.push({ status: 'pass', label: 'AI Bot Policy Declared', detail: `Policy: "${policy}"` });
      base += 10;
    } else {
      checks.push({ status: 'info', label: 'No AI Bot Policy', detail: 'Consider declaring AI indexing preferences.' });
      base += 3;
    }

    // AI content declaration
    const aiGenerated = document.querySelector('meta[name="ai-generated"]');
    if (aiGenerated) {
      checks.push({ status: 'info', label: 'AI-Generated Content Declaration', detail: 'Page declares AI generation.' });
      base += 5;
    } else {
      checks.push({ status: 'info', label: 'No AI Declaration', detail: 'Not applicable unless AI-generated.' });
      base += 3;
    }

    // Canonical self-reference
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      const href = canonical.getAttribute('href');
      const currentUrl = window.location.href;
      const isSelfRef = href.includes(window.location.hostname);

      if (isSelfRef) {
        checks.push({ status: 'pass', label: 'Canonical Self-Reference', detail: 'Properly points to self.' });
        base += 10;
      } else {
        checks.push({ status: 'warn', label: 'Canonical Points Elsewhere', detail: 'Possible duplicate/preferred version.' });
        base += 5;
      }
    }

    return { category: 'Machine Readability', score: Math.min(base, 100), checks };
  }

  function checkEntity() {
    const checks = [];
    let base = 0;

    // Author detection
    const authorMeta = document.querySelector('meta[name="author"]');
    const authorJSON = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some(s => s.textContent.includes('"author"'));
    const bylineSel = document.querySelector('.author, .by-author, [rel="author"]');

    if (authorMeta || authorJSON || bylineSel) {
      checks.push({ status: 'pass', label: 'Author Detected', detail: 'Author information found.' });
      base += 15;
    } else {
      checks.push({ status: 'warn', label: 'No Author Information', detail: 'Consider adding author attribution.' });
      base += 3;
    }

    // datePublished / dateModified
    const datePublished = document.querySelector('meta[property="article:published_time"], time[datetime]');
    const dateModified = document.querySelector('meta[property="article:modified_time"]');
    const dateJSON = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some(s =>
      s.textContent.includes('datePublished') || s.textContent.includes('dateModified')
    );

    if (datePublished || dateJSON) {
      checks.push({ status: 'pass', label: 'Publication Date Found', detail: 'Publish date declared.' });
      base += 12;
    } else {
      checks.push({ status: 'warn', label: 'No Publication Date', detail: 'Missing datePublished.' });
      base += 3;
    }

    if (dateModified || dateJSON) {
      checks.push({ status: 'pass', label: 'Modification Date Found', detail: 'Update date declared.' });
      base += 10;
    } else {
      checks.push({ status: 'info', label: 'No Modification Date', detail: 'Optional but recommended.' });
      base += 3;
    }

    // About page link
    const aboutLink = Array.from(document.querySelectorAll('a')).find(a =>
      /about|about-us|nosotros|sobre|quem-somos/i.test(a.href) || /about|sobre|quem somos/i.test(a.innerText)
    );

    if (aboutLink) {
      checks.push({ status: 'pass', label: 'About Page Link', detail: 'Organization info accessible.' });
      base += 8;
    } else {
      checks.push({ status: 'info', label: 'No About Page Link', detail: 'Consider adding link to About.' });
      base += 2;
    }

    // Contact page link
    const contactLink = Array.from(document.querySelectorAll('a')).find(a =>
      /contact|contato|contatenos/i.test(a.href) || /contact|contato|fale conosco/i.test(a.innerText)
    );

    if (contactLink) {
      checks.push({ status: 'pass', label: 'Contact Page Link', detail: 'Contact info accessible.' });
      base += 8;
    } else {
      checks.push({ status: 'info', label: 'No Contact Page Link', detail: 'Consider adding contact page.' });
      base += 2;
    }

    // E-E-A-T patterns
    const textContent = getTextContent().toLowerCase();
    const experienceWords = /i tested|i used|from my experience|personally|years of experience|we created|we built|i created|i developed|tested|proven|verified/gi;
    const credentialWords = /md|phd|certified|certification|license|licensure|expert|specialist|professional|doctorate|degree/gi;

    const hasExperience = experienceWords.test(textContent);
    const hasCredentials = credentialWords.test(textContent);

    if (hasExperience && hasCredentials) {
      checks.push({ status: 'pass', label: 'E-E-A-T Signals Present', detail: 'Experience and credentials visible.' });
      base += 15;
    } else if (hasExperience || hasCredentials) {
      checks.push({ status: 'info', label: 'Partial E-E-A-T', detail: 'Only experience or credentials found.' });
      base += 8;
    } else {
      checks.push({ status: 'warn', label: 'Minimal E-E-A-T Signals', detail: 'Add credentials or experience info.' });
      base += 2;
    }

    // Contact completeness: phone, email, address
    const phoneRegex = /(\+?[0-9]{1,3}[-.\s]?)?(\([0-9]{2,4}\)|[0-9]{2,4})[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}/g;
    const emailRegex = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

    const hasPhone = phoneRegex.test(textContent);
    const hasEmail = emailRegex.test(textContent);
    const hasAddress = /street|avenue|avenue|road|suite|office|building|endereço|rua|avenida|número/i.test(textContent);

    const contactCount = [hasPhone, hasEmail, hasAddress].filter(x => x).length;

    if (contactCount === 3) {
      checks.push({ status: 'pass', label: 'Complete Contact Info', detail: 'Phone + email + address visible.' });
      base += 12;
    } else if (contactCount >= 1) {
      checks.push({ status: 'info', label: `Partial Contact (${contactCount}/3)`, detail: 'Some contact methods available.' });
      base += 5;
    } else {
      checks.push({ status: 'warn', label: 'No Contact Info', detail: 'Add phone, email, or address.' });
      base += 1;
    }

    return { category: 'Entity & Authority', score: Math.min(base, 100), checks };
  }

  function checkCitability() {
    const checks = [];
    let base = 0;

    // FAQ/Q&A content
    const faqs = document.querySelectorAll('details summary, .faq, [role="button"][aria-expanded]');
    if (faqs.length > 0) {
      checks.push({ status: 'pass', label: `FAQ Content (${faqs.length})`, detail: 'Expandable Q&A found.' });
      base += 15;
    } else {
      checks.push({ status: 'info', label: 'No FAQ Content', detail: 'Consider adding FAQ section.' });
      base += 3;
    }

    // Definition lists
    const dls = document.querySelectorAll('dl').length;
    if (dls > 0) {
      checks.push({ status: 'pass', label: `Definition Lists (${dls})`, detail: 'Semantic term definitions.' });
      base += 10;
    } else {
      checks.push({ status: 'info', label: 'No Definition Lists', detail: 'Optional for glossaries.' });
      base += 2;
    }

    // Tables with headers
    const tables = document.querySelectorAll('table');
    const tablesWithHeaders = Array.from(tables).filter(t => t.querySelector('thead') || t.querySelector('th'));

    if (tablesWithHeaders.length > 0) {
      checks.push({ status: 'pass', label: `Tables with Headers (${tablesWithHeaders.length})`, detail: 'Proper table structure.' });
      base += 12;
    } else if (tables.length > 0) {
      checks.push({ status: 'warn', label: `Tables Without Headers (${tables.length})`, detail: 'Add thead/th for clarity.' });
      base += 3;
    } else {
      checks.push({ status: 'info', label: 'No Tables', detail: 'Not applicable.' });
      base += 5;
    }

    // Lists
    const ols = document.querySelectorAll('ol').length;
    const uls = document.querySelectorAll('ul').length;
    const listCount = ols + uls;

    if (listCount > 0) {
      checks.push({ status: 'pass', label: `Lists (${listCount})`, detail: `${ols} ordered, ${uls} unordered.` });
      base += 12;
    } else {
      checks.push({ status: 'info', label: 'No Lists', detail: 'Consider using lists for clarity.' });
      base += 3;
    }

    // First paragraph length
    const firstP = document.querySelector('p');
    const firstPText = firstP ? (firstP.innerText || firstP.textContent || '').trim() : '';
    const firstPLen = firstPText.length;

    if (firstPLen >= 40 && firstPLen <= 300) {
      checks.push({ status: 'pass', label: `Strong Opening (${firstPLen} chars)`, detail: 'First paragraph is substantial.' });
      base += 12;
    } else if (firstPLen > 0) {
      checks.push({ status: 'info', label: `Opening Length (${firstPLen})`, detail: firstPLen < 40 ? 'Too short' : 'Very long' });
      base += 5;
    } else {
      checks.push({ status: 'warn', label: 'No Opening Paragraph', detail: 'Add introductory text.' });
      base += 1;
    }

    // Headings with IDs (for deep-linking)
    const headingsWithIds = document.querySelectorAll('h2[id], h3[id], h4[id]').length;
    const totalHeadings = document.querySelectorAll('h2, h3, h4').length;

    if (headingsWithIds === totalHeadings && totalHeadings > 0) {
      checks.push({ status: 'pass', label: 'All Headings Linkable', detail: 'All H2-H4 have IDs.' });
      base += 12;
    } else if (headingsWithIds > 0) {
      checks.push({ status: 'info', label: `Partial Heading IDs (${headingsWithIds}/${totalHeadings})`, detail: 'Add IDs to all headings.' });
      base += 5;
    } else {
      checks.push({ status: 'warn', label: 'No Heading IDs', detail: 'Add ID attributes to headings for linking.' });
      base += 2;
    }

    // Direct answer patterns
    const textContent = getTextContent();
    const hasDirectAnswer = /^(yes|no|there are|the answer is|you need|you should|you can|the best|the main|the key|the reason)/im.test(textContent);

    if (hasDirectAnswer) {
      checks.push({ status: 'pass', label: 'Direct Answer Format', detail: 'Content starts with clear answer.' });
      base += 10;
    } else {
      checks.push({ status: 'info', label: 'No Direct Answer', detail: 'Consider starting with direct answer.' });
      base += 3;
    }

    // Summary sections
    const summary = document.querySelector('.summary, .tldr, .key-takeaway, .takeaway, summary');
    if (summary) {
      checks.push({ status: 'pass', label: 'Summary Section', detail: 'TL;DR or key takeaway present.' });
      base += 10;
    } else {
      checks.push({ status: 'info', label: 'No Summary Section', detail: 'Consider adding TL;DR.' });
      base += 3;
    }

    // Step-by-step instructions
    const steps = document.querySelectorAll('ol li');
    if (steps.length >= 3) {
      checks.push({ status: 'pass', label: `Step-by-Step (${steps.length})`, detail: 'Instructions have clear steps.' });
      base += 10;
    } else {
      checks.push({ status: 'info', label: 'Limited Steps', detail: 'Consider breaking into clear steps.' });
      base += 2;
    }

    return { category: 'Citability & Answer-Readiness', score: Math.min(base, 100), checks };
  }

  function checkPerformance() {
    const checks = [];
    let base = 0;

    // Images without width/height
    const images = document.querySelectorAll('img');
    const imgsNoWH = Array.from(images).filter(img => !img.hasAttribute('width') || !img.hasAttribute('height'));
    const whRatio = images.length > 0 ? ((images.length - imgsNoWH.length) / images.length * 100).toFixed(0) : 100;

    if (whRatio === '100') {
      checks.push({ status: 'pass', label: 'All Images Have Dimensions', detail: 'Width/height prevents CLS.' });
      base += 15;
    } else if (whRatio >= 80) {
      checks.push({ status: 'warn', label: `Missing W/H (${100 - whRatio}%)`, detail: `${imgsNoWH.length} images lack dimensions.` });
      base += 5;
    } else {
      checks.push({ status: 'fail', label: 'Many Images Missing W/H', detail: 'High CLS risk.' });
      base += 1;
    }

    // Images without loading="lazy"
    const imgsNoLazy = Array.from(images).filter(img => !img.hasAttribute('loading') || img.getAttribute('loading') !== 'lazy');
    const lazyRatio = images.length > 0 ? ((images.length - imgsNoLazy.length) / images.length * 100).toFixed(0) : 100;

    if (lazyRatio >= 80) {
      checks.push({ status: 'pass', label: `Lazy Loading (${lazyRatio}%)`, detail: 'Most images are lazy-loaded.' });
      base += 12;
    } else if (lazyRatio > 0) {
      checks.push({ status: 'info', label: `Limited Lazy Loading (${lazyRatio}%)`, detail: 'Add loading="lazy" to images.' });
      base += 3;
    } else {
      checks.push({ status: 'warn', label: 'No Lazy Loading', detail: 'Implement lazy loading for images.' });
      base += 1;
    }

    // Render-blocking scripts
    const scripts = document.querySelectorAll('script');
    const blockingScripts = Array.from(scripts).filter(s => {
      const src = s.getAttribute('src');
      const type = s.getAttribute('type');
      const isDeferred = s.hasAttribute('defer') || s.hasAttribute('async');
      const isModule = type === 'module';

      return src && !isDeferred && !isModule;
    });

    if (blockingScripts.length === 0) {
      checks.push({ status: 'pass', label: 'No Render-Blocking Scripts', detail: 'All scripts are defer/async/module.' });
      base += 15;
    } else {
      checks.push({ status: 'warn', label: `Blocking Scripts (${blockingScripts.length})`, detail: 'Add defer/async attributes.' });
      base += 3;
    }

    // Font-display: swap detection
    const styles = document.querySelectorAll('style');
    const hasSwap = Array.from(styles).some(s => s.textContent.includes('font-display: swap'));

    if (hasSwap) {
      checks.push({ status: 'pass', label: 'Font Display: Swap', detail: 'Prevents FOIT.' });
      base += 10;
    } else {
      checks.push({ status: 'info', label: 'Font Display Not Optimized', detail: 'Consider adding font-display: swap.' });
      base += 3;
    }

    // DOM size
    const elementCount = document.querySelectorAll('*').length;
    let domStatus = 'good';
    let domScore = 15;

    if (elementCount > 3000) {
      checks.push({ status: 'fail', label: `Large DOM (${elementCount} nodes)`, detail: 'May impact performance.' });
      domScore = 3;
    } else if (elementCount > 1500) {
      checks.push({ status: 'warn', label: `Medium DOM (${elementCount} nodes)`, detail: 'Approaching limits.' });
      domScore = 8;
    } else {
      checks.push({ status: 'pass', label: `Reasonable DOM (${elementCount} nodes)`, detail: 'Efficient structure.' });
      domScore = 15;
    }
    base += domScore;

    return { category: 'Performance & Crawlability', score: Math.min(base, 100), checks };
  }

  function checkWebMCP() {
    const checks = [];
    let base = 0;

    // WebMCP forms
    const forms = document.querySelectorAll('form[toolname]');
    const formCount = forms.length;

    if (formCount > 0) {
      checks.push({ status: 'pass', label: `WebMCP Forms (${formCount})`, detail: 'Page has interactive tools.' });
      base += 30;
    } else {
      checks.push({ status: 'info', label: 'No WebMCP Forms', detail: 'Page does not use WebMCP.' });
      base += 0;
    }

    // navigator.modelContext API
    const hasModelContext = !!window.navigator.modelContext;
    if (hasModelContext) {
      checks.push({ status: 'pass', label: 'Model Context API Available', detail: 'navigator.modelContext detected.' });
      base += 15;
    } else {
      checks.push({ status: 'info', label: 'No Model Context API', detail: 'Not using advanced agent integration.' });
      base += 0;
    }

    // WebMCP SDK detection
    const hasMCPSDK = Array.from(document.querySelectorAll('script')).some(s => {
      const src = s.getAttribute('src') || '';
      return /webmcp|model-context|mcp-sdk/i.test(src);
    });

    if (hasMCPSDK) {
      checks.push({ status: 'pass', label: 'WebMCP SDK Loaded', detail: 'SDK script detected.' });
      base += 15;
    } else {
      checks.push({ status: 'info', label: 'No WebMCP SDK', detail: 'Not loading WebMCP SDK.' });
      base += 0;
    }

    // Schema potentialAction
    const hasPotentialAction = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some(s =>
      s.textContent.includes('potentialAction')
    );

    if (hasPotentialAction) {
      checks.push({ status: 'pass', label: 'Schema potentialAction', detail: 'Action schema present.' });
      base += 10;
    } else {
      checks.push({ status: 'info', label: 'No potentialAction Schema', detail: 'Optional for tool integration.' });
      base += 0;
    }

    // Recommendations based on page type
    const hasMainContent = !!document.querySelector('main');
    const hasArticleSchema = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some(s =>
      s.textContent.includes('Article')
    );

    if (hasMainContent && hasArticleSchema && formCount === 0) {
      checks.push({ status: 'info', label: 'Opportunity: Interactive Tools', detail: 'Consider adding WebMCP forms for engagement.' });
      base += 5;
    }

    // If no tools/forms: return high base score
    if (formCount === 0 && !hasModelContext && !hasMCPSDK) {
      checks.push({ status: 'info', label: 'WebMCP Not Applicable', detail: 'Page does not use agent interactivity.' });
      base = 80;
    }

    return { category: 'Agent Interactivity', score: Math.min(base, 100), checks };
  }

  function checkContentPositioning() {
    const checks = [];
    let base = 0;

    const textContent = getTextContent().toLowerCase();

    // Brand differentiation signals
    const differentiationWords = /only|first|leading|unique|patented|proprietary|vs\.|compared to|advantage|edge|differ/gi;
    const diffMatches = textContent.match(differentiationWords) || [];
    const hasDiff = diffMatches.length > 0;

    if (diffMatches.length >= 3) {
      checks.push({ status: 'pass', label: `Clear Differentiation (${diffMatches.length})`, detail: 'Multiple competitive signals.' });
      base += 15;
    } else if (hasDiff) {
      checks.push({ status: 'info', label: `Some Differentiation (${diffMatches.length})`, detail: 'Limited unique positioning.' });
      base += 8;
    } else {
      checks.push({ status: 'warn', label: 'Weak Differentiation', detail: 'No clear competitive positioning.' });
      base += 2;
    }

    // Specificity & proof
    const proofWords = /\d+%|increased by|\$\d+|decreased by|million|thousand|growth|proven|case study|results|study/gi;
    const proofMatches = textContent.match(proofWords) || [];

    if (proofMatches.length >= 5) {
      checks.push({ status: 'pass', label: `Strong Proof (${proofMatches.length})`, detail: 'Metrics and evidence present.' });
      base += 15;
    } else if (proofMatches.length > 0) {
      checks.push({ status: 'info', label: `Some Proof (${proofMatches.length})`, detail: 'Limited data/evidence.' });
      base += 8;
    } else {
      checks.push({ status: 'warn', label: 'No Proof Signals', detail: 'Add metrics and evidence.' });
      base += 2;
    }

    // Problem-Solution framing
    const problemWords = /problem|challenge|issue|struggle|difficult|fail|lack|missing|gap/gi;
    const solutionWords = /solution|solve|fix|resolve|help|support|enable|improve|achieve|gain|benefit/gi;
    const outcomeWords = /result|outcome|success|growth|transform|achieve|improve|save|increase|boost/gi;

    const problemCount = (textContent.match(problemWords) || []).length;
    const solutionCount = (textContent.match(solutionWords) || []).length;
    const outcomeCount = (textContent.match(outcomeWords) || []).length;

    const hasFraming = problemCount > 0 && solutionCount > 0 && outcomeCount > 0;

    if (hasFraming && problemCount >= 3) {
      checks.push({ status: 'pass', label: 'Problem-Solution-Outcome Arc', detail: 'Clear narrative structure.' });
      base += 15;
    } else if (hasFraming) {
      checks.push({ status: 'info', label: 'Partial Problem-Solution', detail: 'Some elements present.' });
      base += 8;
    } else {
      checks.push({ status: 'warn', label: 'No Clear Arc', detail: 'Use problem→solution→outcome narrative.' });
      base += 2;
    }

    // Social proof
    const testimonials = document.querySelectorAll('.testimonial, .quote, blockquote, [role="quote"]').length;
    const ratings = document.querySelector('[itemtype*="Rating"], .stars, [role="img"][aria-label*="star"]') ? 1 : 0;
    const logos = document.querySelectorAll('.logo-wall, .clients, .partners').length;
    const awards = document.querySelectorAll('.award, .badge, [aria-label*="award"]').length;

    const proofCount = [testimonials > 0 ? 1 : 0, ratings, logos, awards].filter(x => x).length;

    if (proofCount >= 3) {
      checks.push({ status: 'pass', label: `Strong Social Proof (${proofCount}/4)`, detail: 'Testimonials, ratings, logos, awards.' });
      base += 15;
    } else if (proofCount >= 1) {
      checks.push({ status: 'info', label: `Partial Social Proof (${proofCount}/4)`, detail: 'Limited trust signals.' });
      base += 8;
    } else {
      checks.push({ status: 'warn', label: 'No Social Proof', detail: 'Add testimonials, ratings, or awards.' });
      base += 2;
    }

    // Authority signals
    const authorityWords = /published in|certified|certification|iso|soc 2|partner|official|recognized/gi;
    const authMatches = textContent.match(authorityWords) || [];

    if (authMatches.length >= 2) {
      checks.push({ status: 'pass', label: `Authority Signals (${authMatches.length})`, detail: 'Credentials and partnerships.' });
      base += 10;
    } else if (authMatches.length > 0) {
      checks.push({ status: 'info', label: `Some Authority (${authMatches.length})`, detail: 'Limited credentials.' });
      base += 5;
    } else {
      checks.push({ status: 'warn', label: 'No Authority Signals', detail: 'Add certifications or partnerships.' });
      base += 1;
    }

    return { category: 'Content Positioning', score: Math.min(base, 100), checks };
  }

  function checkContentFreshness() {
    const checks = [];
    let base = 0;
    const textContent = getTextContent();

    // datePublished + dateModified presence
    const datePublished = document.querySelector('meta[property="article:published_time"]');
    const dateModified = document.querySelector('meta[property="article:modified_time"]');
    const jsonLDDate = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some(s =>
      s.textContent.includes('datePublished') || s.textContent.includes('dateModified')
    );

    if (datePublished || dateModified || jsonLDDate) {
      checks.push({ status: 'pass', label: 'Publish/Modified Dates Present', detail: 'Date metadata detected.' });
      base += 15;
    } else {
      checks.push({ status: 'warn', label: 'No Date Metadata', detail: 'Add datePublished/dateModified.' });
      base += 3;
    }

    // Content age estimation
    let ageAssessment = '';
    let ageScore = 0;

    const dateStr = dateModified?.getAttribute('content') || datePublished?.getAttribute('content');
    if (dateStr) {
      const date = new Date(dateStr);
      const ageMs = Date.now() - date.getTime();
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      const ageMonths = Math.floor(ageDays / 30);

      if (ageMonths <= 6) {
        ageAssessment = `Fresh (${ageMonths} months old)`;
        ageScore = 20;
      } else if (ageMonths <= 12) {
        ageAssessment = `Moderate (${ageMonths} months old)`;
        ageScore = 15;
      } else if (ageMonths <= 24) {
        ageAssessment = `Aging (${ageMonths} months old)`;
        ageScore = 8;
      } else {
        ageAssessment = `Stale (${ageMonths}+ months old)`;
        ageScore = 3;
      }

      checks.push({ status: ageScore >= 15 ? 'pass' : ageScore >= 8 ? 'warn' : 'info', label: `Content Age: ${ageAssessment}`, detail: dateStr });
      base += ageScore;
    } else {
      checks.push({ status: 'info', label: 'Content Age Unknown', detail: 'No date metadata found.' });
      base += 5;
    }

    // Temporal language: current year refs
    const currentYear = new Date().getFullYear();
    const yearRegex = /20\d{2}/g;
    const yearMatches = textContent.match(yearRegex) || [];
    const currentYearRefs = yearMatches.filter(y => parseInt(y) === currentYear).length;
    const oldYearRefs = yearMatches.filter(y => parseInt(y) < currentYear - 3).length;

    if (currentYearRefs >= 2) {
      checks.push({ status: 'pass', label: `Current Year References (${currentYearRefs})`, detail: 'Content references ${currentYear}.' });
      base += 10;
    } else if (oldYearRefs > 0) {
      checks.push({ status: 'warn', label: `Outdated References (${oldYearRefs})`, detail: `References to years before ${currentYear - 3}.` });
      base += 2;
    } else {
      checks.push({ status: 'info', label: 'No Year References', detail: 'Content is timeless.' });
      base += 5;
    }

    // Copyright year in footer
    const footer = document.querySelector('footer');
    const footerText = footer ? (footer.innerText || footer.textContent || '').toLowerCase() : '';
    const copyrightMatch = footerText.match(/©\s*(\d{4})/);
    const copyrightYear = copyrightMatch ? copyrightMatch[1] : '';

    if (copyrightYear === String(currentYear)) {
      checks.push({ status: 'pass', label: `Current Copyright Year (${currentYear})`, detail: 'Footer is up-to-date.' });
      base += 8;
    } else if (copyrightYear) {
      checks.push({ status: 'warn', label: `Outdated Copyright (${copyrightYear})`, detail: `Should be ${currentYear}.` });
      base += 2;
    } else {
      checks.push({ status: 'info', label: 'No Copyright Year', detail: 'Not critical but consider adding.' });
      base += 3;
    }

    // Version/changelog signals
    const versionWords = /v\d+\.\d+|changelog|release notes|update|latest|version|new features|improvements/gi;
    const versionMatches = textContent.match(versionWords) || [];

    if (versionMatches.length > 0) {
      checks.push({ status: 'pass', label: `Version/Changelog Signals (${versionMatches.length})`, detail: 'Active maintenance visible.' });
      base += 8;
    }

    return { category: 'Content Freshness', score: Math.min(base, 100), checks };
  }

  function checkInformationDensity() {
    const checks = [];
    let base = 0;

    const textContent = getTextContent();
    const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;

    // Info density: sentences with numbers, "because", "according to"
    const infoWords = /\d+|because|according to|research|study|data|evidence|prove/gi;
    const infoSentences = sentences.filter(s => infoWords.test(s)).length;
    const infoDensity = sentences.length > 0 ? (infoSentences / sentences.length * 100).toFixed(0) : 0;

    if (infoDensity >= 40) {
      checks.push({ status: 'pass', label: `High Info Density (${infoDensity}%)`, detail: 'Content is data-rich.' });
      base += 15;
    } else if (infoDensity >= 20) {
      checks.push({ status: 'info', label: `Moderate Info Density (${infoDensity}%)`, detail: 'Mix of narrative and data.' });
      base += 8;
    } else {
      checks.push({ status: 'warn', label: `Low Info Density (${infoDensity}%)`, detail: 'Add more data and evidence.' });
      base += 2;
    }

    // Self-contained sections: H2 sections with 150-500 words
    const h2s = document.querySelectorAll('h2');
    let wellStructuredH2s = 0;

    h2s.forEach(h2 => {
      let sectionText = '';
      let el = h2.nextElementSibling;
      while (el && !el.matches('h1, h2')) {
        sectionText += (el.innerText || el.textContent || '');
        el = el.nextElementSibling;
      }
      const sectionWords = sectionText.split(/\s+/).filter(w => w.length > 0).length;
      if (sectionWords >= 150 && sectionWords <= 500) {
        wellStructuredH2s++;
      }
    });

    if (wellStructuredH2s >= Math.floor(h2s.length / 2) && h2s.length > 0) {
      checks.push({ status: 'pass', label: `Well-Structured Sections (${wellStructuredH2s}/${h2s.length})`, detail: 'Balanced section lengths.' });
      base += 15;
    } else if (h2s.length > 0) {
      checks.push({ status: 'info', label: `Section Structure (${wellStructuredH2s}/${h2s.length})`, detail: 'Some sections need balancing.' });
      base += 8;
    } else {
      checks.push({ status: 'warn', label: 'No H2 Sections', detail: 'Add subheadings to structure content.' });
      base += 2;
    }

    // Claim-evidence pairing
    const claimWords = /claim|state|argue|suggest|believe|find|show|indicate|demonstrate/gi;
    const claimSentences = sentences.filter(s => claimWords.test(s)).length;
    const claimWithEvidence = Math.floor(claimSentences * 0.5);

    if (claimWithEvidence >= 3) {
      checks.push({ status: 'pass', label: `Claim-Evidence Pairs (${claimWithEvidence}+)`, detail: 'Claims are backed by data.' });
      base += 12;
    } else if (claimSentences > 0) {
      checks.push({ status: 'info', label: `Limited Evidence (${claimWithEvidence})`, detail: 'Add data to support claims.' });
      base += 5;
    }

    // Semantic foam detection (buzzwords without substance)
    const buzzwords = /world-class|synergy|leverage|seamless|cutting-edge|industry-leading|innovative|best-in-class/gi;
    const buzzMatches = textContent.match(buzzwords) || [];

    if (buzzMatches.length === 0) {
      checks.push({ status: 'pass', label: 'No Semantic Foam', detail: 'Avoids hollow buzzwords.' });
      base += 10;
    } else if (buzzMatches.length <= 3) {
      checks.push({ status: 'info', label: `Some Buzzwords (${buzzMatches.length})`, detail: 'Replace with concrete language.' });
      base += 5;
    } else {
      checks.push({ status: 'warn', label: `Heavy Buzzwords (${buzzMatches.length})`, detail: 'Replace vague terms with specifics.' });
      base += 1;
    }

    // Content-to-boilerplate ratio
    const allHTML = document.body.innerHTML;
    const boilerplatePatterns = /header|footer|nav|aside|disclaimer|cookie|privacy|terms|advertisement/gi;
    const boilerplateEstimate = (allHTML.match(boilerplatePatterns) || []).length;
    const contentRatio = wordCount / Math.max(allHTML.length, 1);

    if (contentRatio > 0.15) {
      checks.push({ status: 'pass', label: 'High Content Ratio', detail: 'Content-heavy page.' });
      base += 10;
    } else if (contentRatio > 0.08) {
      checks.push({ status: 'info', label: 'Balanced Content Ratio', detail: 'Moderate boilerplate.' });
      base += 5;
    } else {
      checks.push({ status: 'warn', label: 'Low Content Ratio', detail: 'Heavy boilerplate reduces signal.' });
      base += 1;
    }

    return { category: 'Information Density', score: Math.min(base, 100), checks };
  }

  function checkVerifiability() {
    const checks = [];
    let base = 0;

    const textContent = getTextContent();

    // External citation links (authority domains)
    const links = Array.from(document.querySelectorAll('a[href]'));
    const authorityDomains = /\.gov|\.edu|\.org|scholar\.google|pubmed|arxiv|doi\.org/i;
    const authorityLinks = links.filter(a => {
      try {
        const url = new URL(a.getAttribute('href'), window.location.origin);
        return authorityDomains.test(url.hostname);
      } catch {
        return false;
      }
    });

    if (authorityLinks.length >= 3) {
      checks.push({ status: 'pass', label: `Authority Citations (${authorityLinks.length})`, detail: 'Links to .gov/.edu/.org sources.' });
      base += 20;
    } else if (authorityLinks.length > 0) {
      checks.push({ status: 'info', label: `Some Citations (${authorityLinks.length})`, detail: 'Limited authoritative sources.' });
      base += 10;
    } else {
      checks.push({ status: 'warn', label: 'No Authority Links', detail: 'Add citations to credible sources.' });
      base += 2;
    }

    // Source attribution text
    const attributionPatterns = /according to|a study by|published in|research shows|data from|source:|citation:|reference:|footnote/gi;
    const attributionMatches = textContent.match(attributionPatterns) || [];

    if (attributionMatches.length >= 3) {
      checks.push({ status: 'pass', label: `Source Attribution (${attributionMatches.length})`, detail: 'Clear citations throughout.' });
      base += 15;
    } else if (attributionMatches.length > 0) {
      checks.push({ status: 'info', label: `Limited Attribution (${attributionMatches.length})`, detail: 'Add "according to" and citations.' });
      base += 8;
    } else {
      checks.push({ status: 'warn', label: 'No Attribution', detail: 'Attribute claims to sources.' });
      base += 2;
    }

    // Semantic cite elements
    const cites = document.querySelectorAll('cite').length;
    const footnotes = document.querySelectorAll('sup, [role="doc-noteref"]').length;

    if (cites >= 2 || footnotes >= 2) {
      checks.push({ status: 'pass', label: `Semantic Citations (${cites} cite + ${footnotes} notes)`, detail: 'Proper cite markup.' });
      base += 12;
    } else if (cites > 0 || footnotes > 0) {
      checks.push({ status: 'info', label: `Some Citations (${cites + footnotes})`, detail: 'Consider using more cite elements.' });
      base += 6;
    } else {
      checks.push({ status: 'warn', label: 'No Cite Elements', detail: 'Use <cite> for references.' });
      base += 1;
    }

    // Data attribution: methodology, PDF links
    const dataLinksPattern = /methodology|research|methodology link|pdf|white ?paper|data|download/gi;
    const dataLinks = links.filter(a => dataLinksPattern.test(a.innerText));

    if (dataLinks.length >= 2) {
      checks.push({ status: 'pass', label: `Data Attribution Links (${dataLinks.length})`, detail: 'Methods and data accessible.' });
      base += 12;
    } else if (dataLinks.length > 0) {
      checks.push({ status: 'info', label: `Limited Data Access (${dataLinks.length})`, detail: 'Add methodology/data links.' });
      base += 5;
    } else {
      checks.push({ status: 'warn', label: 'No Data Links', detail: 'Link to methodology and data.' });
      base += 1;
    }

    // Authority link quality assessment
    let highAuthority = 0;
    let mediumAuthority = 0;

    authorityLinks.forEach(a => {
      try {
        const url = new URL(a.getAttribute('href'), window.location.origin);
        if (url.hostname.includes('.edu') || url.hostname.includes('.gov')) highAuthority++;
        else mediumAuthority++;
      } catch {
        mediumAuthority++;
      }
    });

    if (highAuthority >= 2) {
      checks.push({ status: 'pass', label: 'High-Authority Sources', detail: '.edu and .gov links present.' });
      base += 10;
    } else if (mediumAuthority >= 2) {
      checks.push({ status: 'info', label: 'Medium-Authority Sources', detail: '.org and specialized domains.' });
      base += 5;
    }

    return { category: 'Factual Verifiability', score: Math.min(base, 100), checks };
  }

  function checkComprehensiveness() {
    const checks = [];
    let base = 0;

    const textContent = getTextContent();
    const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;

    // Word count vs page type expectations
    let typeExpectation = 500;
    let expectedRange = '300-2000';

    if (document.querySelector('article, [role="article"]')) {
      typeExpectation = 1500;
      expectedRange = '800-5000';
    } else if (document.querySelector('[itemtype*="Product"]')) {
      typeExpectation = 1000;
      expectedRange = '300-2000';
    }

    if (wordCount >= typeExpectation * 0.8 && wordCount <= typeExpectation * 2) {
      checks.push({ status: 'pass', label: `Comprehensive Word Count (${wordCount})`, detail: `Within ${expectedRange} range.` });
      base += 18;
    } else if (wordCount >= typeExpectation * 0.5) {
      checks.push({ status: 'info', label: `Adequate Word Count (${wordCount})`, detail: `Below typical ${expectedRange}.` });
      base += 10;
    } else {
      checks.push({ status: 'warn', label: `Thin Content (${wordCount})`, detail: `Expected ${expectedRange}.` });
      base += 3;
    }

    // Heading coverage expectation
    const expectedHeadings = Math.max(2, Math.floor(wordCount / 400));
    const h2s = document.querySelectorAll('h2').length;

    if (h2s >= expectedHeadings) {
      checks.push({ status: 'pass', label: `Heading Coverage (${h2s}/${expectedHeadings})`, detail: 'Adequate H2 structure.' });
      base += 15;
    } else if (h2s > 0) {
      checks.push({ status: 'info', label: `Limited Headings (${h2s}/${expectedHeadings})`, detail: 'Add more H2 sections.' });
      base += 8;
    } else {
      checks.push({ status: 'warn', label: 'No H2 Headings', detail: 'Add H2 subheadings.' });
      base += 2;
    }

    // Definition patterns
    const definitionPatterns = /is defined as|means|in other words|also known as|refers to|specifically/gi;
    const definitionMatches = textContent.match(definitionPatterns) || [];

    if (definitionMatches.length >= 2) {
      checks.push({ status: 'pass', label: `Definitions (${definitionMatches.length})`, detail: 'Key terms are explained.' });
      base += 12;
    } else if (definitionMatches.length > 0) {
      checks.push({ status: 'info', label: 'Limited Definitions', detail: 'Define key terms more clearly.' });
      base += 6;
    } else {
      checks.push({ status: 'warn', label: 'No Key Definitions', detail: 'Explain specialized terms.' });
      base += 2;
    }

    // Comparison coverage
    const tables = document.querySelectorAll('table').length;
    const comparisonPatterns = /versus|vs\.|pros and cons|comparison|alternative|compared to|instead of|rather than/gi;
    const comparisonMatches = textContent.match(comparisonPatterns) || [];

    if (tables >= 1 || comparisonMatches.length >= 3) {
      checks.push({ status: 'pass', label: `Comparison Coverage (${tables} tables, ${comparisonMatches.length} mentions)`, detail: 'Alternatives discussed.' });
      base += 12;
    } else if (comparisonMatches.length > 0) {
      checks.push({ status: 'info', label: `Limited Comparisons (${comparisonMatches.length})`, detail: 'Add comparison table or discussion.' });
      base += 6;
    } else {
      checks.push({ status: 'warn', label: 'No Comparisons', detail: 'Compare with alternatives.' });
      base += 2;
    }

    // Navigation signals: TOC, related content, summary
    const toc = document.querySelector('nav[role="doc-toc"], .table-of-contents, .toc');
    const related = document.querySelector('.related, .related-posts, [aria-label*="related"]');
    const summary = document.querySelector('.summary, .tldr, .key-takeaway');

    const navCount = [toc, related, summary].filter(x => x).length;

    if (navCount === 3) {
      checks.push({ status: 'pass', label: 'Full Navigation (TOC + Related + Summary)', detail: 'Excellent discoverability.' });
      base += 12;
    } else if (navCount >= 1) {
      checks.push({ status: 'info', label: `Partial Navigation (${navCount}/3)`, detail: 'Add TOC, related content, or summary.' });
      base += 6;
    } else {
      checks.push({ status: 'warn', label: 'No Navigation Aids', detail: 'Add TOC, related links, or summary.' });
      base += 2;
    }

    return { category: 'Content Comprehensiveness', score: Math.min(base, 100), checks };
  }

  function checkMultimodal() {
    const checks = [];
    let base = 0;

    // Image alt quality
    const images = document.querySelectorAll('img');
    const descriptiveAlts = Array.from(images).filter(img => {
      const alt = img.getAttribute('alt') || '';
      return alt.length > 5 && !/^(image|img|photo|banner|picture|png|jpg|pic)\d*/i.test(alt);
    });

    const altQuality = images.length > 0 ? (descriptiveAlts.length / images.length * 100).toFixed(0) : 100;

    if (altQuality >= 80) {
      checks.push({ status: 'pass', label: `Descriptive Image Alt (${altQuality}%)`, detail: 'Most images have good alt text.' });
      base += 18;
    } else if (altQuality >= 50) {
      checks.push({ status: 'info', label: `Partial Alt Quality (${altQuality}%)`, detail: 'Improve image descriptions.' });
      base += 8;
    } else {
      checks.push({ status: 'warn', label: `Generic Alt Text (${altQuality}%)`, detail: 'Add descriptive alt to images.' });
      base += 2;
    }

    // Figure/figcaption usage
    const figures = document.querySelectorAll('figure').length;
    const figcaptions = document.querySelectorAll('figcaption').length;

    if (figures > 0 && figcaptions === figures) {
      checks.push({ status: 'pass', label: `Proper Figures (${figures} with captions)`, detail: 'All figures have captions.' });
      base += 15;
    } else if (figures > 0) {
      checks.push({ status: 'info', label: `Figures Without Captions (${figures})`, detail: 'Add figcaption to figures.' });
      base += 8;
    } else {
      checks.push({ status: 'info', label: 'No Figure Elements', detail: 'Consider using <figure> tags.' });
      base += 3;
    }

    // Video/audio accessibility
    const videos = document.querySelectorAll('video');
    const audios = document.querySelectorAll('audio');
    const tracks = document.querySelectorAll('track').length;

    if (videos.length > 0 || audios.length > 0) {
      if (tracks >= videos.length + audios.length) {
        checks.push({ status: 'pass', label: `Accessible Media (${tracks} tracks)`, detail: 'All media has captions/descriptions.' });
        base += 15;
      } else {
        checks.push({ status: 'warn', label: `Media Without Tracks (${videos.length + audios.length - tracks})`, detail: 'Add captions or transcripts.' });
        base += 5;
      }
    } else {
      checks.push({ status: 'info', label: 'No Video/Audio', detail: 'Not applicable.' });
      base += 5;
    }

    // SVG descriptions
    const svgs = document.querySelectorAll('svg').length;
    const svgsWithDesc = Array.from(document.querySelectorAll('svg')).filter(svg => {
      return svg.querySelector('title') || svg.querySelector('desc') || svg.hasAttribute('aria-label');
    }).length;

    if (svgs > 0) {
      if (svgsWithDesc === svgs) {
        checks.push({ status: 'pass', label: `Accessible SVGs (${svgs}/with description)`, detail: 'All SVGs are labeled.' });
        base += 10;
      } else {
        checks.push({ status: 'warn', label: `SVGs Without Description (${svgs - svgsWithDesc}/${svgs})`, detail: 'Add title/desc to SVGs.' });
        base += 3;
      }
    } else {
      checks.push({ status: 'info', label: 'No SVGs', detail: 'Not applicable.' });
      base += 5;
    }

    // Image structured data
    const imageObjects = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some(s =>
      s.textContent.includes('ImageObject')
    );

    if (imageObjects) {
      checks.push({ status: 'pass', label: 'ImageObject Schema', detail: 'Images have structured data.' });
      base += 10;
    } else {
      checks.push({ status: 'info', label: 'No ImageObject Schema', detail: 'Consider adding image schema.' });
      base += 3;
    }

    return { category: 'Multimodal Content', score: Math.min(base, 100), checks };
  }

  // ============================================================================
  // MAIN ANALYSIS EXECUTION
  // ============================================================================

  const schemas = parseJSON_LD();
  const microdata = countMicrodata();

  const categories = [
    checkStructuredData(schemas),
    checkSemanticHTML(),
    checkAccessibility(),
    checkInternalLinking(),
    checkMeta(),
    checkMachineReadability(),
    checkEntity(),
    checkCitability(),
    checkPerformance(),
    checkWebMCP(),
    checkContentPositioning(),
    checkContentFreshness(),
    checkInformationDensity(),
    checkVerifiability(),
    checkComprehensiveness(),
    checkMultimodal()
  ];

  // Weighted score calculation
  const weights = {
    'Structured Data & Schema': 1.5,
    'Semantic HTML': 1.2,
    'Machine Readability': 1.5,
    'Citability & Answer-Readiness': 1.3,
    'Content Positioning': 1.2,
    'Accessibility for Agents': 1.0,
    'Internal Linking': 1.0,
    'Meta & Discoverability': 1.0,
    'Entity & Authority': 1.0,
    'Information Density': 1.0,
    'Content Freshness': 0.8,
    'Factual Verifiability': 0.8,
    'Content Comprehensiveness': 0.8,
    'Performance & Crawlability': 0.3,
    'Agent Interactivity': 0.2,
    'Multimodal Content': 0.5
  };

  let weightedSum = 0;
  let totalWeight = 0;

  categories.forEach(cat => {
    const weight = weights[cat.category] || 1.0;
    weightedSum += cat.score * weight;
    totalWeight += weight;
  });

  const overallScore = Math.round(weightedSum / totalWeight);

  // Legacy field extraction
  const titleEl = document.querySelector('title');
  const descEl = document.querySelector('meta[name="description"]');
  const canonicalEl = document.querySelector('link[rel="canonical"]');
  const robotsEl = document.querySelector('meta[name="robots"]');
  const ogTitleEl = document.querySelector('meta[property="og:title"]');
  const ogDescEl = document.querySelector('meta[property="og:description"]');
  const ogImageEl = document.querySelector('meta[property="og:image"]');
  const twitterCardEl = document.querySelector('meta[name="twitter:card"]');

  const hreflangs = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]')).map(el => ({
    hreflang: el.getAttribute('hreflang'),
    href: el.getAttribute('href')
  }));

  // Campos adicionais para Overview
  const keywordsEl  = document.querySelector('meta[name="keywords"]');
  const authorEl    = document.querySelector('meta[name="author"]') || document.querySelector('meta[property="article:author"]');
  const publisherEl = document.querySelector('meta[property="og:site_name"]') || document.querySelector('meta[name="publisher"]') || document.querySelector('link[rel="publisher"]');
  const manifestEl  = document.querySelector('link[rel="manifest"]');
  const keywords    = keywordsEl?.getAttribute('content') || '';
  const publisher   = publisherEl?.getAttribute('content') || publisherEl?.getAttribute('href') || '';
  const htmlLang    = document.documentElement.getAttribute('lang') || '';
  const manifestUrl = manifestEl ? new URL(manifestEl.getAttribute('href') || '', window.location.href).href : '';

  // Word count: texto visível do body, excluindo script/style/nav/footer
  const mainContent = document.querySelector('main, article, [role="main"]') || document.body;
  const clone = mainContent.cloneNode(true);
  clone.querySelectorAll('script, style, nav, footer, header, noscript').forEach(el => el.remove());
  const wordCount = (clone.textContent || '').trim().split(/\s+/).filter(w => w.length > 1).length;

  const h1s = document.querySelectorAll('h1');
  const h2s = document.querySelectorAll('h2');
  const h3s = document.querySelectorAll('h3');
  const h4s = document.querySelectorAll('h4');
  const h5s = document.querySelectorAll('h5');
  const h6s = document.querySelectorAll('h6');

  const headingNodes = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h, idx) => {
    // Conta conteúdo imediatamente após este heading até o próximo heading
    // Baseado em passage indexing (Patent US10592553B1): cada H2 = mini-documento
    let el = h.nextElementSibling;
    let pCount = 0, listCount = 0, imgCount = 0, wordsBelow = 0;
    while (el && !el.matches('h1,h2,h3,h4,h5,h6')) {
      if (el.matches('p')) {
        pCount++;
        wordsBelow += (el.textContent || '').split(/\s+/).filter(Boolean).length;
      }
      if (el.matches('ul,ol')) { listCount++; wordsBelow += (el.textContent || '').split(/\s+/).filter(Boolean).length; }
      if (el.matches('img,figure,picture')) imgCount++;
      // Também captura conteúdo em divs imediatos
      if (el.matches('div,section,article') && !el.matches('h1,h2,h3,h4,h5,h6')) {
        wordsBelow += (el.textContent || '').split(/\s+/).filter(Boolean).length;
      }
      el = el.nextElementSibling;
    }
    return {
      level:      h.tagName.toLowerCase(),
      text:       (h.innerText || h.textContent || '').trim(),
      idx,
      pCount,      // parágrafos diretos abaixo (passage completeness)
      listCount,   // listas abaixo (snippet signal)
      imgCount,    // imagens abaixo
      wordsBelow,  // palavras totais de conteúdo abaixo
      hasBold:     h.querySelector('strong,b') !== null,  // avgTermWeight (Google Leak)
      hasNumber:   /\d/.test(h.textContent || ''),        // especificidade E-E-A-T
    };
  });

  const links = document.querySelectorAll('a[href]');
  let internalCount = 0;
  let externalCount = 0;
  let nofollowCount = 0;
  const currentHost = window.location.hostname;
  const linkNodes = []; // dados completos para a aba Links

  links.forEach(link => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

    const anchor = (link.innerText || link.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 200);
    const rel = link.getAttribute('rel') || '';
    const nofollow = rel.includes('nofollow');
    let isInternal = false;
    let resolvedHref = href;

    let isSubdomain = false;
    try {
      const url = new URL(href, window.location.origin);
      isInternal = url.hostname === currentHost;
      // subdomain: mesmo domínio raiz mas hostname diferente (ex: blog.site.com vs site.com)
      if (!isInternal && !href.startsWith('/')) {
        const rootHost = currentHost.split('.').slice(-2).join('.');
        const linkRoot = url.hostname.split('.').slice(-2).join('.');
        if (rootHost === linkRoot && url.hostname !== currentHost) isSubdomain = true;
      }
      resolvedHref = isInternal ? url.pathname + url.search : url.href;
    } catch {
      isInternal = href.startsWith('/') || !href.startsWith('http');
    }

    if (nofollow) nofollowCount++;
    if (isInternal) internalCount++; else externalCount++;

    linkNodes.push({
      href: resolvedHref,
      anchor,
      isInternal,
      isSubdomain,
      nofollow,
      rel,
    });
  });

  // ── Coleta exaustiva de todas as imagens da página ──────────────
  // Estratégia multi-fonte para capturar img, picture/source, e lazy loaders

  function resolveImgSrc(img) {
    // Prioridade: src real carregado > data-src lazy > outros atributos lazy > currentSrc
    const candidates = [
      img.getAttribute('src'),
      img.getAttribute('data-src'),
      img.getAttribute('data-lazy-src'),
      img.getAttribute('data-original'),
      img.getAttribute('data-url'),
      img.getAttribute('data-image'),
      img.getAttribute('data-img'),
      img.getAttribute('data-lazy'),
      img.currentSrc,
    ];
    for (const c of candidates) {
      if (c && c.trim() && !c.startsWith('data:image/gif') && c !== 'about:blank' && c.length > 5) {
        return c.trim();
      }
    }
    return '';
  }

  // Coleta <img> tags
  const imgEls = Array.from(document.querySelectorAll('img'));

  // Coleta <picture><source> — srcset de fontes alternativas
  // Associa cada source ao seu <img> pai para não duplicar
  const pictureSourceMap = new Map(); // img element → melhor src do source
  document.querySelectorAll('picture').forEach(pic => {
    const img = pic.querySelector('img');
    if (!img) return;
    const sources = pic.querySelectorAll('source');
    for (const src of sources) {
      const srcset = src.getAttribute('srcset') || '';
      const firstSrc = srcset.split(',')[0].trim().split(' ')[0];
      if (firstSrc && !firstSrc.startsWith('data:')) {
        pictureSourceMap.set(img, firstSrc);
        break;
      }
    }
  });

  // Deduplica por src para não contar a mesma imagem duas vezes
  const seenSrcs = new Set();

  const imgNodes = imgEls.map(img => {
    let src = resolveImgSrc(img);

    // Se a tag está dentro de <picture>, prefere o src do source se for mais específico
    const pictureSrc = pictureSourceMap.get(img);
    if (pictureSrc && (!src || src.endsWith('placeholder') || src.includes('blank'))) {
      src = pictureSrc;
    }

    if (!src || src.startsWith('data:') || src.length < 5) return null;

    // Normaliza para deduplicação (remove query string e hash)
    const normalized = src.split('?')[0].split('#')[0];
    if (seenSrcs.has(normalized)) return null;
    seenSrcs.add(normalized);

    const alt = img.getAttribute('alt') || '';
    const cleanSrc = normalized.toLowerCase();
    const ext = cleanSrc.split('.').pop() || '';
    const isModernFormat = ['webp','avif','jxl'].includes(ext);
    const isSVG = ext === 'svg' || src.startsWith('data:image/svg');
    if (isSVG) return null;

    const hasAlt = img.hasAttribute('alt') && alt.trim().length > 0;
    const isDecorative = img.getAttribute('role') === 'presentation' ||
                         img.getAttribute('aria-hidden') === 'true';
    const isGenericAlt = hasAlt && /^(image|img|photo|banner|picture|png|jpg|jpeg|gif|pic|foto|imagem|logo|icon|arrow|button|bg|background|undefined|null|_)\d*$/i.test(alt.trim());

    const natW = img.naturalWidth  || 0;
    const natH = img.naturalHeight || 0;
    const dispW = img.getAttribute('width')  ? parseInt(img.getAttribute('width'))  : (img.offsetWidth  || 0);
    const dispH = img.getAttribute('height') ? parseInt(img.getAttribute('height')) : (img.offsetHeight || 0);
    const hasDimAttrs = img.hasAttribute('width') && img.hasAttribute('height');
    const oversized   = natW > 0 && dispW > 0 && natW > dispW * 2.5;

    const loading = img.getAttribute('loading') || '';
    const isLazy  = loading === 'lazy' ||
                    img.hasAttribute('data-src') || img.hasAttribute('data-lazy-src') ||
                    img.hasAttribute('data-lazy') || img.hasAttribute('data-original');

    const rect     = img.getBoundingClientRect();
    const aboveFold = rect.top < window.innerHeight;

    return {
      src: src.length > 300 ? src.substring(0, 300) + '…' : src,
      alt,
      hasAlt,
      isGenericAlt,
      isDecorative,
      isModernFormat,
      isSVG: false,
      ext: ext || '?',
      natW, natH,
      dispW, dispH,
      hasDimAttrs,
      oversized,
      isLazy,
      aboveFold,
    };
  }).filter(Boolean).slice(0, 300);

  const imgsWithoutAlt = imgNodes.filter(i => !i.hasAlt);

  // Return comprehensive results object
  return {
    overallScore,
    url: window.location.href,
    title: titleEl?.innerText || '',
    titleLen: titleEl?.innerText?.length || 0,
    description: descEl?.getAttribute('content') || '',
    descLen: descEl?.getAttribute('content')?.length || 0,
    canonical: canonicalEl?.getAttribute('href') || '',
    robots: robotsEl?.getAttribute('content') || '',
    isNoindex: (robotsEl?.getAttribute('content') || '').includes('noindex'),
    ogTitle: ogTitleEl?.getAttribute('content') || '',
    ogDescription: ogDescEl?.getAttribute('content') || '',
    ogImage: ogImageEl?.getAttribute('content') || '',
    twitterCard: twitterCardEl?.getAttribute('content') || '',
    hreflang: hreflangs,
    keywords,
    publisher,
    htmlLang,
    wordCount,
    manifestUrl,
    h1Count: h1s.length,
    h2Count: h2s.length,
    h3Count: h3s.length,
    h4Count: h4s.length,
    h5Count: h5s.length,
    h6Count: h6s.length,
    h1Text: Array.from(h1s).map(h => h.innerText || h.textContent || ''),
    headingNodes,
    internalLinks: internalCount,
    externalLinks: externalCount,
    nofollowLinks: nofollowCount,
    totalLinks: internalCount + externalCount,
    linkNodes,
    imgTotal: imgNodes.length,
    imgNoAlt: imgsWithoutAlt.length,
    imgNodes,
    schemas,
    pageSchemaSignals: (() => {
      const body = document.body;
      const text = (body.innerText || body.textContent || '');
      const phoneRegex = /(\+?55[\s-]?)?\(?(\d{2})\)?[\s-]?9?\d{4}[\s-]?\d{4}/g;
      const emailRegex = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
      const priceRegex = /R\$\s*[\d.,]+/gi;
      const phones = [], emails = [], prices = [];
      let m;
      while ((m = phoneRegex.exec(text)) !== null) { const p = m[0].trim(); if (p.length >= 8 && !phones.includes(p)) phones.push(p); }
      while ((m = emailRegex.exec(text)) !== null) { const e = m[0].toLowerCase(); if (!emails.includes(e)) emails.push(e); }
      while ((m = priceRegex.exec(text)) !== null) { const pr = m[0].trim(); if (!prices.includes(pr)) prices.push(pr); }
      const ratingEl = document.querySelector('[itemtype*="Rating"], .rating, .stars, [data-rating]');
      let visibleRatingValue = null, visibleRatingCount = null;
      if (ratingEl) {
        const rv = ratingEl.getAttribute('content') || ratingEl.getAttribute('data-rating') || '';
        const rm = rv.match(/(\d+(?:[.,]\d+)?)/);
        if (rm) { const v = parseFloat(rm[1].replace(',','.')); if (v >= 0 && v <= 5) visibleRatingValue = v; }
      }
      const rcm = text.match(/(\d+)\s*(?:avalia[çc][õo]es?|reviews?|comentários)/i);
      if (rcm) visibleRatingCount = parseInt(rcm[1]);
      const bylineEl = document.querySelector('.author, [rel="author"], [itemprop="author"], .byline, meta[name="author"]');
      const authorByline = bylineEl ? ((bylineEl.getAttribute('content') || bylineEl.innerText || '').trim().substring(0,100)) : null;
      const urlP = window.location.pathname.toLowerCase();
      const hasAddToCart = !!document.querySelector('.add-to-cart, [data-action="add-to-cart"]');
      const hasContactForm = !!document.querySelector('form');
      let pageTypeInferred = 'generic';
      if (/blog|artigo|post|news/.test(urlP) || !!document.querySelector('article')) pageTypeInferred = 'article';
      else if (/produto|product|shop|item/.test(urlP) || hasAddToCart) pageTypeInferred = 'product';
      else if (/evento|event/.test(urlP)) pageTypeInferred = 'event';
      else if (/sobre|about|equipe|team/.test(urlP)) pageTypeInferred = 'person';
      else if (/contato|contact|fale/.test(urlP) || hasContactForm) pageTypeInferred = 'business';
      else if (urlP === '/' || urlP === '') pageTypeInferred = 'homepage';
      else if (/faq|perguntas|duvidas/.test(urlP)) pageTypeInferred = 'faq';
      return {
        h1Texts: Array.from(document.querySelectorAll('h1')).map(h => (h.innerText||'').trim()).filter(Boolean),
        h1Count: document.querySelectorAll('h1').length,
        visiblePhones: phones.slice(0, 5),
        visibleEmails: emails.slice(0, 5),
        visiblePrices: prices.slice(0, 10),
        visibleAddress: /\b(rua|avenida|alameda|rodovia|estrada|av\.|r\.)\b/i.test(text),
        visibleHours: /\b(segunda|terça|quarta|quinta|sexta|sábado|domingo)\b.*\d{1,2}[h:]\d{0,2}/i.test(text),
        visibleRatingValue,
        visibleRatingCount,
        authorByline,
        hasMainTag: !!document.querySelector('main'),
        hasArticleTag: !!document.querySelector('article'),
        hasAddressTag: !!document.querySelector('address'),
        hasFigureTag: !!document.querySelector('figure'),
        hasTimeTag: !!document.querySelector('time'),
        ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || null,
        publishedTimeMeta: document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') || null,
        modifiedTimeMeta: document.querySelector('meta[property="article:modified_time"]')?.getAttribute('content') || null,
        pageTypeInferred,
      };
    })(),
    microdata,
    categories,
    semantic: analyzeSemantic(),
    chunks: analyzeChunks(),
  };

  function analyzeSemantic() {
    const TAGS = [
      'header','nav','main','footer',
      'article','section','aside','h1',
      'figure','figcaption','time','address','mark','blockquote',
    ];
    // p removido — universal demais para ser métrica útil
    // aside tem peso reduzido: obrigatório só em blog/listing, não em home
    const WEIGHTS = { header:20, nav:15, main:20, footer:15, article:10, section:8, aside:5, h1:12, figure:6, figcaption:4, time:4, address:4, mark:3, blockquote:4 };
    const EXPECTED_ONE = new Set(['header','nav','main','footer','h1']);

    const result = {};
    let earned = 0, total = 0;

    TAGS.forEach(tag => {
      const els = document.querySelectorAll(tag);
      const count = els.length;
      let status;
      if (EXPECTED_ONE.has(tag)) {
        status = count === 0 ? 'missing' : count === 1 ? 'ok' : 'warning';
      } else {
        status = count > 0 ? 'ok' : 'missing';
      }
      const w = WEIGHTS[tag] || 3;
      total += w;
      if (status === 'ok') earned += w;
      else if (status === 'warning') earned += w * 0.5;
      result[tag] = { count, status };
    });

    // div-abuse detection — ignora divs injetados por extensões de browser
    const EXTENSION_PATTERNS = /glasp|grammarly|loom|honey|pocket|evernote|lastpass|dashlane|bitwarden|1password|adblock|ublock|hypothesis|readwise|omnivore|instapaper|notion-web-clipper|yt_article|chrome-extension/i;

    const abuse = [];
    const bodyChildren = Array.from(document.body.children);
    bodyChildren.forEach((el, i) => {
      if (el.tagName !== 'DIV') return;
      const id  = el.id  || '';
      const cls = el.className || '';
      // Ignora divs de extensões
      if (EXTENSION_PATTERNS.test(id) || EXTENSION_PATTERNS.test(cls)) return;
      const text = (id + ' ' + cls).toLowerCase();
      let suggestion = null;
      if (/header|topo|top|navbar/.test(text) || i === 0) suggestion = 'header';
      else if (/footer|rodape|bottom/.test(text) || i === bodyChildren.length - 1) suggestion = 'footer';
      else if (/nav|menu/.test(text)) suggestion = 'nav';
      else if (/main|content|conteudo|wrapper/.test(text)) suggestion = 'main';
      else if (/aside|sidebar|lateral/.test(text)) suggestion = 'aside';
      if (suggestion) abuse.push({ tag: suggestion, id, className: cls });
    });

    const abusePenalty = Math.min(abuse.length * 5, 20);
    result._score = Math.max(0, Math.round((earned / total) * 100) - abusePenalty);
    result._divAbuse = abuse;
    return result;
  }

  // ── CHUNK ANALYSIS ──────────────────────────────────────────────────────────
  // Extrai TODO o texto da pagina e monta chunks semanticos.
  // Fluxo:
  //   1. Coletar todos os nos de conteudo do DOM real (em ordem de documento)
  //   2. Agrupar: cada heading (H1-H3) inicia um novo chunk; paragrafos e
  //      listas acumulam no chunk corrente. Quando o chunk atinge 300 palavras
  //      sem um novo heading, quebrar automaticamente.
  //   3. Chunks com < 30 palavras sao descartados (navegacao, captions, etc.)
  //   4. data-chunk = bonus de nome quando presente no elemento pai
  function analyzeChunks() {
    const pageH1 = (document.querySelector('h1')?.textContent || '').trim();

    // -- 1. Identificar area de conteudo (DOM real, nao clone) -----------------
    // Seletores em ordem de preferencia
    const CONTENT_SELECTORS = [
      'main', 'article', '[role="main"]',
      '.post-content', '.entry-content', '.article-content', '.article-body',
      '.post-body', '.content-body', '.blog-content', '.page-content',
      '#content', '#main-content', '#post-content', '#article-content',
      '.container', '.wrapper',
    ];
    // Tags/classes a ignorar completamente (navegacao, rodape, etc.)
    const SKIP_TAGS = new Set(['SCRIPT','STYLE','NOSCRIPT','IFRAME','SVG','CANVAS','SELECT','TEXTAREA','BUTTON','INPUT']);
    const SKIP_CLASS_RE = /\b(header|footer|navbar|nav|menu|sidebar|widget|breadcrumb|comment|related|advertisement|cookie|popup|modal|overlay|social|share|tag|label|author-bio|back-to-top|pagination|toc|table-of-contents)\b/i;
    const SKIP_ID_RE   = /\b(header|footer|navbar|nav|sidebar|comments|related|ads?|cookie|popup|social|share)\b/i;

    let root = null;
    for (const sel of CONTENT_SELECTORS) {
      const el = document.querySelector(sel);
      if (el && (el.textContent || '').trim().length > 200) { root = el; break; }
    }
    if (!root) root = document.body;

    // -- 2. TreeWalker percorre TODOS os nos em ordem de documento -------------
    // Coletamos apenas elementos folha relevantes: headings, p, li, blockquote, td
    const BLOCK_TAGS = new Set(['P','LI','BLOCKQUOTE','TD','TH','FIGCAPTION','DT','DD','CAPTION']);
    const HEADING_TAGS = new Set(['H1','H2','H3','H4','H5','H6']);

    function _shouldSkip(el) {
      if (SKIP_TAGS.has(el.tagName)) return true;
      const cls = el.className || '';
      const id  = el.id || '';
      if (SKIP_CLASS_RE.test(cls) || SKIP_CLASS_RE.test(id)) return true;
      if (SKIP_ID_RE.test(id)) return true;
      return false;
    }

    // Percorre em pre-order, pulando subarvores ignoradas
    const nodes = []; // { type: 'heading'|'text', tag, text, el }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(el) {
        if (_shouldSkip(el)) return NodeFilter.FILTER_REJECT; // pula subarvore inteira
        const tag = el.tagName;
        if (HEADING_TAGS.has(tag) || BLOCK_TAGS.has(tag)) return NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_SKIP;
      }
    });

    let node;
    while ((node = walker.nextNode())) {
      const tag  = node.tagName;
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length < 10) continue;
      if (HEADING_TAGS.has(tag)) {
        nodes.push({ type: 'heading', tag, text, el: node });
      } else {
        nodes.push({ type: 'text', tag, text, el: node });
      }
    }

    // -- 3. Agrupar nos em chunks ---------------------------------------------
    // Regra: cada heading (H2/H3) abre novo chunk.
    // H1 registra mas nao abre chunk proprio (e o titulo da pagina).
    // Paragrafos acumulam no chunk corrente.
    // Quebra automatica a cada 350 palavras (chunk muito longo).
    const MAX_WORDS_PER_CHUNK = 350;
    const MIN_WORDS_PER_CHUNK = 30;

    const chunks = [];
    let cur = null; // chunk em construcao

    function _flushCurrent() {
      if (!cur) return;
      const fullText = cur.texts.join(' ').trim();
      const wc = fullText.split(/\s+/).filter(Boolean).length;
      if (wc >= MIN_WORDS_PER_CHUNK) {
        chunks.push({
          id: `chunk-${chunks.length}`,
          name: cur.name,
          text: fullText.slice(0, 3000),
          wordCount: wc,
          source: cur.source,
          headingTag: cur.headingTag || null,
          hasDataChunk: cur.hasDataChunk,
          headingVectorOk: cur.headingTag
            ? _checkHeadingVector(pageH1, cur.name)
            : null,
          local: _analyzeChunkLocal(fullText, chunks.length === 0),
        });
      }
      cur = null;
    }

    function _openChunk(name, source, headingTag, el) {
      _flushCurrent();
      const hasDataChunk = !!(el && (
        el.getAttribute('data-chunk') ||
        el.closest('[data-chunk]')?.getAttribute('data-chunk')
      ));
      const chunkName = (el && el.closest('[data-chunk]')?.getAttribute('data-chunk')) || name;
      cur = { name: chunkName, texts: [], source, headingTag, hasDataChunk };
    }

    nodes.forEach(n => {
      if (n.type === 'heading') {
        const lvl = parseInt(n.tag[1]);
        if (lvl === 1) {
          // H1 = titulo da pagina, nao abre chunk proprio
          if (!cur) _openChunk(n.text, 'h1-intro', 'H1', n.el);
          return;
        }
        // H2/H3/H4+ = sempre abre novo chunk
        _openChunk(n.text, `${n.tag.toLowerCase()}-group`, n.tag, n.el);
      } else {
        // Texto: acumular no chunk corrente
        if (!cur) _openChunk('Introducao', 'intro', null, null);
        cur.texts.push(n.text);
        // Quebra automatica se muito longo
        const wc = cur.texts.join(' ').split(/\s+/).length;
        if (wc >= MAX_WORDS_PER_CHUNK) {
          const savedName = cur.name;
          _flushCurrent();
          // Continua acumulando sob mesmo nome com sufixo
          cur = { name: `${savedName} (cont.)`, texts: [], source: 'overflow', headingTag: null, hasDataChunk: false };
        }
      }
    });
    _flushCurrent();

    // -- 4. Se nenhum chunk util, fallback: texto inteiro da pagina em blocos --
    if (chunks.length === 0) {
      const allText = (root.textContent || '').replace(/\s+/g, ' ').trim();
      const words = allText.split(' ');
      for (let i = 0; i < words.length; i += 250) {
        const slice = words.slice(i, i + 250).join(' ');
        if (slice.split(/\s+/).length >= MIN_WORDS_PER_CHUNK) {
          chunks.push({
            id: `chunk-fb${chunks.length}`,
            name: `Bloco ${chunks.length + 1}`,
            text: slice.slice(0, 3000),
            wordCount: slice.split(/\s+/).length,
            source: 'full-text-fallback',
            headingTag: null,
            hasDataChunk: false,
            headingVectorOk: null,
            local: _analyzeChunkLocal(slice, chunks.length === 0),
          });
        }
      }
    }

    return {
      pageH1,
      totalChunks: chunks.length,
      chunks: chunks.slice(0, 12),
    };
  }

  // Verifica se H2 e semanticamente relacionado ao H1 (heading vector check)
  function _checkHeadingVector(h1, h2) {
    if (!h1 || !h2) return null;
    const h1Words = new Set(h1.toLowerCase().split(/\W+/).filter(w => w.length > 3));
    const h2Words = h2.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const overlap = h2Words.filter(w => h1Words.has(w)).length;
    // Considera relacionado se compartilha pelo menos 1 palavra significativa
    // OU se H2 contém padroes de qualificador (quando, como, por que, para, se)
    const hasQualifier = /^(quando|como|por que|porque|para|se |o que|qual|quais)/i.test(h2);
    return overlap > 0 || hasQualifier;
  }

  // Analise local rapida por chunk (sem API)
  function _analyzeChunkLocal(text, isFirst) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
    const firstSentence = sentences[0]?.trim() || '';
    const lastSentence = sentences[sentences.length - 1]?.trim() || '';

    // 3-Element LLM Check (heuristico)
    const hasFact = /\b(\d|segundo|de acordo|pesquisa|estudo|dados|indica|mostra|comprova)\b/i.test(firstSentence);
    const hasNumber = /\d+/.test(text);
    const hasConclusion = /\b(portanto|por isso|logo|assim|dessa forma|em suma|recomenda|indica-se|deve|e fundamental|e essencial)\b/i.test(lastSentence);

    // ARI (Automated Readability Index) — formula padrao
    const charCount = text.replace(/\s/g, '').length;
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const sentenceCount = Math.max(sentences.length, 1);
    const ari = wordCount > 0
      ? parseFloat((4.71 * (charCount / wordCount) + 0.5 * (wordCount / sentenceCount) - 21.43).toFixed(1))
      : 0;

    // S-P-O heuristico — verbos relacionais comuns
    const SPO_VERBS = /\b(oferece|realiza|garante|possui|inclui|reduz|aumenta|especializa|fornece|permite|evita|causa|gera|produz|executa|opera|utiliza|aplica|apresenta|desenvolve|implementa|e composto|consiste em|funciona|atua|serve)\b/gi;
    const spoMatches = text.match(SPO_VERBS) || [];

    // Indicadores de conclusao acionavel para AEO
    const hasActionPattern = /\b(para (evitar|garantir|obter|reduzir|aumentar|melhorar)|recomenda-se|a melhor (opcao|escolha|pratica)|deve-se|e preciso|o ideal e)\b/i.test(text);

    return {
      hasFact,
      hasNumber,
      hasConclusion,
      hasActionPattern,
      ariScore: Math.min(Math.max(ari, 1), 20),
      spoVerbCount: spoMatches.length,
      sentenceCount,
      wordCount,
      isFirstChunk: isFirst,
    };
  }
})();
