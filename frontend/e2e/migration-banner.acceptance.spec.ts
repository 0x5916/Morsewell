import { expect, test } from '@playwright/test';
import { resetAcceptance } from './helpers';

test.describe('Morsewell migration data guidance', () => {
  test.describe('phone Lessons', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('puts the guided lesson first and leaves the optional check available', async ({
      page
    }) => {
      await resetAcceptance(page, 'Returning learner / populated history', /\/en$/);
      await page.goto('/en/morse/learn');
      const banner = page.locator('.migration-banner[role="status"]');
      await expect(banner).toBeVisible();
      await expect(banner.getByText(/will not transfer automatically/)).toBeVisible();
      await expect(page.locator('.migration-banner[role="alert"]')).toHaveCount(0);
      const recommendation = page.getByRole('button', { name: 'Start lesson 2', exact: true });
      await expect(page.getByRole('link', { name: 'Start first-listen check' })).toHaveClass(
        /btn-ghost/
      );
      await expect(recommendation).toBeInViewport({ ratio: 1 });
      const tabs = await page.locator('nav.bottom-nav').boundingBox();
      const action = await recommendation.boundingBox();
      expect(tabs).toBeTruthy();
      expect(action).toBeTruthy();
      expect(action!.y + action!.height).toBeLessThanOrEqual(tabs!.y);
      expect(await page.evaluate(() => scrollY)).toBe(0);
      // A coordinate tap cannot scroll the target into view like locator.tap() can.
      await page.touchscreen.tap(action!.x + action!.width / 2, action!.y + action!.height / 2);
      await expect(page).toHaveURL(
        (url) => url.pathname === '/en/morse/learn/session' && url.searchParams.get('step') === '2'
      );
    });

    test('keeps the new guest sync guidance in the notice and opens device recovery', async ({
      page
    }) => {
      await resetAcceptance(page, 'New learner / empty history', /\/en$/);
      await page.goto('/en/morse/learn');
      const banner = page.locator('.migration-banner[role="status"]');
      await expect(banner.getByText(/Progress saves in this browser/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start lesson 1' })).toBeVisible();
      await expect(page.locator('.lessons-page a[href="/en/register"]')).toHaveCount(0);
      await banner.getByRole('link', { name: 'Recover history from the previous site' }).tap();
      await expect(page).toHaveURL(/\/en\/settings#device-recovery$/);
      await expect(
        page.getByRole('heading', { name: 'Recover history from the previous site' })
      ).toBeVisible();
    });
  });

  test('keeps guest recovery below the learning content and remembers dismissal across tabs', async ({
    page
  }) => {
    await resetAcceptance(page, 'Returning learner / populated history', /\/en$/);
    const banner = page.locator('.migration-banner[role="status"]');
    await expect(banner).toBeVisible();
    const followsContent = await banner.evaluate((notice) =>
      Boolean(
        document.querySelector('.home-dashboard')!.compareDocumentPosition(notice) &
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    );
    expect(followsContent).toBe(true);
    await banner.getByText('How to sync your history', { exact: true }).press('Enter');
    await expect(banner.getByText(/import your device history/)).toBeVisible();
    await banner.getByRole('button', { name: 'Dismiss announcement' }).click();
    const secondTab = await page.context().newPage();
    await secondTab.goto('/en/morse/learn');
    await expect(secondTab.getByRole('link', { name: 'Start first-listen check' })).toBeVisible();
    await expect(secondTab.locator('.migration-banner')).toHaveCount(0);
  });

  test('recommends the saved passage while keeping guest import help within a disclosure', async ({
    page
  }) => {
    await resetAcceptance(page, 'Guest with saved unfinished practice', /\/en$/);
    const banner = page.locator('.migration-banner[role="status"]');
    await expect(banner).toBeVisible();
    await expect(banner.getByText(/before importing its history/)).toBeHidden();
    await banner.getByText('How to sync your history', { exact: true }).click();
    await expect(banner.getByText(/before importing its history/)).toBeVisible();
    await page.getByRole('link', { name: 'Continue saved passage', exact: true }).click();
    await expect(page).toHaveURL(/practice\?resume=copy/);
    await expect(page.getByRole('button', { name: 'Continue saved passage' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Play passage' }).click();
    await expect(page.getByRole('textbox', { name: 'Your copy' })).toBeVisible();
    await expect(page.locator('.migration-banner')).toHaveCount(0);
  });

  test('warns signed-in users about unsynchronized progress and offers retry/help', async ({
    page
  }) => {
    await resetAcceptance(page, 'Synthetic account / pending sync', /\/en\/settings$/);
    await page.goto('/en/about');

    const banner = page.locator('.migration-banner[role="alert"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(
      /Your progress is waiting to sync|Some progress could not sync/
    );
    const retry = banner.getByRole('button', { name: 'Retry sync' });
    await expect(retry).toBeVisible();
    await expect(retry).toBeEnabled();
    await expect(banner).toContainText(
      /do not clear site data|before moving or clearing browser data/
    );
    await expect(banner.getByRole('link', { name: 'Sync & storage' })).toHaveAttribute(
      'href',
      '/en/settings#sync-storage'
    );
  });
});
