import { Component, computed, inject, ViewChild, ElementRef } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonToggle,
  AlertController,
  IonButton,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  heartOutline,
  downloadOutline,
  cloudUploadOutline,
} from 'ionicons/icons';
import { SettingsStore } from '../store/settings.store';
import { NotesStore } from '../store/notes.store';
import { Note } from '../models/note.model';
import { Browser } from '@capacitor/browser';
import { Platform } from '@ionic/angular';

interface LanguageOption {
  id: string;
  label: string;
}

interface ModelOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonToggle,
    IonButton,
    IonIcon,
  ],
})
export class SettingsPage {
  @ViewChild('fileInput', { static: false }) fileInput!: ElementRef<HTMLInputElement>;
  
  private readonly settings = inject(SettingsStore);
  private readonly notesStore = inject(NotesStore);
  private readonly alertController = inject(AlertController);
  private readonly platform = inject(Platform);

  // Replace with your Stripe Payment Link URL
  private readonly STRIPE_PAYMENT_LINK_URL =
    'https://donate.stripe.com/4gweYZ26zbfY25y9AA';

  constructor() {
    addIcons({
      heartOutline,
      downloadOutline,
      cloudUploadOutline,
    });
  }

  readonly model = computed(() => this.settings.model());
  readonly multilingual = computed(() => this.settings.multilingual());
  readonly quantized = computed(() => this.settings.quantized());
  readonly language = computed(() => this.settings.language());
  readonly task = computed(() => this.settings.task());
  readonly lastUsedModel = computed(() => this.settings.lastUsedModel());

  readonly modelOptions: ModelOption[] = [
    { value: 'Xenova/whisper-tiny', label: 'Xenova/whisper-tiny (41MB)' },
    { value: 'Xenova/whisper-base', label: 'Xenova/whisper-base (77MB)' },
    { value: 'Xenova/whisper-small', label: 'Xenova/whisper-small (249MB)' },
    // { value: 'Xenova/whisper-medium', label: 'Xenova/whisper-medium (776MB)' },
    // {
    //   value: 'distil-whisper/distil-medium.en',
    //   label: 'distil-whisper/distil-medium.en (402MB)',
    // },
    // {
    //   value: 'distil-whisper/distil-large-v2',
    //   label: 'distil-whisper/distil-large-v2 (767MB)',
    // },
  ];

  readonly languages: LanguageOption[] = [
    { id: 'english', label: 'English' },
    { id: 'spanish', label: 'Spanish' },
    { id: 'french', label: 'French' },
    { id: 'german', label: 'German' },
    { id: 'italian', label: 'Italian' },
  ];

  async onModelChange(model: string) {
    const oldModel = this.settings.model();

    // Warn if offline and switching to a different model
    if (!navigator.onLine && oldModel !== model) {
      const alert = await this.alertController.create({
        header: 'No Internet Connection',
        message:
          'You are currently offline. The new model will need to be downloaded when you have an internet connection. If the model is not cached, transcription will not work until you are online.',
        buttons: ['OK'],
      });
      await alert.present();
    }

    // Always update the model (user can proceed if they want)
    this.settings.setModel(model);
  }

  onMultilingualChange(enabled: boolean) {
    this.settings.setMultilingual(enabled);
  }

  onQuantizedChange(enabled: boolean) {
    this.settings.setQuantized(enabled);
  }

  onLanguageChange(language: string) {
    this.settings.setLanguage(language);
  }

  onTaskChange(task: string) {
    if (task === 'translate' || task === 'transcribe') {
      this.settings.setTask(task);
    }
  }

  async openDonationLink() {
    if (!this.STRIPE_PAYMENT_LINK_URL) {
      await this.showDonationSetupError();
      return;
    }

    try {
      await this.openStripeUrl(this.STRIPE_PAYMENT_LINK_URL);
    } catch (error) {
      console.error('Error opening donation link:', error);
      await this.showDonationError();
    }
  }

  private async openStripeUrl(url: string) {
    if (this.platform.is('capacitor')) {
      // Use Capacitor Browser plugin for mobile
      await Browser.open({ url, windowName: '_system' });
    } else {
      // Use window.open for web
      window.open(url, '_blank');
    }
  }

  private async showDonationSetupError() {
    const alert = await this.alertController.create({
      header: 'Donation Setup Required',
      message:
        'Please set your Stripe Payment Link URL in the STRIPE_PAYMENT_LINK_URL constant.',
      buttons: ['OK'],
    });
    await alert.present();
  }

  private async showDonationError() {
    const alert = await this.alertController.create({
      header: 'Donation Error',
      message:
        'There was an error processing your donation. Please try again later.',
      buttons: ['OK'],
    });
    await alert.present();
  }

  exportNotes() {
    try {
      const jsonData = this.notesStore.exportNotes();
      const notes = this.notesStore.notes();
      const filename = `smartnotes-backup-${notes.length}-notes-${new Date()
        .toISOString()
        .split('T')[0]}.json`;

      // Create blob and download
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.showSuccessAlert(
        'Export Successful',
        `Exported ${notes.length} note${notes.length !== 1 ? 's' : ''} to ${filename}`
      );
    } catch (error) {
      console.error('Export error:', error);
      this.showErrorAlert(
        'Export Failed',
        'There was an error exporting your notes. Please try again.'
      );
    }
  }

  triggerImport() {
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.click();
    }
  }

  async handleFileImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    // Reset input
    input.value = '';

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate structure
      if (!this.validateImportData(data)) {
        await this.showErrorAlert(
          'Invalid File',
          'The selected file is not a valid SmartNotes backup file.'
        );
        return;
      }

      const importedNotes = data.notes || data; // Support both formats
      const existingCount = this.notesStore.notes().length;

      if (existingCount > 0) {
        // Ask user: replace or merge
        const alert = await this.alertController.create({
          header: 'Import Notes',
          message: `You currently have ${existingCount} note${
            existingCount !== 1 ? 's' : ''
          }. The import file contains ${importedNotes.length} note${
            importedNotes.length !== 1 ? 's' : ''
          }. How would you like to proceed?`,
          buttons: [
            {
              text: 'Cancel',
              role: 'cancel',
            },
            {
              text: 'Replace All',
              handler: () => {
                this.importNotes(importedNotes, false);
              },
            },
            {
              text: 'Merge',
              handler: () => {
                this.importNotes(importedNotes, true);
              },
            },
          ],
        });
        await alert.present();
      } else {
        // No existing notes, just import
        this.importNotes(importedNotes, false);
      }
    } catch (error) {
      console.error('Import error:', error);
      await this.showErrorAlert(
        'Import Failed',
        'There was an error reading the file. Please make sure it is a valid JSON file.'
      );
    }
  }

  private validateImportData(data: any): boolean {
    // Check if it's an array (old format) or has notes property (new format)
    if (Array.isArray(data)) {
      return data.every((note) => this.isValidNote(note));
    }

    if (data && typeof data === 'object' && Array.isArray(data.notes)) {
      return data.notes.every((note: any) => this.isValidNote(note));
    }

    return false;
  }

  private isValidNote(note: any): note is Note {
    return (
      note &&
      typeof note === 'object' &&
      typeof note.id === 'string' &&
      typeof note.title === 'string' &&
      typeof note.body === 'string' &&
      typeof note.createdAt === 'number' &&
      ['Recording', 'Upload', 'Typed'].includes(note.source)
    );
  }

  private importNotes(notes: Note[], merge: boolean) {
    try {
      this.notesStore.importNotes(notes, merge);
      const finalCount = this.notesStore.notes().length;
      this.showSuccessAlert(
        'Import Successful',
        `Successfully imported ${notes.length} note${
          notes.length !== 1 ? 's' : ''
        }. You now have ${finalCount} note${finalCount !== 1 ? 's' : ''} in total.`
      );
    } catch (error) {
      console.error('Import error:', error);
      this.showErrorAlert(
        'Import Failed',
        'There was an error importing the notes. Please try again.'
      );
    }
  }

  private async showSuccessAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }

  private async showErrorAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }
}
