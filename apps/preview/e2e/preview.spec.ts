import { AxeBuilder } from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { makeSnapshot } from '../src/test/fixtures.ts';

async function mockPreview(page: Page) {
  const snapshot = makeSnapshot();
  await page.route('**/api/preview', (route) =>
    route.fulfill({ body: JSON.stringify(snapshot), contentType: 'application/json' }),
  );
  await page.route('**/api/events', (route) =>
    route.fulfill({
      body: 'event: refresh\ndata: {"type":"refresh","schemaVersion":1,"generation":1,"stateKind":"current"}\n\n',
      contentType: 'text/event-stream',
    }),
  );
}

test('has zero serious or critical axe violations', async ({ page }) => {
  await mockPreview(page);
  await page.goto('/');
  await expect(page.getByRole('listbox')).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const highImpact = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(highImpact).toEqual([]);
  console.info(
    `browser=${page.context().browser()?.version()} axe-serious-critical=${highImpact.length}`,
  );
});

test('narrow reduced-motion layout has no page-level horizontal overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ height: 780, width: 375 });
  await mockPreview(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Fit chapter' })).toBeVisible();
  const dimensions = await page.evaluate<{
    client: number;
    scroll: number;
    transition: string;
  }>(`(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    transition: getComputedStyle(document.querySelector('button')).transitionDuration,
  }))()`);
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
  expect(['0.01ms', '1e-05s']).toContain(dimensions.transition);
});
