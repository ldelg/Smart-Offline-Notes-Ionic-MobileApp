/* eslint-disable camelcase */
import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;

if (typeof self !== 'undefined' && env.backends?.onnx) {
  (env.backends.onnx as any)['executionProviders'] = ['wasm'];
}

class PipelineFactory {
  static task: string | null = null;
  static model: string | null = null;
  static instance: any = null;

  static async getInstance(progress_callback: any = null) {
    if (this.instance === null) {
      if (!this.task || !this.model) {
        throw new Error('Pipeline task and model must be set');
      }
      this.instance = pipeline(this.task as any, this.model, {
        quantized: true,
        progress_callback,
        revision: this.model.includes('/whisper-medium')
          ? 'no_attentions'
          : 'main',
      });
    }
    return this.instance;
  }
}

class AutomaticSpeechRecognitionPipelineFactory extends PipelineFactory {
  static override task: string = 'automatic-speech-recognition';
  static override model: string | null = null;
}

const transcribe = async (
  audio: Float32Array,
  model: string,
  multilingual: boolean,
  subtask: string | null,
  language: string | null,
  isOnline: boolean = true,
  lastUsedModel: string | null = null
) => {
  const modelName = model;

  const p = AutomaticSpeechRecognitionPipelineFactory;
  const modelChanged = p.model !== null && p.model !== modelName;

  if (modelChanged) {
    if (p.instance !== null) {
      const oldInstance = await p.getInstance();
      await oldInstance.dispose();
      p.instance = null;
    }
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
    self.postMessage(data);
  });

  const time_precision =
    transcriber.processor.feature_extractor.config.chunk_length /
    transcriber.model.config.max_source_positions;

  const chunks_to_process: Array<{
    tokens: number[];
    finalised: boolean;
  }> = [
    {
      tokens: [],
      finalised: false,
    },
  ];

  function chunk_callback(chunk: any) {
    const last = chunks_to_process[chunks_to_process.length - 1];
    Object.assign(last, chunk);
    last.finalised = true;

    if (!chunk.is_last) {
      chunks_to_process.push({
        tokens: [],
        finalised: false,
      });
    }
  }

  function callback_function(item: any) {
    const last = chunks_to_process[chunks_to_process.length - 1];
    last.tokens = [...item[0].output_token_ids];

    const data = transcriber.tokenizer._decode_asr(chunks_to_process, {
      time_precision: time_precision,
      return_timestamps: true,
      force_full_sequences: false,
    });

    self.postMessage({
      status: 'update',
      task: 'automatic-speech-recognition',
      data: data,
    });
  }

  const isDistilWhisper = modelName.startsWith('distil-whisper/');
  const output = await transcriber(audio, {
    top_k: 0,
    do_sample: false,
    chunk_length_s: isDistilWhisper ? 20 : 30,
    stride_length_s: isDistilWhisper ? 3 : 5,
    language: language || undefined,
    task: subtask || undefined,
    return_timestamps: true,
    force_full_sequences: false,
    callback_function: callback_function,
    chunk_callback: chunk_callback,
  }).catch((error: any) => {
    self.postMessage({
      status: 'error',
      task: 'automatic-speech-recognition',
      data: error,
    });
    return null;
  });

  return output;
};

self.addEventListener('message', async (event) => {
  const message = event.data;

  if (message.type === 'transcribe') {
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
        lastUsedModel
      );

      if (transcript === null) return;

      self.postMessage({
        status: 'complete',
        task: 'automatic-speech-recognition',
        data: transcript,
      });
    } catch (error: any) {
      self.postMessage({
        status: 'error',
        task: 'automatic-speech-recognition',
        data: error,
      });
    }
  }
});
