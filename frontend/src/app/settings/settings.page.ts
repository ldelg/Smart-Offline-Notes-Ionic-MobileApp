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
  IonButton,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { heartOutline } from 'ionicons/icons';
import { SettingsStore } from '../store/settings.store';
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
  private readonly settings = inject(SettingsStore);
  private readonly alertController = inject(AlertController);
  private readonly platform = inject(Platform);

  // Replace with your Stripe Payment Link URL
  private readonly STRIPE_PAYMENT_LINK_URL =
    'https://donate.stripe.com/4gweYZ26zbfY25y9AA';

  constructor() {
    addIcons({
      heartOutline,
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
}
