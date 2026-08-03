import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Functional claims gate. The a11y suite proves the page is reachable; this one
 * proves it is TRUE. Every headline the page prints — the recovered key, the
 * index-of-coincidence peak, the counters, the challenge score, the honest
 * "inconclusive" refusals — is re-derived here from the ciphertext the page is
 * actually showing and compared against what the page rendered. Nothing is
 * asserted against a memorised string where a computed one is available.
 *
 * The Vigenère primitives below are deliberately a SECOND, independent
 * implementation: if src/vigenere and this file ever disagree, one of them is
 * wrong and the suite says so.
 */

const A = 'A'.charCodeAt(0);

function normalize(text: string): string {
  return text.toUpperCase().replace(/[^A-Z]/g, '');
}

/** Vigenère over letters only: c_i = (p_i + k_(i mod L)) mod 26. */
function encryptLetters(plainLetters: string, key: string): string {
  const k = [...normalize(key)].map((c) => c.charCodeAt(0) - A);
  return [...normalize(plainLetters)]
    .map((ch, i) => String.fromCharCode(A + ((ch.charCodeAt(0) - A + k[i % k.length]) % 26)))
    .join('');
}

function decryptLetters(cipherLetters: string, key: string): string {
  const k = [...normalize(key)].map((c) => c.charCodeAt(0) - A);
  return [...normalize(cipherLetters)]
    .map((ch, i) => String.fromCharCode(A + ((ch.charCodeAt(0) - A - k[i % k.length] + 26 * 26) % 26)))
    .join('');
}

/** IoC = Sum n_i (n_i - 1) / (N (N - 1)). */
function indexOfCoincidence(letters: string): number {
  const n = letters.length;
  if (n < 2) return 0;
  const counts = new Array(26).fill(0);
  for (const ch of letters) counts[ch.charCodeAt(0) - A]++;
  let sum = 0;
  for (const c of counts) sum += c * (c - 1);
  return sum / (n * (n - 1));
}

/** Average IoC across the `period` columns (column c = positions = c mod period). */
function averageIocForPeriod(letters: string, period: number): number {
  const cols: string[][] = Array.from({ length: period }, () => []);
  for (let i = 0; i < letters.length; i++) cols[i % period].push(letters[i]);
  let sum = 0;
  let counted = 0;
  for (const col of cols) {
    if (col.length >= 2) {
      sum += indexOfCoincidence(col.join(''));
      counted++;
    }
  }
  return counted === 0 ? 0 : sum / counted;
}

/** Chi-squared of a column decrypted by `shift`, against English frequencies. */
const ENGLISH_FREQ = [
  0.08167, 0.01492, 0.02782, 0.04253, 0.12702, 0.02228, 0.02015, 0.06094, 0.06966, 0.00153,
  0.00772, 0.04025, 0.02406, 0.06749, 0.07507, 0.01929, 0.00095, 0.05987, 0.06327, 0.09056,
  0.02758, 0.00978, 0.0236, 0.0015, 0.01974, 0.00074,
];

function chiSquaredForShift(columnLetters: string, shift: number): number {
  const counts = new Array(26).fill(0);
  for (const ch of columnLetters) counts[ch.charCodeAt(0) - A]++;
  const total = columnLetters.length;
  if (total === 0) return Infinity;
  let chi = 0;
  for (let i = 0; i < 26; i++) {
    const expected = ENGLISH_FREQ[i] * total;
    const diff = counts[(i + shift) % 26] - expected;
    chi += (diff * diff) / expected;
  }
  return chi;
}

/** First number in a DOM string (handles "0.0736 ◆", "Score 40/100", "L=5"). */
function numOf(text: string | null): number {
  const m = (text ?? '').match(/-?\d+(?:\.\d+)?/);
  expect(m, `expected a number in ${JSON.stringify(text)}`).not.toBeNull();
  return Number(m![0]);
}

// ————————————————————————————————————————————————————————————
// Page objects
// ————————————————————————————————————————————————————————————

const cipherCard = (page: Page): Locator => page.locator('section.card').filter({ has: page.locator('#cipher-input') });
const breakCard = (page: Page): Locator => page.locator('section.card').filter({ has: page.locator('#ct-input') });
/** Step 5 (result) is always the last rendered step of the workbench. */
const resultStep = (page: Page): Locator => page.locator('.step').last();
const decryptionOut = (page: Page): Locator => resultStep(page).locator('p.mono-out');

async function open(page: Page): Promise<void> {
  await page.goto('.');
  await expect(page.locator('#app .cl-hero-title')).toBeVisible();
  await expect(page.locator('.keyout')).toBeVisible();
}

async function pickSample(page: Page, id: string): Promise<void> {
  await page.selectOption('#sample-pick', id);
  await expect(page).toHaveURL(new RegExp(`s=${id}`));
}

/** The ciphertext the page is analysing, straight out of the textarea. */
async function ciphertextOf(page: Page): Promise<string> {
  return page.locator('#ct-input').inputValue();
}

/** The IoC chart rows, as the page rendered them. */
async function iocRows(
  page: Page
): Promise<{ period: number; ioc: number; peak: boolean; chosen: boolean }[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.bar-row')).map((row) => {
      const spans = Array.from(row.children).filter((c) => c.tagName === 'SPAN');
      return {
        period: Number((spans[0].textContent ?? '').replace('L=', '')),
        ioc: Number((spans[1].textContent ?? '').replace('◆', '').trim()),
        peak: row.classList.contains('peak'),
        chosen: row.classList.contains('chosen'),
      };
    })
  );
}

// ————————————————————————————————————————————————————————————
// 1. Cipher panel — the encryption the whole demo is about
// ————————————————————————————————————————————————————————————

test.describe('Cipher panel', () => {
  test('ciphertext equals an independent Vigenere encryption of the shown input and key', async ({ page }) => {
    await open(page);
    const card = cipherCard(page);
    const plain = await page.locator('#cipher-input').inputValue();
    const key = await page.locator('#cipher-key').inputValue();
    const shown = (await card.locator('p.mono-out').first().textContent()) ?? '';

    expect(normalize(shown)).toBe(encryptLetters(plain, key));
    // ...and it is genuinely enciphered, not echoed back.
    expect(normalize(shown)).not.toBe(normalize(plain));
    // Non-letters survive in place, so the shape of the text is preserved.
    expect(shown.length).toBe(plain.length);
  });

  test('the alignment strip shows the key repeating under the message, position by position', async ({ page }) => {
    await open(page);
    const key = await page.locator('#cipher-key').inputValue();
    const plain = await page.locator('#cipher-input').inputValue();

    const cells = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.strip .cell:not(.rowlabel)')).map((c) => {
        const s = Array.from(c.querySelectorAll('span')).map((x) => x.textContent ?? '');
        return { in: s[0], key: s[1], shift: Number(s[2]), out: s[3] };
      })
    );

    const letters = normalize(plain);
    expect(cells.length).toBe(letters.length);
    const normKey = normalize(key);
    cells.forEach((cell, i) => {
      expect(cell.in).toBe(letters[i]);
      // The key letter at this position is the repeating keyword.
      expect(cell.key).toBe(normKey[i % normKey.length]);
      expect(cell.shift).toBe(normKey.charCodeAt(i % normKey.length) - A);
      // out = (in + shift) mod 26, recomputed here.
      expect(cell.out).toBe(String.fromCharCode(A + ((cell.in.charCodeAt(0) - A + cell.shift) % 26)));
    });
  });

  test('the character/letter counter matches the text actually in the box', async ({ page }) => {
    await open(page);
    const text = 'Attack at dawn, 07:30 sharp!';
    await page.locator('#cipher-input').fill(text);
    const counts = (await page.locator('#cipher-counts').textContent()) ?? '';
    const [chars, letters] = counts.match(/\d+/g)!.map(Number);
    expect(chars).toBe(text.length);
    expect(letters).toBe(normalize(text).length);
  });

  test('decrypt direction inverts encrypt: ciphertext under the same key returns the plaintext', async ({ page }) => {
    await open(page);
    const card = cipherCard(page);
    const plain = await page.locator('#cipher-input').inputValue();
    const key = await page.locator('#cipher-key').inputValue();
    const ct = (await card.locator('p.mono-out').first().textContent()) ?? '';

    await page.getByRole('button', { name: '← Decrypt' }).click();
    await expect(page.getByRole('button', { name: '← Decrypt' })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#cipher-input').fill(ct);

    const back = (await card.locator('p.mono-out').first().textContent()) ?? '';
    expect(normalize(back)).toBe(normalize(plain));
    expect(normalize(back)).toBe(decryptLetters(ct, key));
  });

  test('a non-letter keyword is refused with a reason, and no output is faked', async ({ page }) => {
    await open(page);
    await page.locator('#cipher-key').fill('L1BERTY');
    const alert = cipherCard(page).locator('[role="alert"]');
    await expect(alert).toHaveText(/letters A.Z only/i);
    // The alignment strip is cleared rather than left showing a stale result.
    await expect(page.locator('.strip .cell')).toHaveCount(0);
  });
});

// ————————————————————————————————————————————————————————————
// 2. The break lands — headline verdict, checked against the page's own numbers
// ————————————————————————————————————————————————————————————

test.describe('Break workbench: the exploit lands (Declaration / ideal case)', () => {
  test('re-encrypting the recovered plaintext under the recovered key reproduces the ciphertext', async ({ page }) => {
    await open(page);
    const ct = await ciphertextOf(page);
    const key = (await page.locator('.keyout').textContent()) ?? '';
    const plaintext = (await decryptionOut(page).textContent()) ?? '';

    expect(key).toMatch(/^[A-Z]+$/);
    // The load-bearing claim: key + plaintext are a genuine solution of THIS
    // ciphertext, verified by re-running the cipher forward independently.
    expect(encryptLetters(plaintext, key)).toBe(normalize(ct));
    expect(decryptLetters(ct, key)).toBe(normalize(plaintext));
  });

  test('the recovered plaintext is real English, not just self-consistent', async ({ page }) => {
    await open(page);
    const plaintext = ((await decryptionOut(page).textContent()) ?? '').toUpperCase();
    for (const word of ['WHEN IN THE COURSE', 'UNALIENABLE RIGHTS']) {
      expect(plaintext).toContain(word);
    }
    // Its IoC sits in English territory, far above uniform-random 1/26.
    expect(indexOfCoincidence(normalize(plaintext))).toBeGreaterThan(0.06);
  });

  test('the recovered key length equals the index-of-coincidence peak the chart marks', async ({ page }) => {
    await open(page);
    const key = (await page.locator('.keyout').textContent()) ?? '';
    const rows = await iocRows(page);
    const peaks = rows.filter((r) => r.peak).map((r) => r.period);
    const chosen = rows.filter((r) => r.chosen).map((r) => r.period);

    expect(chosen).toEqual([key.length]);
    // The fundamental period is the smallest flagged peak; the rest are its multiples.
    expect(Math.min(...peaks)).toBe(key.length);
    expect(peaks.every((p) => p % key.length === 0)).toBe(true);
    // The step-2 verdict names the same length.
    await expect(page.locator('.status', { hasText: /Convergence/ })).toContainText(
      `point to length ${key.length}`
    );
    // ...as does the step-5 length caption.
    await expect(resultStep(page)).toContainText(`(length ${key.length})`);
  });

  test('every IoC number on the chart is the real index of coincidence of that period', async ({ page }) => {
    await open(page);
    const letters = normalize(await ciphertextOf(page));
    const rows = await iocRows(page);
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) {
      expect(row.ioc, `period ${row.period}`).toBeCloseTo(averageIocForPeriod(letters, row.period), 4);
    }
  });

  test('the peak is a real spike: English-like at the key length, near-random at its neighbours', async ({ page }) => {
    await open(page);
    const rows = await iocRows(page);
    const byPeriod = new Map(rows.map((r) => [r.period, r.ioc]));
    const peak = rows.find((r) => r.chosen)!.period;

    expect(byPeriod.get(peak)!).toBeGreaterThan(0.058); // English-like floor
    for (const neighbour of [peak - 1, peak + 1]) {
      expect(byPeriod.get(neighbour)!).toBeLessThan(0.05);
      expect(byPeriod.get(peak)! - byPeriod.get(neighbour)!).toBeGreaterThan(0.017);
    }
  });

  test('each column key letter is the argmin of the chi-squared profile the page prints', async ({ page }) => {
    await open(page);
    const letters = normalize(await ciphertextOf(page));
    const key = (await page.locator('.keyout').textContent()) ?? '';
    const cards = page.locator('.col-card');
    await expect(cards).toHaveCount(key.length);

    for (let i = 0; i < key.length; i++) {
      const card = cards.nth(i);
      // The 26 chi-squared values the page shows in this column's <select>.
      const shown = await card.locator('select option').evaluateAll((opts) =>
        opts.map((o) => Number((o.textContent ?? '').replace(/.*χ²=/, '')))
      );
      const column = [...letters].filter((_, j) => j % key.length === i).join('');
      // Independently recomputed, they must agree...
      shown.forEach((chi, shift) => {
        expect(chi, `col ${i} shift ${shift}`).toBeCloseTo(chiSquaredForShift(column, shift), 0);
      });
      // ...and the letter the page settled on must be the lowest of them.
      const argmin = shown.indexOf(Math.min(...shown));
      expect(await card.locator('.keyletter').textContent()).toBe(String.fromCharCode(A + argmin));
      expect(key[i]).toBe(String.fromCharCode(A + argmin));
    }
  });

  test('the headline verdict is BROKEN and the quality score behind it agrees', async ({ page }) => {
    await open(page);
    await expect(page.locator('.status.alarm', { hasText: /Cipher broken/ })).toContainText(
      /recovered from ciphertext alone/
    );
    const quality = (await page.locator('.status', { hasText: /English quality/ }).textContent()) ?? '';
    expect(quality).toContain('reads as English');
    // "reads as English" is the label for combined >= 60%; check the number it printed.
    const combined = numOf(quality.match(/combined (\d+)%/)![0]);
    expect(combined).toBeGreaterThanOrEqual(60);
    // All four progress-rail stages complete.
    await expect(page.locator('.rail-step.done')).toHaveCount(4);
    await expect(page.locator('.rail-step.fail, .rail-step.pending')).toHaveCount(0);
  });

  test('revealing the true key confirms the recovery against the answer key', async ({ page }) => {
    await open(page);
    const key = (await page.locator('.keyout').textContent()) ?? '';
    await page.getByRole('button', { name: /Reveal true key/ }).click();
    const banner = page.locator('.status', { hasText: /True key/ });
    await expect(banner).toContainText(`True key: ${key}.`);
    await expect(banner).toContainText('Matches your recovery.');
  });

  test('the ciphertext counters describe the ciphertext actually in the box', async ({ page }) => {
    await open(page);
    const ct = await ciphertextOf(page);
    const counts = (await page.locator('#ct-counts').textContent()) ?? '';
    const [chars, letters, other] = counts.match(/\d+/g)!.map(Number);
    expect(chars).toBe(ct.length);
    expect(letters).toBe(normalize(ct).length);
    expect(other).toBe(Math.max(0, ct.length - normalize(ct).length - (ct.match(/\s/g)?.length ?? 0)));
    // No "too short" warning on a 499-letter sample.
    expect(letters).toBeGreaterThan(50);
    await expect(breakCard(page).locator('[role="status"]')).toHaveText('');
  });

  test('the solver transcript narrates the same key it recovered, ending in the break', async ({ page }) => {
    await open(page);
    const key = (await page.locator('.keyout').textContent()) ?? '';
    await page.locator('#run-attack').click();
    const log = page.locator('#transcript .mono-out');
    await expect(log).toContainText('Decryption reads as English', { timeout: 20000 });
    const text = (await log.textContent()) ?? '';
    expect(text).toContain(`Assembled key: ${key}.`);
    expect(text).toContain(`peak at L=${key.length}`);
    for (let i = 0; i < key.length; i++) {
      expect(text).toContain(`Column ${i + 1} → key “${key[i]}”`);
    }
  });
});

// ————————————————————————————————————————————————————————————
// 3. Failure paths — every way the page is allowed to say "no"
// ————————————————————————————————————————————————————————————

test.describe('Failure and honest-refusal paths', () => {
  test('too-short ciphertext: refuses to fabricate a key and says how short it is', async ({ page }) => {
    await open(page);
    await pickSample(page, 'short');

    const letters = normalize(await ciphertextOf(page)).length;
    expect(letters).toBeLessThan(50);
    // No key, no columns — the demo does not guess.
    await expect(page.locator('.keyout')).toHaveCount(0);
    await expect(page.locator('.col-card')).toHaveCount(0);
    // ...and it says exactly why, with the real letter count.
    await expect(resultStep(page).locator('.status')).toContainText(
      `Ciphertext has only ${letters} letters`
    );
    await expect(resultStep(page).locator('.status')).toContainText(/below the ~50 needed/);
    // Kasiski failed first; the rail shows it.
    await expect(page.locator('.rail-step').first()).toHaveClass(/fail/);
    await expect(page.locator('.rail-step.done')).toHaveCount(0);
  });

  test('OTP boundary: no English-like period is flagged when the verdict says there is none', async ({ page }) => {
    await open(page);
    await pickSample(page, 'boundary');

    const banner = page.locator('.status', { hasText: /No period produces an English-like IoC/ });
    await expect(banner).toBeVisible();
    // Regression: the chart used to mark a cluster of near-random periods
    // "English-like ◆" directly above that banner, contradicting it.
    const rows = await iocRows(page);
    expect(rows.filter((r) => r.peak)).toEqual([]);
    expect(await page.locator('.bars[role="img"]').first().getAttribute('aria-label')).toContain(
      'English-like peaks at periods: none'
    );
    // Every flagged-as-none period really is nowhere near English.
    for (const row of rows) expect(row.ioc).toBeLessThan(0.058);
    await expect(resultStep(page).locator('.status')).toContainText(/inconclusive/);
    await expect(page.locator('.keyout')).toHaveCount(0);
  });

  test('non-English plaintext: the key length resolves but the English check still fails', async ({ page }) => {
    await open(page);
    await pickSample(page, 'latin');

    const ct = await ciphertextOf(page);
    const key = (await page.locator('.keyout').textContent()) ?? '';
    const plaintext = (await decryptionOut(page).textContent()) ?? '';
    // The arithmetic is sound — this really is the decryption...
    expect(encryptLetters(plaintext, key)).toBe(normalize(ct));
    // ...but the English model is the wrong one, so the verdict is NOT "broken".
    await expect(page.locator('.status', { hasText: /English quality/ })).not.toContainText(
      'reads as English'
    );
    await expect(page.locator('.status.alarm', { hasText: /Cipher broken/ })).toHaveCount(0);
    await expect(resultStep(page)).toContainText(/not English|Partially readable/i);
    // The final rail stage never completes.
    await expect(page.locator('.rail-step').last()).toHaveClass(/active/);
  });

  test('a wrong key-length hypothesis produces garbage and the page says so', async ({ page }) => {
    await open(page);
    const trueKey = (await page.locator('.keyout').textContent()) ?? '';
    const wrongLength = trueKey.length + 2;

    await page.selectOption('#key-length-select', String(wrongLength));
    await expect(page.locator('.keyout')).toHaveText(new RegExp(`^[A-Z]{${wrongLength}}$`));
    await expect(page.locator('.col-card')).toHaveCount(wrongLength);

    const ct = await ciphertextOf(page);
    const key = (await page.locator('.keyout').textContent()) ?? '';
    const plaintext = (await decryptionOut(page).textContent()) ?? '';
    // Still arithmetically the decryption under the shown key...
    expect(encryptLetters(plaintext, key)).toBe(normalize(ct));
    // ...but it is not English and the page does not claim a break.
    expect(plaintext.toUpperCase()).not.toContain('WHEN IN THE COURSE');
    await expect(page.locator('.status.alarm', { hasText: /Cipher broken/ })).toHaveCount(0);
    await expect(page.locator('.status', { hasText: /English quality/ })).toContainText(
      /gibberish|partially readable/i
    );
    // Confidence drops off the "high" rung.
    await expect(page.locator('.conf-badge')).not.toContainText('high');

    await page.getByRole('button', { name: /Reveal true key/ }).click();
    await expect(page.locator('.status', { hasText: /True key/ })).toContainText(
      `True key: ${trueKey}. Does not match yet`
    );
  });

  test('tampering with a single column shift breaks the key and is labelled as manual', async ({ page }) => {
    await open(page);
    const trueKey = (await page.locator('.keyout').textContent()) ?? '';
    const col = page.locator('.col-card').first();
    const wrongShift = (trueKey.charCodeAt(0) - A + 7) % 26;

    await col.locator('select').selectOption(String(wrongShift));

    const tampered = (await page.locator('.keyout').textContent()) ?? '';
    expect(tampered[0]).toBe(String.fromCharCode(A + wrongShift));
    expect(tampered.slice(1)).toBe(trueKey.slice(1));
    // The override is disclosed, not silently absorbed.
    await expect(col.locator('.chip')).toHaveText(/manual/);
    await expect(col.locator('.keyletter')).toHaveClass(/overridden/);
    // The plaintext degrades but stays a true decryption of the shown key.
    const plaintext = (await decryptionOut(page).textContent()) ?? '';
    expect(encryptLetters(plaintext, tampered)).toBe(normalize(await ciphertextOf(page)));
    expect(plaintext.toUpperCase()).not.toContain('WHEN IN THE COURSE');
    await page.getByRole('button', { name: /Reveal true key/ }).click();
    await expect(page.locator('.status', { hasText: /True key/ })).toContainText('Does not match yet');

    // Restoring the solver's own answer clears the manual flag.
    await col.locator('select').selectOption(String(trueKey.charCodeAt(0) - A));
    await expect(page.locator('.keyout')).toHaveText(trueKey);
    await expect(col.locator('.chip')).toHaveCount(0);
  });

  test('custom short ciphertext warns before it fails, with the real letter count', async ({ page }) => {
    await open(page);
    await page.locator('#ct-input').fill('QWERTY ZXCVBN');
    await expect(page.locator('#ct-counts')).toHaveText('13 characters · 12 letters (analysed) · 0 punctuation/digits');
    await expect(breakCard(page).locator('[role="status"]')).toHaveText(/Only 12 letters/);
    await expect(page.locator('.keyout')).toHaveCount(0);
    await expect(resultStep(page).locator('.status')).toContainText('only 12 letters');
  });

  test('mostly-punctuation input is called out rather than silently analysed', async ({ page }) => {
    await open(page);
    const junk = '1234567890!@#$%^&*()1234567890!@#$%^&*()1234567890AB';
    await page.locator('#ct-input').fill(junk);
    await expect(breakCard(page).locator('[role="status"]')).toHaveText(
      /Most of this input is non-letters/
    );
    const counts = (await page.locator('#ct-counts').textContent()) ?? '';
    expect(counts.match(/\d+/g)!.slice(0, 2).map(Number)).toEqual([junk.length, 2]);
  });

  test('clearing the ciphertext leaves no recovered key behind', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.locator('#ct-input')).toHaveValue('');
    await expect(page.locator('.keyout')).toHaveCount(0);
    await expect(page.locator('.col-card')).toHaveCount(0);
  });
});

// ————————————————————————————————————————————————————————————
// 4. Challenge mode — the score is a counter, so check its arithmetic
// ————————————————————————————————————————————————————————————

test.describe('Challenge mode', () => {
  test('the key is hidden until submitted, and the counters track what you set', async ({ page }) => {
    await open(page);
    const keyLength = ((await page.locator('.keyout').textContent()) ?? '').length;
    await page.getByRole('button', { name: /Challenge/ }).click();

    await expect(page.locator('.keyout')).toHaveCount(0);
    const letters = await page.locator('.col-card .keyletter').allTextContents();
    expect(letters).toEqual(new Array(keyLength).fill('?'));
    // Chi-squared values are withheld too, or the "solve it yourself" is free.
    await expect(page.locator('.col-card').first().locator('select option').first()).toHaveText(
      'A (shift 0)'
    );
    await expect(resultStep(page)).toContainText(`Columns set: 0/${keyLength} · hints used: 0`);

    await page.locator('.col-card').first().getByRole('button', { name: /Hint/ }).click();
    await expect(page.locator('.col-card').first().locator('.keyletter')).not.toHaveText('?');
    await expect(resultStep(page)).toContainText(`Columns set: 1/${keyLength} · hints used: 1`);
  });

  test('solving every column by hand with no hints scores a perfect 100', async ({ page }) => {
    await open(page);
    // Learn the answer in explore mode, then solve the challenge with it.
    const key = (await page.locator('.keyout').textContent()) ?? '';
    await page.getByRole('button', { name: /Challenge/ }).click();

    for (let i = 0; i < key.length; i++) {
      await page.locator('.col-card').nth(i).locator('select').selectOption(String(key.charCodeAt(i) - A));
    }
    await expect(resultStep(page)).toContainText(`Columns set: ${key.length}/${key.length} · hints used: 0`);
    await page.getByRole('button', { name: 'Submit solution' }).click();

    await expect(page.locator('.keyout')).toHaveText(key);
    const score = page.locator('.status', { hasText: /^.?Score/ });
    await expect(score).toContainText('Score 100/100 (A)');
    await expect(score).toContainText(`${key.length} columns · 0 hint(s) · ${key.length} manual solve(s)`);
    await expect(score).toContainText('Plaintext reads as English — solved!');
  });

  test('hints are charged at 12 points each, exactly as the score claims', async ({ page }) => {
    await open(page);
    const key = (await page.locator('.keyout').textContent()) ?? '';
    await page.getByRole('button', { name: /Challenge/ }).click();

    const hints = 2;
    for (let i = 0; i < hints; i++) {
      await page.locator('.col-card').nth(i).getByRole('button', { name: /Hint/ }).click();
    }
    // Solve the rest by hand so the plaintext still reads as English (base 100).
    for (let i = hints; i < key.length; i++) {
      await page.locator('.col-card').nth(i).locator('select').selectOption(String(key.charCodeAt(i) - A));
    }
    await page.getByRole('button', { name: 'Submit solution' }).click();

    const expected = 100 - 12 * hints;
    const score = page.locator('.status', { hasText: /^.?Score/ });
    await expect(score).toContainText(`Score ${expected}/100`);
    await expect(score).toContainText(`${hints} hint(s) · ${key.length - hints} manual solve(s)`);
    await expect(page.locator('.keyout')).toHaveText(key);
  });
});

// ————————————————————————————————————————————————————————————
// 5. Shareable state — the README promises a linkable workbench
// ————————————————————————————————————————————————————————————

test('the URL hash round-trips the ciphertext, hypothesis and overrides', async ({ page }) => {
  await open(page);
  await pickSample(page, 'holmes');
  const key = (await page.locator('.keyout').textContent()) ?? '';
  await page.selectOption('#key-length-select', String(key.length));
  await page.locator('.col-card').first().locator('select').selectOption('0');

  const hash = new URL(page.url()).hash;
  expect(hash).toContain('s=holmes');
  expect(hash).toContain(`kl=${key.length}`);
  expect(hash).toContain('ov=0.0');

  await page.reload();
  await expect(page.locator('.keyout')).toHaveText('A' + key.slice(1));
  await expect(page.locator('.col-card').first().locator('.chip')).toHaveText(/manual/);
  await expect(page.locator('#sample-pick')).toHaveValue('holmes');
});
