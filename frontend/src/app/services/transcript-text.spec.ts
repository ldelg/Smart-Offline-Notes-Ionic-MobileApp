import {
  assembleTranscript,
  capitalizeSentenceStarts,
  joinTranscriptChunks,
  transcriptTitle,
} from './transcript-text';

describe('transcript text', () => {
  const chunks = [
    { text: ' hello world.', timestamp: [0, 2] as [number, number] },
    { text: ' this is the next sentence.', timestamp: [2.2, 4] as [number, number] },
    { text: ' after a pause it continues.', timestamp: [6, 8] as [number, number] },
  ];

  it('keeps short pauses in the same paragraph and breaks on a long sentence pause', () => {
    expect(joinTranscriptChunks(chunks)).toBe(
      'Hello world. This is the next sentence.\n\nAfter a pause it continues.',
    );
  });

  it('does not break a long pause in the middle of a sentence', () => {
    expect(
      joinTranscriptChunks([
        { text: ' I walked to the', timestamp: [0, 1.2] },
        { text: ' store before lunch.', timestamp: [3.4, 5] },
      ]),
    ).toBe('I walked to the store before lunch.');
  });

  it('joins chunks that have no timestamps with a space', () => {
    expect(
      joinTranscriptChunks([
        { text: 'first sentence.' },
        { text: 'second sentence.' },
      ]),
    ).toBe('First sentence. Second sentence.');
  });

  it('capitalizes sentence starts, including after a paragraph, and leaves iPhone alone', () => {
    expect(capitalizeSentenceStarts('hello world. this is next.')).toBe(
      'Hello world. This is next.',
    );
    expect(capitalizeSentenceStarts('è tardi. oggi piove.')).toBe(
      'È tardi. Oggi piove.',
    );
    expect(capitalizeSentenceStarts('iPhone is here. iOS too.')).toBe(
      'iPhone is here. iOS too.',
    );
    expect(capitalizeSentenceStarts('hello.\n\nworld')).toBe('Hello.\n\nWorld');
    expect(capitalizeSentenceStarts('version 3.14 is fine')).toBe(
      'Version 3.14 is fine',
    );
  });

  it('does not invent fillers or ellipses for pauses', () => {
    const text = joinTranscriptChunks([
      { text: 'we stopped.', timestamp: [0, 1] },
      { text: 'then we left.', timestamp: [4, 5] },
    ]);
    expect(text).toBe('We stopped.\n\nThen we left.');
    expect(text).not.toContain('...');
    expect(text.toLowerCase()).not.toContain('uhm');
  });

  it('uses chunks when result.text is truncated, and result.text when it has more words', () => {
    expect(
      assembleTranscript('Hello', [
        { text: ' Hello world.', timestamp: [0, 1] },
        { text: ' More words.', timestamp: [3, 4] },
      ]),
    ).toBe('Hello world.\n\nMore words.');

    expect(
      assembleTranscript('Hello world. This extra clause survived.', [
        { text: 'Hello world.', timestamp: [0, 1] },
      ]),
    ).toBe('Hello world. This extra clause survived.');
  });

  it('falls back to result.text when chunks are missing', () => {
    expect(assembleTranscript('  hello there. ', undefined)).toBe('Hello there.');
    expect(assembleTranscript('', [{ text: '   ' }])).toBe('');
  });

  it('flattens paragraph breaks out of the note title', () => {
    expect(transcriptTitle('Hello world.\n\nThis is a longer second paragraph.')).toBe(
      'Hello world. This is a longer second paragraph.',
    );
    expect(transcriptTitle('x'.repeat(80)).length).toBe(60);
  });
});
