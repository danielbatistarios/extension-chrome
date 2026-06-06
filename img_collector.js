// img_collector.js — Content script rodando em document_start
// Replica as 9 camadas de busca do Imageye para encontrar TODAS as imagens.
// Dados ficam em window.__seoImgCollector e são lidos pelo popup via executeScript.

(() => {
  'use strict';
  if (window.__seoImgCollector) return;

  const collector = { urls: new Map() };
  window.__seoImgCollector = collector;

  // ── Adiciona URL ao mapa com deduplicação ────────────────────────
  function addImg(src, source, meta = {}) {
    if (!src || typeof src !== 'string') return;
    src = src.trim();
    if (!src || src.length < 6) return;
    if (src.startsWith('data:image/gif')) return;        // pixel 1x1 transparente
    if (src.startsWith('data:image/png;base64,iVBOR')) return; // PNG 1x1
    if (src.startsWith('data:')) return;                 // qualquer data URI

    // Resolve URL relativa
    let full;
    try { full = new URL(src, location.href).href; } catch (_) { return; }

    // Chave sem query/hash para dedup
    const key = full.split('?')[0].split('#')[0];
    if (key.length < 6) return;

    if (!collector.urls.has(key)) {
      collector.urls.set(key, {
        src: full,
        source,
        alt:        meta.alt        ?? '',
        hasAlt:     meta.hasAlt     ?? false,
        hasDimAttrs:meta.hasDimAttrs?? false,
        dispW:      meta.dispW      ?? 0,
        dispH:      meta.dispH      ?? 0,
        isLazy:     meta.isLazy     ?? false,
      });
    }
  }

  function metaFromImg(img) {
    return {
      alt:         img.getAttribute('alt') || '',
      hasAlt:      img.hasAttribute('alt') && (img.getAttribute('alt') || '').trim().length > 0,
      hasDimAttrs: img.hasAttribute('width') && img.hasAttribute('height'),
      dispW:       img.getAttribute('width')  ? parseInt(img.getAttribute('width'))  : (img.offsetWidth  || 0),
      dispH:       img.getAttribute('height') ? parseInt(img.getAttribute('height')) : (img.offsetHeight || 0),
      isLazy:      img.getAttribute('loading') === 'lazy' || img.hasAttribute('data-src'),
    };
  }

  // ── Shadow DOM recursivo ─────────────────────────────────────────
  function queryShadow(selector, root) {
    root = root || document;
    const results = Array.from(root.querySelectorAll(selector));
    const shadowRoots = Array.from(root.querySelectorAll('*'))
      .map(el => el.shadowRoot).filter(Boolean);
    return results.concat(...shadowRoots.map(sr => queryShadow(selector, sr)));
  }

  // ── 9 CAMADAS (réplica exata do Imageye) ─────────────────────────

  function scan() {

    // Camada 1: img.src
    Array.from(document.getElementsByTagName('img')).forEach(img => {
      if (img.src) addImg(img.src, 'img.src', metaFromImg(img));
    });

    // Camada 2: img.currentSrc (CHAVE — pega srcset já resolvido pelo browser)
    Array.from(document.images).forEach(img => {
      if (img.currentSrc) addImg(img.currentSrc, 'img.currentSrc', metaFromImg(img));
    });

    // Camada 3: <source srcset> (picture + video)
    Array.from(document.getElementsByTagName('source')).forEach(source => {
      if (source.srcset) addImg(source.srcset.split(',')[0].trim().split(/\s+/)[0], 'source.srcset');
      if (source.src)    addImg(source.src, 'source.src');
    });

    // Camada 4: srcset multi-resolução — captura CADA URL do srcset
    document.querySelectorAll('img[srcset]').forEach(img => {
      img.getAttribute('srcset').split(',').forEach(part => {
        const url = part.trim().split(/\s+/)[0];
        if (url) addImg(url, 'img[srcset]', metaFromImg(img));
      });
    });

    // Camada 5: <input type="image">
    Array.from(document.getElementsByTagName('input')).forEach(input => {
      if ((input.type || '').toUpperCase() === 'IMAGE' && input.src) {
        addImg(input.src, 'input[type=image]');
      }
    });

    // Camada 6: <a href> com extensão de imagem
    Array.from(document.getElementsByTagName('a')).forEach(link => {
      if (!link.href) return;
      if (/\.(jpg|jpeg|png|gif|bmp|ico|webp|avif|tif|apng|jfif|pjpeg|pjp)(\?|$)/i.test(link.href)) {
        addImg(link.href, 'a[href]');
      }
    });

    // Camada 7: background-image CSS computado em TODOS os elementos
    Array.from(document.getElementsByTagName('*')).forEach(el => {
      try {
        const bg = window.getComputedStyle(el).backgroundImage;
        if (bg && bg !== 'none') {
          for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
            addImg(m[1], 'css-background');
          }
        }
      } catch (_) {}
      // Inline style também
      const inline = el.style?.backgroundImage;
      if (inline && inline !== 'none') {
        for (const m of inline.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
          addImg(m[1], 'style-background');
        }
      }
    });

    // Camada 8: Shadow DOM — <img> dentro de web components
    queryShadow('img').forEach(img => {
      if (img.src)        addImg(img.src,        'shadow-img.src',        metaFromImg(img));
      if (img.currentSrc) addImg(img.currentSrc, 'shadow-img.currentSrc', metaFromImg(img));
    });

    // Camada 9: Regex no innerHTML — URLs de imagem em texto bruto, comentários, JS inline
    try {
      const urls = (document.body?.innerHTML || '').match(
        /https?:\/\/[^\s"'<>()]+/gi
      );
      if (urls) {
        urls.filter((u, i, a) => i === a.indexOf(u))  // dedup
            .filter(u => /\.(png|jpg|jpeg|gif|webp|avif|bmp|ico|tif|apng|jfif|pjpeg|pjp)(\?|$)/i.test(u))
            .forEach(u => addImg(u, 'innerHTML-regex'));
      }
    } catch (_) {}

    // Camada Extra: atributos lazy de qualquer elemento
    const LAZY_ATTRS = ['data-src','data-lazy-src','data-original','data-url',
                        'data-image','data-img','data-lazy','data-background','data-bg'];
    LAZY_ATTRS.forEach(a => {
      document.querySelectorAll(`[${a}]`).forEach(el => {
        const v = el.getAttribute(a);
        if (v) addImg(v, a, { isLazy: true });
      });
    });
  }

  // ── MutationObserver — captura imagens inseridas dinamicamente ───
  new MutationObserver(mutations => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'IMG') {
          if (node.src)        addImg(node.src,        'mutation.src',        metaFromImg(node));
          if (node.currentSrc) addImg(node.currentSrc, 'mutation.currentSrc', metaFromImg(node));
        }
        node.querySelectorAll?.('img').forEach(img => {
          if (img.src)        addImg(img.src,        'mutation-child.src',        metaFromImg(img));
          if (img.currentSrc) addImg(img.currentSrc, 'mutation-child.currentSrc', metaFromImg(img));
        });
      });
      // Atributo src alterado (lazy loader trocou data-src por src)
      if (m.type === 'attributes' && m.target?.tagName === 'IMG') {
        const img = m.target;
        if (img.src)        addImg(img.src,        'mutation.attr.src',        metaFromImg(img));
        if (img.currentSrc) addImg(img.currentSrc, 'mutation.attr.currentSrc', metaFromImg(img));
      }
    });
  }).observe(document.documentElement, {
    childList:       true,
    subtree:         true,
    attributes:      true,
    attributeFilter: ['src', 'data-src', 'data-lazy-src', 'data-original', 'srcset'],
  });

  // ── Executa scan nos momentos certos ────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  // Re-scan após tudo carregar (lazy diferido)
  window.addEventListener('load', () => {
    scan();
    setTimeout(scan, 1000);
    setTimeout(scan, 3000);
  });

})();
