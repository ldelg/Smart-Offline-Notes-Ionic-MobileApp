import { CsvLimit, Note } from '../models/note.model';
import { normalizeTranslations } from '../services/note-translations';

const MAX_TAG_LENGTH = 40;
const MAX_TAGS = 20;

export function normalizeTag(value: string): string | null {
  const tag = value.trim().replace(/\s+/g, ' ');
  if (!tag) return null;
  return tag.slice(0, MAX_TAG_LENGTH);
}

export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const tag = normalizeTag(item);
    if (!tag) continue;
    if (tags.some((existing) => existing.toLocaleLowerCase() === tag.toLocaleLowerCase())) {
      continue;
    }
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

/**
 * Fills pin and tags for notes saved before those fields existed.
 * Returns null when the value is not a note, so the caller can keep the
 * original object instead of dropping it.
 */
export function normalizeStoredNote(value: unknown): Note | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw['id'] !== 'string') return null;
  if (typeof raw['title'] !== 'string') return null;
  if (typeof raw['body'] !== 'string') return null;
  if (typeof raw['createdAt'] !== 'number' || !Number.isFinite(raw['createdAt'])) {
    return null;
  }
  if (
    raw['source'] !== 'Recording' &&
    raw['source'] !== 'Upload' &&
    raw['source'] !== 'Typed'
  ) {
    return null;
  }

  const note: Note = {
    ...(raw as unknown as Note),
    id: raw['id'],
    title: raw['title'],
    body: raw['body'],
    createdAt: raw['createdAt'],
    source: raw['source'],
    pinned: raw['pinned'] === true,
    tags: normalizeTags(raw['tags']),
  };
  if (typeof raw['language'] === 'string') note.language = raw['language'];
  else delete note.language;
  if (typeof raw['duration'] === 'number' && Number.isFinite(raw['duration'])) {
    note.duration = raw['duration'];
  } else {
    delete note.duration;
  }
  const translations = normalizeTranslations(raw['translations'], raw['body'], raw['title']);
  if (translations) note.translations = translations;
  else delete note.translations;
  const csvLimit = normalizeCsvLimit(raw['csvLimit']);
  if (csvLimit) note.csvLimit = csvLimit;
  else delete note.csvLimit;
  return note;
}

function normalizeCsvLimit(value: unknown): CsvLimit | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (!isCount(raw['shown']) || !isCount(raw['total']) || raw['total'] < raw['shown']) {
    return undefined;
  }
  const limit: CsvLimit = { shown: raw['shown'], total: raw['total'] };
  if (
    isCount(raw['columnsShown']) &&
    isCount(raw['columnsTotal']) &&
    raw['columnsTotal'] >= raw['columnsShown']
  ) {
    limit.columnsShown = raw['columnsShown'];
    limit.columnsTotal = raw['columnsTotal'];
  }
  return limit;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Keeps unreadable records that still have an id so a later save cannot delete them. */
export function noteFromStorage(value: unknown): Note | null {
  const normalized = normalizeStoredNote(value);
  if (normalized) return normalized;
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw['id'] !== 'string') return null;
  return value as Note;
}

export function orderNotes(notes: readonly Note[]): Note[] {
  const pinned: Note[] = [];
  const rest: Note[] = [];
  for (const note of notes) {
    if (note?.pinned) pinned.push(note);
    else rest.push(note);
  }
  return [...pinned, ...rest];
}

/**
 * Moves a note inside the pinned group or inside the unpinned group.
 * The other group's notes stay in their places. Indexes are positions
 * in that group as shown in the list, not indexes in the stored array.
 */
export function reorderNotesInGroup(
  notes: readonly Note[],
  pinned: boolean,
  from: number,
  to: number,
): Note[] {
  const inGroup = (note: Note) => (pinned ? !!note.pinned : !note.pinned);
  const members = notes.filter(inGroup);
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= members.length ||
    to >= members.length
  ) {
    return [...notes];
  }
  const nextMembers = [...members];
  const [moved] = nextMembers.splice(from, 1);
  nextMembers.splice(to, 0, moved);
  let cursor = 0;
  return notes.map((note) => (inGroup(note) ? nextMembers[cursor++] : note));
}

function tagKey(tag: string): string {
  return tag.trim().toLocaleLowerCase();
}

export function notesWithPinned(
  notes: readonly Note[],
  id: string,
  pinned: boolean,
): Note[] {
  return notes.map((note) => (note.id === id ? { ...note, pinned } : note));
}

export function notesWithTag(
  notes: readonly Note[],
  id: string,
  rawTag: string,
): Note[] {
  const tag = normalizeTag(rawTag);
  if (!tag) return notes as Note[];
  let changed = false;
  const next = notes.map((note) => {
    if (note.id !== id) return note;
    const tags = note.tags ?? [];
    if (tags.some((existing) => tagKey(existing) === tagKey(tag))) return note;
    if (tags.length >= MAX_TAGS) return note;
    changed = true;
    return { ...note, tags: [...tags, tag] };
  });
  return changed ? next : (notes as Note[]);
}

export function notesWithoutTag(
  notes: readonly Note[],
  id: string,
  rawTag: string,
): Note[] {
  const key = tagKey(rawTag);
  if (!key) return notes as Note[];
  let changed = false;
  const next = notes.map((note) => {
    if (note.id !== id) return note;
    const tags = note.tags ?? [];
    const filtered = tags.filter((existing) => tagKey(existing) !== key);
    if (filtered.length === tags.length) return note;
    changed = true;
    return { ...note, tags: filtered };
  });
  return changed ? next : (notes as Note[]);
}

export function collectTags(notes: readonly Note[]): string[] {
  const tags: string[] = [];
  for (const note of notes) {
    for (const tag of note.tags ?? []) {
      if (tags.some((existing) => tagKey(existing) === tagKey(tag))) continue;
      tags.push(tag);
    }
  }
  return tags;
}

export function filterNotes(
  notes: readonly Note[],
  query: string,
  tag: string | null,
): Note[] {
  const term = query.trim().toLocaleLowerCase();
  const selected = tag ? tagKey(tag) : '';
  return orderNotes(notes).filter((note) => {
    if (selected) {
      const tags = note.tags ?? [];
      if (!tags.some((item) => tagKey(item) === selected)) return false;
    }
    if (!term) return true;
    const translated: string[] = [];
    for (const item of Object.values(note.translations ?? {})) {
      if (item?.title) translated.push(item.title);
      if (item?.text) translated.push(item.text);
    }
    const haystack = [note.title, note.body, ...translated, ...(note.tags ?? [])]
      .join('\n')
      .toLocaleLowerCase();
    return haystack.includes(term);
  });
}
