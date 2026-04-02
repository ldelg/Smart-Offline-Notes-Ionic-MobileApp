import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';

export interface TranslationState {
  currentLang: string;
  translations: Record<string, unknown>;
  loading: boolean;
}

const initialState: TranslationState = {
  currentLang: 'en',
  translations: {},
  loading: false,
};

const lookupTranslation = (
  translations: Record<string, unknown>,
  key: string,
): string => {
  if (!translations || !key) return key;
  const parts = key.split('.');
  let cur: any = translations;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return key;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : key;
};

export const TranslationStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => ({
    async setLanguage(lang: string) {
      if (!lang || lang === store.currentLang()) return;
      patchState(store, { loading: true });
      try {
        const resp = await fetch(`assets/i18n/${lang}.json`);
        if (!resp.ok) {
          patchState(store, {
            translations: {},
            currentLang: lang,
            loading: false,
          });
          return;
        }
        const json = (await resp.json()) as Record<string, unknown>;
        patchState(store, {
          translations: json,
          currentLang: lang,
          loading: false,
        });
      } catch (_error) {
        patchState(store, {
          translations: {},
          currentLang: lang,
          loading: false,
        });
      }
    },
    t(key: string) {
      return lookupTranslation(store.translations(), key);
    },
    getUiLanguageLabel(
      langId: string,
      uiLanguages: Array<{ id: string; label: string }>,
    ) {
      const translated = this.t(`languages.${langId}`);
      if (translated && !translated.startsWith('languages.')) return translated;
      const opt = uiLanguages.find((u) => u.id === langId);
      return opt ? opt.label : langId;
    },
  })),
);
