import { Component, inject, computed, signal } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonButton,
  IonIcon,
  IonBadge,
  IonNote,
} from '@ionic/angular/standalone';
import { DatePipe, UpperCasePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotesStore } from '../store/notes.store';
import { Note } from '../models/note.model';
import { addIcons } from 'ionicons';
import { trashOutline } from 'ionicons/icons';

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
    IonLabel,
    IonButton,
    IonIcon,
    IonBadge,
    IonNote,
    DatePipe,
    UpperCasePipe,
    DecimalPipe,
    FormsModule,
  ],
})
export class NotesPage {
  private readonly store = inject(NotesStore);
  protected readonly searchTerm = signal('');

  protected readonly filteredNotes = computed(() => {
    const term = this.searchTerm().toLowerCase();
    if (!term) return this.store.notes();
    return this.store.notes().filter(
      (note) =>
        note.title.toLowerCase().includes(term) || note.body.toLowerCase().includes(term)
    );
  });

  constructor() {
    addIcons({ trashOutline });
    this.store.loadNotes();
  }

  protected onSearch(event: CustomEvent): void {
    const value = (event.detail as { value?: string }).value || '';
    this.searchTerm.set(value);
  }

  protected deleteNote(id: string): void {
    this.store.deleteNote(id);
  }

  protected getBadgeColor(source: Note['source']): string {
    switch (source) {
      case 'Recording':
        return 'primary';
      case 'Upload':
        return 'success';
      default:
        return 'tertiary';
    }
  }
}

