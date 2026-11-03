import {
  formatAudioDebug,
  isSilenceHallucination,
  NEAR_SILENT_RMS,
  resampleLinear,
  rms,
  SILENT_RMS,
  trimSilence,
} from './audio-pcm';

describe('audio-pcm', () => {
  it('measures digital silence as zero', () => {
    expect(rms(new Float32Array(1600))).toBe(0);
    expect(0).toBeLessThan(SILENT_RMS);
    expect(SILENT_RMS).toBeLessThan(NEAR_SILENT_RMS);
  });

  it('resamples 48 kHz audio to 16 kHz', () => {
    const input = new Float32Array(48000);
    input[0] = 1;
    input[47999] = -1;
    const output = resampleLinear(input, 48000, 16000);
    expect(output.length).toBe(16000);
    expect(output).not.toBe(input);
    expect(output[0]).toBeCloseTo(1, 5);
  });

  it('copies samples when the rate already matches', () => {
    const input = new Float32Array([0.25, -0.5]);
    const output = resampleLinear(input, 16000, 16000);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });

  it('formats the diagnostic line', () => {
    expect(
      formatAudioDebug({ durationSec: 3.09, sampleRate: 16000, rms: 0.01234 }),
    ).toBe('3.1 s, 16000 Hz, RMS 0.0123');
    expect(
      formatAudioDebug({
        durationSec: 3,
        sampleRate: 48000,
        rms: 0.1,
        resampledTo: 16000,
      }),
    ).toContain('resampled to 16000 Hz');
  });

  it('trims a quiet lead-in and keeps the speech', () => {
    const samples = new Float32Array(16000);
    for (let i = 8000; i < 12000; i++) samples[i] = 0.2;
    const trimmed = trimSilence(samples, 16000);
    expect(trimmed.length).toBeLessThan(samples.length);
    expect(trimmed.length).toBeGreaterThan(2000);
    expect(rms(trimmed)).toBeGreaterThan(NEAR_SILENT_RMS);
  });

  it('treats a fully quiet clip as empty', () => {
    expect(trimSilence(new Float32Array(16000), 16000).length).toBe(0);
  });

  it('recognises Whisper silence hallucinations and keeps real speech', () => {
    expect(isSilenceHallucination('Thank you for watching!')).toBeTrue();
    expect(isSilenceHallucination('Thanks for watching.')).toBeTrue();
    expect(isSilenceHallucination('[Music]')).toBeTrue();
    expect(
      isSilenceHallucination(
        'And so my fellow Americans ask not what your country can do for you',
      ),
    ).toBeFalse();
    expect(isSilenceHallucination('Thank you for watching the match')).toBeFalse();
  });
});
