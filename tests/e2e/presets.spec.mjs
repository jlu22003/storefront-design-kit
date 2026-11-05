// Presets on the kit's design panel (playground/dev/panel.js and presets.js),
// run in the `lab` project. Presets layer onto the panel's sliders and color
// picks, and the sliders move to show the result. Presets on the live-site
// panel are tested on a local copy in lab-copy.spec.mjs.

import { expect, test } from '@playwright/test';

const panel = (page) => page.locator('[data-sdk-design-panel]:not([data-inline])');
const rootVar = (page, name) => page.evaluate((prop) => getComputedStyle(document.documentElement).getPropertyValue(prop).trim(), name);

test.beforeEach(async ({ page }) => {
  await page.goto('/playground/primitives.html');
  await page.evaluate(() => {
    localStorage.removeItem('sdk-playground-design');
    localStorage.removeItem('sdk-playground-presets');
  });
  await page.reload();
  await panel(page).locator('button.toggle').click();
});

test('kit presets move the scale sliders and the tokens', async ({ page }) => {
  const design = panel(page);
  await design.getByRole('button', { name: 'Sharp corners' }).click();
  await expect(page.locator('#sdk-dp-radius')).toHaveValue('0');
  expect(await rootVar(page, '--sdk-radius-8')).toBe('0px');

  await design.getByRole('button', { name: 'Soft corners' }).click();
  await expect(page.locator('#sdk-dp-radius')).toHaveValue('0', { message: 'scales multiply: 0 × 150% stays 0' });

  await design.getByRole('button', { name: 'Airy', exact: true }).click();
  await expect(page.locator('#sdk-dp-space')).toHaveValue('1.25');
  expect(await rootVar(page, '--sdk-space-16')).toBe('1.25rem');

  await design.getByRole('button', { name: 'Larger text' }).click();
  await expect(page.locator('#sdk-dp-type')).toHaveValue('1.15');
  await expect(design.locator('.output')).toContainText('--sdk-space-16: 1.25rem;');
});

test('Higher contrast picks text and accent colors at 7:1 for the appearance shown', async ({ page }) => {
  const design = panel(page);
  await design.getByRole('button', { name: 'Higher contrast' }).click();
  const ratios = await design.locator('.contrast li').evaluateAll((items) =>
    Object.fromEntries(items.map((li) => [li.children[0]?.textContent, Number.parseFloat(li.children[1]?.textContent ?? '')])),
  );
  expect(ratios['Text on background']).toBeGreaterThanOrEqual(7);
  expect(ratios['Text on accent']).toBeGreaterThanOrEqual(7);
});

test('Save mine keeps the kit settings as a preset that survives reloads', async ({ page }) => {
  const design = panel(page);
  await design.getByRole('button', { name: 'Compact' }).click();
  await page.locator('#sdk-dp-presets-preset-name').fill('Tight');
  await page.locator('#sdk-dp-presets-preset-name').press('Enter');
  await expect(design.getByRole('status').filter({ hasText: 'Saved Tight.' })).toHaveCount(1);
  await design.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('#sdk-dp-space')).toHaveValue('1');

  // The panel reopens on reload, as it was left.
  await page.reload();
  await panel(page).getByRole('button', { name: 'Tight', exact: true }).click();
  await expect(page.locator('#sdk-dp-space')).toHaveValue('0.8');
});
