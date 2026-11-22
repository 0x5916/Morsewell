import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import MixedCheckPanel from './MixedCheckPanel.svelte';
import { buildMixedCheck } from '../../training/learning-policy/mixed-plan';
import { evaluateCheck } from '../../training/learning-policy/assessment';

const plan = buildMixedCheck({
  ownerKey: 'guest',
  targets: ['K', 'M'],
  knownCharacters: ['K', 'M'],
  profile: {
    id: 'clean20',
    task: 'single-character',
    charWpm: 20,
    audioCondition: 'clean',
    responseSupport: 'open'
  },
  effWpm: 12,
  freqHz: 600,
  startedAt: '2026-10-27T00:00:00Z'
});
const partial = evaluateCheck(plan.plan, [], null);
const onFinish = () => {};

it('places character results before the listening conditions and milestone rules', () => {
  const { body } = render(MixedCheckPanel, {
    props: { plan, onFinish, result: { ...partial, complete: true }, finalStatus: 'completed' }
  });
  expect(body).toMatch(
    /Check complete[\s\S]*Correct without replay[\s\S]*<dt[^>]*>K<\/dt>[\s\S]*<dt[^>]*>M<\/dt>[\s\S]*<details[\s\S]*Character speed: 20 WPM/
  );
  expect(body).not.toContain('type what you hear');
});

it.each([
  [null, null, false, 'Checking your answers…'],
  [null, partial, false, 'Checking your answers…'],
  ['completed', null, false, 'Checking your answers…'],
  ['completed', null, true, 'Your check result could not be loaded.'],
  ['completed', { ...partial, complete: true }, false, 'Check complete'],
  ['incomplete', partial, false, 'Finished all 20 prompts'],
  ['rejected', null, false, 'Evidence rejected']
] as const)(
  'reports only evaluated terminal outcomes (%s, failed=%s)',
  (finalStatus, result, loadFailed, expected) => {
    const { body } = render(MixedCheckPanel, {
      props: { plan, onFinish, result, finalStatus, loadFailed }
    });
    expect(body).toContain(expected);
    if (expected === 'Checking your answers…')
      expect(body).not.toMatch(/Check complete|Check incomplete|first listen correct/);
  }
);
