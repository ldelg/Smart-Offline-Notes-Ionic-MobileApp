import mammoth from 'mammoth';
import { htmlToMarkdown } from './html-markdown';

/** Data rows kept after the header. */
export const CSV_MAX_DATA_ROWS = 300;
export const CSV_MAX_COLS = 50;

export interface CsvMarkdown {
  markdown: string;
  /** Data rows written into the table, not counting the header. */
  shownDataRows: number;
  /** Data rows in the file, not counting the header. */
  totalDataRows: number;
  shownCols: number;
  widestRow: number;
  truncatedRows: boolean;
  truncatedCols: boolean;
}

export function csvToMarkdown(input: string): CsvMarkdown {
  const text = normalizeNewlines(stripBom(input));
  const delimiter = detectDelimiter(text);
  const records = parseRecords(text, delimiter).filter((row, index, all) => {
    if (index === all.length - 1 && row.every((cell) => cell.trim() === '')) return false;
    return true;
  });
  const usable = records.filter((row) => row.some((cell) => cell.trim() !== ''));
  const rows = usable.length ? usable : records;
  if (!rows.length) {
    return {
      markdown: '',
      shownDataRows: 0,
      totalDataRows: 0,
      shownCols: 0,
      widestRow: 0,
      truncatedRows: false,
      truncatedCols: false,
    };
  }
  const widestRow = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const width = Math.min(CSV_MAX_COLS, widestRow);
  const truncatedCols = widestRow > CSV_MAX_COLS;
  const header = fitRow(rows[0] ?? [], width);
  const data = rows.slice(1);
  const kept = data.slice(0, CSV_MAX_DATA_ROWS).map((row) => fitRow(row, width));
  const lines = [
    formatRow(header),
    `| ${header.map(() => '---').join(' | ')} |`,
    ...kept.map((row) => formatRow(row)),
  ];
  return {
    markdown: lines.join('\n'),
    shownDataRows: kept.length,
    totalDataRows: data.length,
    shownCols: width,
    widestRow,
    truncatedRows: data.length > CSV_MAX_DATA_ROWS,
    truncatedCols,
  };
}

export async function docxToMarkdown(data: ArrayBuffer): Promise<string> {
  const result = await mammoth.convertToHtml(
    { arrayBuffer: data },
    {
      convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })),
    },
  );
  return htmlToMarkdown(result.value);
}

/** `.txt` and `.md` stay as written, aside from a leading BOM and newline shape. */
export function plainTextBody(input: string): string {
  return normalizeNewlines(stripBom(input));
}

export function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

export function normalizeNewlines(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function detectDelimiter(text: string): ',' | ';' | '\t' {
  const sample = text.split('\n').slice(0, 20).join('\n');
  const candidates = [',', ';', '\t'] as const;
  let best: ',' | ';' | '\t' = ',';
  let bestScore = 0;
  for (const candidate of candidates) {
    const rows = parseRecords(sample, candidate).filter((row) => row.some((cell) => cell.trim()));
    if (rows.length < 1) continue;
    const width = rows[0].length;
    if (width < 2) continue;
    const matched = rows.filter((row) => row.length === width).length;
    const score = matched * 100 + width;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function parseRecords(text: string, delimiter: ',' | ';' | '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell === '') {
      inQuotes = true;
      continue;
    }
    if (char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }
    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function fitRow(row: string[], width: number): string[] {
  const cells = row.slice(0, width).map((cell) => cell.replace(/\s+/g, ' ').trim());
  while (cells.length < width) cells.push('');
  return cells;
}

function formatRow(cells: string[]): string {
  return `| ${cells.map(escapeCell).join(' | ')} |`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}
