import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { inject } from '@angular/core';
import { tap, pipe, switchMap, catchError, EMPTY } from 'rxjs';
import { Note } from '../models/note.model';
import { TranscriptionService } from '../services/transcription.service';
import { SettingsStore } from './settings.store';

interface NotesState {
  notes: Note[];
  loading: boolean;
}

const initialState: NotesState = {
  notes: [],
  loading: false,
};

export const NotesStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods(
    (
      store,
      transcription = inject(TranscriptionService),
      settings = inject(SettingsStore)
    ) => ({
      loadNotes: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { loading: true })),
          tap(() => {
            const stored = localStorage.getItem('whisper-notes');
            const notes = stored ? JSON.parse(stored) : [];
            patchState(store, { notes, loading: false });
          })
        )
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
          tap(() => patchState(store, { loading: true })),
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

            // Track the actual model being used (use model as-is from dropdown)
            const model = settings.model();
            settings.setLastUsedModel(model);

            return transcription.transcribe(file).pipe(
              tap((update) => {
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
                  JSON.stringify(updatedNotes)
                );

                if (update.isComplete) {
                  patchState(store, { loading: false });
                }
              }),
              catchError((error) => {
                console.error('Transcription failed', error);
                const notes = store.notes().filter((n) => n.id !== noteId);
                patchState(store, { notes, loading: false });
                localStorage.setItem('whisper-notes', JSON.stringify(notes));
                return EMPTY;
              })
            );
          })
        )
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
          // Merge: combine with existing, dedupe by ID
          const existingNotes = store.notes();
          const existingIds = new Set(existingNotes.map((n) => n.id));
          const newNotes = importedNotes.filter((n) => !existingIds.has(n.id));
          const mergedNotes = [...existingNotes, ...newNotes];
          patchState(store, { notes: mergedNotes });
          localStorage.setItem('whisper-notes', JSON.stringify(mergedNotes));
        } else {
          // Replace: replace all notes
          patchState(store, { notes: importedNotes });
          localStorage.setItem('whisper-notes', JSON.stringify(importedNotes));
        }
      },
    })
  )
);
