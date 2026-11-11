import { protectNumbers, restoreNumbers, localizeNumbers } from './translation-numbers';

describe('number protection', () => {
  it('keeps 1,500 and 1.500 as separate originals', () => {
    const source = 'The invoice is 1,500 euros and the code is 1.500.';
    const protectedText = protectNumbers(source);
    expect(protectedText.numbers).toEqual(['1,500', '1.500']);
    expect(protectedText.text).toContain('__N0__');
    expect(protectedText.text).toContain('__N1__');
    expect(protectedText.text).not.toContain('1,500');
    expect(protectedText.text).not.toContain('1.500');
    expect(restoreNumbers(protectedText.text, protectedText.numbers)).toBe(source);
  });

  it('protects grouped and decimal forms, including 12,345.67', () => {
    const source = 'Budget 12,345.67 or 1.500.000 and 3,14.';
    const protectedText = protectNumbers(source);
    expect(protectedText.numbers).toEqual(['12,345.67', '1.500.000', '3,14']);
    expect(restoreNumbers(protectedText.text, protectedText.numbers)).toBe(source);
  });

  it('restores a placeholder the model spaced out', () => {
    expect(restoreNumbers('Total __ N0 __ euros', ['1,500'])).toBe('Total 1,500 euros');
  });

  it('restores a placeholder when the model adds an underscore', () => {
    expect(restoreNumbers('oder __N0___.', ['12,345.67'], 'en', 'de')).toBe(
      'oder 12.345,67.',
    );
  });
});

describe('number localisation', () => {
  const fr = (value: number, decimals: number) =>
    new Intl.NumberFormat('fr', {
      useGrouping: true,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);

  it('rewrites English thousands and decimals for Italian', () => {
    expect(localizeNumbers('Budget 1,500 and 12,345.67.', 'en', 'it')).toBe(
      'Budget 1.500 and 12.345,67.',
    );
  });

  it('rewrites Italian and German quantities for English', () => {
    expect(localizeNumbers('Totale 1.500 e 12.345,67.', 'it', 'en')).toBe(
      'Totale 1,500 e 12,345.67.',
    );
    expect(localizeNumbers('Summe 1.500 oder 3,14.', 'de', 'en')).toBe(
      'Summe 1,500 oder 3.14.',
    );
  });

  it('uses the French grouping character from Intl', () => {
    expect(localizeNumbers('Total 1,500 and 12,345.67.', 'en', 'fr')).toBe(
      `Total ${fr(1500, 0)} and ${fr(12345.67, 2)}.`,
    );
  });

  it('leaves dates, times, and versions as written', () => {
    const source = 'On 11/11/2026 or 11.11.2026 at 10:30, version 1.4.1, ip 192.168.0.1.';
    expect(localizeNumbers(source, 'en', 'it')).toBe(source);
    expect(localizeNumbers(source, 'de', 'en')).toBe(source);
  });

  it('leaves a bare 1,500 or 1.500 untouched when the source language is unknown', () => {
    const source = 'Maybe 1,500 or 1.500, but 12,345.67 and 3,14 are clear.';
    expect(localizeNumbers(source, null, 'en')).toBe(
      'Maybe 1,500 or 1.500, but 12,345.67 and 3.14 are clear.',
    );
  });

  it('leaves a range whose sides use different separators', () => {
    const mixed = 'See 1,500-2.000 and call +39 06 1234567.';
    expect(localizeNumbers(mixed, 'en', 'it')).toBe(mixed);
    expect(localizeNumbers('From 1,500-2,000 euros.', 'en', 'it')).toBe(
      'From 1.500-2.000 euros.',
    );
  });
});
