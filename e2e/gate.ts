import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 };

/**
 * Shared machinery for the WCAG gate.
 *
 * Five rules govern everything here, each one a correction of a specific thing
 * the gate this replaces did.
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. `killMotion()` pushed
 *     `transition:none!important; animation:none!important;
 *     caret-color:transparent!important` through `addStyleTag`. That BYPASSED
 *     `style.css`'s own `@media (prefers-reduced-motion: reduce)` block instead
 *     of exercising it — and on this page the difference is not cosmetic,
 *     because the preference changes what the lab DOES, not just how it looks.
 *     `breakWorkbench.ts` reads `matchMedia('(prefers-reduced-motion: reduce)')`
 *     once at module load into `REDUCED_MOTION`, and `runAttack()` branches on
 *     it: with the preference set, the whole solver transcript is appended in
 *     one synchronous pass; without it, lines are revealed one at a time behind
 *     `await delay(280)` and `#run-attack` is `disabled` for the duration. A
 *     stylesheet injection cannot touch a `setTimeout` loop, so the old gate
 *     always drove the animated branch and then scanned whatever fraction of the
 *     transcript had been written by the time it got there. `boot` asks for the
 *     preference and ASSERTS it took effect, so the transcript is complete and
 *     the same on every run.
 *
 *  2. IT FORCE-OPENED EVERY DISCLOSURE FROM SCRIPT. `openAllDetails()` set
 *     `d.open = true` on every `<details>` on the page. Those are the two
 *     `details.aria-table` text equivalents — the repeats/spacings table under
 *     Step 1 and the IoC-by-period table under Step 2 — and setting `.open`
 *     bypasses the `<summary>` that is the only route a reader has. This gate
 *     clicks the summary and asserts the `open` attribute appeared.
 *
 *  3. IT SCANNED ONCE, AT ONE VIEWPORT, AFTER ONE DRIVE. `driveDemos()` ran the
 *     attack, flipped to challenge mode, ran it again, flipped back to explore,
 *     ran it a third time — and only THEN scanned. Every state it built was
 *     overwritten by the next click before anything measured it, and the single
 *     surviving state was "explore mode, default sample, attack run". Six of the
 *     seven bundled scenarios, both explainer views, the tabula recta
 *     highlighting, every manual override, the challenge score, the empty state
 *     and the entire 380px column had never been scanned at all. This gate scans
 *     after every step, in {dark, light} x {1280, 380}.
 *
 *  4. `violations` IS NOT THE WHOLE ORACLE. See `scan`. Three things on this
 *     page are invisible to a violations-only assertion in particular: the
 *     `color-mix()` surfaces every verdict lands on, which axe files under
 *     `incomplete`; the explainer strip's inline `opacity: 0.5`, which axe reads
 *     through to the undimmed declared colour; and an `aria-label` on a
 *     role-less element, which is PROHIBITED and lands in `incomplete` too,
 *     never in `violations`.
 *
 *  5. IT HAD NO REFLOW, KEYBOARD-SCROLLER OR NON-TEXT ORACLE, and this page
 *     needs all three. It is built out of scrollers — `.strip-wrap`,
 *     `.tableau-wrap`, the transcript log, the highlighted-ciphertext region —
 *     and several of them only overflow at phone width, so the 2.1.1 question
 *     about them exists only in a viewport the old gate never opened.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Transitions drain in waves, not in one batch, so a poll for "nothing running
 * right now" can exit through a gap between waves. Require quiescence to hold
 * for several consecutive frames instead.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __quietFrames?: number };
      const running = document.getAnimations().filter((a) => a.playState === 'running');
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      return w.__quietFrames >= 6;
    },
    undefined,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure mode this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion block
 * cancels that animation without restoring its end state — the element then
 * renders at `opacity: 0` for every reader with the preference set.
 *
 * This page cannot currently be in that shape, and the assertion is what makes
 * that a measurement rather than a reading: `style.css` declares no
 * `@keyframes` and no `animation` property anywhere, and its reduced-motion
 * block sets only `transition: none` and `animation: none`. The check runs in
 * every state regardless, because all of those are properties of the current
 * stylesheet rather than of the page, and this is the cheapest place to catch
 * the first exception.
 *
 * `aria-hidden` subtrees are excluded. The cost of that exclusion is stated
 * plainly: text removed from the accessibility tree AND painted at zero opacity
 * is not checked here — which on this page would mean the status-banner glyphs,
 * the rail marks and the confidence dots, all of which sit beside the words
 * that carry their meaning (see the header of `contrast.ts`).
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      // Deliberately hidden subtrees are not "blank", they are closed.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Uncaught page errors and console errors, collected from the moment the page
 * is created. A renderer that throws halfway through leaves an earlier state on
 * screen, and a gate that scans that state reports green for a page that is
 * broken. Attach before `boot`, assert after the drive.
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/**
 * Exactly one banner landmark: the shared bar.
 *
 * This page puts its hero INSIDE `<main id="app">` — `main.ts` appends a
 * `<header class="cl-hero">` as the first child of the mount point — which
 * scopes that `<header>` out of the banner role on its own, and `index.html`'s
 * `dedupeBanner()` skips it for that same reason (`el.closest('main, …')`
 * returns early). So nothing here demotes anything; the single banner is a
 * property of the markup. Asserting the OUTCOME rather than either mechanism
 * means a change to the nesting is caught too.
 */
export async function assertSingleBanner(page: Page): Promise<void> {
  const banners = await page.evaluate(() => {
    const scoped = new Set(['MAIN', 'ARTICLE', 'ASIDE', 'NAV', 'SECTION']);
    const isBanner = (el: Element): boolean => {
      if (el.getAttribute('role') === 'banner') return true;
      if (el.tagName !== 'HEADER') return false;
      if (el.getAttribute('role')) return false; // explicit non-banner role wins
      for (let p = el.parentElement; p; p = p.parentElement) if (scoped.has(p.tagName)) return false;
      return true;
    };
    return [...document.querySelectorAll('header,[role="banner"]')].filter(isBanner).length;
  });
  expect(banners, 'exactly one banner landmark').toBe(1);
}

/**
 * Load the page in a known theme with reduced motion actually in effect, and
 * assert the content every scan relies on is really on the page — including the
 * lab's DEFAULTS, which are never assumed.
 *
 * `test.use({ reducedMotion })` silently does nothing on Playwright 1.61.1, so
 * the emulation is applied imperatively BEFORE the navigation and then
 * *asserted* from inside the page. On this page an emulation that silently did
 * nothing would change the lab's BEHAVIOUR, not merely its look: `runAttack()`
 * branches on a `REDUCED_MOTION` constant captured at module load, and without
 * the preference the solver transcript is written one line per 280ms with
 * `#run-attack` disabled throughout. Every transcript assertion in the drive
 * depends on the synchronous branch, so the preference is asserted twice — once
 * as `matchMedia`, and once as its visible consequence on `.cl-btn`, whose
 * `transition` the stylesheet's reduced-motion block is what cancels.
 *
 * The theme is seeded through `localStorage` rather than by clicking the toggle,
 * which also pins down a real failure mode: `index.html`'s anti-flash script
 * reads `localStorage.getItem('theme')` and the shared bar's toggle writes
 * `localStorage.setItem('theme', …)`. If those keys drift apart the theme
 * silently stops persisting, and this boot fails on `data-theme` rather than
 * quietly scanning dark twice.
 *
 * The defaults are asserted at length because THIS LAB SHIPS ALREADY SOLVED.
 * Unlike most in this fleet it does not wait to be driven: `createBreakWorkbench`
 * calls `render()` during construction, so the arrival state already contains a
 * completed break of the Declaration sample — the Kasiski repeats, the IoC
 * chart, five recovered columns, the recovered key and the decrypted plaintext.
 * Which half of the lab's behaviour a gate measures therefore depends entirely
 * on what it assumes about that first render, and the shipped values are the
 * ones every ratio below is measured against.
 */
export async function boot(page: Page, theme: 'dark' | 'light'): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the whole
  // test timeout and reports nothing useful. 20s turns that silent hang into a
  // named failure naming the locator.
  page.setDefaultTimeout(20_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await assertSingleBanner(page);

  // The reduced-motion block's visible consequence, asserted rather than
  // assumed. `.cl-btn` declares `transition: background .15s, border-color
  // .15s, color .15s` in the shared header's inline <style>; the only thing
  // that can zero it is `style.css`'s `@media (prefers-reduced-motion: reduce)`
  // block. If the emulation were a no-op this reads `0.15s`.
  expect(
    await page.evaluate(() => getComputedStyle(document.querySelector('.cl-btn')!).transitionDuration),
    "reduced motion must cancel the shared bar's transitions"
  ).toBe('0s');

  // Everything below is mounted by `src/main.ts`, so a navigation that resolves
  // proves nothing.
  await expect(page.locator('#app .cl-hero-title')).toHaveText('Vigenère Break');
  await expect(page.locator('#app section.card')).toHaveCount(3);

  // ── Cipher panel defaults ────────────────────────────────────────────────
  await expect(page.locator('#cipher-input')).toHaveValue(
    'We hold these truths to be self evident'
  );
  await expect(page.locator('#cipher-key')).toHaveValue('LIBERTY');
  await expect(dirBtn(page, 'Encrypt')).toHaveAttribute('aria-pressed', 'true');
  await expect(dirBtn(page, 'Decrypt')).toHaveAttribute('aria-pressed', 'false');
  // The tabula recta ships collapsed behind its own disclosure button.
  await expect(page.locator('button.reveal-tableau')).toHaveText('Show tabula recta');
  await expect(page.locator('button.reveal-tableau')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.tableau-wrap')).toBeHidden();

  // ── Break workbench defaults ─────────────────────────────────────────────
  await expect(page.locator('#sample-pick')).toHaveValue('declaration');
  await expect(page.locator('#max-kl')).toHaveValue('20');
  await expect(modeBtn(page, 'Explore')).toHaveAttribute('aria-pressed', 'true');
  await expect(modeBtn(page, 'Challenge')).toHaveAttribute('aria-pressed', 'false');
  // The transcript is the ONE thing that ships absent — and `[hidden]` is
  // specificity (0,1,0), the same as a class, so a later `.foo { display: … }`
  // would silently defeat it. Read the computed value rather than trusting the
  // attribute; seven labs in this fleet had exactly that collision.
  await expect(page.locator('#transcript')).toBeHidden();
  expect(
    await page.evaluate(() => getComputedStyle(document.querySelector('#transcript')!).display),
    '[hidden] must actually resolve to display:none on #transcript'
  ).toBe('none');

  // ── The break that is ALREADY on screen at first paint ───────────────────
  // `createBreakWorkbench` renders during construction, so the arrival state is
  // a completed attack on the Declaration sample. This is the state a reader
  // meets, and it is the one the old gate never measured on its own.
  await expect(page.locator('.keyout')).toHaveText('LEMON');
  await expect(page.locator('.col-card')).toHaveCount(5);
  await expect(page.locator('.rail-step')).toHaveCount(4);
  await expect(page.locator('.rail-step.done')).toHaveCount(4);

  // Both text-equivalent tables ship shut.
  await expect(page.locator('details.aria-table')).toHaveCount(2);
  await expect(page.locator('details[open]')).toHaveCount(0);

  // Explainer ships on the maths view with column 1 spotlighted.
  await expect(viewBtn(page, 'The math')).toHaveAttribute('aria-pressed', 'true');
  await expect(viewBtn(page, 'The history')).toHaveAttribute('aria-pressed', 'false');

  await settle(page);
  await expectNotBlank(page, `${theme} first paint`);
}

/** The cipher panel's direction toggle. */
function dirBtn(page: Page, name: 'Encrypt' | 'Decrypt') {
  return page.locator('.toggle-group[aria-label="cipher direction"] button', {
    hasText: name,
  });
}
/** The workbench's explore/challenge toggle. */
function modeBtn(page: Page, name: 'Explore' | 'Challenge') {
  return page.locator('.toggle-group[aria-label="workbench mode"] button', { hasText: name });
}
/** The explainer's math/history toggle. */
function viewBtn(page: Page, name: 'The math' | 'The history') {
  return page.locator('.toggle-group[aria-label="explanation view"] button', { hasText: name });
}
/** The cipher panel, which is the first of the three `<section class="card">`s. */
function cipherCard(page: Page) {
  return page.locator('#app section.card').first();
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all, and this page is
 * the shape that breaks it: a 26x26 tabula recta, three alignment strips whose
 * width is one 1.5rem grid column per ciphertext letter, a seven-card column
 * grid, and two data tables. Each of those is meant to scroll inside its own
 * wrapper; the assertion here is that none of them scrolls the DOCUMENT.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide box inside an `overflow-x: auto` wrapper has a huge bounding rect but
    // is clipped by its scroller and contributes nothing to the document's
    // scroll width — naming it sends you off fixing the wrong element. This page
    // has a decoy behind every `.strip-wrap` and `.tableau-wrap`.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1). If
 * it holds no focusable content it needs `tabindex="0"`, so it becomes a focus
 * target arrow keys can then scroll.
 *
 * This lab is unusually dependent on the check because scrolling IS how it shows
 * its evidence: the alignment strips, the tabula recta, the highlighted
 * ciphertext and the solver transcript are all wider or taller than their box.
 * Several of them only overflow at phone width, so a desktop-only gate cannot
 * see the failure at all.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return (
          ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY)
        );
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * Anything focusable must show WHERE the focus is (WCAG 2.4.7).
 *
 * This is here because the fix for a 2.1.1 scroller failure is to add
 * `tabindex="0"`, and elsewhere in this sweep one such pass made seven regions
 * focusable and left every one of them without a focus indicator — a defect
 * introduced by the fix for another defect. This lab has four such regions
 * (`.strip-wrap`, `.tableau-wrap`, the transcript log, the highlighted
 * ciphertext), so the trap is live rather than theoretical.
 *
 * The measurement is a real focus, not a reading of the stylesheet: focus each
 * candidate and require that SOMETHING about its painted box changed —
 * `outline`, `box-shadow` or `border`. `style.css`'s `:focus-visible` rule
 * paints a 3px `--accent` outline, but a rule's existence is not evidence that
 * it reaches a given element; only focusing it is.
 *
 * THE `page.keyboard.press('Tab')` BELOW IS THE WHOLE CHECK, not tidying. The
 * first version of this oracle called `el.focus()` straight from `evaluate` and
 * reported all four of this lab's `tabindex` regions as having no focus
 * indicator. They do have one. Chromium only matches `:focus-visible` on a
 * programmatic `focus()` once its heuristic has seen a keyboard interaction, so
 * an unprimed run measures plain `:focus` — under which the computed outline
 * here is `rgb(236,233,243) none 3px`, style `none`, i.e. nothing painted.
 * Measured directly: unprimed, `.tableau-wrap.matches(':focus-visible')` is
 * `false`; after one real Tab keypress it is `true` and the outline resolves to
 * `rgb(126,87,194) solid 3px`, which is `--accent`. Tabbing to the element for
 * real (43 presses) gives the identical result, so the primed shortcut measures
 * what a keyboard reader sees. An oracle that cannot tell "no focus ring" from
 * "wrong kind of focus" invents defects, and inventing four of them here would
 * have sent a fix at a stylesheet that was already correct.
 */
export async function expectFocusVisible(page: Page, label: string): Promise<void> {
  await page.keyboard.press('Tab');
  const missing = await page.evaluate(() => {
    const snap = (el: Element): string => {
      const cs = getComputedStyle(el);
      return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.border].join('|');
    };
    const out: string[] = [];
    const active = document.activeElement;
    // Blur first. Without this the element that ALREADY holds focus is snapped
    // with its ring up, focused again (no change), and reported as having no
    // indicator — which is what happened in the one state where the priming Tab
    // happened to land on `.strip-wrap`. One false positive in one state out of
    // twenty-six is exactly the shape of finding that gets chased into a fix
    // for a defect that does not exist.
    (active as HTMLElement | null)?.blur?.();
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>('[tabindex]:not([tabindex="-1"])')
    )) {
      if (!el.checkVisibility?.()) continue;
      const before = snap(el);
      el.focus();
      const after = snap(el);
      el.blur();
      if (before === after) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    if (active instanceof HTMLElement) active.focus();
    return Array.from(new Set(out));
  });
  expect(missing, `focusable elements with no visible focus indicator in state: ${label}`).toEqual(
    []
  );
}

/**
 * SC 1.4.11 (non-text contrast) for interactive controls: a control's boundary
 * has to be perceivable against what surrounds it.
 *
 * The aim of this check is the whole point of it. `style.css` defines a
 * dedicated control-boundary token, `--border-strong`, with a comment naming
 * the exact ratios it clears — and applies it to ONE rule,
 * `textarea, input[type="text"], select`. Every other delineated thing on the
 * page draws its edge from `--border`, which the same comment describes as
 * being "for decorative rules". `grep -c` puts the ratio at 1:14. A 1.4.11
 * check aimed at fields would therefore have queried precisely the three
 * selectors where the correct token was already applied, confirmed itself, and
 * measured nothing — the exact self-confirming shape found in three other repos
 * in this sweep. So this queries every control-shaped element instead.
 *
 * A control passes if EITHER
 *   - its fill differs from the surface behind it (how `button.primary` works:
 *     an `--accent` fill on a `--surface` card), or
 *   - it has a border that stands out from the surface behind it AND from its
 *     own fill (how a `<select>` works: a near-panel fill with a drawn edge).
 * so the score is `max(fill-vs-outside, min(border-vs-outside, border-vs-fill))`.
 * Taking the max of the two mechanisms is what keeps this from failing a
 * perfectly delineated solid button for having no border.
 *
 * Two deliberate exclusions:
 *  - `disabled` controls. WCAG exempts inactive components, and this page
 *    disables a column's Hint button once that hint has been spent.
 *  - anything outside `#app`. The shared top bar is not this lab's to change —
 *    every repo in the fleet carries a byte-identical copy — and its `.cl-btn`
 *    boundary (`color-mix(in srgb, var(--accent) 38%, transparent)` over the
 *    bar's fixed `#0b1512`) is measured and ratcheted by `nontext.ts` instead,
 *    and reported upward. Written down here so the exclusion is a decision and
 *    not an oversight.
 */
export async function auditControlBoundaries(
  page: Page
): Promise<Array<{ sel: string; ratio: number }>> {
  return page.evaluate(() => {
    type C = { r: number; g: number; b: number; a: number };
    // Resolve through a canvas rather than a regex: this palette is full of
    // `color-mix()`, which `getComputedStyle` reports unchanged and which a
    // regex reads as null — landing the walk on the wrong backdrop.
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    const parse = (s: string): C => {
      if (!s) return { r: 0, g: 0, b: 0, a: 0 };
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = s;
      const a = ctx.fillStyle;
      ctx.fillStyle = '#fff';
      ctx.fillStyle = s;
      if (a !== ctx.fillStyle) return { r: 0, g: 0, b: 0, a: 0 };
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = s;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    };
    const over = (fg: C, bg: C): C => {
      const a = fg.a + bg.a * (1 - fg.a);
      if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
        g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
        b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
        a,
      };
    };
    const lum = (c: C): number => {
      const f = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a: C, b: C): number => {
      const la = lum(a);
      const lb = lum(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    const backdrop = (start: Element | null): C => {
      const stack: C[] = [];
      for (let n = start; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c.a > 0) {
          stack.push(c);
          if (c.a >= 1) break;
        }
      }
      let out: C = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = stack.length - 1; i >= 0; i--) out = over(stack[i], out);
      return out;
    };
    const describe = (el: Element): string => {
      const cls = el.getAttribute('class');
      return (
        el.tagName.toLowerCase() +
        (el.id ? `#${el.id}` : '') +
        (cls ? `.${cls.trim().split(/\s+/).join('.')}` : '')
      );
    };

    const out: Array<{ sel: string; ratio: number }> = [];
    const app = document.getElementById('app');
    if (!app) return out;
    app
      .querySelectorAll<HTMLElement>("button, select, textarea, input[type='text'], input[type='number']")
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if ((el as HTMLButtonElement).disabled) return;
        if (el.closest('[hidden]')) return;
        const cs = getComputedStyle(el);
        const outside = backdrop(el.parentElement);
        const fillRaw = parse(cs.backgroundColor);
        const fill = fillRaw.a > 0 ? over(fillRaw, outside) : outside;
        const byFill = ratio(fill, outside);
        let byBorder = 1;
        if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') {
          const border = over(parse(cs.borderTopColor), fill);
          byBorder = Math.min(ratio(border, outside), ratio(border, fill));
        }
        out.push({
          sel: describe(el),
          ratio: Math.round(Math.max(byFill, byBorder) * 100) / 100,
        });
      });
    return out;
  });
}

/**
 * When `A11Y_COLLECT` is set, `scan` records failures instead of throwing.
 *
 * A strict gate reports the first failing assertion in the first failing state
 * and stops, so a page with defects in several states needs one full run per
 * defect to enumerate them. The collection pass turns that into a single run. It
 * is a debugging aid only: `A11Y_COLLECT` is never set in CI or in the committed
 * workflow, and a run with it set prints every finding as it happens and then
 * fails at the end, so a green collection run cannot be mistaken for a green
 * gate.
 */
const COLLECTING = !!process.env.A11Y_COLLECT;
const collected: string[] = [];

function record(entry: string): void {
  collected.push(entry);
  // Printed as it happens, not only at the end: a hard assertion later in the
  // drive would otherwise abort the test before anything collected so far was
  // ever shown.
  console.log(`\n[A11Y_COLLECT #${collected.length}] ${entry}`);
}

export function softExpect(actual: unknown, message: string, expected: unknown): void {
  if (!COLLECTING) {
    expect(actual, message).toEqual(expected);
    return;
  }
  try {
    expect(actual, message).toEqual(expected);
  } catch {
    record(`${message}\n  ${JSON.stringify(actual, null, 2)}`);
  }
}

/**
 * Fail the test if the collection pass recorded anything. Without this a
 * collection run would end green, and a green collection run is
 * indistinguishable from a green gate — which is the exact confusion the whole
 * exercise exists to remove.
 */
export function reportCollected(): void {
  if (!COLLECTING) return;
  expect(collected, `A11Y_COLLECT recorded ${collected.length} failure(s)`).toEqual([]);
}

async function soft(fn: () => Promise<void>): Promise<void> {
  if (!COLLECTING) return fn();
  try {
    await fn();
  } catch (e) {
    record(String(e).slice(0, 6000));
  }
}

/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle inside `#app`: axe has no rule for non-text
 * contrast, and the arithmetic text walk cannot reach a control's boundary or a
 * `::before` glyph, because a pseudo-element is not an element and owns no text
 * node.
 *
 * The backlog is real, so this does not block on it — but a check that merely
 * logs is not a gate, and this sweep has spent its whole length deleting checks
 * that could not fail. So it ratchets instead: anything NOT in the baseline
 * fails, anything in the baseline that got WORSE fails, and anything in the
 * baseline that has been FIXED fails until its entry is deleted. That last rule
 * is what stops the allowlist becoming a permanent exemption.
 *
 * It is called from `scan()`, at every driven state. That placement is the whole
 * point: in the gate this pattern came from it was reachable only from inside a
 * `if (!COLLECTING) return …` guard, so it never executed in a strict run and
 * every "no new non-text failures" claim was vacuous.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  // Capture mode: emit every finding and assert nothing, so a baseline can be
  // generated by the SAME path that checks it.
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(
        `NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`
      );
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(
        `NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`
      );
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(`WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`);
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — in which case delete the entry, which is the point
 * — or the drive stopped reaching the state that shows it, which is a coverage
 * regression worth knowing about. Call once, after `driveAllStates`.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)'
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands.
 *
 * Eight assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - reduced-motion end state — see `expectNotBlank`.
 *  - `violations` — the usual WCAG A/AA rule failures, plus three landmark
 *    best-practice rules `withTags` does not run on its own.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those ratios
 *    arithmetically — which matters here, since every verdict surface on the
 *    page is a `color-mix()` axe declines to resolve. Everything else in that
 *    bucket is a real result axe simply could not finish — including
 *    `aria-prohibited-attr`, which is where an `aria-label` on a role-less
 *    element hides, a defect that never reaches the violations array at all.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node,
 *    including the explainer strip's `opacity: 0.5` cells, which axe reads
 *    through.
 *  - non-text contrast for interactive controls — SC 1.4.11, which axe has no
 *    rule for; see `auditControlBoundaries`.
 *  - the 1.4.11 / generated-content ratchet over the whole page, shared bar
 *    included.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - a visible focus indicator on everything given `tabindex` — WCAG 2.4.7.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);
  // TWO axe runs, deliberately, and this is not a style choice.
  //
  // `AxeBuilder.withTags()` and `AxeBuilder.withRules()` both write the same
  // `options.runOnly` field, so the second call SILENTLY REPLACES the first —
  // the axe-core/playwright source says so in as many words on `withRules`
  // ("Cannot be used with AxeBuilder#withTags"). Chained as
  // `.withTags(TAGS).withRules([...landmark rules])`, axe therefore runs those
  // few best-practice rules and NOT ONE WCAG RULE, while a green result reads
  // exactly like a full A/AA pass. For scale, `withTags(TAGS)` selects 69 of
  // axe-core 4.12's 105 rule definitions; the chained form executes 4.
  //
  // Running the two sets separately and merging is the only way to have both.
  // The landmark rules are still wanted because they are best-practice rather
  // than WCAG-tagged, so `withTags` alone does not reach them — and this page
  // has the exact shape they catch: a shared sticky `<header role="banner">`
  // above a `<main id="app">` that contains a second `<header class="cl-hero">`.
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const landmarks = await new AxeBuilder({ page })
    .withRules(['landmark-no-duplicate-banner', 'landmark-unique', 'landmark-one-main'])
    .analyze();
  const results = {
    violations: [...wcag.violations, ...landmarks.violations],
    incomplete: [...wcag.incomplete, ...landmarks.incomplete],
  };

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  softExpect(violations, `axe violations in state: ${label}`, []);

  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  softExpect(unexplainedIncomplete, `axe incomplete results in state: ${label}`, []);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  softExpect(contrast, `measured contrast failures in state: ${label}`, []);

  const boundaries = await auditControlBoundaries(page);
  expect(boundaries.length, `no controls found to measure in state: ${label}`).toBeGreaterThan(0);
  const undelineated = Array.from(
    new Set(boundaries.filter((b) => b.ratio < 3).map((b) => `${b.ratio}:1 ${b.sel}`))
  );
  softExpect(undelineated, `control boundaries under 3:1 (SC 1.4.11) in state: ${label}`, []);

  await soft(() => expectNoNewNonTextFailures(page, label));
  await soft(() => expectScrollersReachable(page, label));
  await soft(() => expectFocusVisible(page, label));
  await soft(() => expectNoHorizontalOverflow(page, label));
}

// ── The drive ───────────────────────────────────────────────────────────────

/** Open one `<details class="aria-table">` by clicking its summary. */
async function openDetails(page: Page, index: number): Promise<void> {
  const d = page.locator('details.aria-table').nth(index);
  await d.locator('summary').click();
  await expect(d).toHaveAttribute('open', '');
}

/** Pick a bundled sample and wait for the workbench to re-render around it. */
async function pickSample(page: Page, id: string): Promise<void> {
  await page.selectOption('#sample-pick', id);
  await expect(page.locator('#sample-pick')).toHaveValue(id);
}

/**
 * Drive the lab through the states that render content, scanning each.
 *
 * Six things shape this drive:
 *
 *  - IT SCANS THE ARRIVAL STATE FIRST, BEFORE ANY CLICK. This lab ships already
 *    solved (see `boot`), so the first state is a completed break — and the gate
 *    this replaces reached it only after three attack runs and two mode flips
 *    had overwritten it.
 *
 *  - EVERY BUNDLED SCENARIO IS DRIVEN, because each one is a DIFFERENT VERDICT
 *    and the verdicts are what this lab paints colour with. `declaration` lands
 *    the break (the red `.status.alarm` banner and four `.rail-step.done`);
 *    `speckled` is ambiguous (the amber "intervene here first" banner and
 *    `.col-card.ambiguous`); `latin` resolves a key length but fails the English
 *    check (`.status.info` plus a partial-quality verdict); `boundary` is the
 *    OTP case, where the solver refuses and `.rail-step.fail` appears; and
 *    `short` is the honest-refusal path, which is the only route to the
 *    `--caution` warning under the ciphertext box. The old gate scanned one of
 *    the seven.
 *
 *  - EVERY OVERRIDE PATH. A wrong key-length hypothesis (garbage plaintext), a
 *    manually changed column shift (`.keyletter.overridden` in `--alarm` plus
 *    the `✎ manual` chip), and Reset back to the solver's own answer. These are
 *    the states where the lab's alarm ink is used as PROSE rather than as a
 *    banner fill, which is a different backdrop and a different ratio.
 *
 *  - BOTH SIDES OF EVERY MODE FORK. Encrypt and decrypt; the maths view and the
 *    history view; explore and challenge. Challenge is driven all the way to a
 *    submitted score, through a spent hint, because the hidden-key `?` state,
 *    the disabled `Hinted ✓` button and the score banner exist nowhere else.
 *
 *  - THE STATES THAT ONLY EXIST WHILE SOMETHING IS WRONG OR EMPTY: a keyword
 *    with a digit in it (the `role="alert"` error in `--alarm`), an empty
 *    plaintext (the "type some text" hint), and a cleared ciphertext (which
 *    strips the whole solver back to a stub).
 *
 *  - NO FIXED TIMEOUTS. Every transition here is synchronous — the workbench
 *    re-renders inside the event handler, and under the reduced motion `boot`
 *    asserts, `runAttack` writes its whole transcript in one pass. The drive
 *    waits on DOM assertions, never on a clock.
 */
export async function driveAllStates(page: Page, theme: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${theme} / ${s}`);

  // The skip link is reached BEFORE anything else, and that ordering is
  // load-bearing rather than stylistic. `expectFocusVisible` — which every
  // `scan` runs — focuses and blurs each `tabindex` element in turn, and
  // Chromium's sequential focus navigation starting point follows the last
  // blur. After one scan, `Tab` therefore resumes from somewhere in the middle
  // of the document rather than from the top, and the assertion below fails for
  // a page whose skip link is perfectly fine. On a freshly loaded document the
  // starting point is the top, and one Tab is the reader's real first keystroke.
  await page.keyboard.press('Tab');
  await expect(page.locator('a.cl-skip-link')).toBeFocused();
  await scanAt('skip link focused');

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await scanAt('first paint, the Declaration break already solved');

  // ── Cipher panel ────────────────────────────────────────────────────────
  await dirBtn(page, 'Decrypt').click();
  await expect(dirBtn(page, 'Decrypt')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('label[for="cipher-input"]')).toHaveText('Ciphertext');
  await scanAt('cipher panel in decrypt direction');

  await dirBtn(page, 'Encrypt').click();
  await expect(dirBtn(page, 'Encrypt')).toHaveAttribute('aria-pressed', 'true');

  // The tabula recta, and the lit row/column/cell it paints for the first
  // alignment position. `lit-cell` is the only place `--accent` is used as a
  // solid fill behind `#fff` text.
  await page.locator('button.reveal-tableau').click();
  await expect(page.locator('button.reveal-tableau')).toHaveText('Hide tabula recta');
  await expect(page.locator('.tableau-wrap')).toBeVisible();
  await expect(page.locator('td.lit-cell')).toHaveCount(0);
  // The highlight is only applied on the next render, which a keystroke forces.
  await page.locator('#cipher-key').fill('LIBERTY');
  await expect(page.locator('td.lit-cell')).toHaveCount(1);
  await expect(page.locator('td.lit-row')).toHaveCount(26);
  await scanAt('tabula recta open with the active row, column and cell lit');

  // A keyword the normaliser refuses: the `role="alert"` error in `--alarm`.
  await page.locator('#cipher-key').fill('K3Y');
  await expect(page.locator('p[role="alert"]')).not.toBeEmpty();
  // Scoped to the cipher panel deliberately: the explainer builds a `.strip` of
  // its own out of the same class, so an unscoped `.strip .cell` counts 22 cells
  // that have nothing to do with the keyword being refused.
  await expect(cipherCard(page).locator('.strip .cell')).toHaveCount(0);
  await scanAt('invalid keyword refused, alert shown');

  await page.locator('#cipher-key').fill('LIBERTY');
  await expect(page.locator('p[role="alert"]')).toBeEmpty();

  // The empty-input branch, which replaces the whole output block with a hint.
  await page.locator('#cipher-input').fill('');
  await expect(page.locator('#cipher-counts')).toHaveText('0 characters · 0 letters processed');
  await scanAt('cipher panel with no input, prompt shown');

  await page.locator('#cipher-input').fill('We hold these truths to be self evident');
  await expect(cipherCard(page).locator('.strip .cell').first()).toBeVisible();

  // The copy button's 1200ms "Copied" swap — a state that exists nowhere else
  // and that the old gate never saw.
  await page.locator('button.copy-btn').first().click();
  await expect(page.locator('button.copy-btn').first()).toContainText('Copied');
  await scanAt('copy confirmation on the cipher output button');
  await expect(page.locator('button.copy-btn').first()).not.toContainText('Copied', {
    timeout: 5_000,
  });

  await page.locator('button.reveal-tableau').click();
  await expect(page.locator('.tableau-wrap')).toBeHidden();

  // ── Break workbench: the transcript ─────────────────────────────────────
  await page.locator('#run-attack').click();
  // Under reduced motion the transcript is written synchronously, so it is
  // complete the moment the click resolves — no wait, deliberately, because
  // that is the assertion that the preference actually changed the code path.
  await expect(page.locator('#transcript')).toBeVisible();
  await expect(page.locator('#transcript .mono-out > div').last()).toContainText(
    'the cipher is broken'
  );
  await scanAt('solver transcript written in full');

  await openDetails(page, 0);
  await openDetails(page, 1);
  await scanAt('both text-equivalent tables open');

  // ── Every bundled scenario ──────────────────────────────────────────────
  // Ambiguous: the amber "intervene here first" banner and a flagged column.
  await pickSample(page, 'speckled');
  await expect(page.locator('.col-card')).not.toHaveCount(0);
  await scanAt('the ambiguous scenario, weak columns flagged');

  // Non-English: a key length resolves, the English check does not pass.
  await pickSample(page, 'latin');
  await expect(page.locator('.keyout')).not.toBeEmpty();
  await scanAt('the Latin scenario, key recovered but not English');

  // The OTP boundary: the solver refuses, and the rail shows a failed stage.
  await pickSample(page, 'boundary');
  await scanAt('the OTP-boundary scenario');

  // Too short: the only route to the `--caution` warning under the box.
  await pickSample(page, 'short');
  await expect(page.locator('#ct-counts')).toContainText('letters (analysed)');
  await scanAt('the too-short scenario, honest refusal');

  await pickSample(page, 'declaration');
  await expect(page.locator('.keyout')).toHaveText('LEMON');

  // ── Overrides ───────────────────────────────────────────────────────────
  // A wrong key-length hypothesis: the plaintext goes to garbage and the page
  // says so, rather than snapping back to the right answer.
  await page.selectOption('#key-length-select', '4');
  await expect(page.locator('.col-card')).toHaveCount(4);
  await scanAt('a wrong key-length hypothesis, plaintext is garbage');

  await page.selectOption('#key-length-select', 'auto');
  await expect(page.locator('.col-card')).toHaveCount(5);

  // A manually changed column: `.keyletter.overridden` paints `--alarm` at
  // 1.6rem, and the `✎ manual` chip appears beside it.
  const firstColSelect = page.locator('.col-card select').first();
  await firstColSelect.selectOption('3');
  await expect(page.locator('.col-card .keyletter.overridden')).toHaveCount(1);
  await expect(page.locator('.col-card .chip')).toHaveCount(1);
  await scanAt('one column overridden by hand, marked manual');

  await page.locator('#reset-break').click();
  await expect(page.locator('.col-card .keyletter.overridden')).toHaveCount(0);
  await expect(page.locator('.keyout')).toHaveText('LEMON');
  await scanAt('reset back to the solver answer');

  // The answer-key check, in both outcomes.
  await page.getByRole('button', { name: 'Reveal true key (check)' }).click();
  await expect(page.locator('.status.ok')).not.toHaveCount(0);
  await scanAt('true key revealed and matching');

  await page.getByRole('button', { name: 'Hide answer' }).click();

  // ── Challenge mode, all the way to a score ──────────────────────────────
  await modeBtn(page, 'Challenge').click();
  await expect(modeBtn(page, 'Challenge')).toHaveAttribute('aria-pressed', 'true');
  // Every key letter is hidden behind `?` until it is solved or hinted.
  await expect(page.locator('.col-card .keyletter').first()).toHaveText('?');
  await expect(page.getByRole('button', { name: 'Submit solution' })).toBeVisible();
  await scanAt('challenge mode, every key letter hidden');

  // Spend one hint: the button goes disabled and the column is marked.
  await page.getByRole('button', { name: '💡 Hint' }).first().click();
  await expect(page.getByRole('button', { name: 'Hinted ✓' }).first()).toBeDisabled();
  await scanAt('challenge mode with one hint spent');

  await page.getByRole('button', { name: 'Submit solution' }).click();
  await expect(page.locator('.status')).not.toHaveCount(0);
  await expect(page.getByText(/Score \d+\/100/)).toBeVisible();
  await scanAt('challenge submitted and scored');

  await modeBtn(page, 'Explore').click();
  await expect(modeBtn(page, 'Explore')).toHaveAttribute('aria-pressed', 'true');

  // ── The empty state ─────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('#ct-input')).toHaveValue('');
  await expect(page.locator('.keyout')).toHaveCount(0);
  await scanAt('ciphertext cleared, no key left behind');

  await pickSample(page, 'declaration');
  await expect(page.locator('.keyout')).toHaveText('LEMON');

  // ── The explainer, both views and every spotlight column ────────────────
  // Each spotlight moves the 22% accent fill to a different third of the strip
  // and leaves the other two thirds at `opacity: 0.5` — which is the state the
  // arithmetic contrast walk exists to measure and axe reads straight through.
  for (const col of ['1', '2', '3']) {
    await page.locator('.toggle-group[aria-label="explanation view"] ~ * button', {
      hasText: new RegExp(`^${col}$`),
    }).click();
    await expect(
      page.locator('.toggle-group[aria-label="explanation view"] ~ * button', {
        hasText: new RegExp(`^${col}$`),
      })
    ).toHaveAttribute('aria-pressed', 'true');
    await scanAt(`explainer maths view, column ${col} spotlighted`);
  }

  await viewBtn(page, 'The history').click();
  await expect(viewBtn(page, 'The history')).toHaveAttribute('aria-pressed', 'true');
  await scanAt('explainer history view');

  await viewBtn(page, 'The math').click();
  await expect(viewBtn(page, 'The math')).toHaveAttribute('aria-pressed', 'true');
  await scanAt('back on the explainer maths view');
}
