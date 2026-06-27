import { describe, expect, it } from 'vitest';
import { SAMPLES, sampleById } from './index';
import { runBreak } from '../vigenere/break';
import { decrypt, encrypt, normalize } from '../vigenere/cipher';
import { plaintextQuality } from '../vigenere/quality';

describe('Bundled samples', () => {
  it('every sample round-trips and reports an accurate letter count', () => {
    for (const s of SAMPLES) {
      expect(encrypt(s.plaintext, s.solutionKey).text).toBe(s.ciphertext);
      expect(decrypt(s.ciphertext, s.solutionKey).text).toBe(s.plaintext.toUpperCase());
      expect(s.letterCount).toBe(normalize(s.ciphertext).length);
    }
  });

  it('ideal sample recovers the exact fundamental key (not a multiple)', () => {
    const r = runBreak(sampleById('declaration')!.ciphertext);
    expect(r.key).toBe('LEMON');
    expect(r.keyLength).toBe(5);
  });

  it('ambiguous sample resolves to the 5-letter fundamental and reads as English', () => {
    const s = sampleById('speckled')!;
    const r = runBreak(s.ciphertext);
    expect(r.keyLength).toBe(5);
    expect(r.key).toBe('BAKER');
    expect(plaintextQuality(r.plaintext).label).toBe('reads as English');
  });

  it('non-English sample finds a key length but the result is NOT readable English', () => {
    const s = sampleById('latin')!;
    const r = runBreak(s.ciphertext);
    expect(r.keyLength).toBeGreaterThan(0);
    // The English-frequency model mis-solves Latin: quality must not read as English.
    expect(plaintextQuality(r.plaintext).label).not.toBe('reads as English');
  });

  it('boundary (near-OTP) sample is inconclusive on auto-break', () => {
    const r = runBreak(sampleById('boundary')!.ciphertext);
    expect(r.inconclusive).toBe(true);
  });

  it('every sample has a category, note, and what-to-notice callout', () => {
    for (const s of SAMPLES) {
      expect(s.category).toBeTruthy();
      expect(s.note.length).toBeGreaterThan(10);
      expect(s.whatToNotice.length).toBeGreaterThan(10);
    }
  });
});
