export const TARGET_SAMPLE_RATE = 16000;

/** Digital silence. Kept so callers can tell a dead buffer from quiet noise. */
export const SILENT_RMS = 0.001;

/** At or below this, the clip is not sent to the model. */
export const NEAR_SILENT_RMS = 0.005;

/** 20 ms windows used when trimming silence from a recording. */
const TRIM_WINDOW_SEC = 0.02;

/** A window is speech if its RMS reaches this. Above the near-silence gate. */
const TRIM_SPEECH_RMS = 0.01;

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

/**
 * Drops quiet lead-in and tail from a mic recording. Phone microphones often
 * deliver silence for a few hundred milliseconds after they open, and Whisper
 * invents a stock phrase when that silence is most of the clip.
 */
export function trimSilence(
  samples: Float32Array,
  sampleRate: number,
): Float32Array {
  if (samples.length === 0 || sampleRate <= 0) return samples;
  const window = Math.max(1, Math.round(sampleRate * TRIM_WINDOW_SEC));
  const isSpeech = (start: number): boolean => {
    const end = Math.min(samples.length, start + window);
    if (end <= start) return false;
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / (end - start)) >= TRIM_SPEECH_RMS;
  };
  let start = 0;
  while (start + window <= samples.length && !isSpeech(start)) start += window;
  let end = samples.length;
  while (end - window >= start && !isSpeech(end - window)) end -= window;
  if (end <= start) return new Float32Array(0);
  const pad = Math.round(sampleRate * 0.08);
  const from = Math.max(0, start - pad);
  const to = Math.min(samples.length, end + pad);
  return samples.subarray(from, to);
}

const SILENCE_HALLUCINATIONS = new Set([
  'thank you for watching',
  'thanks for watching',
  'thank you for watching the video',
  'thanks for watching the video',
  'please subscribe',
  'please like and subscribe',
  'like and subscribe',
  'thanks for listening',
  'thank you for listening',
  'see you next time',
  'see you in the next video',
  'subtitles by the amara org community',
  'subtitles by the amara.org community',
  'transcribed by https otter ai',
  'music',
  'applause',
  'silence',
  'blank audio',
]);

/** True when the whole transcript is a phrase Whisper emits on silence. */
export function isSilenceHallucination(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/https?:\/\//g, ' ')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');
  if (!normalized) return false;
  return SILENCE_HALLUCINATIONS.has(normalized);
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
