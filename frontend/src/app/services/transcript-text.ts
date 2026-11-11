/**
 * Whisper already emits punctuation. This only restores sentence capitals
 * and a paragraph break where a chunk pause is long enough to be a new
 * sentence. It does not invent periods, ellipses, or filler words.
 */
export interface TranscriptChunk {
  text?: unknown;
  timestamp?: readonly [unknown, unknown] | null;
}

/** Pause between chunks that can start a new paragraph. */
export const PARAGRAPH_GAP_SEC = 1.5;

const CLOSERS = new Set(['"', "'", '\u201d', '\u2019', ')', ']', '\u00bb']);
const OPENERS = new Set([
  '"',
  "'",
  '\u00ab',
  '\u201c',
  '\u2018',
  '(',
  '[',
  '\u00bf',
  '\u00a1',
]);

function isGap(char: string): boolean {
  return /\s/u.test(char);
}

function isLowerLetter(char: string): boolean {
  return (
    char.toLocaleLowerCase() !== char.toLocaleUpperCase() &&
    char === char.toLocaleLowerCase()
  );
}

function isUpperLetter(char: string): boolean {
  return (
    char.toLocaleLowerCase() !== char.toLocaleUpperCase() &&
    char === char.toLocaleUpperCase()
  );
}

/** Leaves names like iPhone and iOS alone. */
function isBrandCamel(chars: string[], index: number): boolean {
  const next = chars[index + 1];
  return !!next && isUpperLetter(next);
}

export function capitalizeSentenceStarts(text: string): string {
  const chars = Array.from(text.trim());
  if (chars.length === 0) return '';
  let out = '';
  let atStart = true;
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    if (atStart && isLowerLetter(char) && !isBrandCamel(chars, i)) {
      out += char.toLocaleUpperCase();
      atStart = false;
      continue;
    }
    out += char;
    if (char === '\n') {
      atStart = true;
      continue;
    }
    if (char === '.' || char === '!' || char === '?') {
      let j = i + 1;
      while (j < chars.length && CLOSERS.has(chars[j])) j++;
      atStart = j >= chars.length || isGap(chars[j]);
      continue;
    }
    if (atStart && !isGap(char) && !OPENERS.has(char)) {
      atStart = false;
    }
  }
  return out;
}

function chunkText(chunk: TranscriptChunk): string {
  return typeof chunk?.text === 'string' ? chunk.text.trim() : '';
}

function bound(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function endsSentence(text: string): boolean {
  return /[.!?]["'\u201d\u2019)\]\u00bb\s]*$/u.test(text);
}

export function joinTranscriptChunks(
  chunks: readonly TranscriptChunk[] | null | undefined,
): string {
  if (!Array.isArray(chunks) || chunks.length === 0) return '';
  const parts: { text: string; start: number | null; end: number | null }[] =
    [];
  for (const chunk of chunks) {
    const text = chunkText(chunk);
    if (!text) continue;
    const timestamp = Array.isArray(chunk?.timestamp) ? chunk.timestamp : null;
    parts.push({
      text,
      start: timestamp ? bound(timestamp[0]) : null,
      end: timestamp ? bound(timestamp[1]) : null,
    });
  }
  if (parts.length === 0) return '';

  let out = parts[0].text;
  for (let i = 1; i < parts.length; i++) {
    const prev = parts[i - 1];
    const next = parts[i];
    const gap =
      prev.end !== null && next.start !== null ? next.start - prev.end : null;
    const paragraph =
      gap !== null && gap >= PARAGRAPH_GAP_SEC && endsSentence(prev.text);
    out += paragraph ? `\n\n${next.text}` : ` ${next.text}`;
  }
  return capitalizeSentenceStarts(out);
}

function compactLength(text: string): number {
  return text.replace(/\s+/gu, '').length;
}

/**
 * Prefer chunk text when it is at least as complete as `result.text`.
 * Transformers.js sometimes truncates `result.text` while the chunks still
 * hold the full transcript. Equal content keeps the chunk version so pause
 * breaks survive.
 */
export function assembleTranscript(
  resultText: unknown,
  chunks: readonly TranscriptChunk[] | null | undefined,
): string {
  const fromChunks = joinTranscriptChunks(chunks);
  const fallback =
    typeof resultText === 'string' ? capitalizeSentenceStarts(resultText) : '';
  if (!fromChunks) return fallback;
  if (!fallback) return fromChunks;
  return compactLength(fromChunks) >= compactLength(fallback)
    ? fromChunks
    : fallback;
}

/** One-line title. Paragraph breaks in the body must not leak into the card title. */
export function transcriptTitle(text: string, maxLength = 60): string {
  return text.replace(/\s+/gu, ' ').trim().slice(0, maxLength);
}
