export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

/** Store/service error code when the clip has no usable speech. */
export const NO_SPEECH_ERROR = 'NO_SPEECH';

export interface TranscriptionUpdate {
  text: string;
  chunks?: any[];
  isComplete: boolean;
  language?: string;
  duration?: number;
}
