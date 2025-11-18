import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap, pipe } from 'rxjs';
import { Note } from '../models/note.model';
import { environment } from '../../environments/environment';

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
  withMethods((store, http = inject(HttpClient)) => ({
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
        tap(({ file, source }) => {
          const formData = new FormData();
          formData.append('file', file, file.name);
          http.post<{ text: string; language?: string; duration?: number }>(environment.apiUrl, formData).subscribe({
            next: (response) => {
              const note: Note = {
                id: crypto.randomUUID(),
                title: response.text.slice(0, 60) || 'Transcribed note',
                body: response.text.trim(),
                createdAt: Date.now(),
                source,
                language: response.language,
                duration: response.duration,
              };
              const notes = [...store.notes(), note];
              patchState(store, { notes, loading: false });
              localStorage.setItem('whisper-notes', JSON.stringify(notes));
            },
            error: () => patchState(store, { loading: false }),
          });
        })
      )
    ),
    updateNote: (id: string, changes: Partial<Omit<Note, 'id'>>) => {
      const notes = store.notes().map((note) =>
        note.id === id ? { ...note, ...changes } : note
      );
      patchState(store, { notes });
      localStorage.setItem('whisper-notes', JSON.stringify(notes));
    },
  }))
);

