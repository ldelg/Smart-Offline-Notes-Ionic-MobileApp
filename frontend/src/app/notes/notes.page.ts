import {
  Component,
  inject,
  computed,
  signal,
  effect,
  ViewChild,
  ElementRef,
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
  AlertController,
} from '@ionic/angular/standalone';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NotesStore } from '../store/notes.store';
import { SettingsStore } from '../store/settings.store';
import { Note } from '../models/note.model';
import { TranslationStore } from '../store/translation.store';
import { collectTags, filterNotes } from '../store/notes-list';
import { sharePlainText } from '../services/note-share';
import { addIcons } from 'ionicons';
import {
  trashOutline,
  expandOutline,
  closeOutline,
  saveOutline,
  pin,
  pinOutline,
  shareOutline,
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
    FormsModule,
    ReactiveFormsModule,
  ],
})
export class NotesPage {
  private readonly store = inject(NotesStore);
  private readonly settings = inject(SettingsStore);
  protected readonly translationStore = inject(TranslationStore);
  private readonly alertController = inject(AlertController);
  protected readonly hasNotes = computed(() => this.store.notes().length > 0);
  private readonly fb = inject(FormBuilder);
  protected readonly searchTerm = signal('');
  protected readonly activeTag = signal<string | null>(null);
  protected readonly tagDraft = signal('');
  private loadedFormNoteId: string | null = null;
  protected readonly openTabIds = signal<string[]>([]);
  protected readonly activeTabId = signal<string | null>(null);
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

  protected readonly activeNote = computed(() => {
    const id = this.activeTabId();
    if (!id) return null;
    return this.store.notes().find((note) => note.id === id) ?? null;
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
    });
    this.store.loadNotes();

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
        this.loadedFormNoteId = null;
        this.tagDraft.set('');
        this.editForm.reset();
        return;
      }
      if (this.loadedFormNoteId === note.id) return;
      this.loadedFormNoteId = note.id;
      this.tagDraft.set('');
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
    if (target?.closest('.note-actions, .tag-row, .tag-chip')) return;
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
    const id = this.activeTabId();
    if (!id) return;
    this.store.addTag(id, this.tagDraft());
    this.tagDraft.set('');
  }

  protected removeTag(tag: string): void {
    const id = this.activeTabId();
    if (!id) return;
    this.store.removeTag(id, tag);
  }

  protected async shareNote(note: Note, event?: Event): Promise<void> {
    event?.stopPropagation();
    const text = note.body.trim() || note.title.trim();
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

  private draggedNoteId: string | null = null;
  private touchStartY: number = 0;
  private touchStartX: number = 0;
  private touchStartElement: HTMLElement | null = null;
  private touchCurrentElement: HTMLElement | null = null;
  private isDragging: boolean = false;

  protected onDragStart(event: DragEvent, noteId: string): void {
    this.draggedNoteId = noteId;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', noteId);
    }
    const noteItem = (event.currentTarget as HTMLElement).closest(
      '.note-item',
    ) as HTMLElement;
    if (noteItem) {
      noteItem.classList.add('dragging');
    }
  }

  protected onDragOver(event: DragEvent, noteId: string): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    const target = event.currentTarget as HTMLElement;
    if (this.draggedNoteId && this.draggedNoteId !== noteId) {
      target.classList.add('drag-over');
    }
  }

  protected onDragLeave(event: DragEvent): void {
    (event.currentTarget as HTMLElement).classList.remove('drag-over');
  }

  protected onDragEnd(event: DragEvent): void {
    (event.currentTarget as HTMLElement).classList.remove('dragging');
    document.querySelectorAll('.note-item').forEach((item) => {
      item.classList.remove('drag-over', 'dragging');
    });
    this.draggedNoteId = null;
  }

  protected onDrop(event: DragEvent, noteId: string): void {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('drag-over');

    if (this.draggedNoteId && this.draggedNoteId !== noteId) {
      const allNotes = this.store.notes();
      const fromIndex = allNotes.findIndex((n) => n.id === this.draggedNoteId);
      const toIndex = allNotes.findIndex((n) => n.id === noteId);

      if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
        this.store.reorderNotes(fromIndex, toIndex);
      }
    }

    document.querySelectorAll('.note-item').forEach((item) => {
      item.classList.remove('dragging', 'drag-over');
    });
    this.draggedNoteId = null;
  }

  protected onTouchStart(event: TouchEvent, noteId: string): void {
    const touch = event.touches[0];
    this.touchStartY = touch.clientY;
    this.touchStartX = touch.clientX;
    const handle = event.currentTarget as HTMLElement;
    this.touchStartElement = handle.closest('.note-item') as HTMLElement;
    if (!this.touchStartElement) return;

    this.draggedNoteId = noteId;
    this.isDragging = false;
    // Don't prevent default yet - wait for movement
  }

  protected onTouchMove(event: TouchEvent): void {
    if (!this.touchStartElement || !this.draggedNoteId) return;

    const touch = event.touches[0];
    const deltaY = Math.abs(touch.clientY - this.touchStartY);
    const deltaX = Math.abs(touch.clientX - this.touchStartX);

    // Only start dragging if moved more than 10px (to distinguish from tap)
    if (!this.isDragging && (deltaY > 10 || deltaX > 10)) {
      this.isDragging = true;
      this.touchStartElement.classList.add('dragging');
      event.preventDefault();
    }

    if (!this.isDragging) return;

    const currentY = touch.clientY;
    const moveDeltaY = currentY - this.touchStartY;

    // Move the dragged element visually
    this.touchStartElement.style.transform = `translateY(${moveDeltaY}px)`;
    this.touchStartElement.style.transition = 'none';
    this.touchStartElement.style.zIndex = '1000';

    // Find which note item is at the touch position
    const allNoteItems = Array.from(
      document.querySelectorAll('.note-item'),
    ) as HTMLElement[];
    let targetItem: HTMLElement | null = null;

    for (const item of allNoteItems) {
      if (item === this.touchStartElement) continue;
      const rect = item.getBoundingClientRect();

      // Check if touch is over this item
      if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        targetItem = item;
        break;
      }
    }

    // Remove drag-over from all items
    allNoteItems.forEach((item) => {
      if (item !== this.touchStartElement) {
        item.classList.remove('drag-over');
      }
    });

    // Add drag-over to target item
    if (targetItem) {
      const targetNoteId = targetItem.getAttribute('data-note-id');
      if (targetNoteId && targetNoteId !== this.draggedNoteId) {
        targetItem.classList.add('drag-over');
        this.touchCurrentElement = targetItem;
      }
    } else {
      this.touchCurrentElement = null;
    }

    event.preventDefault();
  }

  protected onTouchEnd(event: TouchEvent): void {
    if (!this.touchStartElement || !this.draggedNoteId) {
      this.isDragging = false;
      return;
    }

    if (this.isDragging) {
      const allNotes = this.store.notes();
      const fromIndex = allNotes.findIndex((n) => n.id === this.draggedNoteId);

      if (this.touchCurrentElement) {
        const targetNoteId =
          this.touchCurrentElement.getAttribute('data-note-id');
        if (targetNoteId) {
          const toIndex = allNotes.findIndex((n) => n.id === targetNoteId);

          if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
            this.store.reorderNotes(fromIndex, toIndex);
          }
        }
      }
    }

    // Reset styles
    if (this.touchStartElement) {
      this.touchStartElement.style.transform = '';
      this.touchStartElement.style.transition = '';
      this.touchStartElement.style.zIndex = '';
      this.touchStartElement.classList.remove('dragging');
    }

    document.querySelectorAll('.note-item').forEach((item) => {
      item.classList.remove('drag-over', 'dragging');
    });

    this.draggedNoteId = null;
    this.touchStartElement = null;
    this.touchCurrentElement = null;
    this.touchStartY = 0;
    this.touchStartX = 0;
    this.isDragging = false;
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
