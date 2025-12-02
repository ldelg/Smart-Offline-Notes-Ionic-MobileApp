import { Injectable, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { SettingsStore } from '../store/settings.store';
import { NetworkService } from './network.service';

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

export interface TranscriptionUpdate {
  text: string;
  chunks?: any[];
  isComplete: boolean;
  language?: string;
  duration?: number;
}

@Injectable({ providedIn: 'root' })
export class TranscriptionService {
  private worker?: Worker;
  private readonly settings = inject(SettingsStore);
  private readonly networkService = inject(NetworkService);

  constructor() {
    if (typeof Worker !== 'undefined') {
      this.worker = new Worker(
        new URL('./transcription.worker', import.meta.url),
        { type: 'module' }
      );
    }
  }

  transcribe(file: File): Observable<TranscriptionUpdate> {
    const updates$ = new Subject<TranscriptionUpdate>();
    const start = performance.now();

    if (!this.worker) {
      updates$.error(
        new Error('Web Workers are not supported in this browser')
      );
      return updates$;
    }

    this.processAudioAndTranscribe(file, updates$, start).catch((error) => {
      updates$.error(error);
    });

    return updates$.asObservable();
  }

  private async processAudioAndTranscribe(
    file: File,
    updates$: Subject<TranscriptionUpdate>,
    start: number
  ): Promise<void> {
    if (!this.worker) {
      throw new Error('Worker not available');
    }

    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

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
      const { status, data, error } = event.data;

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
        this.worker?.removeEventListener('message', messageHandler);

        const chunksCount = result?.chunks?.length || 0;
        console.log(`Chunks: ${chunksCount}`);

        if (result?.chunks && Array.isArray(result.chunks)) {
          result.chunks.forEach((chunk: any, index: number) => {
            console.log(
              `Chunk ${index + 1}/${chunksCount}:`,
              chunk.text?.trim() || ''
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
        this.worker?.removeEventListener('message', messageHandler);
        updates$.error(new Error(error || 'Transcription failed'));
      }
    };

    this.worker.addEventListener('message', messageHandler);

    const model = this.settings.model();
    const multilingual = this.settings.multilingual();
    const quantized = this.settings.quantized();
    const language = multilingual ? this.settings.language() : null;
    const subtask = multilingual ? this.settings.task() : null;
    const isOnline = this.networkService.getStatus();

    this.worker.postMessage(
      {
        type: 'transcribe',
        audio,
        model,
        multilingual,
        quantized,
        subtask,
        language,
        isOnline,
      },
      [audio.buffer]
    );
  }
}
