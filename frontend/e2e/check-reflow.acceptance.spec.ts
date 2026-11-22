import { expect, test } from '@playwright/test';
import de from '../messages/de.json' with { type: 'json' };
import en from '../messages/en.json' with { type: 'json' };
import { installDeterministicAudioClock } from './audio-clock';
import { resetToHome } from './helpers';

test.beforeEach(async ({ page }) => {
  await installDeterministicAudioClock(page);
});

for (const { width, locale, labels } of [
  { width: 390, locale: 'de', labels: de },
  { width: 320, locale: 'en', labels: en },
  { width: 1280, locale: 'en', labels: en }
]) {
  test.describe(`first-listen check at ${width}px with 200% text (${locale})`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch: width < 500 });

    test('the warning opens at its heading and replay and skip stay reachable', async ({
      page
    }) => {
      await resetToHome(page, 'Returning learner / populated history');
      await page.goto(`/${locale}/morse/learn/session?check=KM`);
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      const button = (name: string) => page.getByRole('button', { name, exact: true });
      await expect(button(labels.check_begin_explicit)).toBeVisible();
      await expect(page.getByRole('main')).toHaveCount(1);
      await button(labels.check_begin_explicit).click();
      const answer = page.getByRole('textbox', { name: labels.lesson_answer_label });
      await expect(answer).toBeEnabled();
      await expect(answer).toBeInViewport({ ratio: 1 });
      const replay = button(labels.lesson_replay_sound);
      await expect(replay).toBeInViewport({ ratio: 1 });

      const save = button(labels.session_save_leave);
      await save.click();
      const dialog = page.getByRole('alertdialog');
      const title = dialog.getByRole('heading', { name: labels.check_save_title });
      await expect(title).toBeFocused();
      await expect(title).toBeInViewport({ ratio: 1 });
      expect(await dialog.evaluate((node) => node.scrollTop)).toBe(0);
      await page.keyboard.press('Tab');
      const keep = dialog.getByRole('button', { name: labels.check_keep_checking });
      await expect(keep).toBeFocused();
      await keep.click();
      await expect(dialog).toHaveCount(0);
      await expect(save).toBeFocused();

      // A phone keyboard can shorten the visual viewport without a layout viewport resize.
      if (width < 500) {
        await answer.focus();
        await page.evaluate(() => {
          const viewport = window.visualViewport!;
          Object.defineProperty(viewport, 'height', { configurable: true, value: 400 });
          viewport.dispatchEvent(new Event('resize'));
        });
        await expect(page.locator('.session-shell')).toHaveCSS('height', '400px');
      }
      await expect(replay).toHaveAccessibleDescription(labels.check_replay_cost);
      await replay.click({ timeout: 5000 });
      await expect(replay).toHaveAccessibleDescription(labels.check_credit_used);
      await button(labels.mixed_skip).click({ timeout: 5000 });
      await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10');
      await expect(answer).toBeEnabled();
    });
  });
}

for (const [width, height] of [
  [667, 375],
  [844, 390]
]) {
  test.describe(`landscape check at ${width} × ${height} and 200% text`, () => {
    test.use({ viewport: { width, height }, hasTouch: true });

    test('the keyboard can cover the header area without blocking replay, skip or save', async ({
      page
    }) => {
      await resetToHome(page, 'Returning learner / populated history');
      await page.goto('/de/morse/learn/session?check=KM');
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      const button = (name: string) => page.getByRole('button', { name, exact: true });
      await button(de.check_begin_explicit).tap();
      const answer = page.getByRole('textbox', { name: de.lesson_answer_label });
      await expect(answer).toBeEnabled();
      await answer.focus();
      await page.evaluate(() => {
        const viewport = window.visualViewport!;
        Object.defineProperty(viewport, 'height', { configurable: true, value: 175 });
        viewport.dispatchEvent(new Event('resize'));
      });
      const shell = page.locator('.session-shell');
      await expect(shell).toHaveCSS('height', '175px');
      const replay = button(de.lesson_replay_sound);
      await replay.tap({ timeout: 5000 });
      await expect(replay).toHaveAccessibleDescription(de.check_credit_used);
      await button(de.mixed_skip).tap({ timeout: 5000 });
      await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10');
      await expect(answer).toBeEnabled();
      await button(de.session_save_leave).tap({ timeout: 5000 });
      await expect(page.getByRole('alertdialog').getByRole('heading')).toBeFocused();
    });
  });
}
