/**
 * Numbers that contain a separator. Bergamot rewrites "1,500" and "1.500"
 * into the same target form, and can garble mixed values such as "12,345.67".
 * Placeholders are copied through the model and restored afterwards.
 */
const NUMBER_RE =
  /(?<![A-Za-zÀ-ÿ\d])(?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+[.,]\d+)(?![A-Za-zÀ-ÿ\d])/g;

const PLACEHOLDER_RE = /__\s*N\s*(\d+)\s*__/g;

export interface ProtectedText {
  text: string;
  numbers: string[];
}

export function protectNumbers(text: string): ProtectedText {
  const numbers: string[] = [];
  const protectedText = text.replace(NUMBER_RE, (match) => {
    const id = numbers.length;
    numbers.push(match);
    return `__N${id}__`;
  });
  return { text: protectedText, numbers };
}

export function restoreNumbers(translated: string, numbers: readonly string[]): string {
  return translated.replace(PLACEHOLDER_RE, (match, id: string) => {
    const value = numbers[Number(id)];
    return value ?? match;
  });
}
