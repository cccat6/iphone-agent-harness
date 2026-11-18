import {Marked, Renderer} from '../vendor/marked/marked.esm.js';

const entities = {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'};
const escape = text => text.replace(/[&<>"']/g, character => entities[character]);

const markdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html({text}) {
      return escape(text);
    },
    image({text}) {
      return escape(text);
    },
    link({href, title, tokens}) {
      const text = this.parser.parseInline(tokens);
      const url = URL.canParse(href) ? new URL(href) : null;
      if (!url || !['https:', 'http:', 'mailto:'].includes(url.protocol)) return text;
      return `<a href="${escape(url.href)}"${title ? ` title="${escape(title)}"` : ''} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
    table(token) {
      return `<div class="markdown-table">${Renderer.prototype.table.call(this, token)}</div>`;
    },
  },
});

const rendered = new WeakMap();

export function usesMessageMarkdown(message) {
  return !message.internal && (message.role === 'assistant' || message.role === 'user');
}

export function renderMessageMarkdown(text, message) {
  if (message) {
    const cached = rendered.get(message);
    if (cached?.text === text) return cached.html;
  }
  let html;
  try {
    html = markdown.parse(text);
  } catch {
    // Preserve the message even when pathological input exceeds parser limits.
    html = `<div class="markdown-literal">${escape(text)}</div>`;
  }
  if (message) rendered.set(message, {text, html});
  return html;
}
