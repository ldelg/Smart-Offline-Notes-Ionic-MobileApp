import { TestBed } from '@angular/core/testing';
import { NotesStore } from './notes.store';
import { TranscriptionService } from '../services/transcription.service';

describe('NotesStore', () => {
  const legacy = {
    id: 'a',
    title: 'Hello',
    body: 'Line one.\n\nLine two.',
    createdAt: 10,
    source: 'Typed',
    language: 'english',
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: TranscriptionService, useValue: {} }],
    });
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('loads a legacy note without pin or tags and does not rewrite it', () => {
    localStorage.setItem('whisper-notes', JSON.stringify([legacy]));
    const store = TestBed.inject(NotesStore);
    store.loadNotes();

    const note = store.notes()[0];
    expect(note.body).toBe(legacy.body);
    expect(note.language).toBe('english');
    expect(note.pinned).toBeFalse();
    expect(note.tags).toEqual([]);
    expect(JSON.parse(localStorage.getItem('whisper-notes') || '[]')).toEqual([legacy]);
  });

  it('keeps a record that cannot be normalized when it still has an id', () => {
    localStorage.setItem(
      'whisper-notes',
      JSON.stringify([{ id: 'keep', extra: 1 }]),
    );
    const store = TestBed.inject(NotesStore);
    store.loadNotes();
    expect(store.notes().map((note) => note.id)).toEqual(['keep']);
  });

  it('pins and tags a note without dropping the original fields', () => {
    localStorage.setItem('whisper-notes', JSON.stringify([legacy]));
    const store = TestBed.inject(NotesStore);
    store.loadNotes();
    store.setPinned('a', true);
    store.addTag('a', ' Work ');
    store.addTag('a', 'work');

    const saved = JSON.parse(localStorage.getItem('whisper-notes') || '[]');
    expect(saved[0].pinned).toBeTrue();
    expect(saved[0].tags).toEqual(['Work']);
    expect(saved[0].body).toBe(legacy.body);
    expect(saved[0].language).toBe('english');
    expect(saved[0].title).toBe('Hello');

    store.setTranslation('a', 'en', {
      text: 'Line one.\n\nLine two.',
      sourceLang: 'it',
      sourceHash: 'pending',
      createdAt: 2,
      stale: false,
    });
    store.setTranslation('a', 'de', {
      text: 'Zeile',
      sourceLang: 'it',
      sourceHash: 'pending',
      createdAt: 3,
      stale: false,
    });
    store.updateNote('a', { title: 'Hello' });
    expect(store.notes()[0].translations?.en?.stale).toBeFalse();
    expect(store.notes()[0].translations?.de?.text).toBe('Zeile');
    store.updateNote('a', { body: 'Changed body' });
    expect(store.notes()[0].body).toBe('Changed body');
    expect(store.notes()[0].translations?.en?.text).toBe('Line one.\n\nLine two.');
    expect(store.notes()[0].translations?.en?.stale).toBeTrue();
    expect(store.notes()[0].translations?.de?.stale).toBeTrue();
    store.deleteTranslation('a', 'en');
    expect(store.notes()[0].translations?.en).toBeUndefined();
    expect(store.notes()[0].translations?.de?.text).toBe('Zeile');
    expect(store.notes()[0].language).toBe('english');

    store.removeTag('a', 'WORK');
    expect(store.notes()[0].tags).toEqual([]);
    expect(store.notes()[0].pinned).toBeTrue();
  });

  it('imports legacy notes and keeps notes that were already stored when merging', () => {
    localStorage.setItem('whisper-notes', JSON.stringify([legacy]));
    const store = TestBed.inject(NotesStore);
    store.loadNotes();
    store.importNotes(
      [
        {
          id: 'b',
          title: 'Imported',
          body: 'Still here',
          createdAt: 11,
          source: 'Upload',
        },
      ],
      true,
    );

    const ids = store.notes().map((note) => note.id);
    expect(ids).toEqual(['a', 'b']);
    expect(store.notes()[1].pinned).toBeFalse();
    expect(store.notes()[1].tags).toEqual([]);
    expect(store.notes()[1].body).toBe('Still here');
    expect(store.notes()[0].body).toBe(legacy.body);
  });

  it('persists a reorder inside one pin group without moving the other group', () => {
    localStorage.setItem(
      'whisper-notes',
      JSON.stringify([
        legacy,
        { ...legacy, id: 'b', title: 'Second', pinned: true },
        { ...legacy, id: 'c', title: 'Third' },
      ]),
    );
    const store = TestBed.inject(NotesStore);
    store.loadNotes();
    store.setPinned('a', true);
    store.reorderWithinGroup(true, 0, 1);
    const saved = JSON.parse(localStorage.getItem('whisper-notes') || '[]');
    expect(saved.map((note: { id: string }) => note.id)).toEqual(['b', 'a', 'c']);
    expect(saved.find((note: { id: string }) => note.id === 'c').pinned).not.toBeTrue();
    expect(saved.find((note: { id: string }) => note.id === 'a').pinned).toBeTrue();
    expect(saved.find((note: { id: string }) => note.id === 'a').body).toBe(legacy.body);
  });
});
