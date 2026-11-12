import { Marked } from 'marked';
import DOMPurify from 'dompurify';

const marked = new Marked({
  gfm: true,
  breaks: true,
});

const ALLOWED_TAGS = [
  'a',
  'p',
  'br',
  'strong',
  'em',
  'del',
  'code',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'hr',
  'div',
  'span',
];

const ALLOWED_ATTR = ['href', 'colspan', 'rowspan', 'align', 'class', 'rel', 'target'];

/**
 * Markdown to HTML for on-screen reading.
 * Single newlines become breaks so plain notes and transcripts keep their lines.
 * Scripts and images are removed so nothing remote is loaded.
 */
export function renderMarkdown(source: string): string {
  return sanitizeMarkdownHtml(markdownToHtml(source));
}

/** Markdown to HTML before a machine translation. Not safe to inject on its own. */
export function markdownToHtml(source: string): string {
  const parsed = marked.parse(source ?? '', { async: false });
  return typeof parsed === 'string' ? parsed : '';
}

export function sanitizeMarkdownHtml(html: string): string {
  const withScroll = html.replace(
    /<table\b[^>]*>[\s\S]*?<\/table>/gi,
    (table) => `<div class="table-scroll">${table}</div>`,
  );
  const clean = DOMPurify.sanitize(withScroll, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
  return lockRenderedHtml(clean);
}

function lockRenderedHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('a').forEach((anchor) => {
    const href = anchor.getAttribute('href') ?? '';
    if (!/^(https?:|mailto:)/i.test(href)) anchor.removeAttribute('href');
    anchor.setAttribute('rel', 'noopener noreferrer');
    anchor.setAttribute('target', '_blank');
  });
  template.content.querySelectorAll('img, script, iframe, object, embed').forEach((node) => {
    node.remove();
  });
  template.content.querySelectorAll('[class]').forEach((node) => {
    if (node.getAttribute('class') !== 'table-scroll') node.removeAttribute('class');
  });
  return template.innerHTML;
}
