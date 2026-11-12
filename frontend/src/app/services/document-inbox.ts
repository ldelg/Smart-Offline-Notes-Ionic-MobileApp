import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController } from '@ionic/angular/standalone';
import { Note } from '../models/note.model';
import { NotesStore } from '../store/notes.store';
import { TranslationStore } from '../store/translation.store';
import {
  ImportError,
  ImportOutcome,
  importKind,
  prepareImportFile,
  prepareSharedText,
} from './document-import';
import { DocumentIntent, IncomingDocuments } from './document-intent';
import { quietAlert } from './quiet-alert';

/**
 * Turns ACTION_VIEW and ACTION_SEND payloads into notes.
 * Started once from the root component so a cold start and a share into an
 * already open app both land here.
 */
@Injectable({ providedIn: 'root' })
export class DocumentInboxService {
  private readonly store = inject(NotesStore);
  private readonly router = inject(Router);
  private readonly alerts = inject(AlertController);
  private readonly i18n = inject(TranslationStore);
  /** Set when a note should be opened. The notes screen clears it. */
  readonly noteToOpen = signal<string | null>(null);
  private readonly importOptions = {
    fallbackTitle: () => this.text('notes.import.importedTitle', 'Imported note'),
  };
  private started = false;
  private readonly seen = new Set<string>();

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.listen();
  }

  private async listen(): Promise<void> {
    try {
      await DocumentIntent.addListener('documents', (payload) => {
        void this.ingest(payload);
      });
      await this.ingest(await DocumentIntent.getPending());
    } catch (error) {
      console.warn('Document import is unavailable', error);
    }
  }

  private async ingest(payload: IncomingDocuments | null | undefined): Promise<void> {
    if (!payload) return;
    const files = payload.files ?? [];
    const shared = typeof payload.text === 'string' ? payload.text : '';
    if (!files.length && !shared.trim()) return;
    const token = payload.token ?? '';
    if (token) {
      if (this.seen.has(token)) return;
      this.seen.add(token);
      void DocumentIntent.consume({ token }).catch(() => undefined);
    }

    const outcomes: ImportOutcome[] = [];
    if (files.length) {
      for (const file of files) {
        outcomes.push(
          await prepareImportFile(file, { fallbackTitle: this.importOptions.fallbackTitle() }),
        );
      }
    } else {
      outcomes.push(
        prepareSharedText(
          shared,
          payload.subject,
          this.text('notes.import.sharedTitle', 'Shared text'),
        ),
      );
    }
    await this.finish(outcomes);
  }

  /** Same path as a shared or opened document, for the Create tab file picker. */
  async importBrowserFile(file: File): Promise<void> {
    const filename = file.name || '';
    if (file.size > MAX_BROWSER_FILE_BYTES) {
      await this.finish([{ error: 'too-large', filename }]);
      return;
    }
    const kind = importKind(filename, file.type || '');
    try {
      const raw =
        kind === 'docx'
          ? { name: filename, mime: file.type, base64: await fileToBase64(file) }
          : { name: filename, mime: file.type, text: await file.text() };
      await this.finish([
        await prepareImportFile(raw, { fallbackTitle: this.importOptions.fallbackTitle() }),
      ]);
    } catch (error) {
      console.warn('Document import failed', error);
      await this.finish([{ error: 'unreadable', filename }]);
    }
  }

  private async finish(outcomes: ImportOutcome[]): Promise<void> {
    const notes: Note[] = [];
    const skipped: { name: string; reason: string }[] = [];
    const now = Date.now();
    outcomes.forEach((outcome, index) => {
      if (outcome.note) {
        notes.push({
          id: crypto.randomUUID(),
          title: outcome.note.title,
          body: outcome.note.body,
          createdAt: now + index,
          source: outcome.note.source,
          tags: ['import'],
          ...(outcome.note.csvLimit ? { csvLimit: outcome.note.csvLimit } : {}),
        });
        return;
      }
      if (outcome.error) {
        skipped.push({
          name: outcome.filename || '',
          reason: this.reason(outcome.error),
        });
      }
    });
    if (notes.length) {
      this.store.addImportedNotes(notes);
      this.noteToOpen.set(notes[0].id);
      await this.router.navigate(['/tabs/notes']);
    }
    const message = this.summary(notes.length, skipped);
    if (!message) return;
    const alert = await this.alerts.create(
      quietAlert({
        header: this.text(
          notes.length ? 'notes.import.savedHeader' : 'notes.import.failedHeader',
          notes.length ? 'Imported' : 'Not imported',
        ),
        message,
        mode: 'ios',
        buttons: [this.text('create.alerts.ok', 'OK')],
      }),
    );
    await alert.present();
  }

  private summary(saved: number, skipped: { name: string; reason: string }[]): string {
    const parts: string[] = [];
    if (saved === 1) parts.push(this.text('notes.import.savedOne', 'Saved as a note.'));
    else if (saved > 1) {
      parts.push(
        this.text('notes.import.savedMany', 'Saved {count} notes.').replace(
          '{count}',
          String(saved),
        ),
      );
    }
    for (const item of skipped.slice(0, 3)) {
      parts.push(item.name ? `${item.name}: ${item.reason}` : item.reason);
    }
    return parts.join(' ');
  }

  private reason(error: ImportError): string {
    const key = {
      'too-large': 'notes.import.tooLarge',
      unsupported: 'notes.import.unsupported',
      'legacy-doc': 'notes.import.legacyDoc',
      empty: 'notes.import.empty',
      unreadable: 'notes.import.unreadable',
      failed: 'notes.import.failed',
    }[error];
    const fallback = {
      'too-large': 'This file is too large to import.',
      unsupported: "This file type can't be imported. Use a .txt, .md, .csv, or .docx file.",
      'legacy-doc': "Older Word .doc files aren't supported. Save as .docx and try again.",
      empty: 'This file is empty.',
      unreadable: 'This file could not be read.',
      failed: 'This file could not be imported.',
    }[error];
    return this.text(key, fallback);
  }

  private text(key: string, fallback: string): string {
    const value = this.i18n.t(key);
    return value && value !== key ? value : fallback;
  }
}

const MAX_BROWSER_FILE_BYTES = 2 * 1024 * 1024;

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}
