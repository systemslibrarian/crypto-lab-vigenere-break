import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG regression gate. Deploys are already gated on the Vigenère unit vectors;
 * this gates them on accessibility the same way. Scans the full page — every
 * <details> expanded, both live demos driven so dynamically-injected result
 * regions (solver transcript, recovered key/plaintext, column solver, challenge
 * mode) are included — in both themes.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function killMotion(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}',
  });
}

async function openAllDetails(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const d of Array.from(document.querySelectorAll('details'))) {
      (d as HTMLDetailsElement).open = true;
    }
  });
}

// Drive both interactive demos so every dynamically-rendered region exists in the
// DOM before we scan: run the attack (solver transcript, recovered key/plaintext,
// column solver grid, confidence dashboard), then flip challenge mode which
// re-renders the solver + submit affordances.
async function driveDemos(page: Page): Promise<void> {
  // Reveal the class-toggled tabula recta (a large scrollable region).
  await page.getByRole('button', { name: /Show tabula recta/ }).click();

  await page.locator('#run-attack').click();
  // Attack is animated; wait for the recovered-key output to settle.
  await expect(page.locator('.keyout')).toBeVisible({ timeout: 15000 });

  // Challenge mode surfaces a different set of controls / result banners.
  await page.getByRole('button', { name: /Challenge/ }).click();
  await page.locator('#run-attack').click();
  await page.waitForTimeout(200);
  // Back to explore so both branches' markup has been exercised.
  await page.getByRole('button', { name: /Explore/ }).click();
  await page.locator('#run-attack').click();
  await expect(page.locator('.keyout')).toBeVisible({ timeout: 15000 });
}

async function scan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
  }));
  expect(summary).toEqual([]);
}

test('no WCAG A/AA violations in dark theme', async ({ page }) => {
  await page.goto('.');
  await expect(page.locator('#app .cl-hero-title')).toBeVisible();
  await killMotion(page);
  await driveDemos(page);
  await openAllDetails(page);
  await scan(page);
});

test('no WCAG A/AA violations in light theme', async ({ page }) => {
  await page.goto('.');
  await expect(page.locator('#app .cl-hero-title')).toBeVisible();
  await page.locator('#cl-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await killMotion(page);
  await driveDemos(page);
  await openAllDetails(page);
  await scan(page);
});
