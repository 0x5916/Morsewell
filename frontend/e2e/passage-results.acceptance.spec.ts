import { expect, test, type Page } from '@playwright/test';
import { readCopyCheckpoint, readOwnedSessions, resetToHome, startAndType } from './helpers';

async function preparedPassage(page: Page) {
  const field = await startAndType(page);
  await expect.poll(() => readCopyCheckpoint(page)).toMatchObject({ draft: 'KM' });
  const checkpoint = (await readCopyCheckpoint(page)) as {
    attempt: { exercise: { text: string } };
  };
  return { field, source: checkpoint.attempt.exercise.text };
}

test('a perfect copy shows its score and keeps the passage and calculation on demand', async ({
  page
}) => {
  await resetToHome(page);
  await page.goto('/en/morse/practice');
  const { field, source } = await preparedPassage(page);
  await field.fill(source);
  await page.getByRole('button', { name: 'Score this passage' }).click();
  const result = page.getByRole('dialog', { name: 'Practice results' });
  await expect(result.getByText('All characters matched.')).toBeVisible();
  await expect(result.getByText('100%', { exact: true })).toBeVisible();
  await expect(result.getByRole('table')).toHaveCount(0);
  await result.getByText('Full passage', { exact: true }).click();
  await expect(result.getByText(source, { exact: true })).toBeVisible();
  const policy = result.getByText(
    /Each missing, extra or changed character counts as one difference/
  );
  await expect(policy).toBeHidden();
  await result.getByText('How accuracy is calculated', { exact: true }).click();
  await expect(policy).toBeVisible();
});

test('a pasted emoji stays whole in corrections and keeps the original passage score', async ({
  page
}) => {
  await resetToHome(page);
  await page.goto('/en/morse/practice');
  const { field, source } = await preparedPassage(page);
  await field.fill('🦊' + source.slice(1));
  await field.press('Control+Enter');
  const result = page.getByRole('dialog', { name: 'Practice results' });
  const correction = result.getByRole('img', { name: `You copied 🦊; expected ${source[0]}.` });
  await expect(correction).toHaveText('🦊');
  await expect(result.getByRole('heading', { name: 'Scored differences: 2' })).toBeVisible();
  await expect
    .poll(
      async () => (await readOwnedSessions(page)).find((row) => row.mode === 'practice')?.accuracy
    )
    .toBe(1 - 2 / source.trim().length);
});

test('a partial copy keeps long omissions compact and readable with enlarged phone text', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await resetToHome(page);
  await page.goto('/en/morse/practice');
  await page.addStyleTag({ content: 'html {font-size:200% !important;}' });
  const { field, source } = await preparedPassage(page);
  await field.fill(source[0]);
  await field.press('Control+Enter');
  const result = page.getByRole('dialog', { name: 'Practice results' });
  const summary = result
    .locator('summary')
    .filter({ hasText: /characters missing/ })
    .first();
  await expect(summary).toBeVisible();
  const spaces = summary.locator('..').getByRole('img', { name: 'Missing: space' });
  await expect(spaces).toHaveCount(0);
  await summary.press('Enter');
  await expect(spaces.first()).toBeVisible();
  expect(
    await result
      .locator('.overlay-panel')
      .evaluate((panel) => panel.scrollWidth <= panel.clientWidth + 1)
  ).toBe(true);
  await summary.press('Enter');
  await expect(spaces).toHaveCount(0);
  await expect(result.getByRole('button', { name: 'Finish for today' })).toBeEnabled();
});
