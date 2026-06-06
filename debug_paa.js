// Cole este script no console do DevTools enquanto estiver numa página
// de busca do Google que mostre o bloco "As pessoas também perguntam"
// Copie o output e envie para o Claude

(function debugPAA() {
  const report = { timestamp: new Date().toISOString(), url: location.href, findings: [] };

  // 1. Candidate PAA containers
  const containerSelectors = [
    'div[jsname="N760b"]',
    '.related-question-pair',
    '[data-initq]',
    '[data-q]',
    'div[jsname="Cpkphb"]',
    'div[jscontroller][jsaction][data-ved]',
  ];

  containerSelectors.forEach(sel => {
    const els = document.querySelectorAll(sel);
    if (els.length) {
      report.findings.push({ selector: sel, count: els.length,
        firstAttrs: [...els[0].attributes].map(a => `${a.name}="${a.value}"`).join(' | ') });
    }
  });

  // 2. Find elements with question-like text that are clickable
  const clickable = [];
  document.querySelectorAll('[role="button"], [jsaction*="click"], [jscontroller]').forEach(el => {
    const txt = (el.innerText || '').trim().replace(/\s+/g, ' ').substring(0, 120);
    if (txt.length > 20 && txt.length < 250 && txt.includes('?')) {
      clickable.push({
        tag: el.tagName,
        role: el.getAttribute('role'),
        jsname: el.getAttribute('jsname'),
        jscontroller: el.getAttribute('jscontroller'),
        jsaction: (el.getAttribute('jsaction') || '').substring(0, 80),
        'data-q': el.getAttribute('data-q'),
        'data-ved': (el.getAttribute('data-ved') || '').substring(0, 20),
        text: txt,
        classes: el.className.substring(0, 80),
      });
    }
  });
  report.clickableQuestions = clickable.slice(0, 10);

  // 3. Snapshot the first PAA container's full attribute tree (2 levels deep)
  const firstContainer = document.querySelector('[data-q], .related-question-pair, div[jsname="N760b"]');
  if (firstContainer) {
    function dumpEl(el, depth) {
      if (depth > 3) return null;
      return {
        tag: el.tagName,
        attrs: [...el.attributes].map(a => `${a.name}="${a.value.substring(0,60)}"`).join(' | '),
        children: [...el.children].slice(0, 5).map(c => dumpEl(c, depth + 1)).filter(Boolean),
      };
    }
    report.firstContainerTree = dumpEl(firstContainer, 0);
  }

  console.log('=== PAA DEBUG REPORT ===');
  console.log(JSON.stringify(report, null, 2));
  return report;
})();
