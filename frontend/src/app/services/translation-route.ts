import { AppLang } from '../models/translation.model';

export interface LangPair {
  id: string;
  src: AppLang;
  tgt: AppLang;
}

/** Direct Firefox base-memory packs. Anything else among the five languages pivots through English. */
const DIRECT = new Set([
  'enes',
  'esen',
  'enfr',
  'fren',
  'ende',
  'deen',
  'enit',
  'iten',
]);

export function pairId(src: AppLang, tgt: AppLang): string {
  return `${src}${tgt}`;
}

/**
 * Models needed to translate from the original language to the target.
 * There is no translation-of-a-translation step here: a missing direct pack
 * is only an internal English pivot (source → en → target).
 */
export function translationRoute(src: AppLang, tgt: AppLang): LangPair[] {
  if (src === tgt) return [];
  const direct = pairId(src, tgt);
  if (DIRECT.has(direct)) return [{ id: direct, src, tgt }];
  if (src !== 'en' && tgt !== 'en') {
    return [
      { id: pairId(src, 'en'), src, tgt: 'en' },
      { id: pairId('en', tgt), src: 'en', tgt },
    ];
  }
  return [{ id: direct, src, tgt }];
}
