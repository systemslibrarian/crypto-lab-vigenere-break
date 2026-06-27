import { describe, expect, it } from 'vitest';
import { plaintextQuality } from './quality';
import { encrypt, indexToLetter } from './cipher';

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (1664525 * s + 1013904223) >>> 0) / 0x100000000);
}

describe('Plaintext quality scoring', () => {
  const english =
    'We hold these truths to be self evident that all men are created equal and that they are endowed by their creator with certain unalienable rights among these are life liberty and the pursuit of happiness';

  it('scores genuine English as reading like English', () => {
    const q = plaintextQuality(english);
    expect(q.label).toBe('reads as English');
    expect(q.combined).toBeGreaterThan(0.6);
    expect(q.wordHitRate).toBeGreaterThan(0.3);
  });

  it('scores Vigenère gibberish (wrong key) as gibberish', () => {
    const ct = encrypt(english, 'QXZWVK').text; // encrypting English yields non-English
    const q = plaintextQuality(ct);
    expect(q.label).toBe('looks like gibberish');
    expect(q.combined).toBeLessThan(0.32);
  });

  it('scores uniform-random letters as gibberish', () => {
    const rng = lcg(42);
    let r = '';
    for (let i = 0; i < 400; i++) r += indexToLetter(Math.floor(rng() * 26));
    const q = plaintextQuality(r);
    expect(q.label).toBe('looks like gibberish');
  });

  it('rates correct decryption far above a one-column-off decryption', () => {
    const good = plaintextQuality(english);
    // Corrupt every 5th letter to simulate one wrong column at key length 5.
    const chars = english.split('');
    let li = 0;
    for (let i = 0; i < chars.length; i++) {
      if (/[a-z]/i.test(chars[i])) {
        if (li % 5 === 0) chars[i] = indexToLetter((chars[i].toUpperCase().charCodeAt(0) - 65 + 7) % 26);
        li++;
      }
    }
    const oneOff = plaintextQuality(chars.join(''));
    expect(good.combined).toBeGreaterThan(oneOff.combined);
  });

  it('handles empty and tiny inputs without throwing', () => {
    expect(plaintextQuality('').combined).toBe(0);
    expect(() => plaintextQuality('A')).not.toThrow();
  });
});
