import {
  Component,
  computed,
  inject,
  ViewChild,
  ElementRef,
  effect,
  signal,
} from '@angular/core';
import { ViewWillEnter } from '@ionic/angular';
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
  trashOutline,
  refreshOutline,
} from 'ionicons/icons';
import { SettingsStore } from '../store/settings.store';
import { NotesStore } from '../store/notes.store';
import { Note } from '../models/note.model';
import { Browser } from '@capacitor/browser';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { Platform } from '@ionic/angular';
import { NetworkService } from '../services/network.service';
import {
  LanguageOption,
  languages,
  ModelOption,
  modelOptions,
} from '../models/settings.model';

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
export class SettingsPage implements ViewWillEnter {
  @ViewChild('fileInput', { static: false })
  fileInput!: ElementRef<HTMLInputElement>;

  private readonly settings = inject(SettingsStore);
  private readonly notesStore = inject(NotesStore);
  private readonly alertController = inject(AlertController);
  private readonly platform = inject(Platform);
  readonly networkService = inject(NetworkService);
  private readonly STRIPE_PAYMENT_LINK_URL =
    'https://donate.stripe.com/4gweYZ26zbfY25y9AA';

  readonly cacheSize = signal<string>('0 MB');
  readonly isCalculatingCache = signal(false);

  constructor() {
    addIcons({
      heartOutline,
      downloadOutline,
      cloudUploadOutline,
      trashOutline,
      refreshOutline,
    });

    // Calculate cache size on init
    this.calculateCacheSize();

    // Recalculate cache size when model is used (cache might have grown)
    effect(() => {
      const lastUsed = this.settings.lastUsedModel();
      if (lastUsed) {
        // Debounce to avoid too many calculations
        setTimeout(() => this.calculateCacheSize(), 2000);
      }
    });

    // Watch network status and revert model when going offline
    effect(() => {
      const isOnline = this.networkService.isOnline();
      const lastUsed = this.settings.lastUsedModel();
      const currentModel = this.settings.model();

      // When going offline, revert to cached model if different
      if (!isOnline && lastUsed && currentModel !== lastUsed) {
        // Use lastUsed model as-is (it's the exact model name from dropdown)
        this.settings.setModel(lastUsed);
      }
    });
  }

  ionViewWillEnter() {
    // Recalculate cache size every time the page is entered
    this.calculateCacheSize();
  }

  readonly model = computed(() => this.settings.model());
  readonly multilingual = computed(() => this.settings.multilingual());
  readonly quantized = computed(() => this.settings.quantized());
  readonly language = computed(() => this.settings.language());
  readonly task = computed(() => this.settings.task());
  readonly lastUsedModel = computed(() => this.settings.lastUsedModel());

  readonly modelOptions: ModelOption[] = modelOptions;
  readonly languages: LanguageOption[] = languages;

  // Get the label for lastUsedModel
  readonly lastUsedModelLabel = computed(() => {
    const lastUsed = this.lastUsedModel();
    if (!lastUsed) return '';
    const option = modelOptions.find((opt) => opt.value === lastUsed);
    return option ? option.label : lastUsed;
  });

  // Get the label for current model
  readonly currentModelLabel = computed(() => {
    const current = this.model();
    if (!current) return '';
    const option = modelOptions.find((opt) => opt.value === current);
    return option ? option.label : current;
  });

  // Helper to check if a model supports multilingual
  private isModelMultilingual(model: string): boolean {
    return !model.endsWith('.en') && !model.startsWith('distil-whisper/');
  }

  // Check if current model supports multilingual (not .en models or distil)
  readonly isMultilingualModel = computed(() => {
    return this.isModelMultilingual(this.model());
  });

  onModelChange(model: string) {
    const currentModel = this.settings.model();
    if (model !== currentModel) {
      this.settings.setModel(model);
      // If switching to a non-multilingual model, disable multilingual
      if (!this.isModelMultilingual(model)) {
        this.settings.setMultilingual(false);
      }
    }
  }

  onMultilingualChange(enabled: boolean) {
    this.settings.setMultilingual(enabled);
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

  private async showDonationError() {
    const alert = await this.alertController.create({
      header: 'Donation Error',
      message:
        'There was an error processing your donation. Please try again later.',
      buttons: ['OK'],
    });
    await alert.present();
  }

  async exportNotes() {
    try {
      const jsonData = this.notesStore.exportNotes();
      const notes = this.notesStore.notes();
      const filename = `smartnotes-backup-${notes.length}-notes-${
        new Date().toISOString().split('T')[0]
      }.json`;

      // Try to save directly to Downloads folder on native platforms
      if (Capacitor.isNativePlatform()) {
        try {
          // Try ExternalStorage with Downloads path (may work without permission on Android 10+)
          const result = await Filesystem.writeFile({
            path: `Download/${filename}`,
            data: jsonData,
            directory: Directory.ExternalStorage,
            encoding: Encoding.UTF8,
          });

          await this.showSuccessAlert(
            'Export Successful',
            `File saved to Downloads folder: ${filename}`,
          );
          return;
        } catch (error: any) {
          console.error('Direct save failed, trying Share:', error);

          // Fallback: Save to Cache and use Share
          try {
            const cacheResult = await Filesystem.writeFile({
              path: filename,
              data: jsonData,
              directory: Directory.Cache,
              encoding: Encoding.UTF8,
            });

            await Share.share({
              title: 'SmartNotes Backup',
              text: `Backup of ${notes.length} note${
                notes.length !== 1 ? 's' : ''
              }`,
              url: cacheResult.uri,
              dialogTitle: 'Save SmartNotes Backup',
            });

            await this.showSuccessAlert(
              'Export Successful',
              `Choose where to save the file from the share dialog.`,
            );
            return;
          } catch (shareError: any) {
            // User cancelled share - that's fine
            if (
              shareError.message?.includes('cancel') ||
              shareError.message?.includes('User')
            ) {
              return;
            }
            throw shareError;
          }
        }
      }

      // Fallback for web: trigger a download
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      // Wait a bit before cleaning up
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);

      await this.showSuccessAlert(
        'Export Successful',
        `File downloaded as ${filename}. Check your Downloads folder.`,
      );
    } catch (error) {
      console.error('Export error:', error);
      await this.showErrorAlert(
        'Export Failed',
        'There was an error exporting your notes. Please try again.',
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
          'The selected file is not a valid SmartNotes backup file.',
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
        'There was an error reading the file. Please make sure it is a valid JSON file.',
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
        }. You now have ${finalCount} note${
          finalCount !== 1 ? 's' : ''
        } in total.`,
      );
    } catch (error) {
      console.error('Import error:', error);
      this.showErrorAlert(
        'Import Failed',
        'There was an error importing the notes. Please try again.',
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

  async calculateCacheSize() {
    this.isCalculatingCache.set(true);
    try {
      let totalSize = 0;

      if ('caches' in self) {
        const cacheNames = await caches.keys();
        for (const cacheName of cacheNames) {
          const cache = await caches.open(cacheName);
          const keys = await cache.keys();
          for (const request of keys) {
            const response = await cache.match(request);
            if (response) {
              const blob = await response.blob();
              totalSize += blob.size;
            }
          }
        }
      }

      this.cacheSize.set(this.formatBytes(totalSize));
    } catch (error) {
      console.error('Error calculating cache size:', error);
      this.cacheSize.set('Unknown');
    } finally {
      this.isCalculatingCache.set(false);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 MB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  async clearCache() {
    const alert = await this.alertController.create({
      header: 'Clear Model Cache',
      message: `This will delete all cached models (${this.cacheSize()}). You will need to download them again when you transcribe. Continue?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Clear Cache',
          role: 'destructive',
          handler: async () => {
            await this.performCacheClear();
          },
        },
      ],
    });
    await alert.present();
  }

  private async performCacheClear() {
    try {
      if ('caches' in self) {
        const cacheNames = await caches.keys();
        for (const cacheName of cacheNames) {
          await caches.delete(cacheName);
        }
      }

      // Reset last used model since cache is cleared
      this.settings.setLastUsedModel(null);

      // Recalculate size
      await this.calculateCacheSize();

      await this.showSuccessAlert(
        'Cache Cleared',
        'All cached models have been deleted successfully.',
      );
    } catch (error) {
      console.error('Error clearing cache:', error);
      await this.showErrorAlert(
        'Clear Failed',
        'There was an error clearing the cache. Please try again.',
      );
    }
  }
}
