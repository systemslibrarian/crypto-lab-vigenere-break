// Break workbench: the hands-on cryptanalysis centerpiece. Walks the real
// method — Kasiski → index of coincidence → per-column chi-squared → recovered
// key + decryption — all derived from the ciphertext, with honest inconclusive
// states and manual overrides at every step.

import { clear, copyButton, el, section } from './dom';
import { analyzeCiphertext, runBreak } from '../vigenere/break';
import { indexToLetter } from '../vigenere/cipher';
import { ENGLISH_FREQ, letterCounts } from '../vigenere/frequency';
import { ENGLISH_IOC, RANDOM_IOC } from '../vigenere/ioc';
import { SAMPLES, type Sample } from '../samples';
import type { Analysis } from '../vigenere/break';

export function createBreakWorkbench(): HTMLElement {
  const card = section(
    'Break workbench · cryptanalysis',
    'Recover a Vigenère key from ciphertext alone. When the key falls out and English emerges, the cipher has FAILED — that is the exploit landing.'
  );

  // — State —
  let ciphertext = SAMPLES[0].ciphertext;
  let keyLengthOverride: number | null = null; // null = use diagnosis
  const shiftOverrides = new Map<number, number>();
  let revealKey: string | null = null;

  // — Controls: sample picker + ciphertext input —
  const sampleSelect = el('select', { id: 'sample-pick', 'aria-label': 'Choose a bundled ciphertext' }) as HTMLSelectElement;
  for (const s of SAMPLES) sampleSelect.append(el('option', { value: s.id, text: s.title }));
  const ctInput = el('textarea', {
    id: 'ct-input',
    rows: 3,
    spellcheck: false,
    'aria-label': 'Ciphertext to analyse',
  }) as HTMLTextAreaElement;
  ctInput.value = ciphertext;

  function currentSample(): Sample | undefined {
    return SAMPLES.find((s) => s.ciphertext === ciphertext);
  }

  sampleSelect.addEventListener('change', () => {
    const s = SAMPLES.find((x) => x.id === sampleSelect.value);
    if (!s) return;
    ciphertext = s.ciphertext;
    ctInput.value = s.ciphertext;
    resetHypothesis();
    render();
  });
  ctInput.addEventListener('input', () => {
    ciphertext = ctInput.value;
    resetHypothesis();
    render();
  });

  function resetHypothesis() {
    keyLengthOverride = null;
    shiftOverrides.clear();
    revealKey = null;
  }

  const stepsHost = el('div', { class: 'steps' });

  card.append(
    el('div', { class: 'row' }, [
      el('div', {}, [el('label', { for: 'sample-pick', text: 'Bundled ciphertext' }), sampleSelect]),
    ]),
    el('div', { class: 'row' }, [
      el('div', {}, [
        el('label', { for: 'ct-input', text: 'Or paste your own ciphertext' }),
        ctInput,
        el('p', { class: 'hint', text: 'Non-letters are stripped for analysis and restored in the decryption. Longer text + a short key = an easier break.' }),
      ]),
    ]),
    el('div', { class: 'controls', style: 'margin:0.5rem 0' }, [
      el('button', { type: 'button', class: 'primary', id: 'auto-break' }, ['⚡ Auto-break']),
      el('button', { type: 'button', id: 'reset-break' }, ['Reset hypothesis']),
    ]),
    stepsHost
  );

  card.querySelector('#auto-break')!.addEventListener('click', () => {
    resetHypothesis();
    render();
  });
  card.querySelector('#reset-break')!.addEventListener('click', () => {
    resetHypothesis();
    render();
  });

  // ————————————————————————————————————————————————————————————
  // Rendering
  // ————————————————————————————————————————————————————————————
  function render() {
    clear(stepsHost);
    const analysis = analyzeCiphertext(ciphertext);

    stepsHost.append(renderKasiskiStep(analysis));
    stepsHost.append(renderIocStep(analysis));

    // Pass an explicit length ONLY when the user has overridden it; otherwise let
    // runBreak run its own diagnosis and honest too-short / OTP-boundary guards.
    const result = runBreak(ciphertext, {
      keyLength: keyLengthOverride ?? undefined,
      shiftOverrides: Object.fromEntries(shiftOverrides),
    });

    if (result.keyLength >= 1 && result.columns.length > 0) {
      stepsHost.append(renderColumnStep(analysis, result.keyLength, result.columns));
    } else {
      stepsHost.append(stepShell(3, 'Column frequency solve', 'No key-length hypothesis yet — resolve Step 2 (or set a length manually) first.'));
    }
    stepsHost.append(renderResultStep(result));
  }

  // — Step 1: Kasiski —
  function renderKasiskiStep(a: Analysis): HTMLElement {
    const { step, body } = stepParts(1, 'Kasiski examination', 'Repeated plaintext encrypted at the same key offset yields repeated ciphertext; the gap between repeats is a multiple of the key length. Factor the gaps and the key length surfaces.');
    step.append(el('p', { class: 'what-isnt', text: "What this isn't: not a guess — every spacing and factor below is measured from the ciphertext." }));

    const kas = a.kasiski;
    if (kas.repeats.length === 0) {
      body.append(banner('caution', '⚠', 'No repeated substrings of length ≥ 3 were found. Kasiski yields nothing here — fall back to the index of coincidence (Step 2).'));
      return step;
    }

    // Highlight repeated substrings in the letters-only ciphertext (top few).
    const topRepeats = kas.repeats.slice(0, 6);
    const highlightSet = new Set(topRepeats.map((r) => r.substring));
    body.append(el('p', { class: 'hint', text: `Found ${kas.repeats.length} repeated substring(s). Highlighted below are the longest/most frequent:` }));
    body.append(renderHighlightedText(a.letters, highlightSet));

    // Repeat table: substring, positions, spacings.
    const tbl = el('table');
    tbl.append(el('thead', {}, [el('tr', {}, [
      el('th', { text: 'Repeat' }), el('th', { text: 'Occurrences' }), el('th', { text: 'Spacings' }),
    ])]));
    const tb = el('tbody');
    for (const r of topRepeats) {
      tb.append(el('tr', {}, [
        el('td', {}, [el('code', { text: r.substring })]),
        el('td', { text: String(r.positions.length) }),
        el('td', { text: r.spacings.join(', ') }),
      ]));
    }
    tbl.append(tb);
    const det = el('details', { class: 'aria-table' }, [el('summary', { text: 'Repeats, occurrences & spacings (table)' }), tbl]);
    body.append(det);

    // Factor tally → candidate key lengths.
    const factorList = kas.factors.slice(0, 8).map((f) => `${f.factor} (×${f.count})`).join('   ');
    body.append(el('p', {}, [
      el('strong', { text: 'Factor frequency: ' }),
      el('span', { class: 'mono-out', style: 'display:inline-block;padding:0.2rem 0.5rem;margin:0', text: factorList || '—' }),
    ]));
    body.append(el('p', { class: 'hint', text: 'Caution: the smallest factors (2, 3) divide every spacing, so they always score highest. Use these to corroborate the IoC peak — not to pick the length alone.' }));
    return step;
  }

  // — Step 2: Index of coincidence —
  function renderIocStep(a: Analysis): HTMLElement {
    const { step, body } = stepParts(2, 'Index of coincidence', `Split the ciphertext into L columns and average each column's IoC. At the true key length every column is a simple Caesar shift of English, so the average jumps toward English's ${ENGLISH_IOC} (random is ${RANDOM_IOC.toFixed(4)}).`);

    const peaks = new Set(a.diagnosis.strongIocPeriods);
    const chosen = keyLengthOverride ?? a.diagnosis.suggested ?? -1;
    const maxIoc = Math.max(...a.iocCandidates.map((c) => c.averageIoc), ENGLISH_IOC);

    // Bar chart (period vs avg IoC), peaks flagged with icon + text + color.
    const bars = el('div', { class: 'bars', role: 'img', 'aria-label': iocAriaSummary(a) });
    for (const c of a.iocCandidates) {
      const isPeak = peaks.has(c.period);
      const isChosen = c.period === chosen;
      const row = el('div', { class: `bar-row${isPeak ? ' peak' : ''}${isChosen ? ' chosen' : ''}` }, [
        el('span', { class: 'bar-label', text: `L=${c.period}` }),
        el('div', { class: 'bar-track' }, [
          el('div', { class: 'bar-fill', style: `width:${Math.min(100, (c.averageIoc / maxIoc) * 100).toFixed(1)}%` }),
        ]),
        el('span', { text: `${c.averageIoc.toFixed(4)}${isPeak ? ' ◆' : ''}` }),
      ]);
      bars.append(row);
    }
    body.append(bars);

    // Text-equivalent table for the chart.
    const tbl = el('table');
    tbl.append(el('thead', {}, [el('tr', {}, [el('th', { text: 'Period L' }), el('th', { text: 'Avg IoC' }), el('th', { text: 'English-like?' })])]));
    const tb = el('tbody');
    for (const c of a.iocCandidates) {
      tb.append(el('tr', {}, [
        el('td', { text: String(c.period) }),
        el('td', { text: c.averageIoc.toFixed(4) }),
        el('td', { text: peaks.has(c.period) ? 'peak ◆' : '' }),
      ]));
    }
    tbl.append(tb);
    body.append(el('details', { class: 'aria-table' }, [el('summary', { text: 'IoC by period (table)' }), tbl]));

    // Convergence cue.
    if (a.diagnosis.iocPeak !== null) {
      if (a.diagnosis.converges) {
        body.append(banner('alarm', '🎯', `Convergence: Kasiski factors and the IoC peak both point to length ${a.diagnosis.iocPeak}. The attacker is closing in.`));
      } else {
        body.append(banner('info', 'ℹ', `IoC peaks at length ${a.diagnosis.iocPeak}, but Kasiski did not clearly corroborate it. Treat as a working hypothesis.`));
      }
    } else {
      body.append(banner('caution', '⚠', 'No period produces an English-like IoC. The text may be too short, or the key too long — inconclusive.'));
    }

    // Key-length selector (the hypothesis the user controls).
    const sel = el('select', { 'aria-label': 'Key-length hypothesis' }) as HTMLSelectElement;
    sel.append(el('option', { value: 'auto', text: a.diagnosis.suggested ? `Auto (diagnosed: ${a.diagnosis.suggested})` : 'Auto (inconclusive)' }));
    for (const c of a.iocCandidates) {
      const opt = el('option', { value: String(c.period), text: `L = ${c.period}` }) as HTMLOptionElement;
      if (keyLengthOverride === c.period) opt.selected = true;
      sel.append(opt);
    }
    if (keyLengthOverride === null) (sel.firstChild as HTMLOptionElement).selected = true;
    sel.addEventListener('change', () => {
      keyLengthOverride = sel.value === 'auto' ? null : Number(sel.value);
      shiftOverrides.clear();
      render();
    });
    sel.id = 'key-length-select';
    body.append(el('div', { class: 'controls', style: 'margin-top:0.5rem' }, [
      el('label', { for: 'key-length-select', text: 'Key length =', style: 'margin:0' }),
      sel,
    ]));
    return step;
  }

  // — Step 3: Column frequency solver —
  function renderColumnStep(a: Analysis, keyLength: number, columns: ReturnType<typeof runBreak>['columns']): HTMLElement {
    const { step, body } = stepParts(3, 'Column frequency solve', `Each column is now a single Caesar shift. Score all 26 shifts by chi-squared against English; the lowest is the key letter. Override any column the solver gets wrong — cryptanalysis is iterative.`);

    const grid = el('div', { class: 'columns-grid' });
    for (const col of columns) {
      const overridden = shiftOverrides.has(col.index);
      const shift = overridden ? shiftOverrides.get(col.index)! : col.bestShift;
      const card = el('div', { class: `col-card${col.ambiguous ? ' ambiguous' : ''}` });
      card.append(el('h4', { text: `Column ${col.index + 1} · ${col.letters.length} letters` }));
      card.append(el('div', { class: `keyletter${overridden ? ' overridden' : ''}`, text: indexToLetter(shift) }));

      // Frequency mini-bars: decrypted column distribution vs English.
      card.append(renderColumnFreq(col.letters, shift));

      const sel = el('select', { 'aria-label': `Shift for column ${col.index + 1}` }) as HTMLSelectElement;
      for (let s = 0; s < 26; s++) {
        const opt = el('option', { value: String(s), text: `${indexToLetter(s)} (shift ${s}, χ²=${col.chiByShift[s] === Infinity ? '∞' : col.chiByShift[s].toFixed(0)})` }) as HTMLOptionElement;
        if (s === shift) opt.selected = true;
        sel.append(opt);
      }
      sel.addEventListener('change', () => {
        const v = Number(sel.value);
        if (v === col.bestShift) shiftOverrides.delete(col.index);
        else shiftOverrides.set(col.index, v);
        render();
      });
      card.append(sel);
      if (col.ambiguous) {
        const top = col.rankedShifts.slice(0, 3).map((s) => indexToLetter(s)).join(', ');
        card.append(el('span', { class: 'chip', text: `⚠ ambiguous — top: ${top}` }));
      }
      if (overridden) {
        card.append(el('span', { class: 'chip', style: 'background:transparent;border-color:var(--alarm);color:var(--alarm)', text: '✎ manual' }));
      }
      grid.append(card);
    }
    body.append(grid);
    void a;
    void keyLength;
    return step;
  }

  // — Step 4: Result —
  function renderResultStep(result: ReturnType<typeof runBreak>): HTMLElement {
    const { step, body } = stepParts(4, 'Result · recovered key & plaintext', 'The recovery is honest, not auto-snapped. If a column is off, the plaintext will read as garbage — go back to Step 3 and nudge it.');

    if (result.keyLength < 1 || result.key === '') {
      body.append(banner('caution', '⛔', result.note || 'Inconclusive — no key recovered.'));
      return step;
    }

    if (result.inconclusive) {
      body.append(banner('caution', '⚠', result.note));
    }

    body.append(el('div', { class: 'controls' }, [
      el('span', { text: 'Recovered key:' }),
      el('span', { class: 'keyout', text: result.key }),
      copyButton(() => result.key, 'Copy key'),
    ]));

    // Heuristic "does it read as English?" cue using IoC of the recovered plaintext.
    const looksEnglish = englishScore(result.plaintext) >= 0.058;
    if (!result.inconclusive) {
      if (looksEnglish) {
        body.append(banner('alarm', '🔓', 'Cipher broken. The key was recovered from ciphertext alone and the plaintext reads as English — a short repeating key is fatal to Vigenère.'));
      } else {
        body.append(banner('info', '🛠', 'Key applied, but the plaintext does not yet read as English. One or more columns are likely off — adjust them in Step 3.'));
      }
    }

    const head = el('div', { class: 'controls' }, [
      el('span', { text: 'Decryption:' }),
      copyButton(() => result.plaintext, 'Copy plaintext'),
    ]);
    body.append(head, el('p', { class: 'mono-out', 'aria-live': 'polite', text: result.plaintext }));

    // Optional reveal of the true key (samples only) — for self-check, never used by the break.
    const s = currentSample();
    if (s) {
      const revealBtn = el('button', { type: 'button' }, [revealKey ? 'Hide answer' : 'Reveal true key (check)']);
      revealBtn.addEventListener('click', () => {
        revealKey = revealKey ? null : s.solutionKey;
        render();
      });
      body.append(el('div', { style: 'margin-top:0.6rem' }, [revealBtn]));
      if (revealKey) {
        const match = revealKey === result.key;
        body.append(banner(match ? 'ok' : 'caution', match ? '✓' : '✗', `True key: ${revealKey}. ${match ? 'Matches your recovery.' : 'Does not match yet — keep iterating.'}  (${s.note})`));
      }
    }
    return step;
  }

  render();
  return card;
}

// ————————————————————————————————————————————————————————————
// Helpers
// ————————————————————————————————————————————————————————————

function stepShell(n: number, title: string, msg: string): HTMLElement {
  const { step, body } = stepParts(n, title, '');
  body.append(el('p', { class: 'hint', text: msg }));
  return step;
}

function stepParts(n: number, title: string, sub: string) {
  const step = el('div', { class: 'step' });
  step.append(el('h3', {}, [el('span', { class: 'step-num', text: `Step ${n} ` }), document.createTextNode(title)]));
  if (sub) step.append(el('p', { class: 'hint', text: sub }));
  const body = el('div');
  step.append(body);
  return { step, body };
}

function banner(kind: 'alarm' | 'caution' | 'ok' | 'info', icon: string, text: string): HTMLElement {
  return el('div', { class: `status ${kind}`, role: kind === 'alarm' || kind === 'caution' ? 'alert' : 'status' }, [
    el('span', { class: 'ico', 'aria-hidden': 'true', text: icon }),
    el('span', { text }),
  ]);
}

function renderHighlightedText(letters: string, highlight: Set<string>): HTMLElement {
  const wrap = el('div', { class: 'mono-out', style: 'max-height:7rem;overflow:auto' });
  // Greedy left-to-right marking of the first/longest matches.
  const subs = [...highlight].sort((a, b) => b.length - a.length);
  let i = 0;
  while (i < letters.length) {
    let matched = '';
    for (const s of subs) {
      if (letters.startsWith(s, i)) {
        matched = s;
        break;
      }
    }
    if (matched) {
      wrap.append(el('mark', { class: 'repeat-hl', text: matched }));
      i += matched.length;
    } else {
      wrap.append(document.createTextNode(letters[i]));
      i += 1;
    }
  }
  return wrap;
}

function renderColumnFreq(columnLetters: string, shift: number): HTMLElement {
  // Distribution of the *decrypted* column, overlaid against English order.
  const counts = letterCounts(columnLetters);
  const total = columnLetters.length || 1;
  const wrap = el('div', { class: 'bars', style: 'margin:0.3rem 0', 'aria-hidden': 'true' });
  // Show the decrypted distribution as 26 thin bars in alphabetical (decrypted) order.
  const track = el('div', { style: 'display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:1px;height:2rem;align-items:end' });
  const maxFreq = Math.max(...ENGLISH_FREQ, ...counts.map((c) => c / total));
  for (let i = 0; i < 26; i++) {
    const observed = counts[(i + shift) % 26] / total; // decrypted letter i
    const h = (observed / maxFreq) * 100;
    const eng = (ENGLISH_FREQ[i] / maxFreq) * 100;
    const cell = el('div', { style: 'position:relative;height:100%;display:flex;align-items:end' });
    cell.append(el('div', { style: `width:100%;height:${h.toFixed(0)}%;background:var(--accent-soft)` }));
    // English reference tick.
    cell.append(el('div', { style: `position:absolute;left:0;right:0;bottom:${eng.toFixed(0)}%;border-top:1px solid var(--alarm);opacity:0.6` }));
    track.append(cell);
  }
  wrap.append(track);
  return wrap;
}

function iocAriaSummary(a: Analysis): string {
  const top = [...a.iocCandidates].sort((x, y) => y.averageIoc - x.averageIoc).slice(0, 3);
  const peaks = a.diagnosis.strongIocPeriods.join(', ') || 'none';
  return `Average index of coincidence by period. Highest at ${top.map((c) => `period ${c.period} (${c.averageIoc.toFixed(4)})`).join(', ')}. English-like peaks at periods: ${peaks}.`;
}

/** Crude English-likeness score: IoC of the whole text (≈0.066 for English). */
function englishScore(text: string): number {
  const letters = text.toUpperCase().replace(/[^A-Z]/g, '');
  const N = letters.length;
  if (N < 2) return 0;
  const counts = letterCounts(letters);
  let sum = 0;
  for (const n of counts) sum += n * (n - 1);
  return sum / (N * (N - 1));
}
