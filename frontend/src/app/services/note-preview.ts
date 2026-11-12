const FENCE_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const HEADING_RE = /^( {0,3})#{1,6}[ \t]+(.*?)(?:[ \t]+#+[ \t]*)?$/;
const LIST_RE = /^(\s*)(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$/;
const QUOTE_RE = /^( {0,3})>[ \t]?(.*)$/;
const THEMATIC_RE = /^\s*([-*_])\1{2,}\s*$/;
const SEPARATOR_CELL_RE = /^:?-{3,}:?$/;

/**
 * Plain reading text for the notes list. The stored note is unchanged, so
 * search still sees the original Markdown.
 */
export function notePreview(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of lines) {
    const fenceMatch = FENCE_RE.exec(line);
    if (
      fenceMatch &&
      (fence === null ||
        (fenceMatch[2][0] === fence[0] &&
          fenceMatch[2].length >= fence.length &&
          fenceMatch[3].trim() === ''))
    ) {
      fence = fence === null ? fenceMatch[2] : null;
      continue;
    }
    if (fence !== null) {
      out.push(line);
      continue;
    }
    if (THEMATIC_RE.test(line) || isSeparator(line)) continue;
    const cells = tableCells(line);
    if (cells) {
      const readable = cells.map(stripInline).filter((cell) => cell.length > 0);
      if (readable.length) out.push(readable.join(' · '));
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      out.push(stripInline(heading[2]));
      continue;
    }
    const item = LIST_RE.exec(line);
    if (item) {
      out.push(stripInline(item[2]));
      continue;
    }
    const quote = QUOTE_RE.exec(line);
    if (quote) {
      out.push(stripInline(quote[2]));
      continue;
    }
    out.push(stripInline(line));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isSeparator(line: string): boolean {
  const cells = tableCells(line);
  return !!cells && cells.length > 0 && cells.every((cell) => SEPARATOR_CELL_RE.test(cell.trim()));
}

function tableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return null;
  const pipes = trimmed.split('|').length - 1;
  const edged = trimmed.startsWith('|') || trimmed.endsWith('|');
  if (pipes < 2 && !edged) return null;
  let row = trimmed;
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|')) row = row.slice(0, -1);
  return row.split('|').map((cell) => cell.trim());
}

function stripInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)([\s\S]*?)\1/g, '$2')
    .replace(/(^|[\s(])[*_]([^\s*_]+)[*_](?=$|[\s).,;:!?])/g, '$1$2')
    .replace(/~~([\s\S]*?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
