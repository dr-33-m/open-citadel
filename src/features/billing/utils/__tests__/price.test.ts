import { describe, expect, it } from 'vitest';

import { formatStorePrice } from '../price';

describe('formatStorePrice', () => {
  it('drops the US qualifier and keeps the dollar sign', () => {
    expect(formatStorePrice('US$20.00')).toBe('$20');
    expect(formatStorePrice('US$6.00')).toBe('$6');
  });

  it('tolerates a space between the qualifier and the mark', () => {
    expect(formatStorePrice('US $20.00')).toBe('$20');
  });

  it('strips zero cents without touching a real fraction', () => {
    expect(formatStorePrice('$20.00')).toBe('$20');
    expect(formatStorePrice('$6.99')).toBe('$6.99');
    expect(formatStorePrice('$12.50')).toBe('$12.50');
  });

  it('works in comma-decimal locales, symbol trailing', () => {
    expect(formatStorePrice('20,00 €')).toBe('20 €');
    expect(formatStorePrice('12,50 €')).toBe('12,50 €');
  });

  it('leaves thousands separators alone', () => {
    // The strip is anchored to exactly two zeros at the end; the dot in
    // 1.234 is a grouping mark, not cents.
    expect(formatStorePrice('1.234,00 €')).toBe('1.234 €');
    expect(formatStorePrice('US$1,234.00')).toBe('$1,234');
  });

  it('keeps currencies the prefix rule does not name', () => {
    expect(formatStorePrice('AUS$20.00')).toBe('AUS$20');
    expect(formatStorePrice('R389,99')).toBe('R389,99');
  });

  it('handles a symbol that trails without a space', () => {
    expect(formatStorePrice('20.00$')).toBe('20$');
  });

  it('is exact about what it changes', () => {
    expect(formatStorePrice('$20')).toBe('$20');
    expect(formatStorePrice('20 €')).toBe('20 €');
  });
});
