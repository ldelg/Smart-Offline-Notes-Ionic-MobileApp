import {
  formatAudioDebug,
  NEAR_SILENT_RMS,
  resampleLinear,
  rms,
  SILENT_RMS,
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
});
