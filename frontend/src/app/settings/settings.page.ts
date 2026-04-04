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
  UiLanguageOption,
  uiLanguages,
  ModelOption,
  modelOptions,
} from '../models/settings.model';
import { TranslationStore } from '../store/translation.store';
import { TranslatePipe } from '../pipes/translate.pipe';

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
    TranslatePipe,
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
  private readonly translationStore = inject(TranslationStore);
  private readonly STRIPE_PAYMENT_LINK_URL =
    'https://donate.stripe.com/4gweYZ26zbfY25y9AA';

  readonly cacheSize = signal<string>('0 MB');
  readonly isCalculatingCache = signal(false);
  readonly settingsSelectInterfaceOptions = {
    cssClass: 'settings-select-popover',
    side: 'bottom' as const,
    alignment: 'start' as const,
  };

  private t(key: string): string {
    return this.translationStore.t(key);
  }

  constructor() {
    addIcons({
      heartOutline,
      downloadOutline,
      cloudUploadOutline,
      trashOutline,
      refreshOutline,
    });
    this.calculateCacheSize();

    effect(() => {
      const lastUsed = this.settings.lastUsedModel();
      if (lastUsed) {
        setTimeout(() => this.calculateCacheSize(), 2000);
      }
    });

    effect(() => {
      const isOnline = this.networkService.isOnline();
      const lastUsed = this.settings.lastUsedModel();
      const currentModel = this.settings.model();
      if (!isOnline && lastUsed && currentModel !== lastUsed) {
        this.settings.setModel(lastUsed);
      }
    });

    this.translationStore.setLanguage(this.settings.uiLanguage());
  }
  ionViewWillEnter() {
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
  readonly uiLanguages: UiLanguageOption[] = uiLanguages;

  readonly uiLanguage = computed(() => this.settings.uiLanguage());
  readonly translatedUiLanguages = computed(() => {
    this.translationStore.t('languages.en');
    return this.uiLanguages.map((language) => ({
      ...language,
      label: this.translationStore.t(`languages.${language.id}`),
    }));
  });

  readonly activeModelLabel = computed(() => {
    const lastUsed = this.lastUsedModel();
    if (!lastUsed) {
      return this.t('settings.model.noActiveModel');
    }
    const option = modelOptions.find((opt) => opt.value === lastUsed);
    return option ? option.label : lastUsed;
  });

  readonly currentModelLabel = computed(() => {
    const current = this.model();
    if (!current) return '';
    const option = modelOptions.find((opt) => opt.value === current);
    return option ? option.label : current;
  });

  readonly selectedModelHintKey = computed(() => {
    const current = this.model();
    const lastUsed = this.lastUsedModel();
    return current && lastUsed && current === lastUsed
      ? 'settings.model.downloadedHint'
      : 'settings.model.willBeUsedHint';
  });

  private isModelMultilingual(model: string): boolean {
    return !model.endsWith('.en') && !model.startsWith('distil-whisper/');
  }

  readonly isMultilingualModel = computed(() => {
    return this.isModelMultilingual(this.model());
  });

  onModelChange(model: string) {
    const currentModel = this.settings.model();
    if (model !== currentModel) {
      this.settings.setModel(model);
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

  onUiLanguageChange(lang: string) {
    this.settings.setUiLanguage(lang);
    this.translationStore.setLanguage(lang);
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
      await Browser.open({ url, windowName: '_system' });
    } else {
      window.open(url, '_blank');
    }
  }

  private async showDonationError() {
    const alert = await this.alertController.create({
      header: this.t('settings.messages.donation.errorHeader'),
      message: this.t('settings.messages.donation.errorMessage'),
      buttons: [this.t('settings.messages.common.ok')],
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

      if (Capacitor.isNativePlatform()) {
        try {
          const result = await Filesystem.writeFile({
            path: `Download/${filename}`,
            data: jsonData,
            directory: Directory.ExternalStorage,
            encoding: Encoding.UTF8,
          });

          await this.showSuccessAlert(
            this.t('settings.messages.export.successHeader'),
            `${this.t('settings.messages.export.savedToDownloads')} ${filename}`,
          );
          return;
        } catch (error: any) {
          console.error('Direct save failed, trying Share:', error);
          try {
            const cacheResult = await Filesystem.writeFile({
              path: filename,
              data: jsonData,
              directory: Directory.Cache,
              encoding: Encoding.UTF8,
            });

            await Share.share({
              title: this.t('settings.messages.export.shareTitle'),
              text: `${this.t('settings.messages.export.shareTextPrefix')} ${notes.length} ${this.t(notes.length === 1 ? 'settings.messages.common.note' : 'settings.messages.common.notes')}`,
              url: cacheResult.uri,
              dialogTitle: this.t('settings.messages.export.shareDialogTitle'),
            });

            await this.showSuccessAlert(
              this.t('settings.messages.export.successHeader'),
              this.t('settings.messages.export.chooseWhere'),
            );
            return;
          } catch (shareError: any) {
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

      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();

      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);

      await this.showSuccessAlert(
        this.t('settings.messages.export.successHeader'),
        `${this.t('settings.messages.export.downloadedAs')} ${filename}. ${this.t('settings.messages.export.checkDownloads')}`,
      );
    } catch (error) {
      console.error('Export error:', error);
      await this.showErrorAlert(
        this.t('settings.messages.export.errorHeader'),
        this.t('settings.messages.export.errorMessage'),
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

    input.value = '';

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!this.validateImportData(data)) {
        await this.showErrorAlert(
          this.t('settings.messages.import.invalidHeader'),
          this.t('settings.messages.import.invalidMessage'),
        );
        return;
      }

      const importedNotes = data.notes || data;
      const existingCount = this.notesStore.notes().length;

      if (existingCount > 0) {
        const alert = await this.alertController.create({
          header: this.t('settings.messages.import.header'),
          message: `${this.t('settings.messages.import.currentlyHave')} ${existingCount} ${this.t(existingCount === 1 ? 'settings.messages.common.note' : 'settings.messages.common.notes')}. ${this.t('settings.messages.import.fileContains')} ${importedNotes.length} ${this.t(importedNotes.length === 1 ? 'settings.messages.common.note' : 'settings.messages.common.notes')}. ${this.t('settings.messages.import.howProceed')}`,
          buttons: [
            {
              text: this.t('settings.messages.common.cancel'),
              role: 'cancel',
            },
            {
              text: this.t('settings.messages.import.replaceAll'),
              handler: () => {
                this.importNotes(importedNotes, false);
              },
            },
            {
              text: this.t('settings.messages.import.merge'),
              handler: () => {
                this.importNotes(importedNotes, true);
              },
            },
          ],
        });
        await alert.present();
      } else {
        this.importNotes(importedNotes, false);
      }
    } catch (error) {
      console.error('Import error:', error);
      await this.showErrorAlert(
        this.t('settings.messages.import.errorHeader'),
        this.t('settings.messages.import.readErrorMessage'),
      );
    }
  }

  private validateImportData(data: any): boolean {
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
        this.t('settings.messages.import.successHeader'),
        `${this.t('settings.messages.import.importedPrefix')} ${notes.length} ${this.t(notes.length === 1 ? 'settings.messages.common.note' : 'settings.messages.common.notes')}. ${this.t('settings.messages.import.totalNow')} ${finalCount} ${this.t(finalCount === 1 ? 'settings.messages.common.note' : 'settings.messages.common.notes')}.`,
      );
    } catch (error) {
      console.error('Import error:', error);
      this.showErrorAlert(
        this.t('settings.messages.import.errorHeader'),
        this.t('settings.messages.import.importErrorMessage'),
      );
    }
  }

  private async showSuccessAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: [this.t('settings.messages.common.ok')],
    });
    await alert.present();
  }

  private async showErrorAlert(header: string, message: string) {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: [this.t('settings.messages.common.ok')],
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
      this.cacheSize.set(this.t('settings.messages.network.unknown'));
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
      header: this.t('settings.messages.network.clearCacheHeader'),
      message: `${this.t('settings.messages.network.clearCacheMessagePrefix')} (${this.cacheSize()}). ${this.t('settings.messages.network.clearCacheMessageSuffix')}`,
      buttons: [
        {
          text: this.t('settings.messages.common.cancel'),
          role: 'cancel',
        },
        {
          text: this.t('settings.messages.network.clearCacheAction'),
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

      this.settings.setLastUsedModel(null);
      await this.calculateCacheSize();

      await this.showSuccessAlert(
        this.t('settings.messages.network.clearedHeader'),
        this.t('settings.messages.network.clearedMessage'),
      );
    } catch (error) {
      console.error('Error clearing cache:', error);
      await this.showErrorAlert(
        this.t('settings.messages.network.clearFailedHeader'),
        this.t('settings.messages.network.clearFailedMessage'),
      );
    }
  }
}
