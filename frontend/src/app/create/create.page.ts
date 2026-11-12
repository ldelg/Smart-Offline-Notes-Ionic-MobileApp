import { Component, DestroyRef, inject, signal, effect } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
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
  IonProgressBar,
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
import { NO_SPEECH_ERROR } from '../models/transcription.service.model';
import { TranslatePipe } from '../pipes/translate.pipe';
import { TranslationStore } from '../store/translation.store';
import { AutoTranslateService } from '../services/auto-translate.service';
import { DocumentInboxService } from '../services/document-inbox';
import { isDocumentFile } from '../services/document-import';

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
    IonProgressBar,
    IonToggle,
    ReactiveFormsModule,
    TranslatePipe,
  ],
})
export class CreatePage {
  protected readonly store = inject(NotesStore);
  private readonly networkService = inject(NetworkService);
  private readonly settings = inject(SettingsStore);
  private readonly autoTranslate = inject(AutoTranslateService);
  private readonly transcriptionService = inject(TranscriptionService);
  private readonly alertController = inject(AlertController);
  private readonly translationStore = inject(TranslationStore);
  private readonly inbox = inject(DocumentInboxService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly isRecording = signal(false);
  protected readonly recordingSeconds = signal(0);
  private recordingTimer?: ReturnType<typeof setInterval>;
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
    void this.autoTranslate;
    addIcons({
      micOutline,
      stopCircleOutline,
      cloudUploadOutline,
      createOutline,
    });
    this.store.loadNotes();
    this.releaseMicrophoneWhenBackgrounded();
    this.destroyRef.onDestroy(() => this.clearRecordingTimer());
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

      if (error === NO_SPEECH_ERROR) {
        const debug = this.transcriptionService.lastAudioDebug();
        const message = this.translationStore.t('create.errors.noSpeechMessage');
        this.statusMessage.set(this.translationStore.t('create.errors.noSpeech'));
        this.showAlert(
          this.translationStore.t('create.errors.noSpeechHeader'),
          debug ? `${message} (${debug})` : message,
        ).catch(console.error);
        this.store.clearError();
        return;
      }

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
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const recorder = new MediaRecorder(this.mediaStream);
      this.mediaRecorder = recorder;
      this.chunks = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };

      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type: mime });
        this.chunks = [];
        this.releaseMicrophone();
        const extension = mime.includes('mp4')
          ? 'm4a'
          : mime.includes('ogg')
            ? 'ogg'
            : 'webm';
        void this.processFile(
          new File([blob], `recording.${extension}`, { type: mime }),
          'Recording',
        );
      };

      recorder.start();
      this.recordingSeconds.set(0);
      this.clearRecordingTimer();
      this.recordingTimer = setInterval(() => this.recordingSeconds.update((value) => value + 1), 1000);
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

  /**
   * Android 14 and later mute the microphone once the app leaves the
   * foreground, unless a microphone foreground service is running. Recording
   * stays inside this activity and stops when the user leaves, so the app
   * does not capture audio in the background.
   */
  private releaseMicrophoneWhenBackgrounded(): void {
    const onHidden = () => {
      if (document.visibilityState !== 'visible') this.stopRecording();
    };
    document.addEventListener('visibilitychange', onHidden);
    this.destroyRef.onDestroy(() =>
      document.removeEventListener('visibilitychange', onHidden),
    );
    if (!Capacitor.isNativePlatform()) return;
    void App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) this.stopRecording();
    }).then((handle) => {
      this.destroyRef.onDestroy(() => void handle.remove());
    });
  }

  protected recordingClock(): string {
    const total = this.recordingSeconds();
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  protected stopRecording(): void {
    this.clearRecordingTimer();
    const recorder = this.mediaRecorder;
    if (recorder?.state === 'recording') {
      // The last chunk arrives before `onstop`. Stopping the mic tracks here
      // drops that chunk, so the first take is often silence.
      recorder.stop();
    } else {
      this.releaseMicrophone();
    }
    this.isRecording.set(false);
  }

  private clearRecordingTimer(): void {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = undefined;
    }
  }

  private releaseMicrophone(): void {
    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = undefined;
  }

  protected handleUpload(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;
    input.value = '';
    if (isDocumentFile(file.name, file.type)) {
      void this.inbox.importBrowserFile(file);
      return;
    }
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

  protected progressLabelKey(): string {
    const phase = this.transcriptionService.progressPhase();
    if (phase === 'download') return 'create.progress.downloading';
    if (phase === 'load') return 'create.progress.loading';
    return 'create.progress.transcribing';
  }

  protected progressPercent(): number | null {
    return this.transcriptionService.progressPercent();
  }
}
