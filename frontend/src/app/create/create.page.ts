import { Component, inject, signal, effect } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonItem,
  IonInput,
  IonTextarea,
  IonSpinner,
  IonText,
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
import { SettingsStore } from '../store/settings.store';

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
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonItem,
    IonInput,
    IonTextarea,
    IonSpinner,
    IonText,
    ReactiveFormsModule,
  ],
})
export class CreatePage {
  protected readonly store = inject(NotesStore);
  private readonly networkService = inject(NetworkService);
  private readonly settings = inject(SettingsStore);
  private readonly alertController = inject(AlertController);
  private readonly fb = inject(FormBuilder);
  protected readonly isRecording = signal(false);
  protected readonly statusMessage = signal('');

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

    // Update status when transcription completes
    effect(() => {
      if (
        !this.store.loading() &&
        this.statusMessage() === 'Transcribing audio...'
      ) {
        this.statusMessage.set('Transcription complete!');
        this.showSuccessAlert(
          'Transcription Complete',
          'Your audio has been transcribed and saved as a note!'
        ).catch(console.error);
        setTimeout(
          () => this.statusMessage.set('Ready to create your next note.'),
          2000
        );
      }
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
        'Recording Not Supported',
        'Your device does not support audio recording. Please use the upload option instead.'
      );
      return;
    }

    if (this.noModelDownloaded()) {
      await this.showAlert(
        'No Model Available Offline',
        'You are currently offline and no model is downloaded. Please connect to the internet to download the model once'
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
        this.processFile(
          new File([blob], 'recording.webm', { type: blob.type }),
          'Recording'
        );
        this.chunks = [];
      };

      this.mediaRecorder.start();
      this.isRecording.set(true);
      this.statusMessage.set('Recording... Tap stop when done.');
    } catch (error) {
      console.error(error);
      await this.showAlert(
        'Microphone Permission Required',
        'Please allow microphone access in your browser settings to record audio. You can also upload audio files instead.'
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
    this.processFile(file, 'Upload');
    input.value = '';
  }

  protected async saveNote(): Promise<void> {
    if (this.noteForm.invalid) {
      this.noteForm.markAllAsTouched();
      return;
    }

    const { title, body } = this.noteForm.value;
    const trimmedBody = (body || '').trim();
    if (!trimmedBody) {
      this.statusMessage.set('Please write something before saving.');
      return;
    }

    const note: Note = {
      id: crypto.randomUUID(),
      title: (title || 'Untitled note').trim(),
      body: trimmedBody,
      createdAt: Date.now(),
      source: 'Typed',
    };

    this.store.addNote(note);
    this.noteForm.reset();
    this.statusMessage.set('Note saved successfully.');
    await this.showSuccessAlert(
      'Note Created',
      'Your note has been saved successfully!'
    );
  }

  private processFile(file: File, source: Note['source']): void {
    this.statusMessage.set('Transcribing audio...');
    this.store.transcribe({ file, source });
  }

  private async showSuccessAlert(
    header: string,
    message: string
  ): Promise<void> {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK'],
      cssClass: 'success-alert',
    });
    await alert.present();
  }

  private async showAlert(header: string, message: string): Promise<void> {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK'],
      cssClass: 'error-alert',
    });
    await alert.present();
  }
}
