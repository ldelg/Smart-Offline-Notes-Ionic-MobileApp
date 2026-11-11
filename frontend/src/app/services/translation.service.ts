import { Injectable, inject, signal } from '@angular/core';
import { AppLang } from '../models/translation.model';
import { TranscriptionService } from './transcription.service';
import { LangPair, translationRoute } from './translation-route';
import { CatalogPack } from './translation-catalog';
import {
  InstalledPack,
  deleteInstalledPack,
  downloadPacks,
  listInstalledPacks,
  missingPackIds,
  packsForIds,
  readCached,
  wasmIsCached,
} from './translation-cache';

export interface TranslationProgress {
  phase: 'download' | 'load' | 'translate';
  percent: number | null;
  noteId: string | null;
}

export class TranslationCancelled extends Error {
  constructor() {
    super('Translation cancelled');
    this.name = 'TranslationCancelled';
  }
}

export class TranslationOffline extends Error {
  constructor() {
    super('Language pack is not on this phone');
    this.name = 'TranslationOffline';
  }
}

interface WorkerResponse {
  status: 'progress' | 'complete' | 'error';
  jobId: number;
  phase?: TranslationProgress['phase'];
  percent?: number | null;
  text?: string;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class TranslationService {
  private readonly speech = inject(TranscriptionService);
  readonly progress = signal<TranslationProgress | null>(null);
  readonly installed = signal<InstalledPack[]>([]);
  private worker?: Worker;
  private jobSeq = 0;
  private epoch = 0;
  private loadedKey = '';
  private wasmReady = false;

  constructor() {
    this.speech.registerBeforeStart(() => this.release());
  }

  release(): void {
    this.epoch += 1;
    this.worker?.terminate();
    this.worker = undefined;
    this.loadedKey = '';
    this.wasmReady = false;
    this.progress.set(null);
  }

  async refreshInstalled(): Promise<void> {
    if (typeof caches === 'undefined') {
      this.installed.set([]);
      return;
    }
    this.installed.set(await listInstalledPacks());
  }

  async deletePack(id: string): Promise<void> {
    this.release();
    if (typeof caches === 'undefined') return;
    await deleteInstalledPack(id);
    await this.refreshInstalled();
  }

  routeFor(src: AppLang, tgt: AppLang): LangPair[] {
    return translationRoute(src, tgt);
  }

  async missingFor(route: readonly LangPair[]): Promise<CatalogPack[]> {
    if (typeof caches === 'undefined') return packsForIds(route.map((pair) => pair.id));
    const missing = await missingPackIds(route.map((pair) => pair.id));
    return packsForIds(missing);
  }

  async engineMissing(): Promise<boolean> {
    if (typeof caches === 'undefined') return true;
    return !(await wasmIsCached());
  }

  /**
   * Downloads any missing packs for this route. `confirm` is called only when
   * a download is required. The speech model is released before the engine loads.
   */
  async ensurePacks(
    route: readonly LangPair[],
    noteId: string | null,
    confirm: (packs: CatalogPack[], engineBytes: number) => Promise<boolean>,
  ): Promise<void> {
    const missing = await this.missingFor(route);
    const engine = (await this.engineMissing()) ? 4960506 : 0;
    if (!missing.length && !engine) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new TranslationOffline();
    }
    const accepted = await confirm(missing, engine);
    if (!accepted) throw new TranslationCancelled();
    const epoch = this.epoch;
    this.progress.set({ phase: 'download', percent: 0, noteId });
    await downloadPacks(missing, engine > 0, (ratio) => {
      this.progress.set({
        phase: 'download',
        percent: Math.round(ratio * 100),
        noteId,
      });
    });
    if (epoch !== this.epoch) throw new TranslationCancelled();
    await this.refreshInstalled();
  }

  async translate(
    text: string,
    src: AppLang,
    tgt: AppLang,
    noteId: string | null,
  ): Promise<string> {
    const route = translationRoute(src, tgt);
    if (!route.length) return text;
    if (typeof Worker === 'undefined') {
      throw new Error('Web Workers are not supported in this browser');
    }
    const missing = await this.missingFor(route);
    if (missing.length || (await this.engineMissing())) throw new TranslationOffline();
    const key = route.map((pair) => pair.id).join('+');
    if (this.loadedKey && this.loadedKey !== key) this.release();
    this.speech.releaseModels();
    const epoch = this.epoch;
    const jobId = ++this.jobSeq;
    this.progress.set({ phase: 'load', percent: null, noteId });
    const worker = this.ensureWorker();
    const sendWasm = !this.wasmReady;
    const sendModels = this.loadedKey !== key;
    const wasm = sendWasm ? await readCached('wasm/3.0') : null;
    if (sendWasm && !wasm) throw new TranslationOffline();
    const models = sendModels ? await this.readModels(route) : undefined;
    if (epoch !== this.epoch) throw new TranslationCancelled();
    const glueUrl = new URL('assets/bergamot/bergamot-translator.js', document.baseURI).href;
    const transfer: ArrayBuffer[] = [];
    if (wasm) transfer.push(wasm);
    for (const model of models ?? []) {
      transfer.push(model.model, model.lex, model.vocab);
    }
    try {
    const result = await new Promise<string>((resolve, reject) => {
      const onMessage = (event: MessageEvent<WorkerResponse>) => {
        if (event.data?.jobId !== jobId) return;
        if (epoch !== this.epoch) {
          cleanup();
          reject(new TranslationCancelled());
          return;
        }
        if (event.data.status === 'progress') {
          this.progress.set({
            phase: event.data.phase === 'translate' ? 'translate' : 'load',
            percent: event.data.percent ?? null,
            noteId,
          });
          return;
        }
        cleanup();
        if (event.data.status === 'complete') resolve(event.data.text ?? '');
        else reject(new Error(event.data.message || 'Translation failed'));
      };
      const cleanup = () => worker.removeEventListener('message', onMessage);
      worker.addEventListener('message', onMessage);
      worker.postMessage(
        {
          type: 'translate',
          jobId,
          glueUrl,
          text,
          hops: route.map((pair) => ({ id: pair.id })),
          wasm: wasm ?? undefined,
          models,
        },
        transfer,
      );
    });
    if (epoch !== this.epoch) throw new TranslationCancelled();
    this.wasmReady = true;
    this.loadedKey = key;
    this.progress.set(null);
    return result;
    } catch (error) {
      if (epoch === this.epoch) this.progress.set(null);
      throw error;
    }
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./translation.worker', import.meta.url), {
        type: 'module',
      });
      this.wasmReady = false;
      this.loadedKey = '';
    }
    return this.worker;
  }

  private async readModels(route: readonly LangPair[]): Promise<
    {
      id: string;
      src: AppLang;
      tgt: AppLang;
      model: ArrayBuffer;
      lex: ArrayBuffer;
      vocab: ArrayBuffer;
    }[]
  > {
    const models = [];
    for (const pair of route) {
      const model = await readCached(`pack/${pair.id}/model`);
      const lex = await readCached(`pack/${pair.id}/lex`);
      const vocab = await readCached(`pack/${pair.id}/vocab`);
      if (!model || !lex || !vocab) throw new TranslationOffline();
      models.push({ id: pair.id, src: pair.src, tgt: pair.tgt, model, lex, vocab });
    }
    return models;
  }
}
