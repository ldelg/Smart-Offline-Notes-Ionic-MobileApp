import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { inject } from '@angular/core';
import { tap, pipe, switchMap, catchError, EMPTY, finalize } from 'rxjs';
import { Note } from '../models/note.model';
import { TranscriptionService } from '../services/transcription.service';
import { SettingsStore } from './settings.store';

interface NotesState {
  notes: Note[];
  loading: boolean;
  error: string | null;
}

const initialState: NotesState = {
  notes: [],
  loading: false,
  error: null,
};

export const NotesStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods(
    (
      store,
      transcription = inject(TranscriptionService),
      settings = inject(SettingsStore),
    ) => ({
      loadNotes: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { loading: true, error: null })),
          tap(() => {
            const stored = localStorage.getItem('whisper-notes');
            let notes: Note[] = [];
            try {
              const parsed = stored ? JSON.parse(stored) : [];
              if (Array.isArray(parsed)) {
                notes = parsed;
              } else if (stored) {
                console.error('whisper-notes in localStorage is not an array');
              }
            } catch (e) {
              console.error('Corrupt whisper-notes in localStorage', e);
            }
            patchState(store, { notes, loading: false, error: null });
          }),
        ),
      ),
      addNote: (note: Note) => {
        const notes = [...store.notes(), note];
        patchState(store, { notes });
        localStorage.setItem('whisper-notes', JSON.stringify(notes));
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
            const dropPlaceholder = () => {
              const notes = store.notes().filter((n) => n.id !== noteId);
              patchState(store, { notes });
              localStorage.setItem('whisper-notes', JSON.stringify(notes));
            };

            return transcription.transcribe(file).pipe(
              tap({
                next: (update) => {
                  const updatedNote: Note = {
                    id: noteId,
                    title: update.text.trim()
                      ? update.text.slice(0, 60)
                      : 'Transcribing...',
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
                  localStorage.setItem(
                    'whisper-notes',
                    JSON.stringify(updatedNotes),
                  );

                  if (update.isComplete) {
                    patchState(store, { loading: false, error: null });
                    settings.setLastUsedModel(model);
                  }
                },
                complete: () => {
                  settled = true;
                },
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
                // switchMap unsubscribes the previous job without an error,
                // which used to leave its placeholder as "Transcribing...".
                if (!settled) dropPlaceholder();
              }),
            );
          }),
        ),
      ),
      updateNote: (id: string, changes: Partial<Omit<Note, 'id'>>) => {
        const notes = store
          .notes()
          .map((note) => (note.id === id ? { ...note, ...changes } : note));
        patchState(store, { notes });
        localStorage.setItem('whisper-notes', JSON.stringify(notes));
      },
      reorderNotes: (fromIndex: number, toIndex: number) => {
        const notes = [...store.notes()];
        const [moved] = notes.splice(fromIndex, 1);
        notes.splice(toIndex, 0, moved);
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
        if (merge) {
          const existingNotes = store.notes();
          const existingIds = new Set(existingNotes.map((n) => n.id));
          const newNotes = importedNotes.filter((n) => !existingIds.has(n.id));
          const mergedNotes = [...existingNotes, ...newNotes];
          patchState(store, { notes: mergedNotes });
          localStorage.setItem('whisper-notes', JSON.stringify(mergedNotes));
        } else {
          patchState(store, { notes: importedNotes });
          localStorage.setItem('whisper-notes', JSON.stringify(importedNotes));
        }
      },
      clearError: () => {
        patchState(store, { error: null });
      },
    }),
  ),
);
