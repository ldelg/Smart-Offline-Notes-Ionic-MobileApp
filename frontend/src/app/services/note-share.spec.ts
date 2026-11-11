import { shareWasCancelled } from './note-share';

describe('note share', () => {
  it('treats a dismissed share sheet as a cancel and keeps other failures', () => {
    expect(shareWasCancelled(new Error('Share canceled'))).toBeTrue();
    expect(shareWasCancelled({ name: 'AbortError', message: 'The user aborted a request.' })).toBeTrue();
    expect(shareWasCancelled(new Error('Share API not available in this browser'))).toBeFalse();
  });
});
