// A replayable explanation of WHY Vigenère fails: once the key length is known,
// every Lth letter is a plain Caesar cipher. Step through the columns to see it,
// and watch how identical plaintext at an aligned offset yields identical
// ciphertext (the Kasiski tell). Toggle between the mathematical and historical
// views. Step-based (not time-based) so it is fully keyboard- and reduced-motion-
// friendly.

import { clear, el, section } from './dom';
import { encrypt, letterToIndex, normalize } from '../vigenere/cipher';

// A tiny fixed demo. "THERED" repeats at offsets 0 and 12 — a spacing of 12, a
// multiple of the key length 3 — so its ciphertext repeats too (the Kasiski tell).
const DEMO_PLAIN = 'THEREDFOXRANTHEREDHEN';
const DEMO_KEY = 'KEY';

export function createExplainer(): HTMLElement {
  const card = section(
    'Why Vigenère fails · replay',
    'The whole break rests on one fact: once you know the key length L, every Lth letter shares one key letter — so each column is an ordinary Caesar cipher.'
  );

  let view: 'math' | 'history' = 'math';
  let spotCol = 0;

  const mathBtn = el('button', { type: 'button', 'aria-pressed': 'true', text: 'The math' });
  const histBtn = el('button', { type: 'button', 'aria-pressed': 'false', text: 'The history' });
  const toggle = el('div', { class: 'toggle-group', role: 'group', 'aria-label': 'explanation view' }, [mathBtn, histBtn]);

  const bodyHost = el('div', { style: 'margin-top:0.8rem' });

  function setView(v: 'math' | 'history') {
    view = v;
    mathBtn.setAttribute('aria-pressed', String(v === 'math'));
    histBtn.setAttribute('aria-pressed', String(v === 'history'));
    render();
  }
  mathBtn.addEventListener('click', () => setView('math'));
  histBtn.addEventListener('click', () => setView('history'));

  const letters = normalize(DEMO_PLAIN);
  const cipher = normalize(encrypt(DEMO_PLAIN, DEMO_KEY).text);
  const L = DEMO_KEY.length;

  function renderMath() {
    const host = el('div');

    host.append(
      el('p', { class: 'hint' }, [
        document.createTextNode('Demo plaintext '),
        el('code', { text: letters }),
        document.createTextNode(' encrypted with the repeating key '),
        el('code', { text: DEMO_KEY }),
        document.createTextNode(` (length ${L}).`),
      ])
    );

    // Aligned strip: plaintext / key / ciphertext, with the spotlighted column lit.
    const wrap = el('div', { class: 'strip-wrap' });
    const strip = el('div', { class: 'strip', role: 'img', 'aria-label': mathAria(spotCol) });
    strip.style.gridTemplateRows = 'repeat(3, auto)';
    strip.style.gridAutoFlow = 'column';
    const labelCol = el('div', { class: 'cell rowlabel' }, [
      el('span', { class: 's', text: 'P' }),
      el('span', { class: 'k', text: 'key' }),
      el('span', { class: 's', text: 'C' }),
    ]);
    strip.append(labelCol);
    for (let i = 0; i < letters.length; i++) {
      const inCol = i % L === spotCol;
      const cell = el('div', {
        class: 'cell',
        style: inCol ? 'background:color-mix(in srgb, var(--accent) 22%, transparent);border-radius:4px' : 'opacity:0.5',
      }, [
        el('span', { text: letters[i] }),
        el('span', { class: 'k', text: DEMO_KEY[i % L] }),
        el('span', { text: cipher[i] }),
      ]);
      strip.append(cell);
    }
    wrap.append(strip);
    host.append(wrap);

    // Column spotlight controls.
    const keyLetter = DEMO_KEY[spotCol];
    const shift = letterToIndex(keyLetter);
    const colLetters = [...cipher].filter((_, i) => i % L === spotCol).join('');
    const caption = el('p', {}, [
      el('strong', { text: `Column ${spotCol + 1} of ${L}: ` }),
      document.createTextNode(
        `every ${ordinal(L)} letter was shifted by the same key letter “${keyLetter}” (shift ${shift}). On its own this column — `
      ),
      el('code', { text: colLetters }),
      document.createTextNode(' — is just a Caesar cipher, crackable by frequency analysis. Solve L of them and you have the key.'),
    ]);
    host.append(caption);

    const controls = el('div', { class: 'controls' }, [
      el('span', { text: 'Spotlight column:' }),
    ]);
    for (let c = 0; c < L; c++) {
      const b = el('button', { type: 'button', 'aria-pressed': String(c === spotCol), text: String(c + 1) });
      b.addEventListener('click', () => {
        spotCol = c;
        render();
      });
      controls.append(b);
    }
    host.append(controls);

    // Kasiski tell.
    host.append(el('hr', { style: 'border:none;border-top:1px solid var(--border);margin:1rem 0' }));
    host.append(el('h3', { style: 'margin:0 0 0.3rem;font-size:1rem', text: 'The Kasiski tell' }));
    const firstIdx = letters.indexOf('THERED');
    const secondIdx = letters.indexOf('THERED', firstIdx + 1);
    const spacing = secondIdx - firstIdx;
    host.append(el('p', { class: 'hint' }, [
      document.createTextNode('The plaintext '),
      el('code', { text: 'THERED' }),
      document.createTextNode(` appears at positions ${firstIdx} and ${secondIdx} — a spacing of ${spacing}, which is ${spacing} = ${L} × ${spacing / L}. Because the gap is a multiple of the key length, both copies line up with the same key letters and encrypt to the SAME ciphertext:`),
    ]));
    host.append(renderKasiskiTell(letters, cipher, firstIdx, secondIdx, 6));
    host.append(el('p', { class: 'hint', text: 'That repeated ciphertext block is exactly what Kasiski looked for: the spacing between repeats betrays a multiple of the key length.' }));

    return host;
  }

  function renderHistory() {
    const host = el('div');
    const items: [string, string][] = [
      ['1553 — Bellaso', 'Giovan Battista Bellaso publishes the repeating-keyword cipher later misattributed to Blaise de Vigenère. It earns the name “le chiffre indéchiffrable.”'],
      ['1586 — Vigenère', 'Blaise de Vigenère describes a stronger autokey variant; history pins the weaker repeating-key version to his name instead.'],
      ['c. 1854 — Babbage', 'Charles Babbage privately breaks Vigenère, reportedly by analysing repeated patterns and per-column frequencies. He never publishes.'],
      ['1863 — Kasiski', 'Friedrich Kasiski publishes the spacing-of-repeats method for recovering the key length — the attack now bears his name.'],
      ['1920s — Friedman', 'William F. Friedman puts cryptanalysis on a statistical footing with the index of coincidence, turning key-length recovery into a measurement.'],
    ];
    const dl = el('div', { class: 'steps' });
    for (const [term, desc] of items) {
      dl.append(el('div', { class: 'step' }, [
        el('h3', { style: 'font-size:1rem;margin:0 0 0.2rem', text: term }),
        el('p', { style: 'margin:0', text: desc }),
      ]));
    }
    host.append(dl);
    host.append(el('p', { class: 'hint', text: 'Three centuries of reputation undone by one structural flaw: the key is short and it repeats.' }));
    return host;
  }

  function mathAria(col: number): string {
    return `Alignment of plaintext, repeating key ${DEMO_KEY}, and ciphertext. Column ${col + 1} of ${L} is spotlighted: every ${ordinal(L)} letter uses key letter ${DEMO_KEY[col]}.`;
  }

  function render() {
    clear(bodyHost);
    bodyHost.append(view === 'math' ? renderMath() : renderHistory());
  }

  card.append(toggle, bodyHost);
  render();
  return card;
}

function renderKasiskiTell(
  plain: string,
  cipher: string,
  a: number,
  b: number,
  len: number
): HTMLElement {
  const row = (label: string, text: string, marks: [number, number][]) => {
    const line = el('div', { class: 'cell', style: 'flex-direction:row;gap:0;font-family:var(--mono)' });
    line.append(el('span', { class: 's', style: 'width:3.5rem;flex:0 0 auto', text: label }));
    let i = 0;
    while (i < text.length) {
      const mark = marks.find(([s]) => s === i);
      if (mark) {
        line.append(el('mark', { class: 'repeat-hl', text: text.slice(mark[0], mark[0] + mark[1]) }));
        i += mark[1];
      } else {
        line.append(document.createTextNode(text[i]));
        i += 1;
      }
    }
    return line;
  };
  const wrap = el('div', { class: 'mono-out', style: 'overflow-x:auto' });
  wrap.append(row('plain', plain, [[a, len], [b, len]]));
  wrap.append(row('cipher', cipher, [[a, len], [b, len]]));
  return wrap;
}

function ordinal(n: number): string {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}
