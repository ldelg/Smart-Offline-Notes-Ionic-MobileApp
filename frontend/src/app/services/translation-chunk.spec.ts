import {
  chunk,
  joinTranslatedPieces,
  segmentForTranslation,
} from './translation-chunk';

describe('translation chunking', () => {
  it('keeps a short sentence intact', () => {
    expect(chunk('Hello there.')).toEqual(['Hello there.']);
  });

  it('splits a long unpunctuated run at a conjunction, then at 40 words', () => {
    const words = Array.from({ length: 45 }, (_, index) =>
      index === 16 ? 'and' : `w${index}`,
    );
    const parts = chunk(words.join(' '));
    expect(parts[0].split(/\s+/).length).toBe(16);
    expect(parts[1].startsWith('and ')).toBeTrue();
    expect(parts.join(' ')).toBe(words.join(' '));

    const plain = Array.from({ length: 50 }, (_, index) => `w${index}`).join(' ');
    const hard = chunk(plain);
    expect(hard[0].split(/\s+/).length).toBe(40);
    expect(hard[1].split(/\s+/).length).toBe(10);
  });

  it('keeps paragraph breaks and joins translated pieces the same way', () => {
    const pieces = segmentForTranslation('First line.\nSecond line.\n\nNext paragraph.');
    expect(pieces.map((piece) => piece.breakAfter)).toEqual([
      'line',
      'paragraph',
      'end',
    ]);
    const joined = joinTranslatedPieces(
      ['Primera línea.', 'Segunda línea.', 'Siguiente párrafo.'],
      pieces,
    );
    expect(joined).toBe('Primera línea.\nSegunda línea.\n\nSiguiente párrafo.');
  });
});
