import { signalStore, withMethods, withState, patchState } from '@ngrx/signals';

export type TranscriptionTask = 'transcribe' | 'translate';

export interface SettingsState {
  model: string;
  multilingual: boolean;
  quantized: boolean;
  language: string;
  task: TranscriptionTask;
  lastUsedModel: string | null; // Track the actual model that was last used
}

const initialState: SettingsState = {
  model: 'Xenova/whisper-base',
  multilingual: false,
  quantized: true,
  language: 'english',
  task: 'transcribe',
  lastUsedModel: null,
};

export const SettingsStore = signalStore(
  { providedIn: 'root' },
  withState<SettingsState>(initialState),
  withMethods((store) => ({
    setModel(model: string) {
      patchState(store, { model });
    },
    setMultilingual(multilingual: boolean) {
      patchState(store, { multilingual });
    },
    setQuantized(quantized: boolean) {
      patchState(store, { quantized });
    },
    setLanguage(language: string) {
      patchState(store, { language });
    },
    setTask(task: TranscriptionTask) {
      patchState(store, { task });
    },
    setLastUsedModel(modelName: string) {
      patchState(store, { lastUsedModel: modelName });
    },
  }))
);
