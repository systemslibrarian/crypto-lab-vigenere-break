// Shareable state in the URL hash, so a particular ciphertext + hypothesis +
// overrides can be linked into a classroom, writeup, or bug report. Nothing is
// sent anywhere — the hash lives entirely client-side.

export interface WorkbenchState {
  /** Bundled sample id, or null when the ciphertext is custom. */
  sampleId: string | null;
  /** Custom ciphertext (only when sampleId is null). */
  ciphertext: string | null;
  maxKeyLength: number;
  keyLengthOverride: number | null;
  /** column index → shift. */
  shiftOverrides: Record<number, number>;
  mode: 'explore' | 'challenge';
}

export function encodeState(s: WorkbenchState): string {
  const p = new URLSearchParams();
  if (s.sampleId) p.set('s', s.sampleId);
  else if (s.ciphertext) p.set('ct', s.ciphertext);
  if (s.maxKeyLength !== 20) p.set('mk', String(s.maxKeyLength));
  if (s.keyLengthOverride != null) p.set('kl', String(s.keyLengthOverride));
  const ov = Object.entries(s.shiftOverrides);
  if (ov.length) p.set('ov', ov.map(([i, v]) => `${i}.${v}`).join('-'));
  if (s.mode === 'challenge') p.set('m', 'c');
  return p.toString();
}

export function decodeState(hash: string): Partial<WorkbenchState> {
  const raw = hash.replace(/^#/, '');
  if (!raw) return {};
  const p = new URLSearchParams(raw);
  const out: Partial<WorkbenchState> = {};
  if (p.has('s')) out.sampleId = p.get('s');
  if (p.has('ct')) {
    out.ciphertext = p.get('ct');
    out.sampleId = null;
  }
  if (p.has('mk')) out.maxKeyLength = clampInt(p.get('mk'), 2, 40, 20);
  if (p.has('kl')) out.keyLengthOverride = clampInt(p.get('kl'), 1, 40, 1);
  if (p.has('ov')) {
    const ov: Record<number, number> = {};
    for (const pair of p.get('ov')!.split('-')) {
      const [i, v] = pair.split('.').map(Number);
      if (Number.isInteger(i) && Number.isInteger(v)) ov[i] = ((v % 26) + 26) % 26;
    }
    out.shiftOverrides = ov;
  }
  if (p.get('m') === 'c') out.mode = 'challenge';
  return out;
}

/** Write state to location.hash without adding a history entry. */
export function pushState(s: WorkbenchState): void {
  const encoded = encodeState(s);
  const url = `${location.pathname}${location.search}${encoded ? '#' + encoded : ''}`;
  history.replaceState(null, '', url);
}

export function readState(): Partial<WorkbenchState> {
  return decodeState(location.hash);
}

function clampInt(v: string | null, lo: number, hi: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
