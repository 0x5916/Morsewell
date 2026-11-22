import { expect, test, type Page } from '@playwright/test';
import { readGuidedCheckpoint, readOwnedAttempts, readOwnedSessions, resetToHome } from './helpers';

/**
 * Headless Firefox on Linux has no audio device: AudioContext.resume() never
 * resolves and the introduction would remain on “Listening…” forever. This
 * test exercises guided session transitions, while audio.preview.spec.ts
 * keeps real Web Audio lifecycle coverage.
 */
async function installDeterministicAudioClock(page: Page) {
  await page.addInitScript(() => {
    class FakeParam {
      value = 0;
      setValueAtTime() {}
      linearRampToValueAtTime() {}
    }
    class FakeGain {
      gain = new FakeParam();
      connect() {}
      disconnect() {}
    }
    class FakeOscillator {
      frequency = new FakeParam();
      onended: (() => void) | null = null;
      connect() {}
      disconnect() {}
      start() {}
      stop(when = 0) {
        if (this.onended && document.documentElement.hasAttribute('data-hold-test-audio')) {
          window.addEventListener('finish-test-audio', () => this.onended?.(), { once: true });
        } else {
          setTimeout(() => this.onended?.(), Math.max(0, when * 1000));
        }
      }
    }
    class FakeAudioContext {
      state = 'running';
      currentTime = 0;
      destination = {};
      baseLatency = 0;
      outputLatency = 0;
      createOscillator() {
        return new FakeOscillator();
      }
      createGain() {
        return new FakeGain();
      }
      async resume() {
        this.state = 'running';
      }
      async suspend() {
        this.state = 'suspended';
      }
      async close() {
        this.state = 'closed';
      }
    }
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: FakeAudioContext
    });
  });
}

type GuidedPrompt = {
  id: string;
  spec: { kind: string; expectedText: string };
};

type GuidedCheckpoint = {
  state: {
    phase: string;
    currentPromptIndex: number;
    prompts: GuidedPrompt[];
  };
};

/** Hold the simulated tone long enough to inspect what the user sees during playback. */
async function holdAudio(page: Page) {
  await page.evaluate(() => document.documentElement.setAttribute('data-hold-test-audio', ''));
}

async function finishAudio(page: Page) {
  await page.evaluate(() => {
    document.documentElement.removeAttribute('data-hold-test-audio');
    window.dispatchEvent(new Event('finish-test-audio'));
  });
}

async function checkRecall(page: Page, expected: string, touch: boolean) {
  const prompt = page.locator('.recognition');
  const play = prompt.getByRole('button', { name: 'Play sound', exact: true });
  const replay = prompt.getByRole('button', { name: 'Replay sound', exact: true });
  const input = prompt.getByRole('textbox', { name: 'Type your answer' });
  const transition = prompt.getByText(
    'Type one character to submit. Your answer counts toward your guided lesson targets.'
  );
  const listening = prompt.getByText('Listening…', { exact: true });
  await expect(play).toBeEnabled();
  await expect(transition).toBeVisible();
  await expect(input).toHaveCount(0);
  if (!touch) await expect(play.locator('kbd')).toBeVisible();
  const decoded = new RegExp(`\\b${expected}\\b|[.·•−–-]{2,}`);
  for (const control of [play, replay]) {
    await holdAudio(page);
    if (touch) await control.tap();
    else await page.keyboard.press('Space');
    await expect(listening).toHaveCount(1);
    await expect(input).toHaveCount(0);
    await expect(transition).toBeHidden();
    await expect(prompt.locator('[aria-keyshortcuts~="Space"]')).toHaveCount(0);
    await expect(prompt).not.toContainText(decoded);
    await finishAudio(page);
    await expect(input).toBeEnabled();
    await expect(prompt.getByRole('heading', { name: 'What did you hear?' })).toBeVisible();
    await expect(transition).toBeHidden();
    await expect(replay).toBeEnabled();
    await expect(listening).toHaveCount(0);
    if (!touch) await expect(replay.locator('kbd')).toBeVisible();
    const fieldBox = await input.boundingBox();
    const replayBox = await replay.boundingBox();
    expect(fieldBox!.y + fieldBox!.height).toBeLessThanOrEqual(replayBox!.y);
    await expect(prompt).not.toContainText(decoded);
    if (!touch) await expect(input).toBeFocused();
  }
  await input.fill(expected);
  const proceed = prompt.getByRole('button', { name: 'Play next sound', exact: true });
  await expect(proceed).toBeEnabled();
  await expect(replay).toHaveCount(0);
  await expect(proceed).toHaveAttribute('aria-keyshortcuts', 'Enter');
  if (touch) await proceed.tap();
  else await page.keyboard.press('Enter');
}

async function completeGuidedLesson(page: Page, touch: boolean) {
  test.setTimeout(120_000);
  await resetToHome(page);
  await installDeterministicAudioClock(page);
  await page.goto('/morse/learn/session?step=1');

  await expect
    .poll(async () => (await readGuidedCheckpoint(page)) !== null, { timeout: 10_000 })
    .toBe(true);
  const checkpoint = (await readGuidedCheckpoint(page)) as GuidedCheckpoint;
  const prompts = checkpoint.state.prompts;
  const firstRecall = prompts.findIndex((prompt) => prompt.spec.kind === 'recall');
  expect(firstRecall).toBeGreaterThan(0);

  for (const [index, prompt] of prompts.entries()) {
    const { kind, expectedText: expected } = prompt.spec;
    if (kind === 'introduction') {
      const listen = page.getByRole('button', { name: `Listen to ${expected}` });
      if (index === 0) {
        await holdAudio(page);
        if (touch) await listen.tap();
        else await listen.press('Enter');
        await expect(
          page.getByText('Listening…', { exact: true }).filter({ visible: true })
        ).toHaveCount(1);
        await expect(page.locator('.introduction [aria-keyshortcuts]')).toHaveCount(0);
        await finishAudio(page);
      } else if (await listen.isVisible()) await listen.click();
      const proceed = page.getByRole('button', { name: 'Continue' });
      await expect(proceed).toBeVisible({ timeout: 10_000 });
      await proceed.click();
    } else if (index === firstRecall) {
      await checkRecall(page, expected, touch);
    } else {
      if (kind === 'short-group' && prompts[index - 1]?.spec.kind !== kind) {
        await expect(
          page.getByText(
            `Listen for ${expected.length} characters. Type them in order. The group counts once toward this session only.`
          )
        ).toBeVisible();
      }
      const play = page.getByRole('button', { name: 'Play sound' });
      if (await play.isVisible().catch(() => false)) await play.click();

      // The desktop run reproduces the five-of-eleven rounding case.
      const correct = touch || index < firstRecall + 5;
      const other = expected[0] === 'K' ? 'M' : 'K';
      const response = correct ? expected : other + expected.slice(1);
      if (kind === 'recall' || kind === 'short-group') {
        const input = page.getByRole('textbox', { name: 'Type your answer' });
        await expect(input).toBeEnabled({ timeout: 10_000 });
        await input.fill(response);
      } else {
        const option = page.getByRole('button', { name: `Select ${response}`, exact: true });
        await expect(option).toBeEnabled({ timeout: 10_000 });
        await option.click();
      }

      const next = prompts[index + 1]?.spec;
      const sameFormat = next?.kind === kind && next.expectedText.length === expected.length;
      const proceed = page.getByRole('button', {
        name: correct && sameFormat ? 'Play next sound' : 'Continue',
        exact: true
      });
      await expect(proceed).toBeVisible({ timeout: 10_000 });
      await proceed.click();
    }

    await expect
      .poll(
        async () => {
          const next = (await readGuidedCheckpoint(page)) as GuidedCheckpoint | null;
          return next?.state.currentPromptIndex ?? prompts.length;
        },
        { timeout: 10_000 }
      )
      .toBeGreaterThan(index);
  }

  await expect(page.getByRole('region', { name: 'Session results' })).toBeVisible({
    timeout: 10_000
  });
  await expect.poll(async () => readGuidedCheckpoint(page)).toBeNull();

  const sessions = await readOwnedSessions(page);
  const attempts = await readOwnedAttempts(page);
  const guided = sessions.filter((session) => session.mode === 'guided');
  expect(guided).toHaveLength(1);
  expect(guided[0]).toMatchObject({ status: 'completed', completedPromptCount: prompts.length });
  expect(attempts.length).toBeGreaterThan(0);
  expect(new Set(attempts.map((attempt) => attempt.id)).size).toBe(attempts.length);
  expect(attempts.every((attempt) => attempt.sessionId === guided[0].id)).toBe(true);
  expect(attempts.filter((attempt) => attempt.promptId === prompts[firstRecall].id)).toEqual([
    expect.objectContaining({ replayCount: 1, isCorrect: true })
  ]);

  if (!touch) {
    const result = page.getByRole('region', { name: 'Session results' });
    await expect(result.getByText('5 of 11 scored answers correct')).toBeVisible();
    await expect(result.getByText('45%', { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Finish for today' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish for today' }).click();
  await expect(page).toHaveURL(/\/en\/morse\/learn$/);
  expect(
    (await readOwnedSessions(page)).filter((session) => session.mode === 'guided')
  ).toHaveLength(1);
  if (!touch) {
    await page.goto('/en/morse/progress');
    const activity = page.getByRole('region', { name: 'Recent activity summary' });
    await expect(activity.locator('.accuracy-measure')).toHaveText('45%');
    await page.getByRole('link', { name: 'History', exact: true }).click();
    await expect(page.getByText('45%', { exact: true })).toBeVisible();
  }
}

test('a guided lesson completes once with phase-specific playback cues and keyboard replay', async ({
  page
}) => {
  await completeGuidedLesson(page, false);
});

test.describe('guided playback on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme: 'dark' });

  test('tapping Play, Replay and Continue completes the guided lesson once', async ({ page }) => {
    await completeGuidedLesson(page, true);
  });
});

for (const [locale, width] of [
  ['de', 390],
  ['ja', 320]
] as const) {
  test(`the ${locale} introduction keeps Play in the first viewport at ${width}px and 200% text`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await resetToHome(page);
    await installDeterministicAudioClock(page);
    await page.goto(`/${locale}/morse/learn/session?step=1`);
    await page.locator('.introduction').waitFor();
    await page.addStyleTag({ content: 'html { font-size: 200% !important }' });
    await expect(page.locator('.introduction h1')).toHaveText('K');
    const listen = page.locator('.introduction .btn-primary');
    await expect(listen).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    );
    await listen.click();
    await expect(page.locator('.introduction .replay')).toBeEnabled();
  });
}

test('Back offers save and end without revealing the saved answer', async ({ page }) => {
  await resetToHome(page, 'Returning learner / populated history');
  await page.goto('/en/morse/learn');
  await page.getByRole('button', { name: 'Start lesson 2', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Meet R' })).toBeVisible();
  await page.evaluate(() => window.history.back());
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('heading', { name: 'End this guided session?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Resume session' }).click();
  await expect(page.getByRole('heading', { name: 'Meet R' })).toBeVisible();
  await page.evaluate(() => window.history.back());
  await dialog.getByRole('button', { name: 'Save & leave' }).click();
  await expect(page).toHaveURL(/\/en\/morse\/learn$/);
  await expect(page.locator('.saved-sessions article h2')).toHaveText('Lesson 2: R');
  await expect(page.locator('.saved-sessions article')).toContainText('Prompt 1 of 14');
});

test('coaching explains its scope at entry and on pause, and keeps each answer focused on the sound', async ({
  page
}) => {
  await resetToHome(page, 'Returning learner / populated history');
  await installDeterministicAudioClock(page);
  await page.goto('/en/morse/learn/session?review=KM');
  const policy = page.getByText(/No milestone is awarded/);
  await expect(policy).toBeVisible();
  await page.getByRole('button', { name: 'Begin round' }).click();
  await expect(page.locator('.phase-label')).toHaveText('Coaching');
  await page.getByRole('button', { name: 'Play sound' }).click();
  await page.getByRole('textbox', { name: 'Type your answer' }).fill('X');
  await expect(page.getByRole('button', { name: 'Your answer · X' })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Correct sound/ })).toBeEnabled();
  await expect(policy).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Pause review' }).click();
  await expect(policy).toBeVisible();
});

test('a missed sound keeps its two playable answers and Continue together at 200% text', async ({
  page
}) => {
  await resetToHome(page, 'Returning learner / populated history');
  await installDeterministicAudioClock(page);
  await page.goto('/en/morse/learn/session?review=KM');
  await page.getByRole('button', { name: 'Begin round' }).click();
  await page.getByRole('button', { name: 'Play sound' }).click();
  await page.getByRole('textbox', { name: 'Type your answer' }).fill('X');
  const entered = page.getByRole('button', { name: 'Your answer · X' });
  const expected = page.getByRole('button', { name: /Correct sound/ });
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await expect(entered).toBeEnabled();
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const [first, second, action] = await Promise.all(
      [entered, expected, next].map((control) => control.boundingBox())
    );
    if (!first || !second || !action) throw new Error('Missing feedback control');
    if (width === 320) {
      expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
      expect(second.x).toBeCloseTo(first.x);
    } else {
      expect(second.y).toBeCloseTo(first.y);
      expect(second.x).toBeGreaterThanOrEqual(first.x + first.width);
    }
    expect(second.height).toBeLessThan(150);
    const gap = action.y - (second.y + second.height);
    expect(gap).toBeGreaterThanOrEqual(8);
    expect(gap).toBeLessThanOrEqual(25);
    await entered.click();
    await expect(entered).toHaveAttribute('aria-busy', 'false');
  }
  await next.click();
  await expect(page.getByRole('button', { name: 'Play sound' })).toBeEnabled();
});

for (const locale of ['en', 'de', 'ja', 'zh-Hans', 'zh-Hant']) {
  test(`feedback replay uses the whole visible button label in ${locale}`, async ({ page }) => {
    await resetToHome(page, 'Returning learner / populated history');
    await installDeterministicAudioClock(page);
    await page.goto(`/${locale}/morse/learn/session?review=KM`);
    const begin = page.locator('.review-panel .actions .btn-primary');
    await expect(begin).toBeVisible();
    await expect(page.getByRole('main')).toHaveCount(1);
    await begin.click();
    await page.locator('.recognition .play-controls button').click();
    await page.getByRole('textbox').fill('X');
    const sounds = page.locator('.sounds button');
    await expect(sounds).toHaveCount(2);
    for (const sound of await sounds.all()) {
      const label = (await sound.innerText()).trim();
      await expect(sound).toHaveAccessibleName(label);
      await expect(sound).toHaveAccessibleDescription(/\S/);
      await holdAudio(page);
      await page.getByRole('button', { name: label, exact: true }).press('Enter');
      await expect(sound).toHaveAttribute('aria-busy', 'true');
      await expect(sound).toHaveAccessibleName((await sound.innerText()).trim());
      await finishAudio(page);
      await expect(sound).toHaveAccessibleName(label);
    }
  });
}

test('a completed mixed check counts replayed and skipped targets in its first-listen total', async ({
  page
}) => {
  test.setTimeout(90_000);
  await resetToHome(page, 'Returning learner / populated history');
  await installDeterministicAudioClock(page);
  await page.goto('/en/morse/learn/session?check=K');
  await expect(page.getByText(/Only correct first listens earn credit/)).toBeVisible();
  await page.getByRole('button', { name: 'Start first-listen check' }).click();
  const answer = page.getByRole('textbox', { name: 'Type your answer' });
  await expect(answer).toBeEnabled();
  const checkpoint = (await readGuidedCheckpoint(page)) as GuidedCheckpoint;
  const prompts = checkpoint.state.prompts;
  expect(prompts).toHaveLength(14);

  const activeDocument = await page.evaluate(() => performance.timeOrigin);
  let targetCount = 0;
  for (const [index, prompt] of prompts.entries()) {
    await expect(
      page.getByRole('progressbar', { name: `Prompt ${index + 1} of 14` })
    ).toBeVisible();
    await expect(answer).toBeEnabled();
    const character = prompt.spec.expectedText;
    if (character === 'K') {
      targetCount++;
      if (targetCount === 1) {
        await page.getByRole('button', { name: 'Replay sound' }).click();
        await expect(answer).toBeEnabled();
        await expect(
          page.getByText(/Replayed · no first-listen credit for this sound/)
        ).toBeVisible();
      } else if (targetCount === 2) {
        await page.getByRole('button', { name: 'Skip', exact: true }).click();
        continue;
      }
    }
    await answer.fill(character);
  }
  await expect(page.getByRole('heading', { name: 'Check complete' })).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(activeDocument);
  await expect(page.getByRole('heading', { name: 'Correct without replay' })).toBeVisible();
  const target = page
    .locator('.mixed-panel dl > div')
    .filter({ has: page.getByText('K', { exact: true }) });
  await expect(target.getByRole('definition')).toHaveText('8 of 10');
  await page.getByRole('button', { name: 'Finish for today' }).click();
  await expect(page).toHaveURL(/\/en\/morse\/progress$/);
});

test('only an interrupted first play offers a fresh check and keeps the old check closed', async ({
  page
}) => {
  await resetToHome(page, 'Returning learner / populated history');
  await installDeterministicAudioClock(page);
  await page.goto('/en/morse/learn/session?check=K');
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect.poll(() => readGuidedCheckpoint(page)).toBeNull();
  await page.getByRole('button', { name: 'Start first-listen check' }).click();
  const answer = page.getByRole('textbox', { name: 'Type your answer' });
  await expect(answer).toBeEnabled();
  await page.getByRole('button', { name: 'Pause check' }).click();
  await expect(page.getByRole('button', { name: 'Restart check' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume check' }).last().click();
  await holdAudio(page);
  await page.getByRole('button', { name: 'Replay sound' }).click();
  await page.getByRole('button', { name: 'Pause check' }).click();
  await expect(page.getByRole('button', { name: 'Restart check' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume check' }).last().click();
  await finishAudio(page);
  await expect(answer).toBeEnabled();
  await holdAudio(page);
  await answer.fill('K');
  await expect(page.getByRole('progressbar', { name: 'Prompt 2 of 14' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause check' }).click();
  await expect(page.getByText(/This check can no longer record a milestone/)).toBeVisible();
  const oldId = new URL(page.url()).searchParams.get('resume');
  expect(oldId).toBeTruthy();
  await finishAudio(page);
  await page.getByRole('button', { name: 'Restart check' }).click();
  await expect(answer).toBeEnabled();
  await expect(page.getByRole('progressbar', { name: 'Prompt 1 of 14' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('resume')).not.toEqual(oldId);
  await page.getByRole('button', { name: 'Pause check' }).click();
  await expect(page.getByRole('button', { name: 'Restart check' })).toHaveCount(0);
});

test('reloading a saved first listen warns before it loses milestone eligibility', async ({
  page,
  browserName
}) => {
  await resetToHome(page, 'Returning learner / populated history');
  await installDeterministicAudioClock(page);
  await page.goto('/en/morse/learn/session?check=KM');
  const canUnload = () =>
    page.evaluate(() => window.dispatchEvent(new Event('beforeunload', { cancelable: true })));
  const start = page.getByRole('button', { name: 'Start first-listen check' });
  await expect(start).toBeEnabled();
  expect(await canUnload()).toBe(true);
  await start.click();
  const answer = page.getByRole('textbox', { name: 'Type your answer' });
  await expect(answer).toBeEnabled();
  await expect
    .poll(() => readGuidedCheckpoint(page))
    .toMatchObject({ state: { phase: 'answering' } });
  const saving = page.getByText('Saving on this device…', { exact: true });
  await expect(saving).toBeHidden();
  expect(await canUnload()).toBe(false);

  // Dismissing a native tab-close prompt keeps this exact listen eligible.
  if (browserName === 'chromium') {
    const documentStart = await page.evaluate(() => performance.timeOrigin);
    const warning = page.waitForEvent('dialog');
    const closing = page.close({ runBeforeUnload: true });
    const dialog = await warning;
    expect(dialog.type()).toBe('beforeunload');
    await dialog.dismiss();
    await closing;
    await expect(answer).toBeEnabled();
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentStart);
    expect(await canUnload()).toBe(false);
  }

  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByText(/A first listen was interrupted/)).toBeVisible();
  await expect(saving).toBeHidden();
  expect(await canUnload()).toBe(true);
});

test('resuming an exposed mixed-check prompt warns before leaving and finishes without a milestone', async ({
  page
}) => {
  test.setTimeout(90_000);
  await resetToHome(page, 'Returning learner / populated history');
  await installDeterministicAudioClock(page);
  await page.goto('/en/morse/learn/session?check=KM');
  await page.getByRole('button', { name: 'Start first-listen check' }).click();
  const answer = page.getByRole('textbox', { name: 'Type your answer' });
  await expect(answer).toBeEnabled();
  await page.getByRole('button', { name: 'Save & leave' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('This sound has already started.');
  await dialog.getByRole('button', { name: 'Keep checking' }).click();
  await expect(answer).toBeEnabled();
  await page.getByRole('button', { name: 'Save & leave' }).click();
  await dialog.getByRole('button', { name: 'Save & leave' }).click();
  await page.getByRole('link', { name: 'Resume check' }).click();
  await expect(page.getByText('A first listen was interrupted.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Continue for practice', exact: true }).last().click();
  await expect(
    page.getByText('Practice only. This check cannot record a milestone.')
  ).toBeVisible();
  const checkpoint = (await readGuidedCheckpoint(page)) as GuidedCheckpoint;
  for (const prompt of checkpoint.state.prompts) {
    await expect(answer).toBeEnabled();
    await answer.fill(prompt.spec.expectedText);
  }
  await expect(
    page.getByRole('heading', {
      name: `Finished all ${checkpoint.state.prompts.length} prompts`,
      exact: true
    })
  ).toBeVisible();
  await expect(
    page.getByText(/This check cannot establish proficiency or retention/)
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Check complete', exact: true })).toHaveCount(0);
});
