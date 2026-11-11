import { AppLang } from '../models/translation.model';

/**
 * Numbers that contain a separator. Bergamot rewrites "1,500" and "1.500"
 * into the same target form, and can garble mixed values such as "12,345.67".
 * Placeholders are copied through the model. On the way back, a plain quantity
 * is parsed in the source locale and written in the target locale.
 * Dates, times, versions, phones, addresses, and ambiguous forms are restored
 * exactly as they were.
 */
const TOKEN_RE =
  /(?<![A-Za-zÀ-ÿ\d])(?:\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{1,2}:\d{2}(?::\d{2})?|\d{1,3}(?:\.\d{1,3}){3}|\+\d[\d ().-]{5,}\d|\d{2,4}(?:-\d{2,4}){2,}|(?:\d{1,3}(?:[.,\u00a0\u202f\u2009 ]\d{3})+(?:[.,]\d+)?|\d+[.,]\d+)\s*[-–—]\s*(?:\d{1,3}(?:[.,\u00a0\u202f\u2009 ]\d{3})+(?:[.,]\d+)?|\d+[.,]\d+)|\d+(?:\.\d+){2,}|\d{1,3}(?:[\u00a0\u202f\u2009 ]\d{3})+(?:,\d+)?|\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+[.,]\d+)(?![A-Za-zÀ-ÿ\d])/g;

const PLACEHOLDER_RE = /__\s*N\s*(\d+)\s*__/g;

const GROUP_SPACE = /[\u00a0\u202f\u2009 ]/;

export interface ProtectedText {
  text: string;
  numbers: string[];
}

interface Quantity {
  value: number;
  decimals: number;
}

export function protectNumbers(text: string): ProtectedText {
  const numbers: string[] = [];
  TOKEN_RE.lastIndex = 0;
  const protectedText = text.replace(TOKEN_RE, (match) => {
    const id = numbers.length;
    numbers.push(match);
    return `__N${id}__`;
  });
  return { text: protectedText, numbers };
}

export function restoreNumbers(
  translated: string,
  numbers: readonly string[],
  source?: AppLang | null,
  target?: AppLang | null,
): string {
  return translated.replace(PLACEHOLDER_RE, (match, id: string) => {
    const value = numbers[Number(id)];
    if (value === undefined) return match;
    return renderToken(value, source ?? null, target ?? null);
  });
}

/** Protect, then write quantities for `target`. Everything else is unchanged. */
export function localizeNumbers(
  text: string,
  source: AppLang | null,
  target: AppLang | null,
): string {
  const protectedText = protectNumbers(text);
  return restoreNumbers(protectedText.text, protectedText.numbers, source, target);
}

function renderToken(
  token: string,
  source: AppLang | null,
  target: AppLang | null,
): string {
  if (!target || source === target) return token;
  const range = splitRange(token);
  if (range) {
    if (convention(range.left) !== convention(range.right)) return token;
    const left = readQuantity(range.left, source);
    const right = readQuantity(range.right, source);
    if (!left || !right) return token;
    return `${formatQuantity(left, target)}${range.sep}${formatQuantity(right, target)}`;
  }
  const quantity = readQuantity(token, source);
  if (!quantity) return token;
  return formatQuantity(quantity, target);
}

function readQuantity(token: string, source: AppLang | null): Quantity | null {
  if (isOpaque(token)) return null;
  const parsed = parseForSource(token, source);
  if (!parsed) return null;
  if (!Number.isFinite(parsed.value)) return null;
  return parsed;
}

function isOpaque(token: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return true;
  if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(token)) return true;
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(token)) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(token)) return true;
  if (/^\+\d[\d ().-]{5,}\d$/.test(token)) return true;
  if (/^\d{2,4}(?:-\d{2,4}){2,}$/.test(token)) return true;
  if (/^\d+(?:\.\d+){2,}$/.test(token) && !/^\d{1,3}(?:\.\d{3})+$/.test(token)) return true;
  return false;
}

function splitRange(
  token: string,
): { left: string; right: string; sep: string } | null {
  const match = token.match(/^(.*\d)\s*[-–—]\s*(\d.*)$/);
  if (!match) return null;
  const left = match[1];
  const right = match[2];
  if (left.includes('-') || right.includes('-') || right.includes('–') || right.includes('—')) {
    return null;
  }
  const sep = token.slice(left.length, token.length - right.length);
  return { left, right, sep };
}

/** Surface convention, used to notice a range whose two sides do not agree. */
function convention(token: string): string {
  const comma = token.lastIndexOf(',');
  const dot = token.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) return dot > comma ? 'en-mixed' : 'eu-mixed';
  if (GROUP_SPACE.test(token)) return 'space';
  if (/^\d{1,3}(?:,\d{3})+$/.test(token)) return 'comma-group';
  if (/^\d{1,3}(?:\.\d{3})+$/.test(token)) return 'dot-group';
  if (dot >= 0) return 'dot-decimal';
  if (comma >= 0) return 'comma-decimal';
  return 'other';
}

function parseForSource(
  token: string,
  source: AppLang | null,
): { value: number; decimals: number } | null {
  if (source === 'en') return parseEn(token);
  if (source === 'de' || source === 'it' || source === 'es') return parseEu(token);
  if (source === 'fr') return parseEu(token) ?? parseFrSpace(token);
  return parseUnambiguous(token);
}

function parseEn(token: string): { value: number; decimals: number } | null {
  const mixed = token.match(/^(\d{1,3}(?:,\d{3})+)\.(\d+)$/);
  if (mixed) return finish(mixed[1].replace(/,/g, ''), mixed[2]);
  if (/^\d{1,3}(?:,\d{3})+$/.test(token)) return finish(token.replace(/,/g, ''), '');
  const decimal = token.match(/^(\d+)\.(\d+)$/);
  if (decimal) return finish(decimal[1], decimal[2]);
  return null;
}

function parseEu(token: string): { value: number; decimals: number } | null {
  const mixed = token.match(/^(\d{1,3}(?:\.\d{3})+),(\d+)$/);
  if (mixed) return finish(mixed[1].replace(/\./g, ''), mixed[2]);
  if (/^\d{1,3}(?:\.\d{3})+$/.test(token)) return finish(token.replace(/\./g, ''), '');
  const decimal = token.match(/^(\d+),(\d+)$/);
  if (decimal) return finish(decimal[1], decimal[2]);
  return null;
}

function parseFrSpace(token: string): { value: number; decimals: number } | null {
  const match = token.match(/^(\d{1,3}(?:[\u00a0\u202f\u2009 ]\d{3})+)(?:,(\d+))?$/);
  if (!match) return null;
  return finish(match[1].replace(/[\u00a0\u202f\u2009 ]/g, ''), match[2] ?? '');
}

/**
 * A lone "1,500" or "1.500" is a thousand in one language and a decimal
 * in another. Without a source language it stays as written. A form that
 * uses both separators, or a fraction that is not three digits, has one reading.
 */
function parseUnambiguous(token: string): { value: number; decimals: number } | null {
  if (/^\d{1,3}[.,]\d{3}$/.test(token)) return null;
  return parseEn(token) ?? parseEu(token) ?? parseFrSpace(token);
}

function finish(
  integer: string,
  fraction: string,
): { value: number; decimals: number } | null {
  const digits = integer.replace(/^0+(?=\d)/, '');
  if (digits.length > 15) return null;
  const value = Number(fraction ? `${integer}.${fraction}` : integer);
  if (!Number.isFinite(value)) return null;
  return { value, decimals: fraction.length };
}

function formatQuantity(quantity: Quantity, target: AppLang): string {
  return new Intl.NumberFormat(target, {
    useGrouping: true,
    minimumFractionDigits: quantity.decimals,
    maximumFractionDigits: quantity.decimals,
  }).format(quantity.value);
}
