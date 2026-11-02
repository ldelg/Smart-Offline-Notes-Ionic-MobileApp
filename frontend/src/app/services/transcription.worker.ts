/* eslint-disable camelcase */
import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;

if (typeof self !== 'undefined' && env.backends?.onnx?.wasm) {
  const wasm = env.backends.onnx.wasm as {
    wasmPaths?: string;
    numThreads?: number;
  };
  // Files copied by angular.json from the Transformers.js / ONNX Runtime packages.
  // Overrides the library default of https://cdn.jsdelivr.net/...
  wasm.wasmPaths = new URL('assets/ort/', `${self.location.origin}/`).href;
  if (!self.crossOriginIsolated) {
    wasm.numThreads = 1;
  }
}

type OnnxDevice = 'wasm' | 'webgpu';

const resolveDevice = async (): Promise<OnnxDevice> => {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter?: () => Promise<unknown> } }).gpu;
    if (gpu?.requestAdapter) {
      const adapter = await gpu.requestAdapter();
      if (adapter) return 'webgpu';
    }
  } catch (error) {
    console.warn('WebGPU unavailable, using WASM', error);
  }
  return 'wasm';
};

class PipelineFactory {
  static task: string | null = null;
  static model: string | null = null;
  static device: OnnxDevice | null = null;
  static instance: any = null;

  static async getInstance(progress_callback: any = null) {
    if (this.instance === null) {
      if (!this.task || !this.model) {
        throw new Error('Pipeline task and model must be set');
      }
      let device = await resolveDevice();
      const create = (selected: OnnxDevice) =>
        pipeline(this.task as any, this.model as string, {
          dtype: 'q8',
          device: selected,
          progress_callback,
          revision: this.model?.includes('/whisper-medium') ? 'no_attentions' : 'main',
        });
      try {
        this.instance = await create(device);
      } catch (error) {
        if (device !== 'webgpu') throw error;
        console.warn('WebGPU pipeline failed, falling back to WASM', error);
        device = 'wasm';
        this.instance = await create(device);
      }
      this.device = device;
      console.log(`Transcription device: ${device}`);
    }
    return this.instance;
  }
}

class AutomaticSpeechRecognitionPipelineFactory extends PipelineFactory {
  static override task: string = 'automatic-speech-recognition';
  static override model: string | null = null;
}

const errorText = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Transcription failed';
};

const postError = (jobId: number, error: unknown): void => {
  self.postMessage({
    status: 'error',
    task: 'automatic-speech-recognition',
    jobId,
    data: { message: errorText(error) },
  });
};

const transcribe = async (
  audio: Float32Array,
  model: string,
  _multilingual: boolean,
  subtask: string | null,
  language: string | null,
  isOnline: boolean = true,
  lastUsedModel: string | null = null,
  jobId: number,
) => {
  const modelName = model;
  const isMoonshine = modelName.includes('moonshine');
  const p = AutomaticSpeechRecognitionPipelineFactory;
  const modelChanged = p.model !== null && p.model !== modelName;

  if (modelChanged && p.instance !== null) {
    const oldInstance = await p.getInstance();
    await oldInstance.dispose?.();
    p.instance = null;
    p.device = null;
  }

  const switchingToDifferentModel =
    lastUsedModel !== null && lastUsedModel !== modelName;
  if (switchingToDifferentModel && 'caches' in self && isOnline) {
    try {
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        await caches.delete(cacheName);
      }
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  }

  p.model = modelName;

  const transcriber = await p.getInstance((data: any) => {
    self.postMessage({ ...data, jobId });
  });

  const options: Record<string, unknown> = {};
  if (!isMoonshine) {
    const isDistilWhisper = modelName.startsWith('distil-whisper/');
    options['return_timestamps'] = true;
    options['chunk_length_s'] = isDistilWhisper ? 20 : 30;
    options['stride_length_s'] = isDistilWhisper ? 3 : 5;
    if (language) options['language'] = language;
    if (subtask) options['task'] = subtask;
  }

  const output = await transcriber(audio, options).catch((error: unknown) => {
    postError(jobId, error);
    return null;
  });

  return output;
};

let jobChain: Promise<void> = Promise.resolve();

self.addEventListener('message', (event: MessageEvent) => {
  const message = event.data;
  if (!message || message.type !== 'transcribe') return;

  const jobId = Number(message.jobId);
  jobChain = jobChain
    .then(async () => {
      try {
        const {
          audio,
          model,
          multilingual,
          subtask,
          language,
          isOnline,
          lastUsedModel,
        } = message;
        const transcript = await transcribe(
          audio,
          model,
          multilingual,
          subtask,
          language,
          isOnline,
          lastUsedModel,
          jobId,
        );

        if (transcript === null) return;

        self.postMessage({
          status: 'complete',
          task: 'automatic-speech-recognition',
          jobId,
          data: transcript,
        });
      } catch (error: unknown) {
        postError(jobId, error);
      }
    })
    .catch((error: unknown) => {
      postError(jobId, error);
    });
});
