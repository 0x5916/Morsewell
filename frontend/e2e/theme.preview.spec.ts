import { expect, test } from '@playwright/test';

test('keyboard cycling applies the theme and remembers it on reload', async ({
  page,
  browserName
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/en', { waitUntil: 'networkidle' });
  const theme = page.getByRole('button', { name: /^Theme is / });
  const root = page.locator('html');
  await expect(theme).toHaveAccessibleName('Theme is System. Switch to Light.');
  await expect(theme).toHaveText('System', { useInnerText: true });
  await page.getByRole('button', { name: 'Guest', exact: true }).focus();
  await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
  await expect(theme).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(theme).toHaveAccessibleName('Theme is Light. Switch to Dark.');
  await expect(theme).toHaveText('Light', { useInnerText: true });
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(root).toHaveCSS('color-scheme', 'light');
  await page.keyboard.press('Space');
  await expect(theme).toHaveText('Dark', { useInnerText: true });
  await expect(root).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');

  await page.reload({ waitUntil: 'networkidle' });
  await expect(theme).toHaveAccessibleName('Theme is Dark. Switch to System.');
  await expect(theme).toHaveText('Dark', { useInnerText: true });
  await theme.press('Enter');
  await expect(theme).toHaveAccessibleName('Theme is System. Switch to Light.');
  await expect(theme).toHaveText('System', { useInnerText: true });
  await expect(root).not.toHaveAttribute('data-theme');
  await expect(root).toHaveCSS('color-scheme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveCSS('color-scheme', 'light');
});

test('the header and Settings theme controls update each other immediately', async ({ page }) => {
  await page.goto('/en/settings', { waitUntil: 'networkidle' });
  const appearance = page.getByRole('group', { name: 'Appearance mode', exact: true });
  const theme = page.getByRole('button', { name: /^Theme is / });
  await appearance.getByRole('radio', { name: 'Dark' }).check();
  await expect(theme).toHaveAccessibleName('Theme is Dark. Switch to System.');
  await theme.click();
  await expect(appearance.getByRole('radio', { name: 'System' })).toBeChecked();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
});

test('palette and mode are independent, keyboard accessible and restored on reload', async ({
  page
}) => {
  await page.goto('/en/settings', { waitUntil: 'networkidle' });
  const palette = page.getByRole('group', { name: 'Color palette' });
  const appearance = page.getByRole('group', { name: 'Appearance mode' });
  await expect(palette.getByRole('radio')).toHaveCount(3);
  await expect(appearance.getByRole('radio')).toHaveCount(3);
  await expect(palette.getByRole('radio').first()).toHaveAccessibleName('Neutral');
  await expect(palette.getByRole('radio').first()).toBeChecked();
  await expect(appearance.getByRole('radio').first()).toHaveAccessibleName('System');
  await expect(appearance.getByRole('radio').first()).toBeChecked();

  await palette.getByRole('radio', { name: 'Neutral' }).press('ArrowRight');
  await expect(palette.getByRole('radio', { name: 'Warm' })).toBeFocused();
  await expect(palette.locator('input:focus + .segmented-item')).toHaveCSS('outline-width', '2px');
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'warm');
  await appearance.getByRole('radio', { name: 'Dark' }).check();
  await palette.getByRole('radio', { name: 'Cool' }).click();
  await expect(palette.locator('input:checked + .segmented-item')).toHaveCSS(
    'outline-style',
    'none'
  );
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'cool');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(20, 28, 34)');

  await page.reload({ waitUntil: 'networkidle' });
  await expect(palette.getByRole('radio', { name: 'Cool' })).toBeChecked();
  await expect(appearance.getByRole('radio', { name: 'Dark' })).toBeChecked();
  await appearance.getByRole('radio', { name: 'System' }).check();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(237, 242, 245)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(20, 28, 34)');
});

test('restores the canvas and selected Settings options before app hydration', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    localStorage.setItem('palette', 'warm');
    localStorage.setItem('theme', 'light');
  });
  await page.route('**/_app/**/*.js', (route) => route.abort());
  await page.goto('/en/settings');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(245, 240, 230)');
  await expect(page.getByRole('radio', { name: 'Warm' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Light' })).toBeChecked();
});

test('the icon-only mobile theme control follows shared header visibility', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/en', { waitUntil: 'networkidle' });
  const theme = page.getByRole('button', { name: /^Theme is / });
  await expect(theme).toHaveAccessibleName('Theme is System. Switch to Light.');
  await expect(theme).toHaveText('', { useInnerText: true });
  await theme.click();
  await expect(theme).toHaveAccessibleName('Theme is Light. Switch to Dark.');

  await page.goto('/en/settings', { waitUntil: 'networkidle' });
  await expect(theme).toHaveCount(0);
  await page.getByRole('link', { name: 'Appearance & language' }).click();
  await expect(page.getByRole('radio', { name: 'Light', exact: true })).toBeChecked();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(theme).toBeVisible();
  await page.goto('/en/morse/learn/session?step=1', { waitUntil: 'networkidle' });
  await expect(theme).toHaveCount(0);
});

test('the theme icon animates on change and respects reduced motion', async ({ page }) => {
  const theme = page.getByRole('button', { name: /^Theme is / });
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/en', { waitUntil: 'networkidle' });
    const durations = await theme.evaluate(async (button: HTMLButtonElement) => {
      button.click();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return button
        .getAnimations({ subtree: true })
        .map((animation) => Number(animation.effect?.getTiming().duration));
    });
    if (reducedMotion === 'reduce') expect(Math.max(0, ...durations)).toBeLessThan(1);
    else expect(durations.map(Math.round)).toContain(180);
  }
});
