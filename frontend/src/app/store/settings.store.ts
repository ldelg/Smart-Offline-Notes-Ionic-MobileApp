import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import {
  SETTINGS_STORAGE_KEY,
  SettingsState,
  ThemePreference,
} from '../models/settings.model';
import { AppLang } from '../models/translation.model';
import {
  resolveAutoTranslate,
  settingsNeedMigration,
} from '../services/settings-migration';

const loadSettings = (): Partial<SettingsState> => {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as SettingsState;
      return parsed;
    }
  } catch (e) {
    console.warn('Failed to load settings', e);
  }
  return {};
};

const loaded = loadSettings();
const theme: ThemePreference =
  loaded.theme === 'light' || loaded.theme === 'dark' || loaded.theme === 'system'
    ? loaded.theme
    : 'system';

const initialState: SettingsState = {
  // New installs use Whisper base. It stays multilingual, and at q8 it
  // punctuates without the tiny model's loops and cut-off text. A model
  // already saved in localStorage still wins via the spread below.
  model: 'Xenova/whisper-base',
  multilingual: false,
  quantized: true,
  language: 'english',
  uiLanguage: 'en',
  lastUsedModel: null,
  ...loaded,
  theme,
  task: 'transcribe',
  autoTranslateTo: resolveAutoTranslate(loaded),
};

if (settingsNeedMigration(loaded)) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(initialState));
  } catch (e) {
    console.warn('Failed to migrate settings', e);
  }
}

export const SettingsStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store) => {
    const updateSettings = (partial: Partial<SettingsState>) => {
      patchState(store, partial);
      try {
        const currentState: SettingsState = {
          model: store.model(),
          multilingual: store.multilingual(),
          quantized: store.quantized(),
          language: store.language(),
          uiLanguage: store.uiLanguage(),
          task: 'transcribe',
          lastUsedModel: store.lastUsedModel(),
          theme: store.theme(),
          autoTranslateTo: store.autoTranslateTo(),
        };
        localStorage.setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify(currentState),
        );
      } catch (e) {
        console.warn('Failed to save settings', e);
      }
    };

    return {
      setModel(model: string) {
        updateSettings({ model });
      },
      setMultilingual(multilingual: boolean) {
        updateSettings({ multilingual });
      },
      setLanguage(language: string) {
        updateSettings({ language });
      },
      setUiLanguage(uiLanguage: string) {
        updateSettings({ uiLanguage });
      },
      setLastUsedModel(modelName: string | null) {
        updateSettings({ lastUsedModel: modelName });
      },
      setTheme(themePreference: ThemePreference) {
        updateSettings({ theme: themePreference });
      },
      setAutoTranslateTo(autoTranslateTo: AppLang | null) {
        updateSettings({ autoTranslateTo });
      },
    };
  }),
);
