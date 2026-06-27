import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, normalizeKey, process, tableauCell } from './cipher';

// A deterministic LCG so the property test is reproducible (no Math.random).
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function randomLetters(rng: () => number, len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += String.fromCharCode(65 + Math.floor(rng() * 26));
  return out;
}

describe('Vigenère cipher core', () => {
  it('matches the classic ATTACKATDAWN / LEMON / LXFOPVEFRNHR vector', () => {
    const ct = encrypt('ATTACKATDAWN', 'LEMON').text;
    expect(ct).toBe('LXFOPVEFRNHR');
    expect(decrypt(ct, 'LEMON').text).toBe('ATTACKATDAWN');
  });

  it('round-trips decrypt(encrypt(p, k), k) === p for random alphabetic inputs (property test)', () => {
    const rng = lcg(20260627);
    for (let trial = 0; trial < 500; trial++) {
      const plainLen = 1 + Math.floor(rng() * 80);
      const keyLen = 1 + Math.floor(rng() * 12);
      const plain = randomLetters(rng, plainLen);
      const key = randomLetters(rng, keyLen);
      const ct = encrypt(plain, key).text;
      expect(decrypt(ct, key).text).toBe(plain);
    }
  });

  it('preserves non-alpha characters in place and normalizes case in the letters view', () => {
    const r = encrypt('Hello, World! 123', 'KEY');
    // punctuation, spaces, digits survive in the full text
    expect(r.text).toMatch(/[,!]/);
    expect(r.text).toContain(' ');
    expect(r.text).toContain('123');
    // lettersOnly is uppercase letters only
    expect(r.lettersOnly).toMatch(/^[A-Z]+$/);
    expect(r.lettersOnly.length).toBe('HelloWorld'.length);
  });

  it('round-trips text containing punctuation, preserving the original characters', () => {
    const plain = 'Meet me at 4pm, by the river — alone.';
    const ct = encrypt(plain, 'RIVER').text;
    expect(decrypt(ct, 'RIVER').text).toBe(plain.toUpperCase());
  });

  it('exposes a correct per-letter alignment (key letter and shift)', () => {
    const r = encrypt('AAAA', 'BCDE');
    expect(r.alignment.map((c) => c.cipher).join('')).toBe('BCDE');
    expect(r.alignment.map((c) => c.shift)).toEqual([1, 2, 3, 4]);
    expect(r.alignment.map((c) => c.key).join('')).toBe('BCDE');
  });

  it('rejects empty and non-letter keys with clear errors', () => {
    expect(() => normalizeKey('')).toThrow(/empty/i);
    expect(() => normalizeKey('   ')).toThrow(/empty/i);
    expect(() => normalizeKey('ab1')).toThrow(/letters/i);
    expect(() => normalizeKey('a b')).toThrow(/letters/i);
    expect(normalizeKey('Lemon')).toBe('LEMON');
  });

  it('encrypt is the inverse of decrypt direction in process()', () => {
    const enc = process('SECRET', 'KEY', 'encrypt').text;
    const dec = process(enc, 'KEY', 'decrypt').text;
    expect(dec).toBe('SECRET');
  });

  it('tableau cell (row+col) mod 26 is correct', () => {
    expect(tableauCell(0, 0)).toBe('A');
    expect(tableauCell(11, 0)).toBe('L'); // row L, col A => L
    expect(tableauCell(25, 1)).toBe('A'); // Z + B wraps to A
  });
});
