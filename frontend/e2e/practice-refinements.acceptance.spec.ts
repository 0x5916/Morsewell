import { expect, test } from '@playwright/test';
import de from '../messages/de.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };
import ja from '../messages/ja.json' with { type: 'json' };
import { readSessionCount, resetAcceptance, resetToHome } from './helpers';

for (const [width, lang, labels] of [
  [320, 'en', en],
  [390, 'de', de],
  [320, 'ja', ja]
] as const) {
  test(`enlarged ${lang} setup shows the chosen passage and characters before Play`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: width === 320 ? 740 : 844 });
    await resetToHome(page);
    await page.goto(`/${lang}/morse/practice`);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });

    const setup = page.locator('.passage-setup');
    await expect(
      setup.getByText(labels.practice_history_groups.replace('{step}', '1'), { exact: true })
    ).toBeVisible();
    await expect(setup.locator('.compact-characters')).toHaveText('K M');
    const edit = setup.getByRole('button', { name: labels.practice_change_setup });
    const context = setup.getByRole('combobox', { name: labels.context_label });
    await expect(context).toBeHidden();
    await expect(page.locator('.audio-length')).toContainText(/\d+:\d{2}/);
    const play = page.getByRole('button', { name: labels.practice_start, exact: true });
    const bar = (await page.locator('.bottom-nav').boundingBox())!;
    const playBox = (await play.boundingBox())!;
    expect(playBox.y + playBox.height).toBeLessThanOrEqual(bar.y);
    await edit.click();
    await expect(edit).toHaveAttribute('aria-expanded', 'true');
    await setup.getByRole('combobox', { name: labels.trainer_current_lesson }).selectOption('2');
    await expect(setup.locator('.compact-characters')).toContainText('R');
    await context.selectOption('words');
    await edit.click();
    await expect(setup.locator('.compact-setup p')).toHaveText(labels.context_words);
    await expect(setup.locator('.compact-characters')).toHaveCount(0);
  });
}

for (const width of [390, 1280]) {
  test(`keyboard follows the visible Practice controls at ${width}px and 200% text`, async ({
    page,
    browserName
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await resetToHome(page);
    await page.goto('/de/morse/practice');
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await page.getByRole('button', { name: de.practice_start, exact: true }).click();
    const copy = page.getByRole('textbox', { name: de.trainer_answer_label });
    await copy.fill('K M');
    // macOS WebKit uses Option+Tab to navigate all controls with default keyboard preferences.
    const tab = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
    await copy.press(`Shift+${tab}`);
    await expect(page.getByRole('button', { name: de.player_skip_next })).toBeFocused();
    for (const control of [
      copy,
      page.getByRole('button', { name: de.trainer_check }),
      page.getByRole('button', { name: de.trainer_try_again }),
      page.locator('.audio-settings-summary')
    ]) {
      await page.keyboard.press(tab);
      await expect(control).toBeFocused();
    }
    const disclosure = page.locator('.audio-settings-summary');
    await disclosure.press('Enter');
    await expect(page.getByRole('slider', { name: de.player_volume })).toBeVisible();
    const box = (await disclosure.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await disclosure.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  });
}

test('a delayed save failure brings its warning and retry into view above passage corrections', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await resetAcceptance(page, 'Practice save fails once, then retry', /\/morse\/practice$/);
  await page.goto('/de/morse/practice');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await page.getByRole('button', { name: de.practice_start, exact: true }).click();
  const copy = page.getByRole('textbox', { name: de.trainer_answer_label });
  await copy.fill('K');

  await page.clock.install();
  await page.evaluate(() =>
    sessionStorage.setItem('acceptance.loadingUntil', String(Date.now() + 60_000))
  );
  await copy.press('Control+Enter');
  const result = page.getByRole('dialog', { name: de.trainer_result_title });
  const panel = result.locator('.overlay-panel');
  await expect(result.getByText(de.practice_history_saving)).toBeVisible();
  await panel.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.clock.fastForward(60_001);

  const warning = result.getByRole('alert');
  await expect(warning).toContainText(de.practice_history_failed);
  const retry = warning.getByRole('button', { name: de.lesson_retry_save });
  await expect(retry).toBeInViewport({ ratio: 1 });
  expect(await panel.evaluate((el) => el.scrollTop)).toBe(0);
  const retryBox = (await retry.boundingBox())!;
  const scoreBox = (await result.locator('.overlay-score').boundingBox())!;
  expect(retryBox.y + retryBox.height).toBeLessThanOrEqual(scoreBox.y + 1);
  await retry.click();
  await expect(result.getByText(de.practice_history_saved)).toBeVisible();
  await expect.poll(() => readSessionCount(page)).toBe(1);
});
