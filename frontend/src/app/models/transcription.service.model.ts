export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

export interface TranscriptionUpdate {
  text: string;
  chunks?: any[];
  isComplete: boolean;
  language?: string;
  duration?: number;
}
