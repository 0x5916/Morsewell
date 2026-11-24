import { expect, type Locator, type Page } from '@playwright/test';

export function answerBoxAppearance(field: Locator) {
  return field.evaluate(async (element) => {
    // The focused border should have settled after switching to a fresh native input.
    await Promise.allSettled(
      element
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((transition) => transition.finished)
    );
    const { width, height, x, y } = element.getBoundingClientRect();
    const css = getComputedStyle(element);
    return {
      width,
      height,
      x,
      documentY: Math.round(y + window.scrollY),
      font: [css.fontFamily, css.fontSize, css.fontWeight, css.lineHeight],
      border: css.border,
      radius: css.borderRadius,
      padding: css.padding,
      align: css.textAlign
    };
  });
}

export async function expectPhoneQwerty(page: Page) {
  const keyboard = page.locator('.training-keyboard');
  await expect(keyboard.locator('.key-row')).toHaveCount(3);
  const rows = await keyboard.locator('.key-row').evaluateAll((elements) =>
    elements.map((row) =>
      Array.from(row.querySelectorAll<HTMLButtonElement>('.character'), (key) => {
        const { x, y, width, height } = key.getBoundingClientRect();
        return { label: key.textContent?.trim(), x, y, width, height };
      })
    )
  );
  expect(rows.map((row) => row.map((key) => key.label).join(''))).toEqual([
    'QWERTYUIOP',
    'ASDFGHJKL',
    'ZXCVBNM'
  ]);
  const first = rows[0][0];
  const viewport = page.viewportSize()!;
  expect(first.width).toBeGreaterThanOrEqual(Math.min(44, (viewport.width - 16) / 10) - 1);
  expect(first.x).toBeGreaterThanOrEqual(0);
  expect(rows[0][9].x + rows[0][9].width).toBeLessThanOrEqual(viewport.width + 0.5);

  for (const [index, row] of rows.entries()) {
    const stagger = [0, 0.5, 1.5][index];
    if (index > 0) expect(row[0].y).toBeGreaterThanOrEqual(rows[index - 1][0].y + 43.5);
    for (const [column, key] of row.entries()) {
      expect(Math.abs(key.x - first.x - (column + stagger) * first.width)).toBeLessThan(1);
      expect(Math.abs(key.width - first.width)).toBeLessThan(1);
      expect(key.y).toBe(row[0].y);
      expect(key.height).toBeGreaterThanOrEqual(44);
    }
  }
  const rowCount = 3 + (await keyboard.locator('.space').count());
  expect((await keyboard.boundingBox())!.height).toBeLessThanOrEqual(48 * rowCount + 4);
}
