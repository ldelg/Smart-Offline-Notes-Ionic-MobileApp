import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import {
  SETTINGS_STORAGE_KEY,
  SettingsState,
  TranscriptionTask,
} from '../models/settings.model';

const loadSettings = (): Partial<SettingsState> => {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as SettingsState;
      // Model name is used as-is from dropdown (no appending)
      return parsed;
    }
  } catch (e) {
    console.warn('Failed to load settings', e);
  }
  return {};
};

const initialState: SettingsState = {
  model: 'Xenova/whisper-base',
  multilingual: false,
  quantized: true,
  language: 'english',
  task: 'transcribe',
  lastUsedModel: null,
  ...loadSettings(),
};

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
          task: store.task(),
          lastUsedModel: store.lastUsedModel(),
        };
        localStorage.setItem(
          SETTINGS_STORAGE_KEY,
          JSON.stringify(currentState)
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
      setTask(task: TranscriptionTask) {
        updateSettings({ task });
      },
      setLastUsedModel(modelName: string | null) {
        updateSettings({ lastUsedModel: modelName });
      },
    };
  })
);
