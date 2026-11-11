import { catalogPack } from './translation-catalog';
import { InstalledPack } from './translation-cache';
import {
  languageRows,
  packIdsForLanguage,
  translateChoices,
} from './translation-languages';

describe('translation languages', () => {
  const installed = (
    id: string,
    src: InstalledPack['src'],
    tgt: InstalledPack['tgt'],
    bytes: number,
  ): InstalledPack => ({ id, src, tgt, bytes, savedAt: 1 });

  it('groups both directions of a language and skips English', () => {
    const rows = languageRows([
      installed('fren', 'fr', 'en', 10),
      installed('enfr', 'en', 'fr', 12),
      installed('ende', 'en', 'de', 7),
    ]);
    expect(rows).toEqual([
      { lang: 'fr', bytes: 22 },
      { lang: 'de', bytes: 7 },
    ]);
    expect(packIdsForLanguage('fr')).toEqual(['enfr', 'fren']);
    expect(packIdsForLanguage('en')).toEqual([]);
  });

  it('prices French to German as the French and German packs that are missing', () => {
    const fren = catalogPack('fren')!.bytes;
    const ende = catalogPack('ende')!.bytes;
    const none = translateChoices('fr', new Set());
    const german = none.find((choice) => choice.target === 'de');
    expect(german?.ready).toBeFalse();
    expect(german?.missingLanguages.map((item) => item.lang)).toEqual(['fr', 'de']);
    expect(german?.missingBytes).toBe(fren + ende);

    const frenchOnly = translateChoices('fr', new Set(['fren']));
    expect(frenchOnly.find((choice) => choice.target === 'en')?.ready).toBeTrue();
    expect(frenchOnly.find((choice) => choice.target === 'de')?.missingLanguages).toEqual([
      { lang: 'de', bytes: ende },
    ]);
  });

  it('marks English to Spanish ready once that one pack is installed', () => {
    const choices = translateChoices('en', new Set(['enes']));
    expect(choices.find((choice) => choice.target === 'es')?.ready).toBeTrue();
    expect(choices.find((choice) => choice.target === 'de')?.ready).toBeFalse();
  });
});
