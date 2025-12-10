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
  {
    value: 'Xenova/whisper-tiny',
    label: 'Xenova/whisper-tiny (41MB, multilingual)',
  },
  {
    value: 'Xenova/whisper-base',
    label: 'Xenova/whisper-base (77MB, multilingual)',
  },
  {
    value: 'Xenova/whisper-small',
    label: 'Xenova/whisper-small (249MB, multilingual)',
  },
  {
    value: 'Xenova/whisper-tiny.en',
    label: 'Xenova/whisper-tiny.en (41MB, English only)',
  },
  {
    value: 'Xenova/whisper-base.en',
    label: 'Xenova/whisper-base.en (77MB, English only)',
  },
  {
    value: 'distil-whisper/distil-small.en',
    label: 'distil-whisper/distil-small.en (~125MB, 6x faster, English only)',
  },
  {
    value: 'distil-whisper/distil-medium.en',
    label: 'distil-whisper/distil-medium.en (402MB, English only)',
  },
];

export const languages: LanguageOption[] = [
  { id: 'english', label: 'English' },
  { id: 'spanish', label: 'Spanish' },
  { id: 'french', label: 'French' },
  { id: 'german', label: 'German' },
  { id: 'italian', label: 'Italian' },
];
