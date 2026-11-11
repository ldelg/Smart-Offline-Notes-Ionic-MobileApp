import type { AppLang } from '../models/translation.model';

/**
 * A short title translated on its own keeps source word order
 * ("Monday meeting" → "Lunedì riunione"). Putting it inside one
 * grammatical sentence, marked with <b>, lets the model reorder it.
 * The mark is preserved by Bergamot's HTML mode, so the title can be
 * read back out of the sentence.
 */
const LEADING_ARTICLE =
  /^(?:the|a|an|il|lo|la|i|gli|le|el|los|las|un|una|uno|der|die|das|den|dem|des|ein|eine|einen|einem|einer|les|l'|un')\s+/i;

export function frameTitle(title: string, source: AppLang, article = false): string {
  const marked = `<b>${escapeHtml(title.trim())}</b>`;
  if (article) {
    if (source === 'en') return `This note is about a ${marked}.`;
    if (source === 'it') return `Questa nota riguarda un ${marked}.`;
    if (source === 'es') return `Esta nota trata de un ${marked}.`;
    if (source === 'fr') return `Cette note parle d'un ${marked}.`;
    return `Diese Notiz handelt von einem ${marked}.`;
  }
  if (source === 'en') return `A note about ${marked}.`;
  if (source === 'it') return `Questa nota riguarda ${marked}.`;
  if (source === 'es') return `Esta nota trata de ${marked}.`;
  if (source === 'fr') return `Cette note parle de ${marked}.`;
  return `Diese Notiz handelt von ${marked}.`;
}

/** Title text from a framed HTML translation, or null when the mark was lost. */
export function extractMarkedTitle(html: string): string | null {
  const clean = html.replace(/<\/?font[^>]*>/gi, '');
  const tags: RegExpExecArray[] = [];
  const pattern = /<b>([\s\S]*?)<\/b>/gi;
  let found: RegExpExecArray | null;
  while ((found = pattern.exec(clean))) tags.push(found);
  if (!tags.length) return null;
  const best = tags.sort((a, b) => b[1].length - a[1].length)[0];
  const after = clean.slice(best.index + best[0].length).replace(/<[^>]+>/g, '');
  const leaked = after.split(/[.!?]/)[0] ?? '';
  const text = decodeHtml(`${best[1]} ${leaked}`).replace(/\s+/g, ' ').trim();
  return text || null;
}

/**
 * Drops one leading article and matches the source title's capital.
 * "la riunione del lunedì" from "Monday meeting" becomes "Riunione del lunedì".
 */
export function polishTitle(sourceTitle: string, extracted: string | null): string | null {
  if (!extracted) return null;
  let text = extracted.replace(LEADING_ARTICLE, '').replace(/\s+/g, ' ').trim();
  text = text.replace(/^[,:;—–-]+\s*/, '').replace(/\s+[,:;.]+$/, '');
  if (text.length < 2) return null;
  const source = sourceTitle.trim();
  const first = source.charAt(0);
  if (first && first === first.toLocaleUpperCase() && first !== first.toLocaleLowerCase()) {
    text = text.charAt(0).toLocaleUpperCase() + text.slice(1);
  }
  return text;
}

/**
 * A content word from the title, other than the last one, still present
 * means the model copied it instead of translating it ("Call" in "Call con Marco").
 */
export function copiedSourceWord(sourceTitle: string, translated: string): boolean {
  const words = sourceTitle.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  const translatedLower = translated.toLocaleLowerCase();
  return words.slice(0, -1).some((word) => {
    const bare = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (bare.length < 4) return false;
    return translatedLower.includes(bare.toLocaleLowerCase());
  });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function decodeHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
