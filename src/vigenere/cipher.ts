// Core Vigenère cipher: real modular arithmetic over the 26-letter alphabet
// with a repeating key. c_i = (p_i + k_{i mod L}) mod 26 ; decrypt subtracts.

import type { AlignedCell, CipherResult } from './types';

const A = 65; // 'A'
const ALPHA = 26;

/** Index 0–25 of an uppercase letter. */
export function letterToIndex(ch: string): number {
  return ch.charCodeAt(0) - A;
}

/** Uppercase letter for an index (wraps mod 26 so callers can pass raw sums). */
export function indexToLetter(i: number): string {
  return String.fromCharCode(A + ((i % ALPHA) + ALPHA) % ALPHA);
}

/** True for a single A–Z or a–z character. */
export function isAlpha(ch: string): boolean {
  return /^[A-Za-z]$/.test(ch);
}

/** Uppercase, letters only — the classical analysis form. */
export function normalize(text: string): string {
  return text.toUpperCase().replace(/[^A-Z]/g, '');
}

/** Validate a key: must be non-empty and all letters. Returns normalized key or throws. */
export function normalizeKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length === 0) throw new Error('Key is empty.');
  if (!/^[A-Za-z]+$/.test(trimmed)) {
    throw new Error('Key must contain letters A–Z only (no spaces, digits, or punctuation).');
  }
  return trimmed.toUpperCase();
}

export type Direction = 'encrypt' | 'decrypt';

/**
 * keystream-source extension point.
 *
 * A KeystreamSource yields the key-letter index to apply at each *letter
 * position* of the message. The repeating-key Vigenère is the only source
 * implemented this pass; autokey and running-key variants would plug in here
 * without touching the encrypt/decrypt core below.
 */
export type KeystreamSource = (params: {
  /** 0-based index among letters processed so far. */
  position: number;
  /** Plaintext letter index at this position (0–25). Available for autokey. */
  plainIndex: number;
  /** Ciphertext letter index produced at this position (0–25). For ciphertext-autokey. */
  cipherIndex: number;
}) => number;

/** The standard repeating keyword keystream. */
export function repeatingKeystream(key: string): KeystreamSource {
  const indices = [...key].map(letterToIndex);
  const L = indices.length;
  return ({ position }) => indices[position % L];
}

/**
 * Encrypt or decrypt `text` with `key`. Non-alpha characters are preserved in
 * place in `result.text`; the alignment and `lettersOnly` cover letters only.
 */
export function process(text: string, key: string, direction: Direction): CipherResult {
  const normKey = normalizeKey(key);
  const keystream = repeatingKeystream(normKey);
  const sign = direction === 'encrypt' ? 1 : -1;

  const out: string[] = [];
  const lettersOut: string[] = [];
  const alignment: AlignedCell[] = [];
  let position = 0;

  for (const ch of text) {
    if (!isAlpha(ch)) {
      out.push(ch);
      continue;
    }
    const upper = ch.toUpperCase();
    const inIndex = letterToIndex(upper);
    // For repeating keys the keystream depends only on position; plain/cipher
    // indices are passed through so autokey sources can use them later.
    const shift = keystream({ position, plainIndex: inIndex, cipherIndex: inIndex });
    const outIndex = ((inIndex + sign * shift) % ALPHA + ALPHA) % ALPHA;
    const outLetter = indexToLetter(outIndex);

    out.push(outLetter);
    lettersOut.push(outLetter);
    alignment.push(
      direction === 'encrypt'
        ? { plain: upper, key: indexToLetter(shift), shift, cipher: outLetter }
        : { plain: outLetter, key: indexToLetter(shift), shift, cipher: upper }
    );
    position++;
  }

  return { text: out.join(''), lettersOnly: lettersOut.join(''), alignment };
}

export function encrypt(plaintext: string, key: string): CipherResult {
  return process(plaintext, key, 'encrypt');
}

export function decrypt(ciphertext: string, key: string): CipherResult {
  return process(ciphertext, key, 'decrypt');
}

/**
 * Decrypt using a per-letter key derived from explicit column shifts (length L,
 * applied by letter position mod L). Used by the break workbench so manual
 * column overrides decrypt immediately without reconstructing a key string.
 */
export function decryptWithShifts(text: string, shifts: number[]): CipherResult {
  const key = shifts.map((s) => indexToLetter(s)).join('');
  return decrypt(text, key);
}

/** The tabula recta: row r, col c => letter (r + c) mod 26. Row/col are 0–25. */
export function tableauCell(row: number, col: number): string {
  return indexToLetter(row + col);
}
