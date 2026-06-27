// Break workbench: the hands-on cryptanalysis centerpiece. Walks the real
// method — Kasiski → index of coincidence → per-column chi-squared → recovered
// key + decryption — all derived from the ciphertext, with confidence scoring,
// honest inconclusive states, an animated solver transcript, a guided challenge
// mode, shareable URL state, and manual overrides at every step.

import { clear, copyButton, el, section } from './dom';
import { analyzeCiphertext, runBreak, type Analysis } from '../vigenere/break';
import type { BreakResult } from '../vigenere/types';
import { decryptWithShifts, indexToLetter, normalize } from '../vigenere/cipher';
import { ENGLISH_FREQ, letterCounts } from '../vigenere/frequency';
import { ENGLISH_IOC, RANDOM_IOC } from '../vigenere/ioc';
import { columnConfidence, keyLengthConfidence, suspiciousColumns } from '../vigenere/confidence';
import { plaintextQuality } from '../vigenere/quality';
import { buildTranscript } from './transcript';
import { pushState, readState, type WorkbenchState } from './urlState';
import { SAMPLES, sampleById, type Sample } from '../samples';

const REDUCED_MOTION =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createBreakWorkbench(): HTMLElement {
  const card = section(
    'Break workbench · cryptanalysis',
    'Recover a Vigenère key from ciphertext alone. When the key falls out and English emerges, the cipher has FAILED — that is the exploit landing.'
  );

  // — State —
  const initial = readState();
  let mode: 'explore' | 'challenge' = initial.mode ?? 'explore';
  let maxKeyLength = initial.maxKeyLength ?? 20;
  let keyLengthOverride: number | null = initial.keyLengthOverride ?? null;
  const shiftOverrides = new Map<number, number>();
  if (initial.shiftOverrides) for (const [k, v] of Object.entries(initial.shiftOverrides)) shiftOverrides.set(Number(k), v);
  let revealKey = false;
  // Challenge bookkeeping.
  const hintedColumns = new Set<number>();
  let challengeSubmitted = false;

  let ciphertext =
    initial.ciphertext != null
      ? initial.ciphertext
      : (initial.sampleId && sampleById(initial.sampleId)?.ciphertext) || SAMPLES[0].ciphertext;
  let sampleId: string | null =
    initial.ciphertext != null ? null : initial.sampleId ?? SAMPLES[0].id;

  function currentSample(): Sample | undefined {
    return sampleId ? sampleById(sampleId) : SAMPLES.find((s) => s.ciphertext === ciphertext);
  }

  function syncUrl() {
    const state: WorkbenchState = {
      sampleId,
      ciphertext: sampleId ? null : ciphertext,
      maxKeyLength,
      keyLengthOverride,
      shiftOverrides: Object.fromEntries(shiftOverrides),
      mode,
    };
    pushState(state);
  }

  function resetHypothesis() {
    keyLengthOverride = null;
    shiftOverrides.clear();
    hintedColumns.clear();
    challengeSubmitted = false;
    revealKey = false;
  }

  // — Top controls: sample picker + metadata —
  const sampleSelect = el('select', { id: 'sample-pick', 'aria-label': 'Choose a bundled ciphertext' }) as HTMLSelectElement;
  for (const s of SAMPLES) {
    const opt = el('option', { value: s.id, text: `${s.title} · ${categoryLabel(s.category)}` }) as HTMLOptionElement;
    if (s.id === sampleId) opt.selected = true;
    sampleSelect.append(opt);
  }
  sampleSelect.addEventListener('change', () => {
    const s = sampleById(sampleSelect.value);
    if (!s) return;
    sampleId = s.id;
    ciphertext = s.ciphertext;
    ctInput.value = s.ciphertext;
    resetHypothesis();
    render();
  });

  const metaHost = el('div', { id: 'sample-meta' });

  // — Ciphertext input + counters + actions —
  const ctInput = el('textarea', { id: 'ct-input', rows: 3, spellcheck: false, 'aria-label': 'Ciphertext to analyse' }) as HTMLTextAreaElement;
  ctInput.value = ciphertext;
  const counters = el('p', { class: 'hint', id: 'ct-counts', 'aria-live': 'polite' });
  const warn = el('p', { class: 'hint', role: 'status', style: 'color:var(--caution)' });

  ctInput.addEventListener('input', () => {
    ciphertext = ctInput.value;
    sampleId = null;
    resetHypothesis();
    render();
  });

  const clearBtn = el('button', { type: 'button', text: 'Clear' });
  clearBtn.addEventListener('click', () => {
    ciphertext = '';
    ctInput.value = '';
    sampleId = null;
    resetHypothesis();
    render();
  });

  // — Max key length control —
  const maxKlInput = el('input', { id: 'max-kl', type: 'number', min: 2, max: 40, value: String(maxKeyLength), style: 'max-width:5rem' }) as HTMLInputElement;
  maxKlInput.addEventListener('change', () => {
    const v = Math.max(2, Math.min(40, Math.round(Number(maxKlInput.value) || 20)));
    maxKeyLength = v;
    maxKlInput.value = String(v);
    render();
  });

  // — Mode toggle (explore / challenge) —
  const exploreBtn = el('button', { type: 'button', 'aria-pressed': String(mode === 'explore'), text: 'Explore' });
  const challengeBtn = el('button', { type: 'button', 'aria-pressed': String(mode === 'challenge'), text: '🎯 Challenge' });
  const modeToggle = el('div', { class: 'toggle-group', role: 'group', 'aria-label': 'workbench mode' }, [exploreBtn, challengeBtn]);
  exploreBtn.addEventListener('click', () => setMode('explore'));
  challengeBtn.addEventListener('click', () => setMode('challenge'));
  function setMode(m: 'explore' | 'challenge') {
    mode = m;
    resetHypothesis();
    exploreBtn.setAttribute('aria-pressed', String(m === 'explore'));
    challengeBtn.setAttribute('aria-pressed', String(m === 'challenge'));
    render();
  }

  const runBtn = el('button', { type: 'button', class: 'primary', id: 'run-attack', text: '▶ Run the attack' });
  const resetBtn = el('button', { type: 'button', id: 'reset-break', text: 'Reset' });
  runBtn.addEventListener('click', () => runAttack());
  resetBtn.addEventListener('click', () => { resetHypothesis(); render(); });

  const railHost = el('div', { id: 'progress-rail' });
  const transcriptHost = el('div', { id: 'transcript', role: 'log', 'aria-live': 'polite', hidden: true });
  const stepsHost = el('div', { class: 'steps' });

  card.append(
    el('div', { class: 'row' }, [
      el('div', {}, [el('label', { for: 'sample-pick', text: 'Scenario / bundled ciphertext' }), sampleSelect]),
      el('div', { style: 'flex:0 0 auto' }, [el('label', { text: 'Mode' }), modeToggle]),
    ]),
    metaHost,
    el('div', { class: 'row' }, [
      el('div', {}, [
        el('label', { for: 'ct-input', text: 'Ciphertext (or paste your own)' }),
        ctInput,
        counters,
        warn,
      ]),
    ]),
    el('div', { class: 'controls', style: 'margin:0.4rem 0' }, [
      runBtn,
      resetBtn,
      copyButton(() => ciphertext, 'Copy ciphertext'),
      clearBtn,
      el('label', { for: 'max-kl', text: 'Max key length', style: 'margin:0 0 0 0.5rem' }),
      maxKlInput,
    ]),
    railHost,
    transcriptHost,
    stepsHost
  );

  // ————————————————————————————————————————————————————————————
  // Animated attack: reveal the solver transcript stage by stage.
  // ————————————————————————————————————————————————————————————
  async function runAttack() {
    resetHypothesis();
    render();
    const analysis = analyzeCiphertext(ciphertext, maxKeyLength);
    const result = runBreak(ciphertext, { maxKeyLength });
    const lines = buildTranscript(analysis, result);

    transcriptHost.hidden = false;
    clear(transcriptHost);
    transcriptHost.append(el('h3', { style: 'margin:0 0 0.3rem;font-size:1rem', text: 'Solver transcript' }));
    const log = el('div', { class: 'mono-out', style: 'max-height:14rem;overflow:auto' });
    transcriptHost.append(log);

    if (REDUCED_MOTION) {
      for (const l of lines) log.append(el('div', { text: l }));
      return;
    }
    runBtn.setAttribute('disabled', '');
    for (const l of lines) {
      log.append(el('div', { text: l }));
      log.scrollTop = log.scrollHeight;
      await delay(280);
    }
    runBtn.removeAttribute('disabled');
  }

  // ————————————————————————————————————————————————————————————
  // Render
  // ————————————————————————————————————————————————————————————
  function render() {
    syncUrl();
    renderMeta();
    renderCounters();
    clear(stepsHost);

    const analysis = analyzeCiphertext(ciphertext, maxKeyLength);
    const result = runBreak(ciphertext, {
      keyLength: keyLengthOverride ?? undefined,
      shiftOverrides: Object.fromEntries(shiftOverrides),
      maxKeyLength,
    });

    renderRail(analysis, result);

    stepsHost.append(renderKasiskiStep(analysis));
    stepsHost.append(renderIocStep(analysis, result));

    if (result.keyLength >= 1 && result.columns.length > 0) {
      stepsHost.append(renderConfidenceStep(analysis, result));
      stepsHost.append(renderColumnStep(result));
      stepsHost.append(renderResultStep(analysis, result));
    } else {
      stepsHost.append(stepShell(3, 'Column frequency solve', 'No key-length hypothesis yet — resolve Step 2 (or set a length manually) first.'));
      stepsHost.append(renderResultStep(analysis, result));
    }
  }

  function renderMeta() {
    clear(metaHost);
    const s = currentSample();
    if (!s) {
      metaHost.append(el('p', { class: 'hint', text: 'Custom ciphertext — paste at least ~50 letters of a single-language message for the statistics to work.' }));
      return;
    }
    const box = el('div', { class: 'status info', style: 'flex-direction:column;align-items:stretch;gap:0.3rem' });
    box.append(el('div', {}, [el('strong', { text: `${categoryLabel(s.category)} · ` }), document.createTextNode(`${s.letterCount} letters · ${s.source}`)]));
    box.append(el('div', {}, [el('span', { class: 'ico', 'aria-hidden': 'true', text: '👁 ' }), el('em', { text: s.whatToNotice })]));
    if (mode === 'explore') box.append(el('div', { class: 'hint', style: 'margin:0', text: s.note }));
    metaHost.append(box);
  }

  function renderCounters() {
    const raw = ciphertext.length;
    const norm = normalize(ciphertext).length;
    const nonAlpha = raw - norm - (ciphertext.match(/\s/g)?.length ?? 0);
    counters.textContent = `${raw} characters · ${norm} letters (analysed) · ${Math.max(0, nonAlpha)} punctuation/digits`;
    warn.textContent = '';
    if (norm > 0 && norm < 50) warn.textContent = `⚠ Only ${norm} letters — likely too short for reliable statistics (need ~50+).`;
    else if (raw > 0 && norm / raw < 0.4) warn.textContent = '⚠ Most of this input is non-letters; only letters are analysed.';
  }

  // — Progress rail —
  function renderRail(analysis: Analysis, result: BreakResult) {
    clear(railHost);
    const hasRepeats = analysis.kasiski.repeats.length > 0;
    const hasLength = result.keyLength >= 1;
    const hasColumns = result.columns.length > 0;
    const readable = hasColumns && plaintextQuality(result.plaintext).label === 'reads as English';
    const stages: [string, 'done' | 'active' | 'pending' | 'fail'][] = [
      ['Repeats found', hasRepeats ? 'done' : 'fail'],
      ['Key length', hasLength ? 'done' : 'pending'],
      ['Column shifts', hasColumns ? 'done' : 'pending'],
      ['Plaintext recovered', readable ? 'done' : hasColumns ? 'active' : 'pending'],
    ];
    const rail = el('ol', { class: 'rail', 'aria-label': 'attack progress' });
    stages.forEach(([label, st], i) => {
      const icon = st === 'done' ? '✓' : st === 'fail' ? '–' : st === 'active' ? '…' : '○';
      rail.append(el('li', { class: `rail-step ${st}` }, [
        el('span', { class: 'rail-ico', 'aria-hidden': 'true', text: icon }),
        el('span', { class: 'rail-num', text: `${i + 1}. ` }),
        el('span', { text: label }),
      ]));
    });
    railHost.append(rail);
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
    const topRepeats = kas.repeats.slice(0, 6);
    const highlightSet = new Set(topRepeats.map((r) => r.substring));
    body.append(el('p', { class: 'hint', text: `Found ${kas.repeats.length} repeated substring(s). Highlighted are the longest/most frequent:` }));
    body.append(renderHighlightedText(a.letters, highlightSet));

    const tbl = el('table');
    tbl.append(el('thead', {}, [el('tr', {}, [el('th', { text: 'Repeat' }), el('th', { text: 'Occurrences' }), el('th', { text: 'Spacings' })])]));
    const tb = el('tbody');
    for (const r of topRepeats) tb.append(el('tr', {}, [el('td', {}, [el('code', { text: r.substring })]), el('td', { text: String(r.positions.length) }), el('td', { text: r.spacings.join(', ') })]));
    tbl.append(tb);
    body.append(el('details', { class: 'aria-table' }, [el('summary', { text: 'Repeats, occurrences & spacings (table)' }), tbl]));

    const factorList = kas.factors.slice(0, 8).map((f) => `${f.factor} (×${f.count})`).join('   ');
    body.append(el('p', {}, [el('strong', { text: 'Factor frequency: ' }), el('span', { class: 'mono-out', style: 'display:inline-block;padding:0.2rem 0.5rem;margin:0', text: factorList || '—' })]));
    body.append(el('p', { class: 'hint', text: 'Caution: the smallest factors (2, 3) divide every spacing, so they always score highest. Use these to corroborate the IoC peak — not to pick the length alone.' }));
    return step;
  }

  // — Step 2: Index of coincidence —
  function renderIocStep(a: Analysis, result: BreakResult): HTMLElement {
    const { step, body } = stepParts(2, 'Index of coincidence', `Split into L columns and average each column's IoC. At the true key length every column is a Caesar shift of English, so the average jumps toward ${ENGLISH_IOC} (random is ${RANDOM_IOC.toFixed(4)}).`);

    const peaks = new Set(a.diagnosis.strongIocPeriods);
    const chosen = result.keyLength;
    const maxIoc = Math.max(...a.iocCandidates.map((c) => c.averageIoc), ENGLISH_IOC);

    const bars = el('div', { class: 'bars', role: 'img', 'aria-label': iocAriaSummary(a) });
    for (const c of a.iocCandidates) {
      const isPeak = peaks.has(c.period);
      const isChosen = c.period === chosen;
      bars.append(el('div', { class: `bar-row${isPeak ? ' peak' : ''}${isChosen ? ' chosen' : ''}` }, [
        el('span', { class: 'bar-label', text: `L=${c.period}` }),
        el('div', { class: 'bar-track' }, [el('div', { class: 'bar-fill', style: `width:${Math.min(100, (c.averageIoc / maxIoc) * 100).toFixed(1)}%` })]),
        el('span', { text: `${c.averageIoc.toFixed(4)}${isPeak ? ' ◆' : ''}` }),
      ]));
    }
    body.append(bars);

    const tbl = el('table');
    tbl.append(el('thead', {}, [el('tr', {}, [el('th', { text: 'Period L' }), el('th', { text: 'Avg IoC' }), el('th', { text: 'English-like?' })])]));
    const tb = el('tbody');
    for (const c of a.iocCandidates) tb.append(el('tr', {}, [el('td', { text: String(c.period) }), el('td', { text: c.averageIoc.toFixed(4) }), el('td', { text: peaks.has(c.period) ? 'peak ◆' : '' })]));
    tbl.append(tb);
    body.append(el('details', { class: 'aria-table' }, [el('summary', { text: 'IoC by period (table)' }), tbl]));

    if (a.diagnosis.iocPeak !== null) {
      if (a.diagnosis.converges) body.append(banner('alarm', '🎯', `Convergence: Kasiski factors and the IoC peak both point to length ${a.diagnosis.iocPeak}. The attacker is closing in.`));
      else body.append(banner('info', 'ℹ', `IoC peaks at length ${a.diagnosis.iocPeak}; Kasiski did not clearly corroborate. Treat as a working hypothesis.`));
    } else {
      body.append(banner('caution', '⚠', 'No period produces an English-like IoC. The text may be too short, or the key too long — inconclusive.'));
    }

    const sel = el('select', { id: 'key-length-select', 'aria-label': 'Key-length hypothesis' }) as HTMLSelectElement;
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
      hintedColumns.clear();
      render();
    });
    body.append(el('div', { class: 'controls', style: 'margin-top:0.5rem' }, [el('label', { for: 'key-length-select', text: 'Key length =', style: 'margin:0' }), sel]));
    return step;
  }

  // — Step 3a: Confidence dashboard —
  function renderConfidenceStep(a: Analysis, result: BreakResult): HTMLElement {
    const { step, body } = stepParts(3, 'Confidence dashboard', 'How sure is this break, and where should you intervene first? Confidence is computed from IoC strength, Kasiski corroboration, column size, and the chi-squared margin in each column.');

    const conf = keyLengthConfidence(a, result.keyLength);
    body.append(el('div', { class: 'controls' }, [
      el('span', { text: 'Key-length confidence:' }),
      confidenceBadge(conf.label),
      el('div', { class: 'bar-track', style: 'flex:1;min-width:6rem' }, [el('div', { class: 'bar-fill', style: `width:${(conf.score * 100).toFixed(0)}%;background:${confColor(conf.label)}` })]),
      el('span', { text: `${(conf.score * 100).toFixed(0)}%` }),
    ]));
    const ul = el('ul', { class: 'reasons' });
    for (const r of conf.reasons) ul.append(el('li', { text: r }));
    body.append(ul);

    // Per-column verdict summary + "intervene here first".
    const sus = suspiciousColumns(result.columns);
    if (sus.length === 0) {
      body.append(banner('ok', '✓', 'Every column is a clear winner — no obvious weak spots.'));
    } else {
      const list = sus.map((c) => `Column ${c.index + 1} (${c.verdict})`).join(', ');
      body.append(banner('caution', '🔎', `Intervene here first: ${list}. These columns have the narrowest chi-squared margin — most likely to be wrong.`));
    }
    return step;
  }

  // — Step 3b: Column frequency solver with heatmap + preview —
  function renderColumnStep(result: BreakResult): HTMLElement {
    const challenge = mode === 'challenge';
    const { step, body } = stepParts(
      challenge ? 4 : 4,
      challenge ? 'Solve the columns yourself' : 'Column frequency solve',
      challenge
        ? 'Challenge mode: each column is a Caesar cipher, but the solver is hidden. Read the frequency bars and the χ² heatmap, set each shift, and make the plaintext appear. Request a hint if stuck — but hints cost points.'
        : 'Each column is a single Caesar shift. The χ² heatmap rates all 26 shifts (brighter = better fit to English). Override any column the solver gets wrong — cryptanalysis is iterative.'
    );

    const currentShifts = result.columns.map((c) =>
      shiftOverrides.has(c.index) ? shiftOverrides.get(c.index)! : challenge ? 0 : c.bestShift
    );

    const grid = el('div', { class: 'columns-grid' });
    for (const col of result.columns) {
      const overridden = shiftOverrides.has(col.index);
      const hinted = hintedColumns.has(col.index);
      const shift = currentShifts[col.index];
      const reveal = !challenge || challengeSubmitted || hinted;

      const cardEl = el('div', { class: `col-card${col.ambiguous && reveal ? ' ambiguous' : ''}` });
      cardEl.append(el('h4', { text: `Column ${col.index + 1} · ${col.letters.length} letters` }));
      cardEl.append(el('div', { class: `keyletter${overridden ? ' overridden' : ''}`, text: reveal || overridden ? indexToLetter(shift) : '?' }));

      cardEl.append(renderColumnFreq(col.letters, shift));
      cardEl.append(renderHeatmap(col, shift, (s) => setShift(col.index, s, result)));

      if (reveal) {
        const cc = columnConfidence(col);
        const top3 = col.rankedShifts.slice(0, 3).map((s) => `${indexToLetter(s)}`).join(' ');
        cardEl.append(el('p', { class: 'hint', style: 'margin:0.2rem 0 0', text: `${cc.verdict} · top: ${top3}` }));
      }

      const sel = el('select', { 'aria-label': `Shift for column ${col.index + 1}` }) as HTMLSelectElement;
      for (let s = 0; s < 26; s++) {
        const chi = col.chiByShift[s] === Infinity ? '∞' : col.chiByShift[s].toFixed(0);
        const opt = el('option', { value: String(s), text: `${indexToLetter(s)} (shift ${s}${reveal ? `, χ²=${chi}` : ''})` }) as HTMLOptionElement;
        if (s === shift) opt.selected = true;
        sel.append(opt);
      }
      sel.addEventListener('change', () => setShift(col.index, Number(sel.value), result));
      cardEl.append(sel);

      if (challenge && !challengeSubmitted) {
        const hintBtn = el('button', { type: 'button', style: 'margin-top:0.3rem;font-size:0.78rem', text: hinted ? 'Hinted ✓' : '💡 Hint' });
        if (hinted) hintBtn.setAttribute('disabled', '');
        hintBtn.addEventListener('click', () => {
          hintedColumns.add(col.index);
          shiftOverrides.set(col.index, col.bestShift);
          render();
        });
        cardEl.append(hintBtn);
      }
      if (overridden && reveal) cardEl.append(el('span', { class: 'chip', style: 'background:transparent;border-color:var(--alarm);color:var(--alarm)', text: hinted ? '💡 hint' : '✎ manual' }));
      grid.append(cardEl);
    }
    body.append(grid);

    // Live partial-plaintext preview of the current shifts.
    const preview = decryptWithShifts(ciphertext, currentShifts).text.replace(/\s+/g, ' ').slice(0, 120);
    body.append(el('label', { text: 'Live preview', style: 'margin-top:0.6rem' }));
    body.append(el('p', { class: 'mono-out', 'aria-live': 'polite', text: preview + (preview.length >= 120 ? '…' : '') }));
    return step;
  }

  function setShift(index: number, shift: number, result: BreakResult) {
    const col = result.columns[index];
    const norm = ((shift % 26) + 26) % 26;
    if (!hintedColumns.has(index) && mode !== 'challenge' && col && norm === col.bestShift) shiftOverrides.delete(index);
    else shiftOverrides.set(index, norm);
    render();
  }

  // — Step 4/5: Result —
  function renderResultStep(a: Analysis, result: BreakResult): HTMLElement {
    const challenge = mode === 'challenge';
    const { step, body } = stepParts(challenge ? 5 : 5, 'Result · recovered key & plaintext', 'The recovery is honest, not auto-snapped. If a column is off, the plaintext reads as garbage — go back and nudge it.');

    if (result.keyLength < 1 || result.columns.length === 0) {
      body.append(banner('caution', '⛔', result.note || 'Inconclusive — no key recovered.'));
      return step;
    }

    // The key/plaintext shown reflect current overrides (challenge: only after submit/hints).
    const shifts = result.columns.map((c) => (shiftOverrides.has(c.index) ? shiftOverrides.get(c.index)! : challenge ? 0 : c.bestShift));
    const shownKey = shifts.map((s) => indexToLetter(s)).join('');
    const shownPlain = decryptWithShifts(ciphertext, shifts).text;
    const quality = plaintextQuality(shownPlain);

    if (result.inconclusive) body.append(banner('caution', '⚠', result.note));

    if (challenge && !challengeSubmitted) {
      body.append(banner('info', '🎯', 'Challenge mode: set the column shifts to reveal the plaintext, then submit. Your key is hidden until you do.'));
      const submit = el('button', { type: 'button', class: 'primary', text: 'Submit solution' });
      submit.addEventListener('click', () => { challengeSubmitted = true; render(); });
      body.append(el('div', { class: 'controls' }, [submit, el('span', { class: 'hint', text: `Columns set: ${shiftOverrides.size}/${result.keyLength} · hints used: ${hintedColumns.size}` })]));
      return step;
    }

    body.append(el('div', { class: 'controls' }, [
      el('span', { text: 'Recovered key:' }),
      el('span', { class: 'keyout', text: shownKey }),
      el('span', { class: 'hint', text: `(length ${result.keyLength})` }),
      copyButton(() => shownKey, 'Copy key'),
    ]));

    // Quality dashboard.
    body.append(renderQuality(quality));

    if (!result.inconclusive) {
      if (quality.label === 'reads as English') body.append(banner('alarm', '🔓', 'Cipher broken. The key was recovered from ciphertext alone and the plaintext reads as English — a short repeating key is fatal to Vigenère.'));
      else if (quality.label === 'partially readable') body.append(banner('info', '🛠', 'Partially readable. Either a column is still wrong (check the confidence dashboard) or the plaintext is not English (see the Latin scenario).'));
      else body.append(banner('info', '🛠', 'Not English yet — one or more columns are off. Use the confidence dashboard to find the weakest column.'));
    }

    body.append(el('div', { class: 'controls' }, [el('span', { text: 'Decryption:' }), copyButton(() => shownPlain, 'Copy plaintext')]));
    body.append(el('p', { class: 'mono-out', 'aria-live': 'polite', text: shownPlain }));

    // Challenge scoring.
    if (challenge && challengeSubmitted) body.append(renderScore(result, quality));

    // Reveal true key (samples only).
    const s = currentSample();
    if (s) {
      const revealBtn = el('button', { type: 'button', text: revealKey ? 'Hide answer' : 'Reveal true key (check)' });
      revealBtn.addEventListener('click', () => { revealKey = !revealKey; render(); });
      body.append(el('div', { style: 'margin-top:0.6rem' }, [revealBtn]));
      if (revealKey) {
        const match = s.solutionKey === shownKey;
        body.append(banner(match ? 'ok' : 'caution', match ? '✓' : '✗', `True key: ${s.solutionKey}. ${match ? 'Matches your recovery.' : 'Does not match yet — keep iterating.'}`));
      }
    }
    void a;
    return step;
  }

  function renderScore(result: BreakResult, quality: ReturnType<typeof plaintextQuality>): HTMLElement {
    const hints = hintedColumns.size;
    const manual = [...shiftOverrides.keys()].filter((i) => !hintedColumns.has(i)).length;
    const solved = quality.label === 'reads as English';
    let score = solved ? 100 : quality.label === 'partially readable' ? 55 : 15;
    score -= hints * 12;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'keep trying';
    const kind = solved ? 'alarm' : 'caution';
    return banner(kind, solved ? '🏆' : '🔁', `Score ${score}/100 (${grade}). ${result.keyLength} columns · ${hints} hint(s) · ${manual} manual solve(s). ${solved ? 'Plaintext reads as English — solved!' : 'Plaintext is not fully English yet.'}`);
  }

  render();
  return card;
}

// ————————————————————————————————————————————————————————————
// Helpers
// ————————————————————————————————————————————————————————————

function categoryLabel(c: Sample['category']): string {
  return {
    ideal: 'Ideal case',
    medium: 'Medium',
    ambiguous: 'Needs nudging',
    short: 'Too short (fails)',
    boundary: 'OTP boundary',
    'non-english': 'Non-English',
  }[c];
}

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

function confidenceBadge(label: string): HTMLElement {
  const icon = label === 'high' ? '●●●' : label === 'medium' ? '●●○' : label === 'low' ? '●○○' : '○○○';
  return el('span', { class: 'conf-badge', style: `color:${confColor(label)}`, 'aria-label': `confidence ${label}` }, [
    el('span', { 'aria-hidden': 'true', text: icon + ' ' }),
    el('strong', { text: label }),
  ]);
}

function confColor(label: string): string {
  return label === 'high' ? 'var(--ok)' : label === 'medium' ? 'var(--accent)' : label === 'low' ? 'var(--caution)' : 'var(--ink-soft)';
}

function renderHighlightedText(letters: string, highlight: Set<string>): HTMLElement {
  const wrap = el('div', { class: 'mono-out', style: 'max-height:7rem;overflow:auto' });
  const subs = [...highlight].sort((a, b) => b.length - a.length);
  let i = 0;
  while (i < letters.length) {
    let matched = '';
    for (const s of subs) if (letters.startsWith(s, i)) { matched = s; break; }
    if (matched) { wrap.append(el('mark', { class: 'repeat-hl', text: matched })); i += matched.length; }
    else { wrap.append(document.createTextNode(letters[i])); i += 1; }
  }
  return wrap;
}

function renderColumnFreq(columnLetters: string, shift: number): HTMLElement {
  const counts = letterCounts(columnLetters);
  const total = columnLetters.length || 1;
  const wrap = el('div', { class: 'bars', style: 'margin:0.3rem 0', 'aria-hidden': 'true' });
  const track = el('div', { style: 'display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:1px;height:2rem;align-items:end' });
  const maxFreq = Math.max(...ENGLISH_FREQ, ...counts.map((c) => c / total));
  for (let i = 0; i < 26; i++) {
    const observed = counts[(i + shift) % 26] / total;
    const h = (observed / maxFreq) * 100;
    const eng = (ENGLISH_FREQ[i] / maxFreq) * 100;
    const cell = el('div', { style: 'position:relative;height:100%;display:flex;align-items:end' });
    cell.append(el('div', { style: `width:100%;height:${h.toFixed(0)}%;background:var(--accent-soft)` }));
    cell.append(el('div', { style: `position:absolute;left:0;right:0;bottom:${eng.toFixed(0)}%;border-top:1px solid var(--alarm);opacity:0.6` }));
    track.append(cell);
  }
  wrap.append(track);
  return wrap;
}

// 26-shift chi-squared heatmap. Brighter = lower χ² = better fit. Cells are
// clickable to set the shift; the <select> remains the accessible control.
function renderHeatmap(
  col: { chiByShift: number[]; bestShift: number },
  current: number,
  onPick: (shift: number) => void
): HTMLElement {
  const finite = col.chiByShift.filter((x) => Number.isFinite(x));
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const wrap = el('div', { class: 'heatmap', 'aria-hidden': 'true', title: 'χ² by shift — brighter is a better fit to English' });
  for (let s = 0; s < 26; s++) {
    const chi = col.chiByShift[s];
    const t = max > min && Number.isFinite(chi) ? 1 - (chi - min) / (max - min) : 0; // 1 = best
    const cell = el('div', {
      class: `heat-cell${s === current ? ' current' : ''}${s === col.bestShift ? ' best' : ''}`,
      style: `background:color-mix(in srgb, var(--accent) ${(t * 100).toFixed(0)}%, transparent)`,
      title: `${indexToLetter(s)} · shift ${s} · χ²=${Number.isFinite(chi) ? chi.toFixed(0) : '∞'}`,
    });
    cell.addEventListener('click', () => onPick(s));
    wrap.append(cell);
  }
  return wrap;
}

function renderQuality(q: ReturnType<typeof plaintextQuality>): HTMLElement {
  const kind = q.label === 'reads as English' ? 'ok' : q.label === 'partially readable' ? 'caution' : 'info';
  const wrap = el('div', { class: `status ${kind}`, style: 'flex-direction:column;align-items:stretch;gap:0.3rem' });
  wrap.append(el('div', {}, [el('span', { class: 'ico', 'aria-hidden': 'true', text: '📖 ' }), el('strong', { text: `English quality: ${q.label}` })]));
  wrap.append(el('div', { class: 'hint', style: 'margin:0', text: `word-hit ${(q.wordHitRate * 100).toFixed(0)}% · common-bigrams ${(q.bigramScore * 100).toFixed(0)}% · IoC ${q.ioc.toFixed(4)} · combined ${(q.combined * 100).toFixed(0)}%` }));
  return wrap;
}

function iocAriaSummary(a: Analysis): string {
  const top = [...a.iocCandidates].sort((x, y) => y.averageIoc - x.averageIoc).slice(0, 3);
  const peaks = a.diagnosis.strongIocPeriods.join(', ') || 'none';
  return `Average index of coincidence by period. Highest at ${top.map((c) => `period ${c.period} (${c.averageIoc.toFixed(4)})`).join(', ')}. English-like peaks at periods: ${peaks}.`;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
