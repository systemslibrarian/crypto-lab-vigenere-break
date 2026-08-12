import { expect, test } from '@playwright/test';
import {
  boot,
  driveAllStates,
  expectBaselineNotStale,
  NARROW,
  reportCollected,
  watchPageErrors,
} from './gate';

/**
 * WCAG A/AA regression gate.
 *
 * The lab is driven along everything it teaches: the arrival state, which on
 * this page is an already-completed break of the Declaration sample; the skip
 * link focused; both cipher directions; the tabula recta opened through its own
 * button, with the active row, column and cell lit; a keyword the normaliser
 * refuses, and an emptied plaintext; a copy confirmation while it is on screen;
 * the solver transcript, written in one synchronous pass because reduced motion
 * is really in effect; both text-equivalent tables opened through their
 * summaries; all five distinct scenario verdicts — broken, ambiguous,
 * non-English, OTP-boundary and too-short-to-try; a wrong key-length hypothesis;
 * a column overridden by hand and then reset; the answer key revealed; challenge
 * mode from hidden key through a spent hint to a submitted score; the cleared
 * empty state; and the explainer in both views with each of its three spotlight
 * columns. Every one of those states is scanned, in both themes, at desktop and
 * phone width.
 *
 * Clipboard permission is granted because `dom.ts`'s `copyButton` swallows a
 * rejected `navigator.clipboard.writeText` in a bare `catch {}`: without the
 * grant the promise rejects, the label never changes, and the drive would be
 * asserting against a state the code never reached.
 *
 * See `gate.ts` for why nothing is injected into the page, why no `<details>` is
 * opened from script, why the lab's defaults are asserted rather than assumed,
 * and why `violations` is not the whole oracle.
 */

for (const theme of ['dark', 'light'] as const) {
  test(`no WCAG A/AA violations in ${theme} theme`, async ({ page, context }) => {
    test.setTimeout(900_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = watchPageErrors(page);
    await boot(page, theme);
    await driveAllStates(page, theme);
    expect(errors, errors.join('\n')).toEqual([]);
    expectBaselineNotStale();
    reportCollected();
  });

  test(`no WCAG A/AA violations in ${theme} theme at 380px`, async ({ page, context }) => {
    test.setTimeout(900_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = watchPageErrors(page);
    await page.setViewportSize(NARROW);
    await boot(page, theme);
    await driveAllStates(page, `${theme} @380px`);
    expect(errors, errors.join('\n')).toEqual([]);
    expectBaselineNotStale();
    reportCollected();
  });
}
