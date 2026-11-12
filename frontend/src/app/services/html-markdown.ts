import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
});
turndown.use(gfm);
turndown.remove(['script', 'style', 'img']);

/** HTML from a document converter, back to Markdown. Images are dropped. */
export function htmlToMarkdown(html: string): string {
  const withoutImages = html.replace(/<img\b[^>]*>/gi, '');
  const withHeaders = promoteTableHeaders(flattenTableParagraphs(withoutImages));
  const markdown = turndown.turndown(withHeaders);
  return tidyMarkdown(replaceKeptTables(markdown));
}

/**
 * Mammoth writes every cell as `td`. The GFM converter only builds a Markdown
 * table when the first row uses `th`, so the first row is promoted.
 */
function flattenTableParagraphs(html: string): string {
  return html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (table) =>
    table.replace(/<\/?p\b[^>]*>/gi, ''),
  );
}

function promoteTableHeaders(html: string): string {
  return html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (table) => {
    if (/<th[\s>]/i.test(table)) return table;
    let seen = false;
    return table.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/i, (row) => {
      if (seen) return row;
      seen = true;
      return row.replace(/<td\b/gi, '<th').replace(/<\/td>/gi, '</th>');
    });
  });
}

function replaceKeptTables(markdown: string): string {
  if (!/<table[\s>]/i.test(markdown)) return markdown;
  return markdown.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (table) => {
    const rows = collect(table, /<tr\b[^>]*>[\s\S]*?<\/tr>/gi).map((row) =>
      collect(row, /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi).map((cell) =>
        cell.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      ),
    );
    if (!rows.length) return '';
    const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const pad = (row: string[]): string[] => {
      const next = row.slice(0, width);
      while (next.length < width) next.push('');
      return next;
    };
    const header = pad(rows[0]);
    const lines = [
      `| ${header.join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`,
      ...rows.slice(1).map((row) => `| ${pad(row).join(' | ')} |`),
    ];
    return lines.join('\n');
  });
}

function collect(source: string, pattern: RegExp): string[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const expression = new RegExp(pattern.source, flags);
  const found: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = expression.exec(source))) {
    found.push(match[1] ?? match[0]);
  }
  return found;
}

function tidyMarkdown(markdown: string): string {
  return markdown
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^([ \t]*[-+*])[ \t]{2,}/gm, '$1 ')
    .replace(/^([ \t]*\d+[.)])[ \t]{2,}/gm, '$1 ')
    .trim();
}
