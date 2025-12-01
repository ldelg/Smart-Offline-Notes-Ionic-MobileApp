import { Component, computed, inject } from '@angular/core';
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
} from '@ionic/angular/standalone';
import { SettingsStore } from '../store/settings.store';

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
  ],
})
export class SettingsPage {
  private readonly settings = inject(SettingsStore);
  private readonly alertController = inject(AlertController);

  readonly model = computed(() => this.settings.model());
  readonly multilingual = computed(() => this.settings.multilingual());
  readonly quantized = computed(() => this.settings.quantized());
  readonly language = computed(() => this.settings.language());
  readonly task = computed(() => this.settings.task());

  readonly modelOptions: ModelOption[] = [
    { value: 'Xenova/whisper-tiny', label: 'Xenova/whisper-tiny (41MB)' },
    { value: 'Xenova/whisper-base', label: 'Xenova/whisper-base (77MB)' },
    { value: 'Xenova/whisper-small', label: 'Xenova/whisper-small (249MB)' },
    { value: 'Xenova/whisper-medium', label: 'Xenova/whisper-medium (776MB)' },
    {
      value: 'distil-whisper/distil-medium.en',
      label: 'distil-whisper/distil-medium.en (402MB)',
    },
    {
      value: 'distil-whisper/distil-large-v2',
      label: 'distil-whisper/distil-large-v2 (767MB)',
    },
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
    if (!navigator.onLine && oldModel && oldModel !== model) {
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
}


