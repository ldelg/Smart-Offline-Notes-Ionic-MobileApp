import { ProgressTracker } from './progress-tracker';

describe('ProgressTracker', () => {
  it('keeps one overall percentage when another file starts', () => {
    const tracker = new ProgressTracker();
    expect(
      tracker.push(
        { status: 'progress', file: 'a.onnx', loaded: 50, total: 100 },
        0,
      ),
    ).toEqual({ phase: 'download', percent: 50 });

    expect(
      tracker.push(
        { status: 'progress', file: 'b.onnx', loaded: 0, total: 100 },
        100,
      ),
    ).toBeNull();

    expect(
      tracker.push(
        { status: 'progress', file: 'b.onnx', loaded: 100, total: 100 },
        200,
      ),
    ).toEqual({ phase: 'download', percent: 75 });
  });

  it('never moves the percentage backwards', () => {
    const tracker = new ProgressTracker();
    tracker.push({ status: 'progress', file: 'a.onnx', progress: 80 }, 0);
    expect(
      tracker.push({ status: 'progress', file: 'a.onnx', progress: 10 }, 100),
    ).toBeNull();
    expect(
      tracker.push({ status: 'progress', file: 'a.onnx', progress: 90 }, 200),
    ).toEqual({ phase: 'download', percent: 90 });
  });

  it('throttles updates to about ten per second and keeps the latest value', () => {
    const tracker = new ProgressTracker();
    tracker.push({ status: 'progress', file: 'a.onnx', progress: 10 }, 0);
    const throttled = tracker.push(
      { status: 'progress', file: 'a.onnx', progress: 40 },
      40,
    );
    expect(throttled).toBeNull();
    expect(tracker.hasPending).toBeTrue();

    const flushed = tracker.flush(100);
    expect(flushed).toEqual({ phase: 'download', percent: 40 });
  });

  it('uses an indeterminate bar while the model loads or transcribes', () => {
    const tracker = new ProgressTracker();
    expect(tracker.push({ status: 'initiate' }, 0)).toEqual({
      phase: 'load',
      percent: null,
    });
    expect(tracker.push({ status: 'ready' }, 100)).toEqual({
      phase: 'transcribe',
      percent: null,
    });
    expect(
      tracker.push(
        { status: 'progress', file: 'late.onnx', progress: 5 },
        200,
      ),
    ).toBeNull();
  });
});
