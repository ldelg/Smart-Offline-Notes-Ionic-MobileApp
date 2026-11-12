import { AppLang } from '../models/translation.model';
import { markdownToHtml } from './markdown-render';
import { htmlToMarkdown } from './html-markdown';

export interface MarkdownTranslateFns {
  plain: (text: string) => Promise<string>;
  html: (html: string) => Promise<string>;
}

export interface BodyTranslator {
  translate(
    text: string,
    src: AppLang,
    tgt: AppLang,
    noteId: string | null,
    quiet?: boolean,
    html?: boolean,
  ): Promise<string>;
}

const HEADING_RE = /^(#{1,6})[ \t]+(.*)$/;
const FENCE_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const LIST_RE = /^(\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/;
const QUOTE_RE = /^ {0,3}>/;
const CODE_PLACEHOLDER_RE = /_+\s*C\s*(\d+)\s*_+/g;

/**
 * True when the note uses Markdown structure worth keeping through translation.
 * Plain transcripts stay on the existing line-preserving translator.
 */
export function markdownHasStructure(text: string): boolean {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line) || HEADING_RE.test(line) || LIST_RE.test(line) || QUOTE_RE.test(line)) {
      return true;
    }
    if (isTableStart(lines, i)) return true;
    if (hasInlineMarkdown(line)) return true;
  }
  return false;
}

export function hasInlineMarkdown(text: string): boolean {
  if (text.includes('**') || text.includes('__') || text.includes('~~') || text.includes('`')) {
    return true;
  }
  if (/\[[^\]]+\]\([^)]+\)/.test(text)) return true;
  return /(^|\s)[*_][^\s*_]+[*_]/.test(text);
}

/**
 * Translates the words and puts the Markdown back: headings, lists, tables,
 * quotes, and fenced code. Inline emphasis goes through HTML mode.
 */
export async function translateMarkdown(text: string, fns: MarkdownTranslateFns): Promise<string> {
  const blocks = parseBlocks(stripImages(text));
  const translated: string[] = [];
  for (const block of blocks) {
    if (block.type === 'blank') continue;
    if (block.type === 'code') {
      translated.push(block.text);
      continue;
    }
    if (block.type === 'heading') {
      translated.push(`${'#'.repeat(block.level)} ${await translatePiece(block.text, fns)}`);
      continue;
    }
    if (block.type === 'list') {
      const items: string[] = [];
      for (const item of block.items) {
        items.push(`${item.marker}${await translatePiece(item.text, fns)}`);
      }
      translated.push(items.join('\n'));
      continue;
    }
    if (block.type === 'quote') {
      const inner = await translatePiece(block.text, fns);
      translated.push(
        inner
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n'),
      );
      continue;
    }
    if (block.type === 'table') {
      translated.push(await translateTable(block.rows, fns));
      continue;
    }
    translated.push(await translatePiece(block.text, fns));
  }
  return translated
    .map((part) => part.replace(/\s+$/g, ''))
    .filter((part) => part.trim())
    .join('\n\n')
    .trim();
}

export async function translateNoteBody(
  machine: BodyTranslator,
  text: string,
  src: AppLang,
  tgt: AppLang,
  noteId: string | null,
): Promise<string> {
  if (!markdownHasStructure(text)) {
    return machine.translate(text, src, tgt, noteId);
  }
  return translateMarkdown(text, {
    plain: (part) => machine.translate(part, src, tgt, noteId),
    html: (part) => machine.translate(part, src, tgt, noteId, false, true),
  });
}

async function translateTable(rows: string[][], fns: MarkdownTranslateFns): Promise<string> {
  if (!rows.length) return '';
  const header = await Promise.all(rows[0].map((cell) => translatePiece(cell, fns)));
  const body: string[][] = [];
  for (const row of rows.slice(1)) {
    body.push(await Promise.all(row.map((cell) => translatePiece(cell, fns))));
  }
  const width = Math.max(header.length, ...body.map((row) => row.length), 1);
  const pad = (row: string[]) => {
    const next = row.slice(0, width);
    while (next.length < width) next.push('');
    return next;
  };
  return [
    formatRow(pad(header)),
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...body.map((row) => formatRow(pad(row))),
  ].join('\n');
}

async function translatePiece(text: string, fns: MarkdownTranslateFns): Promise<string> {
  if (!text.trim()) return text;
  if (!hasInlineMarkdown(text)) return fns.plain(text);
  const html = protectInlineCode(markdownToHtml(text));
  const htmlOut = await fns.html(html.html);
  const back = restoreInlineCode(htmlToMarkdown(htmlOut), html.codes).trim();
  return back || (await fns.plain(text));
}

function protectInlineCode(html: string): { html: string; codes: string[] } {
  const codes: string[] = [];
  const next = html.replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, (match) => {
    const id = codes.length;
    codes.push(match);
    return `<code>__C${id}__</code>`;
  });
  return { html: next, codes };
}

function restoreInlineCode(text: string, codes: readonly string[]): string {
  if (!codes.length) return text;
  return text.replace(CODE_PLACEHOLDER_RE, (match, id: string) => {
    const original = codes[Number(id)];
    if (!original) return match;
    return original.replace(/<[^>]+>/g, '');
  });
}

function stripImages(text: string): string {
  return text.replace(/!\[[^\]]*]\([^)]*\)/g, '').replace(/!\[[^\]]*]\[[^\]]*]/g, '');
}

type Block =
  | { type: 'blank' }
  | { type: 'code'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; items: { marker: string; text: string }[] }
  | { type: 'quote'; text: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'paragraph'; text: string };

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      blocks.push({ type: 'blank' });
      i++;
      continue;
    }
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const marker = fence[2][0];
      const size = fence[2].length;
      const buf = [line];
      i++;
      let closed = false;
      while (i < lines.length) {
        buf.push(lines[i]);
        const close = FENCE_RE.exec(lines[i]);
        i++;
        if (close && close[2][0] === marker && close[2].length >= size && close[3].trim() === '') {
          closed = true;
          break;
        }
      }
      if (!closed) {
        blocks.push({ type: 'paragraph', text: buf.join('\n') });
      } else {
        blocks.push({ type: 'code', text: buf.join('\n') });
      }
      continue;
    }
    if (isTableStart(lines, i)) {
      const rows: string[][] = [];
      rows.push(splitTableRow(lines[i]));
      i++;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        const cells = splitTableRow(lines[i]);
        if (!isSeparatorCells(cells)) rows.push(cells);
        i++;
      }
      blocks.push({ type: 'table', rows });
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        text: heading[2].replace(/\s+#+\s*$/, '').trim(),
      });
      i++;
      continue;
    }
    if (LIST_RE.test(line)) {
      const items: { marker: string; text: string }[] = [];
      while (i < lines.length && LIST_RE.test(lines[i])) {
        const match = LIST_RE.exec(lines[i]);
        const marker = match ? match[1] : '';
        items.push({ marker, text: lines[i].slice(marker.length) });
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    }
    if (QUOTE_RE.test(line)) {
      const quotes: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quotes.push(lines[i].replace(/^ {0,3}>[ \t]?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', text: quotes.join('\n') });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !startsSpecial(lines, i)) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'paragraph', text: para.join('\n') });
  }
  return blocks;
}

function startsSpecial(lines: string[], index: number): boolean {
  const line = lines[index];
  return (
    FENCE_RE.test(line) ||
    HEADING_RE.test(line) ||
    LIST_RE.test(line) ||
    QUOTE_RE.test(line) ||
    isTableStart(lines, index)
  );
}

function isTableStart(lines: string[], index: number): boolean {
  if (index + 1 >= lines.length) return false;
  if (!lines[index].includes('|')) return false;
  return isSeparatorLine(lines[index + 1]);
}

function isSeparatorLine(line: string): boolean {
  if (!line.includes('-') || !line.includes('|')) return false;
  return isSeparatorCells(splitTableRow(line));
}

function isSeparatorCells(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitTableRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|')) row = row.slice(0, -1);
  const cells: string[] = [];
  let current = '';
  let escape = false;
  for (const char of row) {
    if (escape) {
      current += char;
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function formatRow(cells: string[]): string {
  return `| ${cells.map((cell) => cell.replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`;
}
