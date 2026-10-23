// Syntax highlighting for the code samples, in the bayl.es palette: the house style already treats colour as
// syntax highlighting, so each token kind takes a role colour that is safe for text in both themes (css/style.css).
// Small and dependency-free on purpose: it knows the three languages this page shows (js, webidl, sh), not more.

const KEYWORDS = {
  js: new Set([
    'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'do', 'else', 'export',
    'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'null',
    'of', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'undefined', 'var',
    'void', 'while', 'yield',
  ]),
  webidl: new Set([
    'attribute', 'boolean', 'callback', 'const', 'dictionary', 'double', 'enum', 'false', 'getter', 'inherit',
    'interface', 'long', 'mixin', 'null', 'optional', 'partial', 'readonly', 'required', 'sequence', 'setter',
    'short', 'static', 'stringifier', 'true', 'typedef', 'undefined', 'unsigned', 'void',
  ]),
  sh: new Set([]),
};

// One pass, longest-first alternatives. Groups: comment, string, number, word, flag, other. Shell comments start
// with '#'; in JS and WebIDL they're '//' and '/* */' (a '#' there is an ordinary character).
const REST = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(--?[\w-]+(?:=[^\s\\]+)?)|([\s\S])/.source;
const COMMENT = { sh: /#[^\n]*/.source, js: /\/\/[^\n]*|\/\*[\s\S]*?\*\//.source };
const tokenRegex = (lang) => new RegExp(`(${lang === 'sh' ? COMMENT.sh : COMMENT.js})|${REST}`, 'g');

export function tokenize(source, lang) {
  const keywords = KEYWORDS[lang] || KEYWORDS.js;
  const out = [];
  let m;
  let lineStart = true;
  const TOKEN = tokenRegex(lang);
  for (;;) {
    // Shell: the command at the start of a line is one token, path and all (./out/Default/Chromium).
    if (lang === 'sh' && lineStart) {
      const cmd = /^[^\s\\#"'-][^\s]*/.exec(source.slice(TOKEN.lastIndex));
      if (cmd) {
        out.push({ text: cmd[0], kind: 'function' });
        TOKEN.lastIndex += cmd[0].length;
        lineStart = false;
        continue;
      }
    }
    if (!(m = TOKEN.exec(source))) {
      break;
    }
    const [text, comment, string, number, word, flag] = m;
    let kind = null;
    if (comment !== undefined) {
      kind = 'comment';
    } else if (string !== undefined) {
      kind = 'string';
    } else if (number !== undefined) {
      kind = 'number';
    } else if (word !== undefined) {
      const next = source.slice(TOKEN.lastIndex).match(/^\s*(.)/)?.[1];
      if (keywords.has(word)) {
        kind = 'keyword';
      } else if (next === '(') {
        kind = 'function';
      } else if (/^[A-Z]/.test(word)) {
        kind = 'type';
      } else if (lang !== 'sh' && source[m.index - 1] === '.') {
        kind = 'property';
      }
    } else if (flag !== undefined && lang === 'sh') {
      kind = 'keyword';
    } else if (/[{}()[\];,.<>=+*/&|!?:-]/.test(text)) {
      kind = 'punct';
    }
    out.push({ text, kind });
    if (text === '\n') {
      lineStart = true;
    } else if (!/^\s+$/.test(text) && text !== '\\') {
      lineStart = false;
    }
  }
  return out;
}

export function highlightAll(root = document) {
  for (const code of root.querySelectorAll('pre.code-snippet > code[data-lang]')) {
    const tokens = tokenize(code.textContent, code.dataset.lang);
    const frag = document.createDocumentFragment();
    for (const { text, kind } of tokens) {
      if (kind) {
        const span = document.createElement('span');
        span.className = `tok-${kind}`;
        span.textContent = text;
        frag.appendChild(span);
      } else {
        frag.appendChild(document.createTextNode(text));
      }
    }
    code.replaceChildren(frag);
    addCopyButton(code.parentElement);
  }
}

function addCopyButton(pre) {
  if (!navigator.clipboard || pre.querySelector('.copy-btn')) {
    return;
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'quiet copy-btn';
  btn.textContent = 'copy';
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pre.querySelector('code').textContent);
      btn.textContent = 'copied';
    } catch {
      btn.textContent = "couldn't copy";
    }
    setTimeout(() => (btn.textContent = 'copy'), 1500);
  });
  pre.appendChild(btn);
}
