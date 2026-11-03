export type TranscriptionTask = 'transcribe' | 'translate';
export type ThemePreference = 'system' | 'light' | 'dark';

export interface SettingsState {
  model: string;
  multilingual: boolean;
  quantized: boolean;
  language: string;
  uiLanguage: string;
  task: TranscriptionTask;
  lastUsedModel: string | null;
  theme: ThemePreference;
}

export const SETTINGS_STORAGE_KEY = 'whisper-settings';

/** localStorage prefix: one consent flag per model id, cleared with the model cache. */
export const MODEL_DOWNLOAD_CONSENT_PREFIX = 'model-download-consent:';

export interface LanguageOption {
  id: string;
  label: string;
}

export interface UiLanguageOption {
  id: string;
  label: string;
}

export interface ModelOption {
  value: string;
  /** Short name used in confirmations and the picker. */
  label: string;
  size: string;
  englishOnly: boolean;
  faster?: boolean;
}

export const modelOptions: ModelOption[] = [
  {
    value: 'Xenova/whisper-tiny',
    label: 'Whisper tiny',
    size: '41 MB',
    englishOnly: false,
  },
  {
    value: 'Xenova/whisper-base',
    label: 'Whisper base',
    size: '77 MB',
    englishOnly: false,
  },
  {
    value: 'Xenova/whisper-small',
    label: 'Whisper small',
    size: '249 MB',
    englishOnly: false,
  },
  {
    value: 'Xenova/whisper-tiny.en',
    label: 'Whisper tiny.en',
    size: '41 MB',
    englishOnly: true,
  },
  {
    value: 'Xenova/whisper-base.en',
    label: 'Whisper base.en',
    size: '77 MB',
    englishOnly: true,
  },
  {
    value: 'distil-whisper/distil-small.en',
    label: 'Distil small',
    size: '125 MB',
    englishOnly: true,
    faster: true,
  },
  {
    value: 'distil-whisper/distil-medium.en',
    label: 'Distil medium',
    size: '402 MB',
    englishOnly: true,
  },
  {
    value: 'onnx-community/moonshine-tiny-ONNX',
    label: 'Moonshine tiny',
    size: '28 MB',
    englishOnly: true,
    faster: true,
  },
];

export function modelOption(id: string): ModelOption | undefined {
  return modelOptions.find((option) => option.value === id);
}

export function isEnglishOnlyModel(model: string): boolean {
  return (
    model.endsWith('.en') ||
    model.startsWith('distil-whisper/') ||
    model.includes('moonshine')
  );
}

export const languages: LanguageOption[] = [
  { id: 'english', label: 'English' },
  { id: 'spanish', label: 'Spanish' },
  { id: 'french', label: 'French' },
  { id: 'german', label: 'German' },
  { id: 'italian', label: 'Italian' },
];

export const uiLanguages: UiLanguageOption[] = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' },
  { id: 'it', label: 'Italiano' },
];
