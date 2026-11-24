import { expect, test, type Page } from '@playwright/test';
import de from '../messages/de.json' with { type: 'json' };
import { installDeterministicAudioClock } from './audio-clock';
import { answerBoxAppearance, expectPhoneQwerty } from './phone-keyboard';
import {
  EVIDENCE_DB,
  pageAlert,
  readCopyCheckpoint,
  readGuidedCheckpoint,
  readOwnedSessions,
  readSessionCount,
  resetAcceptance,
  resetToHome,
  saveAndLeave,
  startAndType
} from './helpers';

const accountId = '11111111-1111-4111-8111-111111111111';

async function changePracticeAccount(page: Page, signedIn: boolean) {
  const tab = await page.context().newPage();
  await tab.goto('/robots.txt');
  await tab.evaluate(
    ({ accountId, signedIn }) => {
      if (signedIn) {
        const payload = btoa(
          JSON.stringify({
            sub: accountId,
            exp: Math.floor(Date.now() / 1000) + 86_400
          })
        );
        localStorage.setItem('access_token', `fixture.${payload}.fixture`);
        localStorage.setItem('username', 'Synthetic learner');
      } else {
        localStorage.removeItem('access_token');
        localStorage.removeItem('username');
        localStorage.removeItem('refresh_token');
      }
    },
    { accountId, signedIn }
  );
  await tab.close();
}

async function createCheckpoint(page: Page) {
  await resetToHome(page);
  await page.goto('/en/morse/practice');
  await startAndType(page);
  await expect.poll(async () => (await readCopyCheckpoint(page)) !== null).toBe(true);
  await saveAndLeave(page);
}

async function openCheckpointInTwoTabs(page: Page) {
  await createCheckpoint(page);
  await page.goto('/en/morse/practice');
  await expect(page.getByRole('button', { name: 'Continue saved passage' })).toBeVisible();

  const other = await page.context().newPage();
  await other.goto(page.url());
  await expect(other.getByRole('button', { name: 'Continue saved passage' })).toBeVisible();
  return other;
}

test('Save & leave opens Home in a fresh document and keeps the latest copy', async ({ page }) => {
  await resetToHome(page);
  await page.goto('/en/morse/practice');
  const answer = await startAndType(page);
  await expect(page.getByRole('button', { name: 'Save & leave' })).toBeVisible();
  await answer.fill('MK');

  await saveAndLeave(page);

  const documentUrl = await page.evaluate(
    () => performance.getEntriesByType('navigation')[0]?.name
  );
  expect(documentUrl).toBe(page.url());
  await expect.poll(() => readCopyCheckpoint(page)).toMatchObject({ draft: 'MK' });
});

test('persists, resumes, and discards a practice checkpoint', async ({ page }) => {
  await createCheckpoint(page);

  await page.goto('/morse/practice');
  await expect(page.getByRole('button', { name: 'Continue saved passage' })).toBeVisible();
  await expect
    .poll(async () => (await readCopyCheckpoint(page)) as { draft?: string })
    .toMatchObject({
      draft: 'KM'
    });

  await page.getByRole('button', { name: 'Continue saved passage' }).click();
  await expect(page.getByRole('textbox', { name: 'Your copy' })).toHaveValue('KM');

  await page.getByRole('link', { name: 'Progress' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Discard and leave' }).click();
  await expect(page).toHaveURL(/\/en\/morse\/progress$/);
  await expect.poll(async () => readCopyCheckpoint(page)).toBeNull();

  await page.goto('/morse/practice');
  await expect(page.getByRole('button', { name: 'Play passage' })).toBeVisible();
});

test('rapid continue clicks do not strand the resumed session', async ({ page }) => {
  await createCheckpoint(page);
  await page.goto('/morse/practice');
  await expect(page.getByRole('button', { name: 'Continue saved passage' })).toBeVisible();

  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) =>
      candidate.textContent?.includes('Continue saved passage')
    );
    button?.click();
    button?.click();
    button?.click();
  });

  await expect(page.getByRole('textbox', { name: 'Your copy' })).toHaveValue('KM');
  await expect(pageAlert(page)).toHaveCount(0);
});

test('a direct saved-passage link opens the existing copy without playing it', async ({ page }) => {
  await createCheckpoint(page);
  await page.goto('/en/morse/practice?resume=copy');
  await expect(page.getByRole('textbox', { name: 'Your copy' })).toHaveValue('KM');
  await expect(page.getByRole('button', { name: 'Replay', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue saved passage' })).toHaveCount(0);
});

test('continuing a signed-in passage restores the draft in one visit', async ({ page }) => {
  await resetAcceptance(page, 'Synthetic account / pending sync', /\/en\/settings$/);
  await page.goto('/en/morse/practice');
  const input = await startAndType(page);
  await input.fill('M K');
  await saveAndLeave(page);
  await page.getByRole('link', { name: 'Continue saved passage', exact: true }).click();
  await expect(page).toHaveURL(/resume=copy/);
  await expect(page.getByRole('textbox', { name: 'Your copy' })).toHaveValue('M K');
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
});

test('saving on the way to another page stays in Practice until the latest draft is durable', async ({
  page
}) => {
  await resetToHome(page);
  await page.goto('/en/morse/practice');
  const answer = await startAndType(page);
  await expect.poll(() => readCopyCheckpoint(page)).toMatchObject({ draft: 'KM' });
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      if (
        this.name === 'meta' &&
        value?.key === 'checkpoint:copy' &&
        !document.documentElement.hasAttribute('data-enable-checkpoint')
      ) {
        throw new DOMException('Synthetic draft write failure', 'QuotaExceededError');
      }
      return original.call(this, value, key);
    };
  });
  await answer.fill('KMMK');
  await page.getByRole('link', { name: 'Progress' }).click();
  const dialog = page.getByRole('alertdialog');
  const save = dialog.getByRole('button', { name: 'Save and continue' });
  await save.click();
  await expect(dialog).toContainText('The session could not be saved');
  await expect(save).toBeEnabled();
  await expect(page).toHaveURL(/\/en\/morse\/practice$/);
  await expect(answer).toHaveValue('KMMK');
  expect(await readCopyCheckpoint(page)).toMatchObject({ draft: 'KM' });
  await page.evaluate(() => document.documentElement.setAttribute('data-enable-checkpoint', ''));
  await save.click();
  await expect(page).toHaveURL(/\/en\/morse\/progress$/);
  expect(await readCopyCheckpoint(page)).toMatchObject({ draft: 'KMMK' });
});

test('a second tab cannot resume while the first tab holds the session', async ({ page }) => {
  const other = await openCheckpointInTwoTabs(page);

  await Promise.all([
    page.getByRole('button', { name: 'Continue saved passage' }).click(),
    other.getByRole('button', { name: 'Continue saved passage' }).click()
  ]);
  await expect
    .poll(
      async () =>
        (await page.getByRole('textbox', { name: 'Your copy' }).count()) +
        (await other.getByRole('textbox', { name: 'Your copy' }).count())
    )
    .toBe(1);

  const winner = (await page.getByRole('textbox', { name: 'Your copy' }).count()) ? page : other;
  const loser = winner === page ? other : page;
  await expect(pageAlert(loser)).toContainText('active in another tab');
  await expect(loser.getByRole('button', { name: 'Try again' })).toBeVisible();

  await winner.close();
  await loser.getByRole('button', { name: 'Try again' }).click();
  await expect(loser.getByRole('button', { name: 'Continue saved passage' })).toBeVisible();
  await loser.getByRole('button', { name: 'Continue saved passage' }).click();
  await expect(loser.getByRole('textbox', { name: 'Your copy' })).toHaveValue('KM');
});

test('a stale card cannot resurrect a checkpoint discarded in another tab', async ({ page }) => {
  const other = await openCheckpointInTwoTabs(page);

  await page.getByRole('button', { name: 'Continue saved passage' }).click();
  await expect(page.getByRole('textbox', { name: 'Your copy' })).toHaveValue('KM');
  await page.getByRole('link', { name: 'Progress' }).click();
  await page.getByRole('button', { name: 'Discard and leave' }).click();
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
  await expect.poll(async () => readCopyCheckpoint(page)).toBeNull();
  await expect(other.getByRole('button', { name: 'Continue saved passage' })).toBeVisible();

  await other.getByRole('button', { name: 'Continue saved passage' }).click();
  await expect(other.getByRole('button', { name: 'Play passage' })).toBeVisible();
  await expect(other.getByRole('textbox', { name: 'Your copy' })).toHaveCount(0);
  await expect.poll(async () => readCopyCheckpoint(other)).toBeNull();
});

test('a corrupt checkpoint is ignored without blocking a new practice', async ({ page }) => {
  await createCheckpoint(page);
  await page.goto('/morse/practice');
  await expect(page.getByRole('button', { name: 'Continue saved passage' })).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('morsewell_ui_acceptance_evidence');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').put({
          owner: 'unclaimed',
          key: 'checkpoint:copy',
          value: {
            version: 1,
            kind: 'copy',
            id: 'copy',
            href: '/morse/practice',
            savedAt: new Date().toISOString(),
            draft: 'KM',
            attempt: {
              id: 'corrupt',
              exercise: { lesson: 1, text: 'KM' },
              settings: {},
              session: {}
            }
          }
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });

  await page.reload();
  await expect(page.getByRole('button', { name: 'Play passage' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue saved passage' })).toHaveCount(0);
  await expect(pageAlert(page)).toHaveCount(0);
});

test('account switching hides the guest checkpoint until sign-out', async ({ page }) => {
  await createCheckpoint(page);
  await page.goto('/morse/practice');
  await expect(page.getByRole('button', { name: 'Continue saved passage' })).toBeVisible();

  await changePracticeAccount(page, true);

  await expect(page.getByRole('button', { name: 'Play passage' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue saved passage' })).toHaveCount(0);
  expect(await readCopyCheckpoint(page)).not.toBeNull();

  await changePracticeAccount(page, false);

  await expect(page.getByRole('button', { name: 'Continue saved passage' })).toBeVisible();
});

test('a failed guest score leaves the signed-in draft free to save and continue', async ({
  page
}) => {
  await resetAcceptance(page, 'Practice save fails once, then retry', /\/morse\/practice$/);
  const guestCopy = await startAndType(page, 'MK');
  await guestCopy.press('Control+Enter');
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  const guest = () => readCopyCheckpoint(page);
  const account = () => readCopyCheckpoint(page, EVIDENCE_DB, `account:${accountId}`);
  await expect
    .poll(guest)
    .toMatchObject({ draft: 'MK', attempt: { session: { status: 'reviewed' } } });

  await changePracticeAccount(page, true);
  await expect(page.getByRole('button', { name: 'Play passage' })).toBeVisible();
  expect(
    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })))
  ).toBe(true);
  const current = await startAndType(page, 'KM RR');
  await expect(page.getByRole('button', { name: 'Save & leave' })).toBeVisible();
  const progress = page
    .locator('.navbar-links')
    .getByRole('link', { name: 'Progress', exact: true });
  await progress.click();
  const prompt = page.getByRole('alertdialog');
  await expect(prompt.getByRole('button', { name: 'Save and continue' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(prompt).toHaveCount(0);
  await expect(current).toHaveValue('KM RR');
  await progress.click();
  await prompt.getByRole('button', { name: 'Save and continue' }).press('Enter');
  await expect(page).toHaveURL(/\/en\/morse\/progress$/);
  await expect.poll(account).toMatchObject({ draft: 'KM RR' });
  await expect.poll(guest).toMatchObject({ draft: 'MK' });

  await changePracticeAccount(page, false);
  await page.goto('/en/morse/practice?resume=copy');
  await expect(
    page.getByRole('dialog').getByText('Practice result saved on this device.')
  ).toBeVisible();
  const sessions = await readOwnedSessions(page);
  expect(sessions.map((s) => s.ownerKey)).toEqual(['unclaimed']);
  await expect.poll(guest).toBeNull();
  await expect.poll(account).toMatchObject({ draft: 'KM RR' });
});

test.describe('saving a passage after switching accounts on a phone', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('a late guest save cannot clear the signed-in draft', async ({ page }) => {
    await resetToHome(page);
    await page.goto('/en/morse/practice');
    await startAndType(page, 'MK');
    await page.clock.install();
    await page.evaluate(() =>
      sessionStorage.setItem('acceptance.loadingUntil', String(Date.now() + 60_000))
    );
    await page.getByRole('button', { name: 'Score this passage' }).tap();
    await expect(
      page.getByRole('dialog').getByText('Saving practice on this device…')
    ).toBeVisible();
    await changePracticeAccount(page, true);
    await page.getByRole('button', { name: 'Play passage' }).tap();
    await page.getByRole('textbox', { name: 'Your copy' }).fill('KM RR');
    const save = page.getByRole('button', { name: 'Save & leave' });
    await expect(save).toBeVisible();
    await page.clock.fastForward(60_001);
    await expect.poll(() => readSessionCount(page)).toBe(1);
    await expect.poll(() => readCopyCheckpoint(page)).toBeNull();
    await save.tap();
    await expect(page).toHaveURL(/\/en$/);
    await expect
      .poll(() => readCopyCheckpoint(page, EVIDENCE_DB, `account:${accountId}`))
      .toMatchObject({ draft: 'KM RR' });
  });
});

test('retrying a failed practice save records exactly one session', async ({ page }) => {
  await resetAcceptance(page, 'Practice save fails once, then retry', /\/morse\/practice$/);
  await startAndType(page);
  await page.getByRole('button', { name: 'Score this passage' }).click();

  await expect(pageAlert(page)).toContainText('has not been saved');
  expect(await readSessionCount(page)).toBe(0);

  await page
    .getByRole('dialog', { name: 'Practice results' })
    .getByRole('button', { name: 'Close' })
    .click();
  await page.getByRole('button', { name: 'Retry saving' }).click();
  await expect(page.getByText('Practice result saved on this device')).toBeVisible();
  await expect.poll(async () => readSessionCount(page)).toBe(1);
  await expect.poll(async () => readCopyCheckpoint(page)).toBeNull();
});

test.describe('passage setup on a phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    hasTouch: true
  });
  test('previews the generated duration, then keeps editing and scoring reachable', async ({
    page
  }) => {
    await resetToHome(page);
    await page.goto('/en/morse/practice');
    const length = await page.locator('.audio-length').innerText();
    await expect(page.getByText('Type what you hear. Leave a space between groups.')).toBeVisible();
    await page.getByRole('button', { name: 'Play passage' }).tap();
    const answer = page.getByRole('textbox', { name: 'Your copy' });
    await expect(answer).toHaveAttribute('inputmode', 'none');
    const keys = page.getByRole('group', { name: 'Training keyboard' });
    for (const name of ['K', 'Space', 'M'])
      await keys.getByRole('button', { name, exact: true }).tap();
    await expect(answer).toHaveValue('K M');
    const score = page.getByRole('button', { name: 'Score this passage' });
    await expect(page.getByRole('combobox', { name: 'Practice content' })).toHaveCount(0);
    await expect(page.locator('.score-shortcut')).toBeHidden();
    await score.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(score).toBeInViewport({ ratio: 1 });
    await score.tap();
    const result = page.getByRole('dialog', { name: 'Practice results' });
    await expect(result).toBeVisible();
    await result.getByRole('button', { name: 'Close' }).tap();
    await expect(answer).toHaveAttribute('readonly');
    const clock = page.locator('.player-inline-timer');
    await page.getByRole('button', { name: 'Replay', exact: true }).tap();
    await expect(clock).toContainText('/ ' + length.match(/\d+:\d{2}/)![0]);
    const setup = page.locator('.setup-details > summary');
    await setup.tap();
    await expect(page.getByRole('combobox', { name: 'Practice content' })).toBeVisible();
    await setup.tap();
    await expect(answer).toHaveValue('K M');
    await expect(keys).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'Lesson keys only' })).toHaveCount(0);
  });

  test('lesson keys follow the cumulative group lesson and leave words unrestricted', async ({
    page
  }) => {
    await resetToHome(page);
    await page.goto('/en/morse/practice');
    const button = (name: string) => page.getByRole('button', { name, exact: true });
    const filter = page.getByRole('checkbox', { name: 'Lesson keys only' });
    const characters = page.locator('.keys .character');
    const enabled = page.locator('.keys .character:enabled');
    const setup = page.locator('.setup-details > summary');
    const play = button('Play passage');
    const replace = button('Discard and start new passage');
    await play.tap();
    await expect(filter).toBeChecked();
    await expectPhoneQwerty(page);
    await expect(enabled).toHaveText(['K', 'M']);
    await expect(button('Space')).toBeEnabled();
    await expect(button('Backspace')).toBeEnabled();
    const layer = page.locator('.training-keyboard .layer');
    const layerPosition = () =>
      layer.evaluate((button) => {
        const deck = button.closest('.training-keyboard')!.getBoundingClientRect();
        const key = button.getBoundingClientRect();
        return [key.x - deck.x, key.y - deck.y, key.width, key.height, deck.height];
      });
    const letterPosition = await layerPosition();
    await button('123 · Numbers and punctuation').tap();
    expect(await layerPosition()).toEqual(letterPosition);
    await expect(characters).toHaveText([...'1234567890.,/?']);
    await expect(enabled).toHaveCount(0);
    await button('ABC · Letters').tap();

    await setup.tap();
    await page.getByLabel('Use characters through lesson').selectOption('18');
    await replace.tap();
    await play.tap();
    await expect(filter).toBeChecked();
    await expectPhoneQwerty(page);
    await expect(button('R')).toBeEnabled();
    await expect(button('Y')).toBeEnabled();
    await expect(button('Z')).toBeDisabled();
    await button('123 · Numbers and punctuation').tap();
    await expect(enabled).toHaveText(['0', '.']);
    await setup.tap();
    await page.getByLabel('Practice content').selectOption('words');
    await replace.tap();
    await play.tap();
    await expect(filter).toHaveCount(0);
    await expect(enabled).toHaveText([...'QWERTYUIOPASDFGHJKLZXCVBNM']);
  });

  test('the app keyboard preserves physical word deletion and undo in a passage', async ({
    page
  }) => {
    await resetToHome(page);
    await page.goto('/en/morse/practice');
    await page.getByRole('button', { name: 'Play passage' }).tap();
    const copy = page.getByRole('textbox', { name: 'Your copy' });
    await expect(copy).toHaveAttribute('inputmode', 'none');
    await copy.press('K');
    await expect(copy).toHaveValue('K');
    await copy.press('ControlOrMeta+z');
    await expect(copy).toHaveValue('');
    await copy.pressSequentially('KM MK');
    await copy.press(process.platform === 'darwin' ? 'Alt+Backspace' : 'Control+Backspace');
    await expect(copy).toHaveValue('KM ');
    await expect(page.getByRole('group', { name: 'Training keyboard' })).toBeVisible();
  });

  test('edits a selection, restores the copy and shares the keyboard choice with Lessons', async ({
    page
  }) => {
    await resetToHome(page, 'Returning learner / populated history');
    await page.goto('/en/morse/practice');
    const button = (name: string) => page.getByRole('button', { name, exact: true });
    await button('Play passage').tap();
    const filter = page.getByRole('checkbox', { name: 'Lesson keys only' });
    const copy = page.getByRole('textbox', { name: 'Your copy' });
    await copy.pressSequentially('KM');
    await page.keyboard.down('M');
    await page.keyboard.down('M');
    await page.keyboard.up('M');
    await expect(copy).toHaveValue('KMMM');
    await page.keyboard.down('Backspace');
    await page.keyboard.down('Backspace');
    await page.keyboard.up('Backspace');
    await expect(copy).toHaveValue('KM');
    await filter.uncheck();
    await expect(copy).toHaveValue('KM');
    await copy.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(0, 1));
    await button('123 · Numbers and punctuation').tap();
    await expect(copy).toBeFocused();
    await button('5').tap();
    await button('Slash').tap();
    await expect(copy).toHaveValue('5/M');
    await button('Backspace').tap();
    await expect(copy).toHaveValue('5M');
    const appBox = await answerBoxAppearance(copy);
    await button('Use phone keyboard').tap();
    await expect(filter).toHaveCount(0);
    await expect(copy).toBeEditable();
    await expect(copy).toBeFocused();
    expect(await answerBoxAppearance(copy)).toEqual(appBox);
    await expect(copy).toHaveValue('5M');
    await saveAndLeave(page);
    await page.goto('/en/morse/practice?resume=copy');
    await expect(copy).toHaveValue('5M');
    await expect(copy).toBeEditable();
    await button('Use app keyboard').tap();
    await expect(filter).not.toBeChecked();
    await expect(button('Z')).toBeEnabled();
    await filter.check();
    await button('Use phone keyboard').tap();
    await saveAndLeave(page);
    await installDeterministicAudioClock(page);
    await page.goto('/en/morse/learn/session?check=KM');
    await button('Start first-listen check').tap();
    const answer = page.getByRole('textbox', { name: 'Type your answer' });
    await expect(answer).toBeEditable();
    const nativeBox = await answerBoxAppearance(answer);
    expect(nativeBox.width).toBe(nativeBox.height);
    expect(nativeBox.width).toBeGreaterThanOrEqual(80);
    await button('Use app keyboard').tap();
    await expect(answer).toHaveAttribute('inputmode', 'none');
    expect(await answerBoxAppearance(answer)).toEqual(nativeBox);
    await expect(filter).toHaveCount(0);
    await expect(page.locator('.keys .character:enabled')).toHaveCount(26);
    await expect(button('Backspace')).toHaveCount(0);
    await button('123 · Numbers and punctuation').tap();
    await expect(button('0')).toBeEnabled();
    await button('ABC · Letters').tap();
    await expect(page.locator('body')).not.toHaveClass(/keyboard-open/);
    await button('K').tap();
    await expect
      .poll(() => readGuidedCheckpoint(page))
      .toMatchObject({
        state: {
          attempts: [
            {
              enteredText: 'K',
              inputMode: 'touch',
              responseInterface: 'full-alphabet',
              replayCount: 0
            }
          ]
        }
      });
  });
});

test.describe('Practice at 320px on a phone', () => {
  const size = { width: 320, height: 844 };
  test.use({ viewport: size, screen: size, hasTouch: true });
  test('German keys and scoring controls stay inside the passage at 200% text', async ({
    page
  }) => {
    await resetToHome(page);
    await page.goto('/de/morse/practice', { waitUntil: 'networkidle' });
    await page.addStyleTag({ content: 'html {font-size: 200%}' });
    await page.getByRole('button', { name: de.practice_start }).click();
    const keys = page.getByRole('group', { name: de.training_keyboard });
    await keys.getByRole('button', { name: 'K', exact: true }).tap();
    for (const toggle of [de.training_numbers, de.training_letters]) {
      await keys.getByRole('button', { name: toggle }).tap();
      expect(
        await keys.getByRole('button').evaluateAll((buttons) =>
          buttons.every((b) => {
            const box = b.getBoundingClientRect();
            return box.left >= 0 && box.right <= innerWidth && b.scrollWidth <= b.clientWidth + 1;
          })
        )
      ).toBe(true);
    }
    const score = page.getByRole('button', { name: de.trainer_check, exact: true });
    const box = (await score.boundingBox())!;
    const card = (await page.getByRole('region', { name: de.practice_copy_region }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(card.x);
    expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width + 1);
    await score.click();
    await expect(page.getByRole('dialog', { name: de.trainer_result_title })).toBeVisible();
  });
});

test('context choices preserve the groups lesson and checked playback stays listen-only', async ({
  page
}) => {
  await resetToHome(page);
  await page.goto('/en/morse/practice');
  const lesson = page.getByLabel('Use characters through lesson');
  const content = page.getByLabel('Practice content');
  await lesson.selectOption('2');
  await content.selectOption('words');
  await expect(page.getByText('12 English words', { exact: true })).toBeVisible();
  await content.selectOption('groups');
  await expect(lesson).toHaveValue('2');
  await content.selectOption('words');
  const answer = await startAndType(page, 'RADIO');
  await answer.press('Enter');
  await expect(answer).toHaveValue('RADIO\n');
  await expect(page.getByRole('dialog', { name: 'Practice results' })).toHaveCount(0);
  await answer.press('Control+Enter');
  const results = page.getByRole('dialog', { name: 'Practice results' });
  await expect(results.getByText('Passage accuracy', { exact: true })).toBeVisible();
  await expect(results.getByText('Practice result saved on this device.')).toBeVisible();
  await results.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await expect(page.getByText('Replaying scored passage')).toBeVisible();
  await expect(answer).toHaveAttribute('readonly');
  await expect(page.getByRole('button', { name: 'Score this passage' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByText('Scored passage replay paused')).toBeVisible();
  await expect.poll(() => readCopyCheckpoint(page)).toBeNull();
  await page.getByRole('link', { name: 'Progress', exact: true }).click();
  await page.goto('/en/morse/progress?view=history');
  await expect(page.getByText('Words', { exact: true })).toBeVisible();
});

async function waitForClientRouting(page: Page) {
  const trigger = page.getByRole('button', { name: 'About Practice' });
  await expect(trigger).toBeVisible();
  await expect
    .poll(
      async () => {
        if (await page.getByRole('dialog').count()) return true;
        await trigger.click();
        return (await page.getByRole('dialog').count()) > 0;
      },
      { timeout: 10_000 }
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('browser Back keeps the draft or saves it and follows the original destination', async ({
  page
}) => {
  await resetToHome(page);
  await page.goto('/morse/practice', { waitUntil: 'networkidle' });
  await waitForClientRouting(page);
  await page.getByRole('link', { name: 'Progress' }).click();
  await page.waitForURL(/\/en\/morse\/progress$/);
  await page.getByRole('link', { name: 'Practice', exact: true }).click();
  await page.waitForURL(/\/en\/morse\/practice$/);
  await startAndType(page);
  await expect.poll(async () => (await readCopyCheckpoint(page)) !== null).toBe(true);

  await page.evaluate(() => history.back());
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Stay in Practice' }).click();
  await expect(page).toHaveURL(/\/en\/morse\/practice$/);
  await expect(page.getByRole('textbox', { name: 'Your copy' })).toHaveValue('KM');

  await page.evaluate(() => history.back());
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page).toHaveURL(/\/en\/morse\/progress$/);
  await expect.poll(() => readCopyCheckpoint(page)).toMatchObject({ draft: 'KM' });
});

test('volume preserves playback and the draft; saved passages can be kept or explicitly discarded', async ({
  page
}) => {
  await resetToHome(page);
  await page.goto('/en/morse/practice');
  const answer = await startAndType(page, 'KM');
  await expect.poll(() => readCopyCheckpoint(page)).toMatchObject({ draft: 'KM' });
  const original = (await readCopyCheckpoint(page)) as {
    attempt: { id: string; exercise: { text: string } };
  };
  await page.getByText('Audio settings', { exact: true }).click();
  await page.getByRole('slider', { name: /Volume/ }).press('Home');
  await page.getByRole('slider', { name: /Volume/ }).press('ArrowRight');
  await expect(answer).toHaveValue('KM');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect
    .poll(() => readCopyCheckpoint(page))
    .toMatchObject({
      draft: 'KM',
      attempt: {
        id: original.attempt.id,
        exercise: original.attempt.exercise,
        settings: { volume: 0.05 }
      }
    });
  await page.getByRole('link', { name: 'Progress' }).click();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page).toHaveURL(/\/en\/morse\/progress$/);
  await page.getByRole('link', { name: 'Practice', exact: true }).click();
  const discard = page.getByRole('button', { name: 'Discard saved session', exact: true });
  await discard.click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: 'Keep saved session' }).click();
  await expect(discard).toBeFocused();
  await expect.poll(() => readCopyCheckpoint(page)).toMatchObject({ draft: 'KM' });
  await discard.click();
  await dialog.getByRole('button', { name: 'Discard saved session' }).click();
  await expect.poll(() => readCopyCheckpoint(page)).toBeNull();
  await expect(page.getByRole('button', { name: 'Play passage' })).toBeVisible();
});

test('passage feedback identifies changed letters in the original groups', async ({ page }) => {
  await resetToHome(page);
  await page.goto('/en/morse/practice');
  const answer = await startAndType(page);
  await expect.poll(() => readCopyCheckpoint(page)).not.toBeNull();
  const checkpoint = (await readCopyCheckpoint(page)) as {
    attempt: { exercise: { text: string } };
  };
  const groups = checkpoint.attempt.exercise.text.trim().split(' ');
  expect(groups.length).toBeGreaterThanOrEqual(2);
  const copy = groups.map((group, i) => {
    if (i > 1) return group;
    return group.slice(0, -1) + (group.endsWith('K') ? 'M' : 'K');
  });
  await answer.fill(copy.join(' '));
  await page.getByRole('button', { name: 'Score this passage' }).click();
  const result = page.getByRole('dialog', { name: 'Practice results' });
  await expect(result.getByText('2 characters differed.')).toBeVisible();
  const corrections = result.locator('.diff-group');
  await expect(corrections).toHaveCount(2);
  await expect(result.getByRole('columnheader', { name: 'Sent' })).toBeVisible();
  await expect(result.getByRole('columnheader', { name: 'You typed' })).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await expect(
      corrections.nth(i).getByRole('img', {
        name: `You copied ${copy[i].at(-1)}; expected ${groups[i].at(-1)}.`,
        exact: true
      })
    ).toBeVisible();
  }
  await expect(result.getByRole('img', { name: /^(Missing|Extra):/ })).toHaveCount(0);
});
