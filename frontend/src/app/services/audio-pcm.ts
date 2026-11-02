export const TARGET_SAMPLE_RATE = 16000;

/** Below this, the clip is treated as silence and the model is not run. */
export const SILENT_RMS = 0.001;

/** Logged as a warning. Quiet speech can still be transcribed. */
export const NEAR_SILENT_RMS = 0.005;

export function mixToMono(audioBuffer: AudioBuffer): Float32Array {
  if (audioBuffer.numberOfChannels <= 1) {
    return new Float32Array(audioBuffer.getChannelData(0));
  }
  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.getChannelData(1);
  const mono = new Float32Array(audioBuffer.length);
  const scale = Math.sqrt(2);
  for (let i = 0; i < audioBuffer.length; i++) {
    mono[i] = (scale * (left[i] + right[i])) / 2;
  }
  return mono;
}

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  const step = samples.length > 200000 ? Math.floor(samples.length / 200000) : 1;
  let count = 0;
  for (let i = 0; i < samples.length; i += step) {
    const value = samples[i];
    sum += value * value;
    count++;
  }
  return Math.sqrt(sum / count);
}

/** Linear resample. Returns a copy even when the rate already matches. */
export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (input.length === 0) return new Float32Array(0);
  if (fromRate === toRate) return new Float32Array(input);
  const outLength = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const out = new Float32Array(outLength);
  const scale = (input.length - 1) / Math.max(1, outLength - 1);
  for (let i = 0; i < outLength; i++) {
    const position = i * scale;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = position - left;
    out[i] = input[left] * (1 - fraction) + input[right] * fraction;
  }
  return out;
}

export function formatAudioDebug(info: {
  durationSec: number;
  sampleRate: number;
  rms: number;
  resampledTo?: number;
}): string {
  const base = `${info.durationSec.toFixed(1)} s, ${info.sampleRate} Hz, RMS ${info.rms.toFixed(4)}`;
  if (info.resampledTo && info.resampledTo !== info.sampleRate) {
    return `${base} (resampled to ${info.resampledTo} Hz)`;
  }
  return base;
}
