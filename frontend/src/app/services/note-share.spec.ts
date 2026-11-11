import { composeShareText, shareWasCancelled } from './note-share';

describe('note share', () => {
  it('treats a dismissed share sheet as a cancel and keeps other failures', () => {
    expect(shareWasCancelled(new Error('Share canceled'))).toBeTrue();
    expect(shareWasCancelled({ name: 'AbortError', message: 'The user aborted a request.' })).toBeTrue();
    expect(shareWasCancelled(new Error('Share API not available in this browser'))).toBeFalse();
  });

  it('shares the original alone as plain text, and labels a chosen subset', () => {
    expect(
      composeShareText([{ heading: 'Original', text: 'Ciao', kind: 'original' }]),
    ).toBe('Ciao');
    expect(
      composeShareText([
        { heading: 'Original', text: 'Ciao', kind: 'original' },
        { heading: 'EN', text: 'Hello', kind: 'translation' },
        { heading: 'DE', text: '  ', kind: 'translation' },
      ]),
    ).toBe('Original\nCiao\n\nEN\nHello');
    expect(
      composeShareText([{ heading: 'EN', text: 'Hello', kind: 'translation' }]),
    ).toBe('EN\nHello');
  });
});
