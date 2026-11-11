import { Note } from '../models/note.model';
import { notesWithTag, notesWithoutTag, normalizeTags } from './notes-list';

export interface NoteEditorValue {
  title: string;
  body: string;
  tags: readonly string[];
}

/** True when the open editor differs from the last saved title, body, or tags. */
export function noteEditorDirty(
  saved: NoteEditorValue,
  draft: NoteEditorValue,
): boolean {
  if (saved.title.trim() !== draft.title.trim()) return true;
  if (saved.body.trim() !== draft.body.trim()) return true;
  return !sameTags(saved.tags, draft.tags);
}

function sameTags(saved: readonly string[], draft: readonly string[]): boolean {
  const left = normalizeTags([...saved]).slice().sort((a, b) => a.localeCompare(b));
  const right = normalizeTags([...draft]).slice().sort((a, b) => a.localeCompare(b));
  if (left.length !== right.length) return false;
  return left.every((tag, index) => tag === right[index]);
}

function draftNote(tags: readonly string[]): Note {
  return {
    id: 'editor',
    title: '',
    body: '',
    createdAt: 0,
    source: 'Typed',
    tags: [...tags],
  };
}

export function editorTagsAfterAdd(tags: readonly string[], rawTag: string): string[] {
  return notesWithTag([draftNote(tags)], 'editor', rawTag)[0].tags ?? [];
}

export function editorTagsAfterRemove(tags: readonly string[], rawTag: string): string[] {
  return notesWithoutTag([draftNote(tags)], 'editor', rawTag)[0].tags ?? [];
}
