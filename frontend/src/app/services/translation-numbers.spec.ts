import { protectNumbers, restoreNumbers } from './translation-numbers';

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
});
