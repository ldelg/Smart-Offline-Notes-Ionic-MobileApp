import { Injectable, inject, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { SettingsStore } from '../store/settings.store';
import { NetworkService } from './network.service';
import { TranscriptionUpdate } from '../models/transcription.service.model';

function transcriptionErrorMessage(payload: {
  error?: unknown;
  data?: unknown;
} | null | undefined): string {
  const candidates = [payload?.error, payload?.data];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value instanceof Error && value.message.trim()) return value.message;
    if (value && typeof value === 'object' && 'message' in value) {
      const message = (value as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message.trim();
    }
  }
  return 'Transcription failed';
}

@Injectable({ providedIn: 'root' })
export class TranscriptionService {
  private worker?: Worker;
  private activeHandler?: (event: MessageEvent) => void;
  private readonly settings = inject(SettingsStore);
  private readonly networkService = inject(NetworkService);
  readonly modelStatus = signal<string | null>(null);
  readonly modelProgress = signal<number | null>(null);

  /** Latest transcribe() call. Older in-flight work must not emit into it. */
  private jobToken = 0;
  /** Token of the job that has been posted to the worker, if any. */
  private inFlightToken: number | null = null;

  constructor() {
    this.createWorker();
  }

  transcribe(file: File): Observable<TranscriptionUpdate> {
    const token = ++this.jobToken;
    const updates$ = new Subject<TranscriptionUpdate>();
    const start = performance.now();

    this.modelStatus.set(null);
    this.modelProgress.set(null);

    if (this.inFlightToken !== null) {
      // The worker handles one pipeline call at a time and broadcasts every
      // message to every listener. Starting another job has to replace it.
      this.restartWorker();
    }

    if (!this.worker) {
      return new Observable((subscriber) => {
        subscriber.error(
          new Error('Web Workers are not supported in this browser'),
        );
      });
    }

    let settled = false;
    const settle = () => {
      settled = true;
      if (this.inFlightToken === token) {
        this.inFlightToken = null;
      }
    };

    this.processAudioAndTranscribe(file, updates$, start, token, settle).catch(
      (error) => {
        if (token !== this.jobToken) return;
        this.detachActiveHandler();
        settle();
        updates$.error(error);
      },
    );

    return new Observable((subscriber) => {
      const subscription = updates$.subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        if (!settled && token === this.jobToken) {
          this.restartWorker();
        }
      };
    });
  }

  private createWorker(): void {
    if (typeof Worker === 'undefined') return;
    this.worker = new Worker(
      new URL('./transcription.worker', import.meta.url),
      { type: 'module' },
    );
  }

  private detachActiveHandler(): void {
    if (this.worker && this.activeHandler) {
      this.worker.removeEventListener('message', this.activeHandler);
    }
    this.activeHandler = undefined;
  }

  private restartWorker(): void {
    this.detachActiveHandler();
    this.worker?.terminate();
    this.worker = undefined;
    this.inFlightToken = null;
    this.modelStatus.set(null);
    this.modelProgress.set(null);
    this.createWorker();
  }

  private async processAudioAndTranscribe(
    file: File,
    updates$: Subject<TranscriptionUpdate>,
    start: number,
    token: number,
    settle: () => void,
  ): Promise<void> {
    if (!this.worker) {
      throw new Error('Worker not available');
    }

    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContext({ sampleRate: 16000 });
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      if (token !== this.jobToken || !this.worker) return;

      let audio: Float32Array;
      if (audioBuffer.numberOfChannels === 2) {
        const SCALING_FACTOR = Math.sqrt(2);
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.getChannelData(1);
        audio = new Float32Array(left.length);
        for (let i = 0; i < audioBuffer.length; ++i) {
          audio[i] = (SCALING_FACTOR * (left[i] + right[i])) / 2;
        }
      } else {
        audio = audioBuffer.getChannelData(0);
      }

      const audioDuration = audio.length / 16000;
      console.log(`Transcribing ${audioDuration.toFixed(1)}s of audio`);

      const messageHandler = (event: MessageEvent) => {
        if (token !== this.jobToken) return;
        const payload = event.data;
        const { status, data } = payload || {};

        if (this.handleModelProgress(payload)) {
          return;
        }

        if (status === 'update') {
          const updateData = data as [string, { chunks: any[] }];
          const text = updateData[0] || '';
          const chunks = updateData[1]?.chunks || [];

          updates$.next({
            text: text,
            chunks: chunks,
            isComplete: false,
          });
        } else if (status === 'complete') {
          const result = data;
          this.detachActiveHandler();
          settle();
          this.modelStatus.set(null);
          this.modelProgress.set(null);

          const chunksCount = result?.chunks?.length || 0;
          console.log(`Chunks: ${chunksCount}`);

          if (result?.chunks && Array.isArray(result.chunks)) {
            result.chunks.forEach((chunk: any, index: number) => {
              console.log(
                `Chunk ${index + 1}/${chunksCount}:`,
                chunk.text?.trim() || '',
              );
            });
          }

          let text = '';
          if (result?.text && result.text.trim().length > 0) {
            text = result.text;
            console.log(`result.text length: ${text.length} chars`);

            if (result?.chunks && result.chunks.length > 1) {
              const chunkTexts = result.chunks
                .map((chunk: any) => chunk.text?.trim() || '')
                .filter((t: string) => t.length > 0);
              const mergedFromChunks = chunkTexts.join(' ').trim();
              if (mergedFromChunks.length > text.length) {
                text = mergedFromChunks;
                console.log(`Using merged chunks (${text.length} chars)`);
              }
            }
          } else if (
            result?.chunks &&
            Array.isArray(result.chunks) &&
            result.chunks.length > 0
          ) {
            const chunkTexts = result.chunks
              .map((chunk: any) => chunk.text?.trim() || '')
              .filter((t: string) => t.length > 0);
            text = chunkTexts.join(' ').trim();
            console.log(`Merged from chunks: ${text.length} chars`);
          } else if (typeof result === 'string') {
            text = result;
          }

          console.log(`Final text: ${text.length} chars`);

          updates$.next({
            text: text.trim(),
            chunks: result?.chunks || [],
            isComplete: true,
            language: result?.language ?? result?.language_detection?.language,
            duration: Math.round((performance.now() - start) / 100) / 10,
          });
          updates$.complete();
        } else if (status === 'error') {
          this.detachActiveHandler();
          settle();
          this.modelStatus.set(null);
          this.modelProgress.set(null);
          updates$.error(new Error(transcriptionErrorMessage(payload)));
        }
      };

      this.detachActiveHandler();
      this.activeHandler = messageHandler;
      this.worker.addEventListener('message', messageHandler);
      this.inFlightToken = token;

      const model = this.settings.model();
      const multilingual = this.settings.multilingual();
      const language = multilingual ? this.settings.language() : null;
      const subtask = multilingual ? this.settings.task() : null;
      const isOnline = this.networkService.getStatus();
      const lastUsedModel = this.settings.lastUsedModel();

      this.worker.postMessage(
        {
          type: 'transcribe',
          audio,
          model,
          multilingual,
          subtask,
          language,
          isOnline,
          lastUsedModel,
        },
        [audio.buffer],
      );
    } finally {
      void audioContext.close();
    }
  }

  private handleModelProgress(payload: any): boolean {
    if (!payload) return false;
    const status = payload.status;
    const isTranscriptionEvent =
      status === 'update' || status === 'complete' || status === 'error';
    if (isTranscriptionEvent) return false;

    const hasProgress = typeof payload.progress === 'number';
    if (!status && !hasProgress) return false;

    const message = this.formatModelStatus(payload);
    if (message) {
      this.modelStatus.set(message);
    }
    this.modelProgress.set(hasProgress ? payload.progress : null);
    return true;
  }

  private formatModelStatus(payload: any): string | null {
    const status = payload.status;
    const file = this.formatModelFile(payload.file || payload.name);
    if (status && file) return `${status}: ${file}`;
    if (status) return String(status);
    if (file) return `Loading model: ${file}`;
    return null;
  }

  private formatModelFile(value: any): string | null {
    if (!value || typeof value !== 'string') return null;
    const parts = value.split('/');
    const file = parts[parts.length - 1] || value;
    return file.length > 40 ? `…${file.slice(-40)}` : file;
  }
}
