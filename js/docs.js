// The read tabs: the proposal's documents, shown inside the site.
//
// The documents are published from the spec repo to /web-tempo-sync/ (scripts/spec-publish.sh in
// unraid-config), on the same site, so a doc tab fetches its published page and shows the article.
// The spec is Bikeshed output with its own styles, so it gets a frame instead. The standalone
// pages stay where they are, for links from outside.

import { highlightAll } from './highlight.js';

const BASE = '/web-tempo-sync/';
const DOCS = {
  spec: { page: '', title: 'Specification' },
  explainer: { page: 'explainer.html', title: 'Explainer' },
  objections: { page: 'OBJECTIONS.html', title: 'Objections' },
  privacy: { page: 'security-privacy-questionnaire.html', title: 'Security & privacy questionnaire' },
  slides: { page: 'slides.html', title: 'Slides' },
};
// Links between the documents become links between tabs.
const TAB_FOR_PAGE = {
  '': 'spec',
  './': 'spec',
  'index.html': 'spec',
  'explainer.html': 'explainer',
  'explainer.md': 'explainer',
  'OBJECTIONS.html': 'objections',
  'OBJECTIONS.md': 'objections',
  'security-privacy-questionnaire.html': 'privacy',
  'security-privacy-questionnaire.md': 'privacy',
  'slides.html': 'slides',
  'slides.md': 'slides',
};
const LANG = { javascript: 'js', js: 'js', webidl: 'webidl', sh: 'sh', bash: 'sh', shell: 'sh' };

function standaloneLink(doc) {
  const p = document.createElement('p');
  p.className = 'help doc-source';
  const a = document.createElement('a');
  a.href = BASE + doc.page;
  a.textContent = `Open the ${doc.title.toLowerCase()} as its own page`;
  p.append(a);
  return p;
}

function failed(panel, doc, err) {
  const p = document.createElement('p');
  p.className = 'help err';
  p.textContent = `Couldn't load the ${doc.title.toLowerCase()} (${err.message}).`;
  panel.replaceChildren(p, standaloneLink(doc));
}

// Code blocks as the api tab shows them: highlighted, with a copy button.
function highlightCode(article) {
  for (const code of article.querySelectorAll('pre > code[class*="language-"]')) {
    const lang = LANG[code.className.match(/language-([\w-]+)/)?.[1]];
    if (lang) {
      code.dataset.lang = lang;
      code.parentElement.classList.add('code-snippet');
    }
  }
  highlightAll(article);
}

// Anchors in the document would change the page's #tab, so they scroll within the tab instead.
// Links to the other documents switch tabs; any other relative link resolves against the
// published pages.
function rewriteLinks(article, panel) {
  for (const a of article.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (href.startsWith('#')) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        panel.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView({ behavior: 'smooth' });
      });
    } else if (href in TAB_FOR_PAGE) {
      a.setAttribute('href', `#${TAB_FOR_PAGE[href]}`);
    } else if (href === '/tempo-sync/') {
      a.setAttribute('href', '#');
    } else if (!/^[a-z]+:|^\//i.test(href)) {
      a.setAttribute('href', BASE + href);
    }
  }
  for (const img of article.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src');
    if (!/^[a-z]+:|^\//i.test(src)) {
      img.setAttribute('src', BASE + src);
    }
  }
}

export async function mountDoc(panel, name) {
  const doc = DOCS[name];
  if (name === 'spec') {
    const frame = document.createElement('iframe');
    frame.className = 'spec-frame';
    frame.title = doc.title;
    frame.src = BASE;
    panel.replaceChildren(standaloneLink(doc), frame);
    return;
  }
  const loading = document.createElement('p');
  loading.className = 'help';
  loading.textContent = 'Loading…';
  panel.replaceChildren(loading);
  try {
    const res = await fetch(BASE + doc.page);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const page = new DOMParser().parseFromString(await res.text(), 'text/html');
    const article = page.querySelector('main article') ?? page.querySelector('article');
    if (!article) {
      throw new Error('no article in the page');
    }
    article.classList.add('doc');
    highlightCode(article);
    rewriteLinks(article, panel);
    panel.replaceChildren(document.adoptNode(article), standaloneLink(doc));
  } catch (err) {
    failed(panel, doc, err);
  }
}
