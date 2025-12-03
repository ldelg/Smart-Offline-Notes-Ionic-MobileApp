//Store

export type TranscriptionTask = 'transcribe' | 'translate';

export interface SettingsState {
  model: string;
  multilingual: boolean;
  quantized: boolean;
  language: string;
  task: TranscriptionTask;
  lastUsedModel: string | null;
}

export const SETTINGS_STORAGE_KEY = 'whisper-settings';

// Component

export interface LanguageOption {
  id: string;
  label: string;
}

export interface ModelOption {
  value: string;
  label: string;
}

export const modelOptions: ModelOption[] = [
  { value: 'Xenova/whisper-tiny', label: 'Xenova/whisper-tiny (41MB)' },
  { value: 'Xenova/whisper-base', label: 'Xenova/whisper-base (77MB)' },
  { value: 'Xenova/whisper-small', label: 'Xenova/whisper-small (249MB)' },
  // { value: 'Xenova/whisper-medium', label: 'Xenova/whisper-medium (776MB)' },
  // {
  //   value: 'distil-whisper/distil-medium.en',
  //   label: 'distil-whisper/distil-medium.en (402MB)',
  // },
  // {
  //   value: 'distil-whisper/distil-large-v2',
  //   label: 'distil-whisper/distil-large-v2 (767MB)',
  // },
];

export const languages: LanguageOption[] = [
  { id: 'english', label: 'English' },
  { id: 'spanish', label: 'Spanish' },
  { id: 'french', label: 'French' },
  { id: 'german', label: 'German' },
  { id: 'italian', label: 'Italian' },
];
