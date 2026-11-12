import { NoteTranslations } from './translation.model';

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  source: 'Recording' | 'Upload' | 'Typed';
  language?: string;
  duration?: number;
  /** Missing on notes saved before pinning existed. Treat as not pinned. */
  pinned?: boolean;
  /** Missing on notes saved before tags existed. Treat as no tags. */
  tags?: string[];
  /**
   * Translations of `body`, keyed by target language.
   * Missing on notes saved before translation existed.
   */
  translations?: NoteTranslations;
  /**
   * Set when a CSV import kept only part of the sheet.
   * Counts are data rows and columns, not counting the header row.
   */
  csvLimit?: CsvLimit;
}

export interface CsvLimit {
  shown: number;
  total: number;
  columnsShown?: number;
  columnsTotal?: number;
}
