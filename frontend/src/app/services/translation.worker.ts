import { AppLang, isAppLang } from '../models/translation.model';
import { joinTranslatedPieces, segmentForTranslation } from './translation-chunk';
import { protectNumbers, restoreNumbers } from './translation-numbers';

interface ModelPayload {
  id: string;
  src: string;
  tgt: string;
  model: ArrayBuffer;
  lex: ArrayBuffer;
  vocab: ArrayBuffer;
}

interface TranslateMessage {
  type: 'translate';
  jobId: number;
  glueUrl: string;
  text: string;
  sourceLang?: AppLang;
  targetLang?: AppLang;
  html?: boolean;
  hops: { id: string }[];
  wasm?: ArrayBuffer;
  models?: ModelPayload[];
}

const MODEL_CONFIG = `
            beam-size: 1
            normalize: 1.0
            word-penalty: 0
            max-length-break: 128
            mini-batch-words: 1024
            workspace: 128
            max-length-factor: 2.0
            skip-cost: true
            cpu-threads: 0
            quiet: true
            quiet-translation: true
            gemm-precision: int8shiftAlphaAll
            alignment: soft
            `;

let loadBergamot: ((module: any) => any) | null = null;
let bergamot: any = null;
let service: any = null;
const loaded = new Map<string, any>();

const post = (payload: Record<string, unknown>): void => {
  self.postMessage(payload);
};

async function ensureRuntime(wasm: ArrayBuffer, glueUrl: string): Promise<void> {
  if (bergamot) return;
  if (!loadBergamot) {
    const code = await (await fetch(glueUrl)).text();
    loadBergamot = new Function(`${code}\nreturn loadBergamot;`)() as (module: any) => any;
  }
  const wasmBinary = new Uint8Array(wasm);
  bergamot = await new Promise((resolve, reject) => {
    const instance = loadBergamot!({
      INITIAL_MEMORY: 41943040,
      print: () => undefined,
      printErr: (message: unknown) => console.warn(message),
      onAbort: (reason: unknown) => reject(new Error(String(reason ?? 'Bergamot aborted'))),
      wasmBinary,
      onRuntimeInitialized: async () => {
        await Promise.resolve();
        resolve(instance);
      },
    });
  });
  service = new bergamot.BlockingService({ cacheSize: 0 });
}

function aligned(bytes: Uint8Array, alignment: number): any {
  const memory = new bergamot.AlignedMemory(bytes.byteLength, alignment);
  memory.getByteArrayView().set(bytes);
  return memory;
}

function loadModel(payload: ModelPayload): void {
  const modelMem = aligned(new Uint8Array(payload.model), 256);
  const lexMem = aligned(new Uint8Array(payload.lex), 64);
  const vocabMem = aligned(new Uint8Array(payload.vocab), 64);
  const vocabs = new bergamot.AlignedMemoryList();
  vocabs.push_back(vocabMem);
  const model = new bergamot.TranslationModel(
    payload.src,
    payload.tgt,
    MODEL_CONFIG,
    modelMem,
    lexMem,
    vocabs,
    null,
  );
  loaded.set(payload.id, model);
}

function translateBlocking(text: string, hops: { id: string }[], html = false): string {
  const messages = new bergamot.VectorString();
  const options = new bergamot.VectorResponseOptions();
  messages.push_back(text);
  options.push_back({ qualityScores: false, alignment: false, html });
  const first = loaded.get(hops[0].id);
  const response =
    hops.length === 1
      ? service.translate(first, messages, options)
      : service.translateViaPivoting(first, loaded.get(hops[1].id), messages, options);
  const translated = response.get(0).getTranslatedText() as string;
  response.delete();
  messages.delete();
  options.delete();
  return translated;
}

async function translateNote(
  text: string,
  hops: { id: string }[],
  jobId: number,
  source: AppLang | null,
  target: AppLang | null,
  html = false,
): Promise<string> {
  const protectedText = protectNumbers(text);
  if (html) {
    const translated = translateBlocking(protectedText.text, hops, true);
    post({ status: 'progress', jobId, phase: 'translate', percent: 100 });
    return restoreNumbers(translated, protectedText.numbers, source, target);
  }
  const pieces = segmentForTranslation(protectedText.text);
  if (!pieces.length) return '';
  const translated: string[] = [];
  for (let index = 0; index < pieces.length; index++) {
    translated.push(translateBlocking(pieces[index].text, hops, false));
    post({
      status: 'progress',
      jobId,
      phase: 'translate',
      percent: Math.round(((index + 1) / pieces.length) * 100),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return restoreNumbers(
    joinTranslatedPieces(translated, pieces),
    protectedText.numbers,
    source,
    target,
  );
}

self.addEventListener('message', (event: MessageEvent<TranslateMessage>) => {
  const message = event.data;
  if (!message || message.type !== 'translate') return;
  const jobId = message.jobId;
  void (async () => {
    try {
      if (message.wasm) {
        post({ status: 'progress', jobId, phase: 'load', percent: null });
        await ensureRuntime(message.wasm, message.glueUrl);
      }
      if (!bergamot || !service) throw new Error('Translation engine is not loaded');
      if (message.models?.length) {
        for (const model of message.models) loadModel(model);
      }
      for (const hop of message.hops) {
        if (!loaded.has(hop.id)) throw new Error(`Language pack ${hop.id} is not loaded`);
      }
      const source = isAppLang(message.sourceLang) ? message.sourceLang : null;
      const target = isAppLang(message.targetLang) ? message.targetLang : null;
      const text = await translateNote(
        message.text,
        message.hops,
        jobId,
        source,
        target,
        message.html === true,
      );
      post({ status: 'complete', jobId, text });
    } catch (error) {
      post({
        status: 'error',
        jobId,
        message: error instanceof Error ? error.message : 'Translation failed',
      });
    }
  })();
});
