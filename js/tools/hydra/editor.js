// A small code editor: a textarea over a highlighted copy of its text, in the page's own palette.
// No dependency: the highlighter is the one the code samples use (js/highlight.js).

import { tokenize } from '../../highlight.js';

export class CodeEditor {
  #textarea;
  #code;
  #escaped = false;

  constructor(root, { value = '', label = 'Code', onRun = () => {}, onChange = () => {} } = {}) {
    root.classList.add('hydra-editor');
    const pre = document.createElement('pre');
    pre.setAttribute('aria-hidden', 'true');
    this.#code = document.createElement('code');
    pre.append(this.#code);
    this.#textarea = document.createElement('textarea');
    Object.assign(this.#textarea, { spellcheck: false, value, rows: 1 });
    this.#textarea.setAttribute('autocapitalize', 'off');
    this.#textarea.setAttribute('autocomplete', 'off');
    this.#textarea.setAttribute('autocorrect', 'off');
    this.#textarea.setAttribute('aria-label', label);
    root.replaceChildren(pre, this.#textarea);
    this.#render();

    this.#textarea.addEventListener('input', () => {
      this.#render();
      onChange(this.value);
    });
    this.#textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onRun();
        return;
      }
      // Tab indents. Escape, then Tab, leaves the editor, so the keyboard isn't trapped.
      if (e.key === 'Escape') {
        this.#escaped = true;
        return;
      }
      if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !this.#escaped) {
        e.preventDefault();
        this.#insert('  ');
      }
      this.#escaped = false;
    });
  }

  get value() {
    return this.#textarea.value;
  }

  set value(text) {
    this.#textarea.value = text;
    this.#render();
  }

  #insert(text) {
    const ta = this.#textarea;
    // execCommand keeps the browser's undo stack; setRangeText is the fallback.
    if (!document.execCommand?.('insertText', false, text)) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input'));
    }
  }

  #render() {
    const frag = document.createDocumentFragment();
    for (const { text, kind } of tokenize(this.value, 'js')) {
      if (kind) {
        const span = document.createElement('span');
        span.className = `tok-${kind}`;
        span.textContent = text;
        frag.append(span);
      } else {
        frag.append(text);
      }
    }
    // A trailing newline needs a character after it to take up a line.
    frag.append('\n ');
    this.#code.replaceChildren(frag);
  }
}
