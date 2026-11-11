import { Injectable, inject, signal } from '@angular/core';
import { AppLang } from '../models/translation.model';
import { TranscriptionService } from './transcription.service';
import { LangPair, translationRoute } from './translation-route';
import {
  copiedSourceWord,
  extractMarkedTitle,
  frameTitle,
  polishTitle,
} from './translation-title';
import { packIdsForLanguage } from './translation-languages';
import { CatalogPack } from './translation-catalog';
import {
  InstalledPack,
  deleteInstalledPack,
  downloadErrorKey,
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
  loadedBytes: number | null;
  totalBytes: number | null;
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
    await this.deletePackIds([id]);
  }

  /** Removes every downloaded direction for one non-English language. */
  async deleteLanguage(lang: AppLang): Promise<void> {
    await this.deletePackIds(packIdsForLanguage(lang));
  }

  private async deletePackIds(ids: readonly string[]): Promise<void> {
    this.release();
    if (typeof caches === 'undefined') return;
    for (const id of ids) await deleteInstalledPack(id);
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
   * Downloads any missing packs for this route. Turning auto-translate on, or
   * picking a language that shows a download size, is the consent. There is
   * no second prompt. `displayBytes` is the pack total shown on the progress line.
   */
  async ensurePacks(
    route: readonly LangPair[],
    noteId: string | null,
    displayBytes = 0,
  ): Promise<void> {
    const missing = await this.missingFor(route);
    const engine = (await this.engineMissing()) ? 4960506 : 0;
    if (!missing.length && !engine) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new TranslationOffline();
    }
    const shown = displayBytes > 0 ? displayBytes : missing.reduce((sum, pack) => sum + pack.bytes, 0);
    const epoch = this.epoch;
    this.progress.set({
      phase: 'download',
      percent: null,
      noteId,
      loadedBytes: 0,
      totalBytes: shown || null,
    });
    try {
      await downloadPacks(missing, engine > 0, (ratio) => {
        if (epoch !== this.epoch) return;
        const percent = ratio === null ? null : Math.round(Math.max(0, Math.min(1, ratio)) * 100);
        this.progress.set({
          phase: 'download',
          percent,
          noteId,
          loadedBytes: percent === null || !shown ? null : Math.round((percent / 100) * shown),
          totalBytes: shown || null,
        });
      });
    } catch (error) {
      if (epoch === this.epoch) this.progress.set(null);
      if (error instanceof TranslationOffline || error instanceof TranslationCancelled) throw error;
      const keyed = new Error(downloadErrorKey(error));
      keyed.name = 'DownloadFailed';
      throw keyed;
    }
    if (epoch !== this.epoch) throw new TranslationCancelled();
    await this.refreshInstalled();
  }

  /**
   * Translates a short title inside a sentence so word order can change,
   * then reads the marked span back out. The note body is never part of
   * this call. A copied source word is tried once more with an article,
   * and a lost mark falls back to translating the title on its own.
   */
  async translateTitle(
    title: string,
    src: AppLang,
    tgt: AppLang,
    noteId: string | null,
    quiet = false,
  ): Promise<string> {
    const primary = polishTitle(
      title,
      extractMarkedTitle(await this.translate(frameTitle(title, src), src, tgt, noteId, quiet, true)),
    );
    if (primary && !copiedSourceWord(title, primary)) return primary;
    if (src === 'en') {
      const retry = polishTitle(
        title,
        extractMarkedTitle(
          await this.translate(frameTitle(title, src, true), src, tgt, noteId, quiet, true),
        ),
      );
      if (retry && !copiedSourceWord(title, retry)) return retry;
    }
    const plain = (await this.translate(title, src, tgt, noteId, quiet)).trim();
    return plain || title;
  }

  async translate(
    text: string,
    src: AppLang,
    tgt: AppLang,
    noteId: string | null,
    quiet = false,
    html = false,
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
    if (!quiet) {
      this.progress.set({
        phase: 'load',
        percent: null,
        noteId,
        loadedBytes: null,
        totalBytes: null,
      });
    }
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
          if (!quiet) {
            this.progress.set({
              phase: event.data.phase === 'translate' ? 'translate' : 'load',
              percent: event.data.percent ?? null,
              noteId,
              loadedBytes: null,
              totalBytes: null,
            });
          }
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
          sourceLang: src,
          targetLang: tgt,
          html,
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
    if (!quiet) this.progress.set(null);
    return result;
    } catch (error) {
      if (!quiet && epoch === this.epoch) this.progress.set(null);
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
