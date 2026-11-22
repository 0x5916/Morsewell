<script lang="ts">
  import type { ConfusionPair } from '../../training/v2/types';
  import { localizedHref } from '#lib/i18n.svelte.ts';
  import * as m from '#lib/paraglide/messages.js';
  import { parseReviewRequest, reviewHref } from '../../training/targeted-review';

  let {
    confusionPairs,
    slowChars,
    knownCharacters = [],
    featuredPair
  }: {
    confusionPairs: ConfusionPair[];
    slowChars: string[];
    knownCharacters?: string[];
    featuredPair?: ConfusionPair;
  } = $props();

  function canPractise(pair: ConfusionPair) {
    return (
      parseReviewRequest(pair.expected + pair.actual) &&
      [pair.expected, pair.actual].every((ch) => knownCharacters.includes(ch))
    );
  }
</script>

<details class="ui-disclosure">
  <summary>{m.progress_practice_details()}</summary>
  <ul>
    {#each confusionPairs as pair (`${pair.expected}-${pair.actual}`)}
      {@const playable = canPractise(pair)}
      {#if pair !== featuredPair || playable}
        <li>
          {#if pair !== featuredPair}<span
              >{m.progress_pair_detail({
                expected: pair.expected,
                actual: pair.actual,
                count: pair.confusionCount
              })}</span
            >{/if}
          {#if playable}
            <a
              class="link standalone-target"
              href={localizedHref(reviewHref([pair.expected, pair.actual]))}
            >
              {m.review_title({ characters: `${pair.expected}, ${pair.actual}` })}
            </a>
          {/if}
        </li>
      {/if}
    {/each}
  </ul>
  {#if slowChars.length}
    <dl>
      <dt>{m.progress_slow()}</dt>
      <dd>{slowChars.join(', ')}</dd>
    </dl>
  {/if}
  <a class="link standalone-target" href={localizedHref('/morse/practice')}
    >{m.progress_open_practice()}</a
  >
</details>

<style>
  ul {
    display: grid;
    gap: var(--space-2);
    list-style: none;
    padding: 0;
    margin: 0;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    column-gap: var(--space-4);
    align-items: center;
  }
  dd {
    margin-inline-start: 0;
    font-family: var(--font-mono);
  }
</style>
