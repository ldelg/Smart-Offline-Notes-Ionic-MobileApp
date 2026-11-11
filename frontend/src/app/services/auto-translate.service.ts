import { Injectable, effect, inject } from '@angular/core';
import { AlertController } from '@ionic/angular/standalone';
import { NotesStore } from '../store/notes.store';
import { SettingsStore } from '../store/settings.store';
import { TranslationStore } from '../store/translation.store';
import { AppLang } from '../models/translation.model';
import { makeTranslation, storedSourceLanguage } from './note-translations';
import { detectLanguage } from './translation-detect';
import { translationRoute } from './translation-route';
import { formatBytes, CatalogPack } from './translation-catalog';
import {
  TranslationCancelled,
  TranslationService,
} from './translation.service';

/** Translates a newly saved note when the optional setting is on. */
@Injectable({ providedIn: 'root' })
export class AutoTranslateService {
  private readonly notes = inject(NotesStore);
  private readonly settings = inject(SettingsStore);
  private readonly translation = inject(TranslationService);
  private readonly alerts = inject(AlertController);
  private readonly i18n = inject(TranslationStore);
  private readonly handled = new Set<string>();
  private readonly declined = new Set<string>();

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
      await this.translation.ensurePacks(route, note.id, (packs, engineBytes) =>
        this.confirm(packs, engineBytes),
      );
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
      if (error instanceof TranslationCancelled) return;
      console.warn('Auto-translate skipped', error);
    }
  }

  private lang(code: AppLang): string {
    const label = this.i18n.t(`languages.${code}`);
    return label.startsWith('languages.') ? code.toUpperCase() : label;
  }

  private async confirm(packs: CatalogPack[], engineBytes: number): Promise<boolean> {
    const key = `${packs.map((pack) => pack.id).join('+')}:${engineBytes}`;
    if (this.declined.has(key)) return false;
    const pairText = packs
      .map((pack) => `${this.lang(pack.src)} → ${this.lang(pack.tgt)}`)
      .join(', ');
    const bytes = packs.reduce((sum, pack) => sum + pack.bytes, 0) + engineBytes;
    const template = this.i18n.t('notes.translate.downloadMessage');
    const message = template
      .replace('{pack}', pairText || this.i18n.t('settings.translation.engine'))
      .replace('{size}', formatBytes(bytes));
    const alert = await this.alerts.create({
      header: this.i18n.t('notes.translate.downloadHeader'),
      message,
      buttons: [
        { text: this.i18n.t('notes.translate.cancel'), role: 'cancel' },
        { text: this.i18n.t('notes.translate.downloadConfirm'), role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'confirm') {
      this.declined.add(key);
      return false;
    }
    return true;
  }
}
