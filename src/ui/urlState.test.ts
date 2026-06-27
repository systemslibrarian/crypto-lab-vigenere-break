import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, type WorkbenchState } from './urlState';

const base: WorkbenchState = {
  sampleId: 'declaration',
  ciphertext: null,
  maxKeyLength: 20,
  keyLengthOverride: null,
  shiftOverrides: {},
  mode: 'explore',
};

describe('URL state encode/decode', () => {
  it('round-trips a sample selection', () => {
    const enc = encodeState(base);
    expect(decodeState('#' + enc).sampleId).toBe('declaration');
  });

  it('round-trips overrides, key length, max key length and mode', () => {
    const s: WorkbenchState = {
      sampleId: 'gettysburg',
      ciphertext: null,
      maxKeyLength: 30,
      keyLengthOverride: 6,
      shiftOverrides: { 0: 2, 3: 25 },
      mode: 'challenge',
    };
    const d = decodeState('#' + encodeState(s));
    expect(d.sampleId).toBe('gettysburg');
    expect(d.maxKeyLength).toBe(30);
    expect(d.keyLengthOverride).toBe(6);
    expect(d.shiftOverrides).toEqual({ 0: 2, 3: 25 });
    expect(d.mode).toBe('challenge');
  });

  it('prefers custom ciphertext over sample id', () => {
    const s: WorkbenchState = { ...base, sampleId: null, ciphertext: 'ABCDEF' };
    const d = decodeState('#' + encodeState(s));
    expect(d.ciphertext).toBe('ABCDEF');
    expect(d.sampleId).toBe(null);
  });

  it('returns empty object for an empty hash', () => {
    expect(decodeState('')).toEqual({});
    expect(decodeState('#')).toEqual({});
  });

  it('normalises out-of-range overrides into 0..25', () => {
    const d = decodeState('#ov=0.30-1.-5');
    expect(d.shiftOverrides![0]).toBe(4); // 30 mod 26
  });
});
