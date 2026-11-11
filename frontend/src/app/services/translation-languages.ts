import { APP_LANGS, AppLang } from '../models/translation.model';
import { CatalogPack, catalogPack } from './translation-catalog';
import { InstalledPack } from './translation-cache';
import { translationRoute } from './translation-route';

/** Non-English languages. English is the hub and has no pack of its own. */
export const PACK_LANGUAGES: readonly AppLang[] = ['fr', 'de', 'it', 'es'];

export interface LanguageRow {
  lang: AppLang;
  bytes: number;
}

export interface MissingLanguage {
  lang: AppLang;
  bytes: number;
}

export interface TranslateChoice {
  target: AppLang;
  missingBytes: number;
  missingLanguages: MissingLanguage[];
  ready: boolean;
}

/** The non-English side of a direct pack. English-only hops are not listed. */
export function packLanguage(src: AppLang, tgt: AppLang): AppLang | null {
  if (src !== 'en' && tgt === 'en') return src;
  if (tgt !== 'en' && src === 'en') return tgt;
  return null;
}

export function packIdsForLanguage(lang: AppLang): string[] {
  if (lang === 'en') return [];
  return [`en${lang}`, `${lang}en`];
}

/** One row per installed non-English language. Both directions are added together. */
export function languageRows(packs: readonly InstalledPack[]): LanguageRow[] {
  const totals = new Map<AppLang, number>();
  for (const pack of packs) {
    const lang = packLanguage(pack.src, pack.tgt);
    if (!lang) continue;
    totals.set(lang, (totals.get(lang) ?? 0) + pack.bytes);
  }
  return PACK_LANGUAGES.filter((lang) => totals.has(lang)).map((lang) => ({
    lang,
    bytes: totals.get(lang) ?? 0,
  }));
}

export function groupMissingByLanguage(packs: readonly CatalogPack[]): MissingLanguage[] {
  const totals = new Map<AppLang, number>();
  for (const pack of packs) {
    const lang = packLanguage(pack.src, pack.tgt);
    if (!lang) continue;
    totals.set(lang, (totals.get(lang) ?? 0) + pack.bytes);
  }
  return PACK_LANGUAGES.filter((lang) => totals.has(lang)).map((lang) => ({
    lang,
    bytes: totals.get(lang) ?? 0,
  }));
}

/**
 * Target languages for a note, with the real size of packs that are not on
 * the phone yet. A French to German translation needs the French and German
 * packs. An already downloaded language is left out of the total.
 */
export function translateChoices(
  source: AppLang,
  installedIds: ReadonlySet<string>,
): TranslateChoice[] {
  return APP_LANGS.filter((target) => target !== source).map((target) => {
    const missingPacks = translationRoute(source, target)
      .filter((pair) => !installedIds.has(pair.id))
      .map((pair) => catalogPack(pair.id))
      .filter((pack): pack is CatalogPack => !!pack);
    const missingLanguages = groupMissingByLanguage(missingPacks);
    const missingBytes = missingLanguages.reduce((sum, item) => sum + item.bytes, 0);
    return {
      target,
      missingBytes,
      missingLanguages,
      ready: missingBytes === 0,
    };
  });
}
