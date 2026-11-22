<script lang="ts">
  import { DEFAULT_MASTERY_POLICY as policy, type CharacterMastery } from '../../training/v2/types';
  import { masteryRequirements } from './lesson-requirements';
  import { getLocale } from '#lib/paraglide/runtime.js';
  import * as m from '#lib/paraglide/messages.js';

  let {
    unlockTitle,
    remainingMasteries
  }: {
    unlockTitle: string;
    remainingMasteries: CharacterMastery[];
  } = $props();
</script>

<details class="unlock-checks">
  <summary class="training-disclosure">{unlockTitle}</summary>
  <ul class="mastery-checks" role="list">
    {#each remainingMasteries as mastery (mastery.character)}
      <li class="mastery-character">
        <strong class="check-character">{mastery.character}</strong>
        <div class="character-checks">
          {#each masteryRequirements(mastery) as requirement (requirement.id)}
            <div class="mastery-check">
              <div class="check-values">
                <span>{requirement.label}</span><strong>{requirement.value}</strong>
              </div>
              {#if requirement.current !== undefined && requirement.target !== undefined}
                <progress aria-hidden="true" value={requirement.current} max={requirement.target}
                ></progress>
              {/if}
            </div>
          {/each}
        </div>
      </li>
    {/each}
  </ul>
  <details class="calculation ui-disclosure">
    <summary>{m.learn_unlock_calculation()}</summary>
    <p class="unlock-hint">
      {m.learn_unlock_checks_hint({
        count: policy.minAttemptsForStability,
        sessions: policy.minSessionsForStability,
        window: policy.rollingWindowSize,
        percent: Math.round(policy.targetAccuracy * 100),
        seconds: (policy.maxAutomaticLatencyMs / 1000).toLocaleString(getLocale())
      })}
    </p>
  </details>
</details>

<style>
  .unlock-checks summary {
    min-height: var(--answer-target-min);
    padding-block: var(--space-3);
    color: var(--text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
  }

  .calculation {
    margin-top: var(--space-3);
  }

  .unlock-hint {
    margin: 0 0 var(--space-4);
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .mastery-checks {
    display: grid;
    gap: var(--space-6);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .mastery-character {
    display: grid;
    grid-template-columns: 2rem minmax(0, 1fr);
    gap: var(--space-3);
  }

  .check-character {
    font-size: var(--text-xl);
    color: var(--text-primary);
  }

  .character-checks {
    display: grid;
    gap: var(--space-3);
    min-width: 0;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .check-values {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-3);
    overflow-wrap: anywhere;
  }

  .check-values strong {
    color: var(--text-primary);
    font-weight: 500;
  }

  .mastery-check progress {
    appearance: none;
    display: block;
    width: 100%;
    height: var(--space-1);
    margin-top: var(--space-2);
    border: 0;
    background: var(--border);
  }

  .mastery-check progress::-webkit-progress-bar {
    background: var(--border);
  }

  .mastery-check progress::-webkit-progress-value {
    background: var(--accent);
  }

  .mastery-check progress::-moz-progress-bar {
    background: var(--accent);
  }
</style>
