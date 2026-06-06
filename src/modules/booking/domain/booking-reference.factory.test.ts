import { describe, it, expect } from 'vitest';
import { generateBookingReference } from './booking-reference.factory.js';

const VALID_CHARS = new Set('ABCDEFGHJKLMNPQRSTUVWXYZ23456789');

describe('generateBookingReference', () => {
  it('returns a 6-character string', () => {
    expect(generateBookingReference()).toHaveLength(6);
  });

  it('only contains characters from the allowed set', () => {
    for (let i = 0; i < 100; i++) {
      const ref = generateBookingReference();
      for (const char of ref) {
        expect(VALID_CHARS.has(char)).toBe(true);
      }
    }
  });

  it('never contains visually ambiguous characters I, O, 0, 1', () => {
    for (let i = 0; i < 200; i++) {
      const ref = generateBookingReference();
      expect(ref).not.toMatch(/[IO01]/);
    }
  });

  it('generates unique references across multiple calls', () => {
    const refs = new Set(Array.from({ length: 500 }, () => generateBookingReference()));
    expect(refs.size).toBeGreaterThan(490);
  });
});
