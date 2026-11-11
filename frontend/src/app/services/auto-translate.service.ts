import { Injectable, effect, inject } from '@angular/core';
import { NotesStore } from '../store/notes.store';
import { SettingsStore } from '../store/settings.store';
import { makeTranslation, storedSourceLanguage } from './note-translations';
import { detectLanguage } from './translation-detect';
import { translationRoute } from './translation-route';
import { groupMissingByLanguage } from './translation-languages';
import {
  TranslationCancelled,
  TranslationOffline,
  TranslationService,
} from './translation.service';

/**
 * Translates a newly saved note when the setting is on.
 * Turning the setting on is the consent to download packs. There is no
 * second prompt. Offline notes are left untranslated until the phone is online.
 */
@Injectable({ providedIn: 'root' })
export class AutoTranslateService {
  private readonly notes = inject(NotesStore);
  private readonly settings = inject(SettingsStore);
  private readonly translation = inject(TranslationService);
  private readonly handled = new Set<string>();

  constructor() {
    effect(() => {
      const ready = this.notes.noteReady();
      if (!ready) return;
      void this.run(ready.id, ready.seq);
    });
  }

  private async run(id: string, seq: number): Promise<void> {
    const token = `${id}:${seq}`;
    if (this.handled.has(token)) return;
    this.handled.add(token);
    const target = this.settings.autoTranslateTo();
    if (!target) return;
    const note = this.notes.notes().find((item) => item.id === id);
    if (!note?.body.trim()) return;
    const existing = note.translations?.[target];
    if (existing && !existing.stale) return;
    const source = storedSourceLanguage(note) ?? detectLanguage(note.body);
    if (!source || source === target) return;
    const route = translationRoute(source, target);
    try {
      const missing = await this.translation.missingFor(route);
      const bytes = groupMissingByLanguage(missing).reduce((sum, item) => sum + item.bytes, 0);
      await this.translation.ensurePacks(route, note.id, bytes);
      const current = this.notes.notes().find((item) => item.id === id) ?? note;
      const text = await this.translation.translate(
        current.body,
        source,
        target,
        note.id,
      );
      const after = this.notes.notes().find((item) => item.id === id);
      if (!after || after.body !== current.body) return;
      this.notes.setTranslation(
        id,
        target,
        makeTranslation(text, source, after.body, Date.now()),
      );
    } catch (error) {
      this.translation.progress.set(null);
      if (error instanceof TranslationCancelled || error instanceof TranslationOffline) return;
      console.warn('Auto-translate skipped', error);
    }
  }
}
