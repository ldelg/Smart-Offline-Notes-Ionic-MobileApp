import {
  Component,
  ElementRef,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonSearchbar,
  IonList,
  IonItem,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonLabel,
  IonButton,
  IonIcon,
  IonNote,
  IonTextarea,
  IonInput,
  IonReorder,
  IonReorderGroup,
  IonProgressBar,
  AlertController,
} from '@ionic/angular/standalone';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  Validators,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NotesStore } from '../store/notes.store';
import { SettingsStore } from '../store/settings.store';
import { Note } from '../models/note.model';
import { TranslationStore } from '../store/translation.store';
import { collectTags, filterNotes } from '../store/notes-list';
import {
  editorTagsAfterAdd,
  editorTagsAfterRemove,
  noteEditorDirty,
} from '../store/note-editor';
import { composeShareText, sharePlainText } from '../services/note-share';
import { AutoTranslateService } from '../services/auto-translate.service';
import {
  TranslationCancelled,
  TranslationOffline,
  TranslationProgress,
  TranslationService,
} from '../services/translation.service';
import { AppLang, isAppLang } from '../models/translation.model';
import { makeTranslation, storedSourceLanguage } from '../services/note-translations';
import { detectLanguage } from '../services/translation-detect';
import { formatBytes } from '../services/translation-catalog';
import { addIcons } from 'ionicons';
import {
  trashOutline,
  expandOutline,
  closeOutline,
  saveOutline,
  pin,
  pinOutline,
  shareOutline,
  languageOutline,
  refreshOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-notes',
  templateUrl: 'notes.page.html',
  styleUrls: ['notes.page.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSearchbar,
    IonList,
    IonItem,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonLabel,
    RouterLink,
    IonButton,
    IonIcon,
    IonNote,
    IonTextarea,
    IonInput,
    IonReorder,
    IonReorderGroup,
    IonProgressBar,
    FormsModule,
    ReactiveFormsModule,
  ],
})
export class NotesPage {
  private readonly store = inject(NotesStore);
  private readonly settings = inject(SettingsStore);
  protected readonly translationStore = inject(TranslationStore);
  private readonly alertController = inject(AlertController);
  private readonly machine = inject(TranslationService);
  private readonly autoTranslate = inject(AutoTranslateService);
  protected readonly translationProgress = this.machine.progress;
  protected readonly hasNotes = computed(() => this.store.notes().length > 0);
  private readonly fb = inject(FormBuilder);
  protected readonly searchTerm = signal('');
  protected readonly activeTag = signal<string | null>(null);
  protected readonly tagDraft = signal('');
  protected readonly editorTags = signal<string[]>([]);
  private readonly editorFields = signal({ title: '', body: '' });
  private readonly loadedNoteId = signal<string | null>(null);
  protected readonly openTabIds = signal<string[]>([]);
  protected readonly activeTabId = signal<string | null>(null);
  private readonly translationViews = signal<Record<string, AppLang | 'original'>>({});
  @ViewChild('noteCarousel', { static: false })
  private noteCarousel?: ElementRef<HTMLDivElement>;
  private isScrollingProgrammatically = false;
  protected readonly editForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(1)]],
    body: ['', [Validators.required, Validators.minLength(1)]],
  });

  protected readonly availableTags = computed(() => collectTags(this.store.notes()));
  protected readonly filteredNotes = computed(() =>
    filterNotes(this.store.notes(), this.searchTerm(), this.activeTag()),
  );
  protected readonly reorderLocked = computed(
    () => this.searchTerm().trim().length > 0 || this.activeTag() !== null,
  );
  protected readonly noteGroups = computed(() => {
    const notes = this.filteredNotes();
    const groups: { pinned: boolean; notes: Note[] }[] = [];
    const pinned = notes.filter((note) => note.pinned);
    const rest = notes.filter((note) => !note.pinned);
    if (pinned.length) groups.push({ pinned: true, notes: pinned });
    if (rest.length) groups.push({ pinned: false, notes: rest });
    return groups;
  });

  protected readonly activeNote = computed(() => {
    const id = this.activeTabId();
    if (!id) return null;
    return this.store.notes().find((note) => note.id === id) ?? null;
  });

  protected readonly editorDirty = computed(() => {
    const note = this.activeNote();
    if (!note || this.loadedNoteId() !== note.id) return false;
    const fields = this.editorFields();
    return noteEditorDirty(
      { title: note.title, body: note.body, tags: note.tags ?? [] },
      { title: fields.title, body: fields.body, tags: this.editorTags() },
    );
  });

  constructor() {
    addIcons({
      trashOutline,
      expandOutline,
      closeOutline,
      saveOutline,
      pin,
      pinOutline,
      shareOutline,
      languageOutline,
      refreshOutline,
    });
    void this.autoTranslate;
    this.store.loadNotes();
    this.editForm.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.editorFields.set({
        title: value.title ?? '',
        body: value.body ?? '',
      });
    });

    effect(() => {
      const selected = this.activeTag();
      if (!selected) return;
      const stillThere = this.availableTags().some(
        (tag) => tag.toLocaleLowerCase() === selected.toLocaleLowerCase(),
      );
      if (!stillThere) this.activeTag.set(null);
    });

    effect(() => {
      const note = this.activeNote();
      if (!note) {
        this.loadedNoteId.set(null);
        this.tagDraft.set('');
        this.editorTags.set([]);
        this.editorFields.set({ title: '', body: '' });
        this.editForm.reset({}, { emitEvent: false });
        return;
      }
      if (this.loadedNoteId() === note.id) return;
      this.loadedNoteId.set(note.id);
      this.tagDraft.set('');
      this.editorTags.set([...(note.tags ?? [])]);
      this.editorFields.set({ title: note.title, body: note.body });
      this.editForm.patchValue(
        { title: note.title, body: note.body },
        { emitEvent: false },
      );
    });
  }

  protected noteMeta(note: Note): string {
    const parts = [this.relativeTime(note.createdAt)];
    if (note.duration) parts.push(`${Math.round(note.duration)}s`);
    const uiToNote: Record<string, string> = {
      en: 'english',
      es: 'spanish',
      fr: 'french',
      de: 'german',
      it: 'italian',
    };
    const uiLanguage = uiToNote[this.settings.uiLanguage()];
    if (note.language && note.language !== uiLanguage) parts.push(note.language);
    return parts.join(' · ');
  }

  private relativeTime(createdAt: number): string {
    const lang = this.settings.uiLanguage() || 'en';
    const minutes = Math.round((Date.now() - createdAt) / 60000);
    if (minutes < 1) return this.translationStore.t('notes.meta.justNow');
    if (minutes < 60) return `${minutes} ${this.translationStore.t('notes.meta.minutes')}`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} ${this.translationStore.t('notes.meta.hours')}`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days} ${this.translationStore.t('notes.meta.days')}`;
    return new Date(createdAt).toLocaleDateString(lang, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  protected onSearch(event: CustomEvent): void {
    const value = (event.detail as { value?: string }).value || '';
    this.searchTerm.set(value);
  }

  protected openNoteFromCard(event: Event, id: string): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.note-actions, .tag-row, .tag-chip, ion-reorder')) return;
    this.openNote(id);
  }

  protected tagIsActive(tag: string): boolean {
    const selected = this.activeTag();
    return !!selected && selected.toLocaleLowerCase() === tag.toLocaleLowerCase();
  }

  protected setTagFilter(tag: string | null): void {
    this.activeTag.set(tag);
  }

  protected filterByTag(tag: string, event: Event): void {
    event.stopPropagation();
    this.activeTag.set(this.tagIsActive(tag) ? null : tag);
  }

  protected togglePin(note: Note, event?: Event): void {
    event?.stopPropagation();
    this.store.setPinned(note.id, !note.pinned);
  }

  protected addActiveTag(event?: Event): void {
    event?.preventDefault();
    this.editorTags.set(editorTagsAfterAdd(this.editorTags(), this.tagDraft()));
    this.tagDraft.set('');
  }

  protected removeTag(tag: string): void {
    this.editorTags.set(editorTagsAfterRemove(this.editorTags(), tag));
  }

  protected translationLangs(note: Note): AppLang[] {
    return (['en', 'es', 'fr', 'de', 'it'] as const).filter(
      (lang) => !!note.translations?.[lang],
    );
  }

  protected viewLang(note: Note): AppLang | 'original' {
    const selected = this.translationViews()[note.id] ?? 'original';
    if (selected !== 'original' && !note.translations?.[selected]) return 'original';
    return selected;
  }

  protected showOriginal(note: Note): void {
    this.translationViews.update((views) => ({ ...views, [note.id]: 'original' }));
  }

  protected showTranslation(note: Note, lang: AppLang): void {
    this.translationViews.update((views) => ({ ...views, [note.id]: lang }));
  }

  protected activeTranslation(note: Note) {
    const lang = this.viewLang(note);
    if (lang === 'original') return null;
    return note.translations?.[lang] ?? null;
  }

  protected progressFor(note: Note): TranslationProgress | null {
    const progress = this.translationProgress();
    if (!progress || progress.noteId !== note.id) return null;
    return progress;
  }

  protected progressLabel(progress: TranslationProgress): string {
    if (progress.phase === 'download') return this.translationStore.t('notes.translate.progressDownload');
    if (progress.phase === 'translate') {
      return this.translationStore.t('notes.translate.progressTranslate');
    }
    return this.translationStore.t('notes.translate.progressLoad');
  }

  protected async translateNote(note: Note, event?: Event): Promise<void> {
    event?.stopPropagation();
    this.openNote(note.id);
    await this.promptTranslate(note.id);
  }

  protected async promptTranslate(noteId: string): Promise<void> {
    const note = this.store.notes().find((item) => item.id === noteId);
    if (!note?.body.trim()) return;
    const known = storedSourceLanguage(note);
    const source =
      known ??
      (await this.pickLanguage(
        this.translationStore.t('notes.translate.pickSource'),
        ['en', 'es', 'fr', 'de', 'it'],
        detectLanguage(note.body),
      ));
    if (!source) return;
    const targets = (['en', 'es', 'fr', 'de', 'it'] as const).filter(
      (lang) => lang !== source && !note.translations?.[lang],
    );
    if (!targets.length) {
      await this.showAlert(
        this.translationStore.t('notes.translate.add'),
        this.translationStore.t('notes.translate.noMore'),
      );
      return;
    }
    const target = await this.pickLanguage(
      this.translationStore.t('notes.translate.pickTarget'),
      targets,
      targets[0],
    );
    if (!target || target === source) return;
    await this.runTranslation(note.id, source, target);
  }

  protected async retranslate(note: Note): Promise<void> {
    const lang = this.viewLang(note);
    if (lang === 'original') return;
    const source = note.translations?.[lang]?.sourceLang ?? storedSourceLanguage(note);
    if (!source || source === lang) return;
    await this.runTranslation(note.id, source, lang);
  }

  protected deleteTranslation(note: Note): void {
    const lang = this.viewLang(note);
    if (lang === 'original') return;
    this.store.deleteTranslation(note.id, lang);
    this.showOriginal(note);
  }

  private async runTranslation(noteId: string, source: AppLang, target: AppLang): Promise<void> {
    const note = this.store.notes().find((item) => item.id === noteId);
    if (!note) return;
    try {
      const route = this.machine.routeFor(source, target);
      await this.machine.ensurePacks(route, noteId, (packs, engineBytes) =>
        this.confirmDownload(packs, engineBytes),
      );
      const current = this.store.notes().find((item) => item.id === noteId) ?? note;
      const text = await this.machine.translate(current.body, source, target, noteId);
      const after = this.store.notes().find((item) => item.id === noteId);
      if (!after || after.body !== current.body) return;
      this.store.setTranslation(
        noteId,
        target,
        makeTranslation(text, source, after.body, Date.now()),
      );
      this.showTranslation(after, target);
    } catch (error) {
      if (error instanceof TranslationCancelled) return;
      const offline = error instanceof TranslationOffline;
      await this.showAlert(
        this.translationStore.t(
          offline ? 'notes.translate.offlineHeader' : 'notes.translate.failedHeader',
        ),
        this.translationStore.t(
          offline ? 'notes.translate.offlineMessage' : 'notes.translate.failedMessage',
        ),
      );
    }
  }

  private langName(code: AppLang): string {
    const label = this.translationStore.t(`languages.${code}`);
    return label.startsWith('languages.') ? code.toUpperCase() : label;
  }

  private async pickLanguage(
    header: string,
    options: readonly AppLang[],
    current: AppLang | null,
  ): Promise<AppLang | null> {
    const alert = await this.alertController.create({
      header,
      inputs: options.map((lang) => ({
        type: 'radio' as const,
        label: this.langName(lang),
        value: lang,
        checked: lang === current,
      })),
      buttons: [
        { text: this.translationStore.t('notes.translate.cancel'), role: 'cancel' },
        { text: this.translationStore.t('create.alerts.ok'), role: 'confirm' },
      ],
    });
    await alert.present();
    const result = await alert.onDidDismiss();
    if (result.role !== 'confirm') return null;
    const value =
      result.data && typeof result.data === 'object' && 'values' in result.data
        ? (result.data as { values?: unknown }).values
        : undefined;
    return isAppLang(value) ? value : current;
  }

  private async confirmDownload(
    packs: { src: AppLang; tgt: AppLang; bytes: number }[],
    engineBytes: number,
  ): Promise<boolean> {
    const pairText = packs
      .map((pack) => `${this.langName(pack.src)} → ${this.langName(pack.tgt)}`)
      .join(', ');
    const bytes = packs.reduce((sum, pack) => sum + pack.bytes, 0) + engineBytes;
    const message = this.translationStore
      .t('notes.translate.downloadMessage')
      .replace('{pack}', pairText || this.translationStore.t('settings.translation.engine'))
      .replace('{size}', formatBytes(bytes));
    const alert = await this.alertController.create({
      header: this.translationStore.t('notes.translate.downloadHeader'),
      message,
      buttons: [
        { text: this.translationStore.t('notes.translate.cancel'), role: 'cancel' },
        {
          text: this.translationStore.t('notes.translate.downloadConfirm'),
          role: 'confirm',
        },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }

  private async chooseShareText(note: Note, langs: readonly AppLang[]): Promise<string | null> {
    const alert = await this.alertController.create({
      header: this.translationStore.t('notes.share.choose'),
      message: this.translationStore.t('notes.share.include'),
      inputs: [
        {
          type: 'checkbox' as const,
          label: this.translationStore.t('notes.translate.original'),
          value: 'original',
          checked: true,
        },
        ...langs.map((lang) => ({
          type: 'checkbox' as const,
          label: lang.toUpperCase(),
          value: lang,
          checked: false,
        })),
      ],
      buttons: [
        { text: this.translationStore.t('notes.translate.cancel'), role: 'cancel' },
        { text: this.translationStore.t('notes.actions.share'), role: 'confirm' },
      ],
    });
    await alert.present();
    const result = await alert.onDidDismiss();
    if (result.role !== 'confirm') return null;
    const values =
      result.data && typeof result.data === 'object' && 'values' in result.data
        ? (result.data as { values?: unknown }).values
        : [];
    const selected = new Set(Array.isArray(values) ? values : []);
    if (!selected.size) {
      await this.showAlert(
        this.translationStore.t('notes.share.choose'),
        this.translationStore.t('notes.share.nothing'),
      );
      return null;
    }
    return composeShareText([
      ...(selected.has('original')
        ? [
            {
              heading: this.translationStore.t('notes.translate.original'),
              text: note.body,
              kind: 'original' as const,
            },
          ]
        : []),
      ...langs
        .filter((lang) => selected.has(lang))
        .map((lang) => ({
          heading: `${lang.toUpperCase()} · ${this.translationStore.t('notes.translate.machine')}`,
          text: note.translations?.[lang]?.text ?? '',
          kind: 'translation' as const,
        })),
    ]);
  }

  protected async shareNote(note: Note, event?: Event): Promise<void> {
    event?.stopPropagation();
    const langs = this.translationLangs(note);
    let text = note.body.trim() || note.title.trim();
    if (langs.length) {
      const chosen = await this.chooseShareText(note, langs);
      if (chosen === null) return;
      text = chosen;
    }
    if (!text) return;
    try {
      const result = await sharePlainText({
        title: note.title.trim() || text.slice(0, 60),
        text,
        dialogTitle: this.translationStore.t('notes.share.dialogTitle'),
      });
      if (result === 'copied') {
        await this.showAlert(
          this.translationStore.t('notes.share.copiedHeader'),
          this.translationStore.t('notes.share.copiedMessage'),
        );
      }
    } catch (error) {
      console.error('Share failed', error);
      await this.showAlert(
        this.translationStore.t('notes.share.failedHeader'),
        this.translationStore.t('notes.share.failedMessage'),
      );
    }
  }

  private async showAlert(header: string, message: string): Promise<void> {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: [this.translationStore.t('create.alerts.ok')],
    });
    await alert.present();
  }

  protected deleteNote(id: string): void {
    this.store.deleteNote(id);
  }

  protected onReorder(event: Event, pinned: boolean): void {
    const detail = (
      event as CustomEvent<{
        from: number;
        to: number;
        complete: (listOrReorder?: boolean | unknown[]) => Promise<unknown>;
      }>
    ).detail;
    if (!this.reorderLocked() && detail.from !== detail.to) {
      this.store.reorderWithinGroup(pinned, detail.from, detail.to);
    }
    void detail.complete(false);
  }

  protected openNote(id: string): void {
    const current = this.openTabIds();
    if (!current.includes(id)) {
      this.openTabIds.set([...current, id]);
    }
    this.activeTabId.set(id);
    queueMicrotask(() => this.syncCarouselToActive());
  }

  protected selectTab(id: string): void {
    if (this.activeTabId() === id) return;
    this.activeTabId.set(id);
    // Sync carousel after Angular updates the view
    requestAnimationFrame(() => this.syncCarouselToActive());
  }

  protected closeTab(id: string, event?: Event): void {
    event?.stopPropagation();
    const updated = this.openTabIds().filter((tabId) => tabId !== id);
    this.openTabIds.set(updated);
    if (this.activeTabId() === id) {
      this.activeTabId.set(updated.length ? updated[updated.length - 1] : null);
    }
    queueMicrotask(() => this.syncCarouselToActive());
  }

  protected showList(): void {
    this.activeTabId.set(null);
  }

  protected saveActiveNote(): void {
    const id = this.activeTabId();
    if (!id) return;
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const { title, body } = this.editForm.value;
    this.store.updateNote(id, {
      title: (title || '').trim(),
      body: (body || '').trim(),
      tags: [...this.editorTags()],
    });
  }

  protected hasOpenTabs(): boolean {
    return this.openTabIds().length > 0;
  }

  protected openedNotes(): Note[] {
    const ids = this.openTabIds();
    const notes = this.store.notes();
    return ids
      .map((id) => notes.find((note) => note.id === id))
      .filter((note): note is Note => Boolean(note));
  }

  protected onCarouselScroll(): void {
    // Ignore scroll events during programmatic scrolling
    if (this.isScrollingProgrammatically) return;

    const container = this.noteCarousel?.nativeElement;
    if (!container) return;
    const width = container.offsetWidth;
    if (!width) return;
    const index = Math.round(container.scrollLeft / width);
    const note = this.openedNotes()[index];
    if (note && this.activeTabId() !== note.id) {
      this.activeTabId.set(note.id);
    }
  }

  private syncCarouselToActive(): void {
    const container = this.noteCarousel?.nativeElement;
    if (!container) {
      // Retry if container not ready
      requestAnimationFrame(() => this.syncCarouselToActive());
      return;
    }

    const activeId = this.activeTabId();
    if (!activeId) {
      this.isScrollingProgrammatically = true;
      container.scrollTo({ left: 0, behavior: 'smooth' });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.isScrollingProgrammatically = false;
        });
      });
      return;
    }

    // Find the slide element for the active note
    const slideElement = container.querySelector(
      `[data-note-id="${activeId}"]`,
    ) as HTMLElement;
    if (slideElement) {
      this.isScrollingProgrammatically = true;
      slideElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'start',
      });

      // Reset flag after scroll animation
      let rafCount = 0;
      const resetFlag = () => {
        rafCount++;
        if (rafCount < 5) {
          requestAnimationFrame(resetFlag);
        } else {
          this.isScrollingProgrammatically = false;
        }
      };
      requestAnimationFrame(resetFlag);
    } else {
      // Fallback to index-based scrolling if element not found
      const index = this.openedNotes().findIndex(
        (note) => note.id === activeId,
      );
      if (index >= 0) {
        const scrollPosition = index * container.offsetWidth;
        this.isScrollingProgrammatically = true;
        container.scrollTo({
          left: scrollPosition,
          behavior: 'smooth',
        });

        let rafCount = 0;
        const resetFlag = () => {
          rafCount++;
          if (rafCount < 5) {
            requestAnimationFrame(resetFlag);
          } else {
            this.isScrollingProgrammatically = false;
          }
        };
        requestAnimationFrame(resetFlag);
      }
    }
  }
}
