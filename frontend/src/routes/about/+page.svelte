<script lang="ts">
  import { ArrowRight, BookOpen, ShieldCheck, UserRound, Wrench } from '@lucide/svelte';
  import { localizedHref as href } from '#lib/i18n.svelte.ts';
  import { getLocale } from '#lib/paraglide/runtime.js';
  import { GITHUB_URL } from '#lib/seo.ts';
  import { LESSONS } from '#lib/training/sequence.ts';
  import { DEFAULT_LESSON_PLAN_CONFIG as sound } from '#lib/training/v2/lesson-builder.ts';
  import { DEFAULT_MASTERY_POLICY as policy } from '#lib/training/v2/types.ts';
  import * as m from '#lib/paraglide/messages.js';

  // The lists store the message functions, not their values, so the template
  // always reads the current locale (the layout also remounts on a switch).
  const toc = [
    { id: 'koch-method', label: m.about_koch_title },
    { id: 'the-project', label: m.about_project_title },
    { id: 'about-the-author', label: m.about_author_title },
    { id: 'your-data', label: m.about_privacy_title }
  ];
</script>

<div class="about-page page-narrow">
  <header class="about-header">
    <h1 class="page-title">{m.about_title()}</h1>
    <p class="body-text body-text--prose about-intro">{m.about_intro()}</p>
  </header>

  <nav class="about-toc" aria-label={m.about_toc_label()}>
    <span class="card-label about-toc-label">{m.about_toc_label()}</span>
    <ul class="about-toc-list">
      {#each toc as item (item.id)}
        <li><a class="link standalone-target" href={`#${item.id}`}>{item.label()}</a></li>
      {/each}
    </ul>
  </nav>

  <!-- Koch method -->
  <section class="about-section" id="koch-method">
    <div class="about-section-icon" aria-hidden="true">
      <BookOpen size={20} />
    </div>
    <h2 class="section-title">{m.about_koch_title()}</h2>
    <p class="body-text body-text--prose about-intro">{m.about_koch_intro()}</p>

    <details class="ui-disclosure lesson-targets">
      <summary>{m.about_koch_step2_title()}</summary>
      <p>
        {m.about_koch_step2_body({
          attempts: policy.minAttemptsForStability,
          sessions: policy.minSessionsForStability,
          window: policy.rollingWindowSize,
          accuracy: policy.targetAccuracy * 100,
          seconds: (policy.maxAutomaticLatencyMs / 1000).toLocaleString(getLocale())
        })}
      </p>
      <p>{m.about_koch_step1_body({ speed: sound.charWpm, spacing: sound.effWpm })}</p>
      <p>{m.about_koch_step4_body({ count: LESSONS.join('').length, lessons: LESSONS.length })}</p>
    </details>
    <a href={href('/morse/learn/session?step=1')} class="btn-cta about-start"
      >{m.home_cta()}<ArrowRight size={18} aria-hidden="true" /></a
    >
  </section>

  <!-- The project -->
  <section class="about-section" id="the-project">
    <div class="about-section-icon" aria-hidden="true"><Wrench size={20} /></div>
    <h2 class="section-title">{m.about_project_title()}</h2>
    <p class="body-text body-text--prose">{m.about_project_body()}</p>
    <p class="body-text body-text--prose">
      {m.about_project_support()}
      <a class="link" href="mailto:contact@morsewell.com">contact@morsewell.com</a>
    </p>
    <p class="body-text about-links">
      <a href={GITHUB_URL} class="link standalone-target" rel="noopener noreferrer" target="_blank"
        >{m.about_project_github()}</a
      >
    </p>
  </section>

  <!-- About the author -->
  <section class="about-section" id="about-the-author">
    <div class="about-section-icon" aria-hidden="true"><UserRound size={20} /></div>
    <h2 class="section-title">{m.about_author_title()}</h2>
    <p class="body-text body-text--prose">{m.about_author_p1()}</p>
    <p class="body-text body-text--prose">
      {m.about_author_p2_pre()}
      <a href={GITHUB_URL} class="link" rel="noopener noreferrer" target="_blank"
        >{m.about_author_github()}</a
      >.
    </p>
  </section>

  <!-- Your data -->
  <section class="about-section" id="your-data">
    <div class="about-section-icon" aria-hidden="true"><ShieldCheck size={20} /></div>
    <h2 class="section-title">{m.about_privacy_title()}</h2>
    <p class="body-text body-text--prose">
      {m.about_privacy_body({ importAction: m.history_import() })}
    </p>
    <a class="link standalone-target" href={href('/privacy')}>{m.privacy_title()}</a>
  </section>
</div>

<style>
  /* Width and vertical gaps come from `.page-narrow` and the shell; this page
     owns only the article's internal rhythm. */
  .about-intro {
    margin: var(--space-2) 0 0;
  }

  .about-toc {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .about-toc-label {
    margin-bottom: 0;
  }

  /* Four short labels: two fixed columns so a label never breaks mid-phrase,
     collapsing to one per row on phones where a two-up row would crowd the
     targets. */
  .about-toc-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-1) var(--space-6);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--text-sm);
  }

  /* Long-form, sequential content: no card chrome. Article rhythm + rules read
     better here than a stack of independent tiles. */
  .about-section {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin-top: var(--section-gap);
    /* Keep anchored sections clear of the sticky navbar. */
    scroll-margin-top: 4.5rem;
  }

  /* The TOC is part of the page's opening, not a section of the article, so it
     closes at the block rhythm. `--section-gap` here left the first section
     floating away from the links that point into it. */
  .about-toc + .about-section {
    margin-top: var(--block-gap);
  }

  .about-section-icon {
    display: flex;
    color: var(--accent);
    margin-bottom: 0.5rem;
  }

  .about-section-icon :global(svg) {
    width: 1.5rem;
    height: 1.5rem;
  }

  .about-links {
    margin-top: var(--space-3);
  }

  .about-section > .standalone-target {
    align-self: flex-start;
  }

  .lesson-targets {
    margin-block: var(--space-3);
  }
  .about-start {
    align-self: flex-start;
  }
  @media (max-width: 480px) {
    .about-toc-list {
      grid-template-columns: 1fr;
    }
  }

  /* Below the navbar breakpoint the top bar is `display: none`, so the desktop
     4.5rem clearance only parks the target below a hole of empty page. */
  @media (max-width: 799px) {
    .about-section {
      scroll-margin-top: var(--space-4);
    }
  }
</style>
