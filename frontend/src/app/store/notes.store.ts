import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { inject } from '@angular/core';
import { tap, pipe, switchMap, catchError, EMPTY, finalize } from 'rxjs';
import { Note } from '../models/note.model';
import { AppLang, NoteTranslation } from '../models/translation.model';
import {
  noteWithTranslation,
  noteWithoutTranslation,
  translationsAfterEdit,
} from '../services/note-translations';
import { NO_SPEECH_ERROR } from '../models/transcription.service.model';
import { TranscriptionService } from '../services/transcription.service';
import { transcriptTitle } from '../services/transcript-text';
import {
  noteFromStorage,
  notesWithPinned,
  notesWithoutTag,
  notesWithTag,
  normalizeStoredNote,
  reorderNotesInGroup,
} from './notes-list';
import { SettingsStore } from './settings.store';

interface NotesState {
  notes: Note[];
  loading: boolean;
  error: string | null;
  /** Bumps when a new note is saved, so auto-translate can run once. */
  noteReady: { id: string; seq: number } | null;
}

const initialState: NotesState = {
  notes: [],
  loading: false,
  error: null,
  noteReady: null,
};

export const NotesStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods(
    (
      store,
      transcription = inject(TranscriptionService),
      settings = inject(SettingsStore),
    ) => {
      let readySeq = 0;
      const persist = (notes: Note[]) => {
        patchState(store, { notes });
        localStorage.setItem('whisper-notes', JSON.stringify(notes));
      };
      const markReady = (id: string) => {
        readySeq += 1;
        patchState(store, { noteReady: { id, seq: readySeq } });
      };
      return {
      loadNotes: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { loading: true, error: null })),
          tap(() => {
            const stored = localStorage.getItem('whisper-notes');
            let notes: Note[] = [];
            try {
              const parsed = stored ? JSON.parse(stored) : [];
              notes = Array.isArray(parsed)
                ? parsed
                    .map((item) => noteFromStorage(item))
                    .filter((item): item is Note => item !== null)
                : [];
            } catch (e) {
              console.error('Corrupt whisper-notes in localStorage', e);
            }
            patchState(store, { notes, loading: false, error: null });
          }),
        ),
      ),
      addNote: (note: Note) => {
        const notes = [...store.notes(), note];
        persist(notes);
        markReady(note.id);
      },
      deleteNote: (id: string) => {
        const notes = store.notes().filter((n) => n.id !== id);
        patchState(store, { notes });
        localStorage.setItem('whisper-notes', JSON.stringify(notes));
      },
      transcribe: rxMethod<{ file: File; source: Note['source'] }>(
        pipe(
          tap(() => patchState(store, { loading: true, error: null })),
          switchMap(({ file, source }) => {
            const noteId = crypto.randomUUID();
            const initialNote: Note = {
              id: noteId,
              title: 'Transcribing...',
              body: '',
              createdAt: Date.now(),
              source,
            };
            const notes = [...store.notes(), initialNote];
            patchState(store, { notes });
            localStorage.setItem('whisper-notes', JSON.stringify(notes));

            const model = settings.model();
            let settled = false;

            return transcription.transcribe(file).pipe(
              tap((update) => {
                const text = update.text.trim();
                if (update.isComplete && !text) {
                  settled = true;
                  const remaining = store.notes().filter((n) => n.id !== noteId);
                  patchState(store, {
                    notes: remaining,
                    loading: false,
                    error: NO_SPEECH_ERROR,
                  });
                  localStorage.setItem(
                    'whisper-notes',
                    JSON.stringify(remaining),
                  );
                  settings.setLastUsedModel(model);
                  return;
                }

                const updatedNote: Note = {
                  id: noteId,
                  title: text ? transcriptTitle(text) : 'Transcribing...',
                  body: update.text,
                  createdAt: initialNote.createdAt,
                  source,
                  language: update.language,
                  duration: update.duration,
                };

                const updatedNotes = store
                  .notes()
                  .map((n) => (n.id === noteId ? updatedNote : n));
                patchState(store, { notes: updatedNotes });
                if (text || update.isComplete) {
                  localStorage.setItem(
                    'whisper-notes',
                    JSON.stringify(updatedNotes),
                  );
                }

                if (update.isComplete) {
                  settled = true;
                  patchState(store, { loading: false, error: null });
                  settings.setLastUsedModel(model);
                  if (text) markReady(noteId);
                }
              }),
              catchError((error) => {
                settled = true;
                console.error('Transcription failed', error);
                const notes = store.notes().filter((n) => n.id !== noteId);
                patchState(store, {
                  notes,
                  loading: false,
                  error:
                    error instanceof Error
                      ? error.message
                      : 'Transcription failed',
                });
                localStorage.setItem('whisper-notes', JSON.stringify(notes));
                return EMPTY;
              }),
              finalize(() => {
                if (settled) return;
                const remaining = store.notes().filter((n) => n.id !== noteId);
                if (remaining.length === store.notes().length) return;
                patchState(store, { notes: remaining });
                localStorage.setItem(
                  'whisper-notes',
                  JSON.stringify(remaining),
                );
              }),
            );
          }),
        ),
      ),
      setPinned: (id: string, pinned: boolean) => {
        const notes = notesWithPinned(store.notes(), id, pinned);
        patchState(store, { notes });
        localStorage.setItem('whisper-notes', JSON.stringify(notes));
      },
      addTag: (id: string, rawTag: string) => {
        const current = store.notes();
        const notes = notesWithTag(current, id, rawTag);
        if (notes === current) return;
        patchState(store, { notes });
        localStorage.setItem('whisper-notes', JSON.stringify(notes));
      },
      removeTag: (id: string, rawTag: string) => {
        const current = store.notes();
        const notes = notesWithoutTag(current, id, rawTag);
        if (notes === current) return;
        patchState(store, { notes });
        localStorage.setItem('whisper-notes', JSON.stringify(notes));
      },
      updateNote: (id: string, changes: Partial<Omit<Note, 'id'>>) => {
        const notes = store.notes().map((note) => {
          if (note.id !== id) return note;
          const next = { ...note, ...changes };
          const nextTitle = typeof changes.title === 'string' ? changes.title : note.title;
          const nextBody = typeof changes.body === 'string' ? changes.body : note.body;
          if (nextTitle !== note.title || nextBody !== note.body) {
            next.translations = translationsAfterEdit(
              note.translations,
              nextTitle,
              nextBody,
              { title: note.title, body: note.body },
            );
          }
          return next;
        });
        persist(notes);
      },
      setTranslation: (id: string, lang: AppLang, translation: NoteTranslation) => {
        const notes = store
          .notes()
          .map((note) =>
            note.id === id ? noteWithTranslation(note, lang, translation) : note,
          );
        persist(notes);
      },
      deleteTranslation: (id: string, lang: AppLang) => {
        const notes = store
          .notes()
          .map((note) =>
            note.id === id ? noteWithoutTranslation(note, lang) : note,
          );
        persist(notes);
      },
      reorderNotes: (fromIndex: number, toIndex: number) => {
        const notes = [...store.notes()];
        const [moved] = notes.splice(fromIndex, 1);
        notes.splice(toIndex, 0, moved);
        patchState(store, { notes });
        localStorage.setItem('whisper-notes', JSON.stringify(notes));
      },
      reorderWithinGroup: (pinned: boolean, from: number, to: number) => {
        const notes = reorderNotesInGroup(store.notes(), pinned, from, to);
        patchState(store, { notes });
        localStorage.setItem('whisper-notes', JSON.stringify(notes));
      },
      exportNotes: () => {
        const notes = store.notes();
        const exportData = {
          version: '1.0',
          exportDate: new Date().toISOString(),
          noteCount: notes.length,
          notes,
        };
        return JSON.stringify(exportData, null, 2);
      },
      importNotes: (importedNotes: Note[], merge: boolean = false) => {
        const cleaned = importedNotes
          .map((note) => normalizeStoredNote(note) ?? noteFromStorage(note))
          .filter((note): note is Note => note !== null);
        if (merge) {
          const existingNotes = store.notes();
          const existingIds = new Set(existingNotes.map((n) => n.id));
          const newNotes = cleaned.filter((n) => !existingIds.has(n.id));
          const mergedNotes = [...existingNotes, ...newNotes];
          patchState(store, { notes: mergedNotes });
          localStorage.setItem('whisper-notes', JSON.stringify(mergedNotes));
        } else {
          patchState(store, { notes: cleaned });
          localStorage.setItem('whisper-notes', JSON.stringify(cleaned));
        }
      },
      clearError: () => {
        patchState(store, { error: null });
      },
    };
    },
  ),
);
