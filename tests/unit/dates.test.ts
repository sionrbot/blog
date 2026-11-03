import { describe, expect, it } from 'vite-plus/test';
import { formatDate } from '../../src/utils/posts';

// Run this file in separate TZ processes; each assertion checks the actual returned string.
describe('formatDate', () => {
  it.each([
    ['2026-01-01T00:00:00Z', 'January 1, 2026'],
    ['2026-12-31T23:59:59Z', 'December 31, 2026'],
    ['2026-01-01T00:30:00+08:00', 'December 31, 2025'],
    ['2024-02-29T12:00:00Z', 'February 29, 2024'],
  ])('formats %s as its UTC calendar date', (input, expected) => {
    expect(formatDate(new Date(input), 'en-US')).toBe(expected);
  });

  it('uses the requested locale', () => {
    expect(formatDate(new Date('2026-01-02T00:00:00Z'), 'en-GB')).toBe('2 January 2026');
  });
});
