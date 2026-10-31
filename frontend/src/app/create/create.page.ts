import { Component, inject, signal, effect } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon,
  IonCard,
  IonCardContent,
  IonItem,
  IonInput,
  IonTextarea,
  IonSpinner,
  IonText,
  IonToggle,
  AlertController,
} from '@ionic/angular/standalone';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NotesStore } from '../store/notes.store';
import { Note } from '../models/note.model';
import { addIcons } from 'ionicons';
import {
  micOutline,
  stopCircleOutline,
  cloudUploadOutline,
  createOutline,
} from 'ionicons/icons';
import { NetworkService } from '../services/network.service';
import {
  MODEL_DOWNLOAD_CONSENT_PREFIX,
  modelOptions,
} from '../models/settings.model';
import { SettingsStore } from '../store/settings.store';
import { TranscriptionService } from '../services/transcription.service';
import { TranslatePipe } from '../pipes/translate.pipe';
import { TranslationStore } from '../store/translation.store';

@Component({
  selector: 'app-create',
  templateUrl: 'create.page.html',
  styleUrls: ['create.page.scss'],
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonIcon,
    IonCard,
    IonCardContent,
    IonItem,
    IonInput,
    IonTextarea,
    IonSpinner,
    IonText,
    IonToggle,
    ReactiveFormsModule,
    TranslatePipe,
  ],
})
export class CreatePage {
  protected readonly store = inject(NotesStore);
  private readonly networkService = inject(NetworkService);
  private readonly settings = inject(SettingsStore);
  private readonly transcriptionService = inject(TranscriptionService);
  private readonly alertController = inject(AlertController);
  private readonly translationStore = inject(TranslationStore);
  private readonly fb = inject(FormBuilder);
  protected readonly isRecording = signal(false);
  protected readonly statusMessage = signal('');
  protected readonly isManualEntry = signal(false);

  protected readonly noteForm = this.fb.group({
    title: [''],
    body: ['', [Validators.minLength(2)]],
  });

  private mediaRecorder?: MediaRecorder;
  private mediaStream?: MediaStream;
  private chunks: BlobPart[] = [];

  constructor() {
    addIcons({
      micOutline,
      stopCircleOutline,
      cloudUploadOutline,
      createOutline,
    });
    this.store.loadNotes();
    effect(() => {
      if (
        !this.store.loading() &&
        !this.store.error() &&
        this.statusMessage() === this.translationStore.t('create.transcribing')
      ) {
        this.statusMessage.set(
          this.translationStore.t('create.status.transcriptionComplete'),
        );
        this.showSuccessAlert(
          this.translationStore.t('create.alerts.transcriptionCompleteHeader'),
          this.translationStore.t('create.alerts.transcriptionCompleteMessage'),
        ).catch(console.error);
        setTimeout(
          () =>
            this.statusMessage.set(
              this.translationStore.t('create.status.ready'),
            ),
          2000,
        );
      }
    });

    effect(() => {
      const error = this.store.error();
      if (!error) return;

      const errorMessage = error.toLowerCase();
      const isRateLimited =
        errorMessage.includes('429') ||
        errorMessage.includes('too many requests') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('huggingface');
      const friendlyStatus = this.translationStore.t(
        isRateLimited
          ? 'create.errors.rateLimited'
          : 'create.errors.transcriptionFailed',
      );
      const friendlyMessage = this.translationStore.t(
        isRateLimited
          ? 'create.errors.rateLimitedMessage'
          : 'create.errors.transcriptionFailedMessage',
      );
      const hasDetail = error !== 'Transcription failed';

      this.statusMessage.set(
        hasDetail && !isRateLimited ? error : friendlyStatus,
      );
      this.showAlert(
        this.translationStore.t(
          isRateLimited
            ? 'create.errors.rateLimitedHeader'
            : 'create.errors.transcriptionFailedHeader',
        ),
        hasDetail ? `${friendlyMessage} (${error})` : friendlyMessage,
      ).catch(console.error);
      this.store.clearError();
    });
  }

  noModelDownloaded(): boolean {
    const isOnline = this.networkService.isOnline();
    const isModelCached = this.settings.lastUsedModel() !== null;
    return !isOnline && !isModelCached;
  }

  protected async startRecording(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      await this.showAlert(
        this.translationStore.t('create.errors.recordingNotSupportedHeader'),
        this.translationStore.t('create.errors.recordingNotSupportedMessage'),
      );
      return;
    }

    if (this.noModelDownloaded()) {
      await this.showAlert(
        this.translationStore.t('create.errors.noModelOfflineHeader'),
        this.translationStore.t('create.errors.noModelOfflineMessage'),
      );
      return;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      this.mediaRecorder = new MediaRecorder(this.mediaStream);
      this.chunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' });
        void this.processFile(
          new File([blob], 'recording.webm', { type: blob.type }),
          'Recording',
        );
        this.chunks = [];
      };

      this.mediaRecorder.start();
      this.isRecording.set(true);
      this.statusMessage.set(this.translationStore.t('create.recording'));
    } catch (error) {
      console.error(error);
      await this.showAlert(
        this.translationStore.t('create.errors.microphonePermissionHeader'),
        this.translationStore.t('create.errors.microphonePermissionMessage'),
      );
    }
  }

  protected stopRecording(): void {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
      this.mediaStream?.getTracks().forEach((track) => track.stop());
    }
    this.isRecording.set(false);
  }

  protected handleUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    input.value = '';
    void this.processFile(file, 'Upload');
  }

  protected async saveNote(): Promise<void> {
    if (this.noteForm.invalid) {
      this.noteForm.markAllAsTouched();
      return;
    }

    const { title, body } = this.noteForm.value;
    const trimmedBody = (body || '').trim();
    if (!trimmedBody) {
      this.statusMessage.set(
        this.translationStore.t('create.errors.emptyNote'),
      );
      return;
    }

    const note: Note = {
      id: crypto.randomUUID(),
      title: (
        title || this.translationStore.t('create.defaults.untitled')
      ).trim(),
      body: trimmedBody,
      createdAt: Date.now(),
      source: 'Typed',
    };

    this.store.addNote(note);
    this.noteForm.reset();
    this.statusMessage.set(this.translationStore.t('create.saved'));
    await this.showSuccessAlert(
      this.translationStore.t('create.alerts.noteCreatedHeader'),
      this.translationStore.t('create.alerts.noteCreatedMessage'),
    );
  }

  private async processFile(file: File, source: Note['source']): Promise<void> {
    try {
      if (!(await this.confirmModelDownload())) {
        this.statusMessage.set(this.translationStore.t('create.status.ready'));
        return;
      }
    } catch (error) {
      console.error(error);
      return;
    }
    this.statusMessage.set(this.translationStore.t('create.transcribing'));
    this.store.transcribe({ file, source });
  }

  /** Ask before each model that still has to be downloaded from huggingface.co. */
  private async confirmModelDownload(): Promise<boolean> {
    const model = this.settings.model();
    if (this.settings.lastUsedModel() === model) return true;

    const key = `${MODEL_DOWNLOAD_CONSENT_PREFIX}${model}`;
    if (localStorage.getItem(key) === 'yes') return true;

    const label =
      modelOptions.find((option) => option.value === model)?.label ?? model;
    const template = this.translationStore.t('create.modelDownload.message');
    const message = template.includes('{model}')
      ? template.split('{model}').join(label)
      : `${label}. ${template}`;

    const alert = await this.alertController.create({
      header: this.translationStore.t('create.modelDownload.header'),
      message,
      buttons: [
        {
          text: this.translationStore.t('create.modelDownload.cancel'),
          role: 'cancel',
        },
        {
          text: this.translationStore.t('create.modelDownload.confirm'),
          role: 'confirm',
        },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'confirm') return false;
    localStorage.setItem(key, 'yes');
    return true;
  }

  private async showSuccessAlert(
    header: string,
    message: string,
  ): Promise<void> {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: [this.translationStore.t('create.alerts.ok')],
      cssClass: 'success-alert',
    });
    await alert.present();
  }

  private async showAlert(header: string, message: string): Promise<void> {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: [this.translationStore.t('create.alerts.ok')],
      cssClass: 'error-alert',
    });
    await alert.present();
  }

  protected modelStatusLine(): string {
    const service = this.transcriptionService as any;
    const status = service.modelStatus?.();
    if (status) return status;
    return `${this.translationStore.t('create.modelLabel')}: ${this.settings.model()}`;
  }

  protected modelProgressLabel(): string | null {
    const service = this.transcriptionService as any;
    const progress = service.modelProgress?.();
    if (typeof progress !== 'number') return null;
    return `${Math.round(progress)}%`;
  }
}
