export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  source: 'Recording' | 'Upload' | 'Typed';
  language?: string;
  duration?: number;
}

