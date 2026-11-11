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
}
