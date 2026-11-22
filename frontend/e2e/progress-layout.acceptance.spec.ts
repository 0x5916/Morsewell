import { expect, test, type Locator } from '@playwright/test';
import de from '../messages/de.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };
import { resetToHome } from './helpers';

async function textBounds(locator: Locator) {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return Array.from(range.getClientRects(), (rect) => ({
      left: rect.left,
      top: rect.top,
      right: rect.right
    }));
  });
}

test('a new learner can read the enlarged empty state and return to Lessons', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  await resetToHome(page);
  await page.goto('/de/morse/progress?view=characters');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  const heading = page.getByRole('heading', { name: de.progress_empty_title });
  await expect(heading).toBeVisible();
  const card = await page.locator('.progress-empty').boundingBox();
  for (const line of await textBounds(heading)) {
    expect(line.right).toBeLessThanOrEqual(card!.x + card!.width);
  }
  await page.getByRole('link', { name: de.progress_return_course }).click();
  await expect(page).toHaveURL(/\/de\/morse\/learn$/);
});

for (const [width, percent, locale] of [
  [390, 100, 'en'],
  [320, 200, 'en'],
  [390, 200, 'de'],
  [1280, 200, 'de']
] as const) {
  test(`Progress keeps values, tabs and expandable character records readable at ${width}px / ${percent}% (${locale})`, async ({
    page
  }) => {
    const labels = locale === 'de' ? de : en;
    await page.setViewportSize({ width, height: 844 });
    await resetToHome(page, 'Returning learner / populated history');
    await page.goto(`/${locale}/morse/progress`);
    await page.addStyleTag({ content: `html { font-size: ${percent}% !important; }` });
    const ledger = page.getByRole('region', { name: labels.progress_activity_label });
    await expect(ledger.locator('.metric-val')).toHaveCount(3);
    const rightEdges = [];
    for (const metric of await ledger.locator('.metric-block').all()) {
      const [value, ...otherLines] = await textBounds(metric.locator('.metric-val'));
      expect(otherLines).toHaveLength(0);
      expect(value.right).toBeLessThanOrEqual(width);
      rightEdges.push(value.right);
      if (percent === 200 && width < 400) {
        const label = await metric.locator('.metric-label').boundingBox();
        expect(value.top).toBeGreaterThanOrEqual(label!.y + label!.height - 1);
      }
    }
    if (percent === 100) expect(Math.max(...rightEdges) - Math.min(...rightEdges)).toBeLessThan(2);

    const info = ledger.getByRole('button').last();
    await info.click();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeInViewport({ ratio: 0.99 });
    const triggerBox = await info.boundingBox();
    const tipBox = await tooltip.boundingBox();
    expect(
      Math.min(
        Math.abs(tipBox!.y - triggerBox!.y - triggerBox!.height),
        Math.abs(triggerBox!.y - tipBox!.y - tipBox!.height)
      )
    ).toBeLessThanOrEqual(5);
    await info.press('Escape');
    await expect(tooltip).toHaveCount(0);
    const nav = page.locator('.section-nav');
    for (const link of await nav.getByRole('link').all()) {
      expect(await textBounds(link)).toHaveLength(1);
    }
    await nav.getByRole('link', { name: labels.progress_tab_characters }).press('Enter');
    const title = page.getByRole('heading', { name: labels.progress_character_records });
    await expect(title).toBeVisible();
    const bounds = await title.boundingBox();
    for (const line of await textBounds(title)) {
      expect(line.right).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
    }
    const records = page.getByRole('region', { name: labels.progress_tab_characters });
    const row = records.locator('summary').first();
    await row.press('Enter');
    await expect(
      records.getByRole('heading', { name: labels.progress_past_milestones })
    ).toBeVisible();
    expect(await records.evaluate((region) => region.scrollWidth <= region.clientWidth + 1)).toBe(
      true
    );
  });
}
