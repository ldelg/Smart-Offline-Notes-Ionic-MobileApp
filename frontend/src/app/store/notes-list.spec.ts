import { Note } from '../models/note.model';
import {
  collectTags,
  filterNotes,
  normalizeStoredNote,
  noteFromStorage,
  notesWithPinned,
  notesWithoutTag,
  notesWithTag,
  orderNotes,
  reorderNotesInGroup,
} from './notes-list';

const legacy = {
  id: '1',
  title: 'Market',
  body: 'Buy apples.\n\nThen walk home.',
  createdAt: 5,
  source: 'Typed' as const,
  language: 'english',
};

describe('notes list', () => {
  it('defaults pin and tags on notes saved before those fields existed', () => {
    const note = normalizeStoredNote(legacy);
    expect(note).toEqual({
      ...legacy,
      pinned: false,
      tags: [],
    });
  });

  it('keeps an unreadable record that still has an id', () => {
    expect(normalizeStoredNote({ id: 'x' })).toBeNull();
    expect(noteFromStorage({ id: 'x', extra: true })?.id).toBe('x');
    expect(noteFromStorage(null)).toBeNull();
  });

  it('places pinned notes first and keeps the existing order inside each group', () => {
    const notes = [
      { ...legacy, id: 'a', pinned: false },
      { ...legacy, id: 'b', pinned: true },
      { ...legacy, id: 'c', pinned: false },
      { ...legacy, id: 'd', pinned: true },
    ];
    expect(orderNotes(notes).map((note) => note.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(notesWithPinned(notes, 'a', true).find((note) => note.id === 'a')?.pinned).toBeTrue();
    expect(notesWithPinned(notes, 'a', true).find((note) => note.id === 'a')?.body).toBe(
      legacy.body,
    );
  });

  it('reorders inside the pinned group and inside the unpinned group', () => {
    const notes = [
      { ...legacy, id: 'a', pinned: false },
      { ...legacy, id: 'b', pinned: true },
      { ...legacy, id: 'c', pinned: false },
      { ...legacy, id: 'd', pinned: true },
    ];
    const pinnedMoved = reorderNotesInGroup(notes, true, 0, 1);
    expect(orderNotes(pinnedMoved).map((note) => note.id)).toEqual(['d', 'b', 'a', 'c']);
    expect(pinnedMoved.map((note) => note.id)).toEqual(['a', 'd', 'c', 'b']);
    expect(pinnedMoved.find((note) => note.id === 'b')?.body).toBe(legacy.body);

    const unpinnedMoved = reorderNotesInGroup(notes, false, 1, 0);
    expect(orderNotes(unpinnedMoved).map((note) => note.id)).toEqual(['b', 'd', 'c', 'a']);
    expect(reorderNotesInGroup(notes, true, 0, 5)).toEqual(notes);
  });

  it('adds and removes tags without duplicates, and filters them together with search', () => {
    let notes: Note[] = [
      { ...legacy, id: 'a', tags: [] },
      { ...legacy, id: 'b', title: 'Home', body: 'meeting notes', tags: ['Home'] },
    ];
    notes = notesWithTag(notes, 'a', '  Work  ');
    notes = notesWithTag(notes, 'a', 'work');
    expect(notes.find((note) => note.id === 'a')?.tags).toEqual(['Work']);
    notes = notesWithTag(notes, 'a', '');
    expect(notes.find((note) => note.id === 'a')?.tags).toEqual(['Work']);

    expect(filterNotes(notes, 'meeting', null).map((note) => note.id)).toEqual(['b']);
    expect(filterNotes(notes, '', 'work').map((note) => note.id)).toEqual(['a']);
    expect(filterNotes(notes, 'market', 'work').map((note) => note.id)).toEqual(['a']);
    expect(filterNotes(notes, 'meeting', 'work')).toEqual([]);
    const translated = notesWithTag(
      [
        {
          ...legacy,
          id: 'c',
          title: 'Nota',
          body: 'Solo original',
          tags: [],
          translations: {
            en: {
              text: 'Kitchen meeting',
              sourceLang: 'it' as const,
              sourceHash: 'x',
              createdAt: 1,
              stale: false,
            },
          },
        },
      ],
      'c',
      'Home',
    );
    expect(filterNotes(translated, 'kitchen', null).map((item) => item.id)).toEqual(['c']);
    expect(collectTags(notes)).toEqual(['Work', 'Home']);

    notes = notesWithoutTag(notes, 'a', 'WORK');
    expect(notes.find((note) => note.id === 'a')?.tags).toEqual([]);
  });
});
