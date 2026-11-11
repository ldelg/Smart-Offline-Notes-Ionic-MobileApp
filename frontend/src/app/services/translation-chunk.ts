/**
 * Break very long unpunctuated runs (Whisper-style) into pieces of at most
 * ~40 words, preferring a conjunction once the current piece is at least 15
 * words. Ported from the benchmark chunker.
 */
const BREAK_WORD =
  /^(and|so|because|but|anyway|then|y|pero|porque|así|entonces|o sea|e|ma|perché|quindi|cioè|poi|tipo)$/i;

export function chunk(text: string): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);
    if (words.length <= 40) {
      out.push(sentence);
      continue;
    }
    let current: string[] = [];
    for (let i = 0; i < words.length; i++) {
      if (current.length >= 15 && BREAK_WORD.test(words[i])) {
        out.push(current.join(' '));
        current = [];
      } else if (current.length >= 40) {
        out.push(current.join(' '));
        current = [];
      }
      current.push(words[i]);
    }
    if (current.length) out.push(current.join(' '));
  }
  return out;
}

export type PieceBreak = 'space' | 'line' | 'paragraph' | 'end';

export interface TextPiece {
  text: string;
  breakAfter: PieceBreak;
}

/**
 * Splits a note into model-sized pieces and remembers paragraph and line
 * breaks so they can be put back after translation.
 */
export function segmentForTranslation(text: string): TextPiece[] {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.trim()) return [];
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const pieces: TextPiece[] = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const lines = paragraph
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    lines.forEach((line, lineIndex) => {
      const chunks = chunk(line);
      chunks.forEach((part, chunkIndex) => {
        const lastChunk = chunkIndex === chunks.length - 1;
        const lastLine = lineIndex === lines.length - 1;
        const lastParagraph = paragraphIndex === paragraphs.length - 1;
        let breakAfter: PieceBreak = 'space';
        if (lastChunk && lastLine && lastParagraph) breakAfter = 'end';
        else if (lastChunk && lastLine) breakAfter = 'paragraph';
        else if (lastChunk) breakAfter = 'line';
        pieces.push({ text: part, breakAfter });
      });
    });
  });
  return pieces;
}

export function joinTranslatedPieces(
  parts: readonly string[],
  pieces: readonly TextPiece[],
): string {
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    out += parts[i].trim();
    const gap = pieces[i]?.breakAfter;
    if (gap === 'space') out += ' ';
    else if (gap === 'line') out += '\n';
    else if (gap === 'paragraph') out += '\n\n';
  }
  return out;
}
