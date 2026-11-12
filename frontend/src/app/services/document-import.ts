import { CsvLimit } from '../models/note.model';
import { csvToMarkdown, docxToMarkdown, plainTextBody } from './document-convert';

/** Resulting note text above this is rejected. localStorage has to hold it. */
export const MAX_IMPORT_CHARS = 1_000_000;

export type ImportKind = 'txt' | 'md' | 'csv' | 'docx' | 'doc' | 'unsupported';

export type ImportError =
  | 'too-large'
  | 'unsupported'
  | 'legacy-doc'
  | 'empty'
  | 'unreadable'
  | 'failed';

export interface RawImportFile {
  name?: string;
  mime?: string;
  text?: string;
  base64?: string;
  size?: number;
  error?: string;
}

export interface PreparedNote {
  title: string;
  body: string;
  source: 'Upload' | 'Typed';
  csvLimit?: CsvLimit;
}

export interface ImportOutcome {
  note?: PreparedNote;
  error?: ImportError;
  filename?: string;
}

export function importKind(name: string, mime: string): ImportKind {
  const ext = extensionOf(name);
  if (ext === 'docx') return 'docx';
  if (ext === 'doc') return 'doc';
  if (ext === 'csv') return 'csv';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'txt') return 'txt';
  const type = mime.toLowerCase().split(';')[0].trim();
  if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'docx';
  }
  if (type === 'application/msword') return 'doc';
  if (type === 'text/csv' || type === 'text/comma-separated-values' || type === 'application/csv') {
    return 'csv';
  }
  if (type === 'text/markdown' || type === 'text/x-markdown') return 'md';
  if (type === 'text/plain') return 'txt';
  return 'unsupported';
}

export function titleFromFilename(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? '';
  const clean = base.trim();
  const dot = clean.lastIndexOf('.');
  if (dot > 0) return clean.slice(0, dot).trim();
  return clean;
}

export function firstHeading(markdown: string): string | null {
  const match = /^(?:#{1,6}[ \t]+)(.+?)\s*#*\s*$/m.exec(markdown);
  const text = match?.[1]?.trim();
  return text || null;
}

export function isDocumentFile(name: string, mime: string): boolean {
  return importKind(name, mime) !== 'unsupported';
}

export async function prepareImportFile(
  file: RawImportFile,
  options: { fallbackTitle: string },
): Promise<ImportOutcome> {
  const filename = (file.name ?? '').trim();
  const kind = importKind(filename, file.mime ?? '');
  if (file.error === 'too-large') return { error: 'too-large', filename };
  if (file.error === 'unreadable') return { error: 'unreadable', filename };
  if (file.error === 'unsupported') return { error: 'unsupported', filename };
  if (kind === 'doc') return { error: 'legacy-doc', filename };
  if (kind === 'unsupported') return { error: 'unsupported', filename };

  try {
    let body = '';
    let csvLimit: CsvLimit | undefined;
    if (kind === 'docx') {
      if (!file.base64) return { error: 'unreadable', filename };
      const bytes = base64ToBytes(file.base64);
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      body = await docxToMarkdown(buffer);
    } else if (kind === 'csv') {
      const text = fileText(file);
      if (text === null) return { error: 'unreadable', filename };
      const table = csvToMarkdown(text);
      body = table.markdown;
      if (table.truncatedRows || table.truncatedCols) {
        csvLimit = {
          shown: table.shownDataRows,
          total: table.totalDataRows,
        };
        if (table.truncatedCols) {
          csvLimit.columnsShown = table.shownCols;
          csvLimit.columnsTotal = table.widestRow;
        }
      }
    } else {
      const text = fileText(file);
      if (text === null) return { error: 'unreadable', filename };
      body = plainTextBody(text);
    }
    if (!body.trim()) return { error: 'empty', filename };
    if (body.length > MAX_IMPORT_CHARS) return { error: 'too-large', filename };
    return {
      note: {
        title: preferredTitle(filename, body, options.fallbackTitle),
        body,
        source: 'Upload',
        ...(csvLimit ? { csvLimit } : {}),
      },
      filename,
    };
  } catch (error) {
    console.warn('Document import failed', error);
    return { error: 'failed', filename };
  }
}

export function prepareSharedText(
  text: string,
  subject: string | undefined,
  fallbackTitle: string,
): ImportOutcome {
  const body = plainTextBody(text);
  if (!body.trim()) return { error: 'empty' };
  if (body.length > MAX_IMPORT_CHARS) return { error: 'too-large' };
  const fromSubject = subject?.replace(/\s+/g, ' ').trim();
  const title = fromSubject
    ? fromSubject.slice(0, 120)
    : preferredTitle('', body, fallbackTitle);
  return { note: { title, body, source: 'Typed' } };
}

function preferredTitle(filename: string, body: string, fallback: string): string {
  const fromName = titleFromFilename(filename);
  if (fromName && !fromName.startsWith('.')) return clip(fromName, 120);
  const heading = firstHeading(body);
  if (heading) return clip(heading, 120);
  const line = body
    .split('\n')
    .map((item) => item.trim())
    .find(Boolean);
  if (line) return clip(line, 80);
  return fallback;
}

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/\s+$/, '')}…`;
}

function extensionOf(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

function fileText(file: RawImportFile): string | null {
  if (typeof file.text === 'string') return file.text;
  if (typeof file.base64 === 'string' && file.base64) {
    try {
      return new TextDecoder('utf-8', { fatal: false }).decode(base64ToBytes(file.base64));
    } catch {
      return null;
    }
  }
  return null;
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
