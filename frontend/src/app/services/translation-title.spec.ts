import {
  copiedSourceWord,
  extractMarkedTitle,
  frameTitle,
  polishTitle,
} from './translation-title';

describe('framed title translation', () => {
  it('marks the title and escapes markup', () => {
    expect(frameTitle('Monday meeting', 'en')).toBe('A note about <b>Monday meeting</b>.');
    expect(frameTitle('Call with Marco', 'en', true)).toBe(
      'This note is about a <b>Call with Marco</b>.',
    );
    expect(frameTitle('A <b> & C', 'fr')).toBe('Cette note parle de <b>A &lt;b&gt; &amp; C</b>.');
  });

  it('reads the title back out of the sentence, including words the tag did not cover', () => {
    expect(
      extractMarkedTitle('Questa nota riguarda una <b>riunione del lunedì</b>.'),
    ).toBe('riunione del lunedì');
    expect(
      extractMarkedTitle(
        'Cette note concerne <b>la liste des</b> achats.',
      ),
    ).toBe('la liste des achats');
    expect(
      extractMarkedTitle(
        'Questa nota parla <b>di</b> una <b>chiamata con Marco</b>.',
      ),
    ).toBe('chiamata con Marco');
    const withFonts =
      '<font x-bergamot-word-index="0">Una</font> nota sulla <b><font>riunione</font> del lunedì</b>.';
    expect(extractMarkedTitle(withFonts)).toBe('riunione del lunedì');
  });

  it('drops a leading article and keeps the source capital', () => {
    expect(polishTitle('Monday meeting', 'la riunione del lunedì')).toBe('Riunione del lunedì');
    expect(polishTitle('Shopping list', 'la lista della spesa')).toBe('Lista della spesa');
    expect(polishTitle('Ideas for the trip', 'le idee per il viaggio')).toBe(
      'Idee per il viaggio',
    );
    expect(polishTitle('idées cadeaux', 'idee regalo')).toBe('idee regalo');
  });

  it('notices a source word the model copied', () => {
    expect(copiedSourceWord('Call with Marco', 'Call con Marco')).toBeTrue();
    expect(copiedSourceWord('Shopping list', 'liste Shopping')).toBeTrue();
    expect(copiedSourceWord('Call with Marco', 'chiamata con Marco')).toBeFalse();
    expect(copiedSourceWord('Monday meeting', 'riunione del lunedì')).toBeFalse();
  });
});
