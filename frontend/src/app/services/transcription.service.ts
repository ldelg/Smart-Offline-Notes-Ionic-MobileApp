import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { SettingsStore } from '../store/settings.store';
import { NetworkService } from './network.service';
import { TranscriptionUpdate } from '../models/transcription.service.model';

const workerErrorMessage = (payload: any): string => {
  const candidates = [payload?.error, payload?.data];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
    if (candidate instanceof Error && candidate.message.trim()) {
      return candidate.message;
    }
    if (
      candidate &&
      typeof candidate === 'object' &&
      typeof candidate.message === 'string' &&
      candidate.message.trim()
    ) {
      return candidate.message;
    }
  }
  return 'Transcription failed';
};

@Injectable({ providedIn: 'root' })
export class TranscriptionService {
  private worker?: Worker;
  private readonly settings = inject(SettingsStore);
  private readonly networkService = inject(NetworkService);
  readonly modelStatus = signal<string | null>(null);
  readonly modelProgress = signal<number | null>(null);
  private requestSeq = 0;
  private activeHandler?: (event: MessageEvent) => void;

  constructor() {
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(
        new URL('./transcription.worker', import.meta.url),
        { type: 'module' },
      );
    }
  }

  transcribe(file: File): Observable<TranscriptionUpdate> {
    return new Observable((subscriber) => {
      const requestId = ++this.requestSeq;
      const start = performance.now();

      this.modelStatus.set(null);
      this.modelProgress.set(null);

      if (!this.worker) {
        subscriber.error(
          new Error('Web Workers are not supported in this browser'),
        );
        return;
      }

      this.detachActiveHandler();

      let disposed = false;
      const messageHandler = (event: MessageEvent) => {
        if (disposed || event.data?.jobId !== requestId) return;
        this.handleWorkerMessage(event.data, subscriber, start, () => {
          disposed = true;
          this.detach(messageHandler);
        });
      };
      this.activeHandler = messageHandler;
      this.worker.addEventListener('message', messageHandler);

      this.processAudioAndTranscribe(file, requestId, () => disposed).catch(
        (error) => {
          if (disposed || requestId !== this.requestSeq) return;
          this.detach(messageHandler);
          this.modelStatus.set(null);
          this.modelProgress.set(null);
          subscriber.error(
            error instanceof Error ? error : new Error(String(error)),
          );
        },
      );

      return () => {
        disposed = true;
        this.detach(messageHandler);
      };
    });
  }

  private detachActiveHandler(): void {
    if (!this.activeHandler) return;
    this.worker?.removeEventListener('message', this.activeHandler);
    this.activeHandler = undefined;
  }

  private detach(handler: (event: MessageEvent) => void): void {
    this.worker?.removeEventListener('message', handler);
    if (this.activeHandler === handler) this.activeHandler = undefined;
  }

  private async processAudioAndTranscribe(
    file: File,
    requestId: number,
    isDisposed: () => boolean,
  ): Promise<void> {
    if (!this.worker) {
      throw new Error('Worker not available');
    }

    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContext({ sampleRate: 16000 });
    let audio: Float32Array;
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

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
    } finally {
      try {
        await audioContext.close();
      } catch (closeError) {
        console.warn('Failed to close AudioContext', closeError);
      }
    }

    if (isDisposed()) return;

    const audioDuration = audio.length / 16000;
    console.log(`Transcribing ${audioDuration.toFixed(1)}s of audio`);

    const model = this.settings.model();
    const multilingual = this.settings.multilingual();
    const language = multilingual ? this.settings.language() : null;
    const subtask = multilingual ? this.settings.task() : null;
    const isOnline = this.networkService.getStatus();
    const lastUsedModel = this.settings.lastUsedModel();

    this.worker.postMessage(
      {
        type: 'transcribe',
        jobId: requestId,
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
  }

  private handleWorkerMessage(
    payload: any,
    subscriber: {
      next: (value: TranscriptionUpdate) => void;
      error: (error: unknown) => void;
      complete: () => void;
    },
    start: number,
    finish: () => void,
  ): void {
    const { status, data } = payload || {};

    if (this.handleModelProgress(payload)) {
      return;
    }

    if (status === 'update') {
      const updateData = data as [string, { chunks: any[] }];
      const text = updateData[0] || '';
      const chunks = updateData[1]?.chunks || [];

      subscriber.next({
        text: text,
        chunks: chunks,
        isComplete: false,
      });
    } else if (status === 'complete') {
      const result = data;
      finish();
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

      subscriber.next({
        text: text.trim(),
        chunks: result?.chunks || [],
        isComplete: true,
        language: result?.language ?? result?.language_detection?.language,
        duration: Math.round((performance.now() - start) / 100) / 10,
      });
      subscriber.complete();
    } else if (status === 'error') {
      finish();
      this.modelStatus.set(null);
      this.modelProgress.set(null);
      subscriber.error(new Error(workerErrorMessage(payload)));
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
