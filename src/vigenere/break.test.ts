import { describe, expect, it } from 'vitest';
import { runBreak } from './break';
import { encrypt, normalize } from './cipher';
import { SAMPLES, sampleById } from '../samples';

describe('Full break pipeline (derived, not hardcoded)', () => {
  it('recovers key + plaintext from a long sample encrypted with a short key', () => {
    const sample = sampleById('declaration')!;
    // Strip everything but the ciphertext — the break gets no key, no plaintext.
    const ciphertext = sample.ciphertext;
    const result = runBreak(ciphertext);

    expect(result.inconclusive).toBe(false);
    expect(result.keyLength).toBe(5);
    expect(result.key).toBe('LEMON');
    // Recovered plaintext matches the original letters.
    expect(normalize(result.plaintext)).toBe(normalize(sample.plaintext));
  });

  it('recovers a 6-letter key (Gettysburg / CIPHER)', () => {
    const sample = sampleById('gettysburg')!;
    const result = runBreak(sample.ciphertext);
    expect(result.key).toBe('CIPHER');
    expect(normalize(result.plaintext)).toBe(normalize(sample.plaintext));
  });

  it('recovers an 8-letter key (Holmes / VICTORIA)', () => {
    const sample = sampleById('holmes')!;
    const result = runBreak(sample.ciphertext);
    expect(result.key).toBe('VICTORIA');
    expect(normalize(result.plaintext)).toBe(normalize(sample.plaintext));
  });

  it('works on a freshly-encrypted arbitrary English passage with a random short key', () => {
    const plain =
      'It is a truth universally acknowledged that a single man in possession of a good fortune must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood this truth is so well fixed in the minds of the surrounding families that he is considered the rightful property of some one or other of their daughters.';
    const key = 'WALNUT';
    const ct = encrypt(plain, key).text;
    const result = runBreak(ct);
    expect(result.key).toBe(key);
    expect(normalize(result.plaintext)).toBe(normalize(plain));
  });

  it('reports INCONCLUSIVE on a too-short ciphertext rather than a confident key', () => {
    const sample = sampleById('short')!;
    const result = runBreak(sample.ciphertext);
    expect(result.inconclusive).toBe(true);
    expect(result.note).toMatch(/short|more text|inconclusive/i);
  });

  it('honors a manual key-length override even when short', () => {
    const sample = sampleById('short')!;
    const result = runBreak(sample.ciphertext, { keyLength: 3 });
    // Forced length produces columns (low-confidence), not an empty inconclusive bail.
    expect(result.keyLength).toBe(3);
    expect(result.columns.length).toBe(3);
  });

  it('applies per-column shift overrides to the decryption', () => {
    const sample = sampleById('declaration')!;
    const base = runBreak(sample.ciphertext);
    // Force column 0 to the wrong shift; plaintext must change.
    const wrongShift = (base.columns[0].bestShift + 3) % 26;
    const tweaked = runBreak(sample.ciphertext, {
      keyLength: base.keyLength,
      shiftOverrides: { 0: wrongShift },
    });
    expect(tweaked.plaintext).not.toBe(base.plaintext);
    expect(tweaked.key[0]).not.toBe(base.key[0]);
  });

  it('flags the OTP boundary when key length approaches text length', () => {
    const sample = sampleById('short')!;
    const letters = normalize(sample.ciphertext);
    const result = runBreak(sample.ciphertext, { keyLength: Math.floor(letters.length / 2) });
    expect(result.inconclusive).toBe(true);
    expect(result.note).toMatch(/one-time-pad|OTP|boundary/i);
  });

  it('every bundled sample round-trips under its own solution key', () => {
    for (const s of SAMPLES) {
      const dec = encrypt(s.plaintext, s.solutionKey); // sanity: encrypt is deterministic
      expect(dec.text).toBe(s.ciphertext);
    }
  });
});
