<script lang="ts">
  import * as m from '#lib/paraglide/messages.js';
  import { dialogFocusables, dialogFocusTarget } from '../dialog-focus';

  interface Props {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    onSaveLeave?: () => void;
    saveLabel?: string;
    busy?: boolean;
    returnFocusTo?: HTMLElement | null;
    fallbackFocus?: HTMLElement | null;
    title?: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
  }

  let {
    isOpen = false,
    onConfirm = () => {},
    onSaveLeave,
    saveLabel,
    busy = false,
    onCancel = () => {},
    returnFocusTo = null,
    fallbackFocus = null,
    title,
    description,
    confirmLabel,
    cancelLabel
  }: Props = $props();

  let dialogEl = $state<HTMLDialogElement | null>(null);
  let heading: HTMLHeadingElement;
  const dialogId = $props.id();

  $effect(() => {
    if (!dialogEl) return;
    if (isOpen && !dialogEl.open) {
      dialogEl.showModal();
      heading.focus({ preventScroll: true });
      dialogEl.scrollTo({ top: 0, behavior: 'instant' });
    } else if (!isOpen && dialogEl.open) {
      dialogEl.close();
      (returnFocusTo?.isConnected ? returnFocusTo : fallbackFocus)?.focus();
    }
  });

  function handleBackdropClick(event: MouseEvent) {
    if (busy || event.target !== dialogEl || !dialogEl) return;
    const { left, right, top, bottom } = dialogEl.getBoundingClientRect();
    if (
      event.clientX < left ||
      event.clientX > right ||
      event.clientY < top ||
      event.clientY > bottom
    )
      onCancel();
  }

  function handleKeydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === 'Escape' && (event.repeat || event.isComposing || event.keyCode === 229)) {
      event.preventDefault();
      return;
    }
    if (event.key !== 'Tab' || !dialogEl) return;
    const target = dialogFocusTarget(
      dialogFocusables(dialogEl),
      dialogEl.ownerDocument.activeElement as HTMLElement | null,
      event.shiftKey,
      dialogEl
    );
    if (target) {
      event.preventDefault();
      target.focus();
    }
  }
</script>

<dialog
  class="dialog-card"
  role="alertdialog"
  aria-labelledby={`${dialogId}-title`}
  aria-describedby={`${dialogId}-description`}
  bind:this={dialogEl}
  oncancel={(event) => {
    event.preventDefault();
    if (!busy) onCancel();
  }}
  onclick={handleBackdropClick}
  onkeydown={handleKeydown}
>
  <h2 id={`${dialogId}-title`} class="section-title" tabindex="-1" bind:this={heading}>
    {title ?? m.lesson_exit_title()}
  </h2>
  <p id={`${dialogId}-description`} class="dialog-text">
    {description ?? m.learn_exit_description()}
  </p>

  <div class="dialog-actions">
    <button type="button" class="btn-primary" disabled={busy} onclick={onCancel}
      >{cancelLabel ?? m.lesson_resume()}</button
    >
    {#if onSaveLeave}<button type="button" class="btn-ghost" disabled={busy} onclick={onSaveLeave}
        >{saveLabel ?? m.session_save_leave()}</button
      >{/if}
    <button type="button" class="btn-ghost" disabled={busy} onclick={onConfirm}
      >{confirmLabel ?? m.lesson_exit()}</button
    >
  </div>
</dialog>

<style>
  .dialog-card::backdrop {
    background: color-mix(in srgb, var(--bg-base) 70%, transparent);
  }

  .dialog-card {
    background-color: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-overlay);
    padding: min(var(--space-6), 24px);
    margin: auto;
    max-width: 26rem;
    width: calc(100% - 2 * min(var(--space-4), 16px));
    max-height: calc(100dvh - 2 * min(var(--space-4), 16px));
    container-type: inline-size;
    overflow: auto;
  }

  .dialog-card[open] {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .section-title {
    margin: 0;
    font-size: var(--text-lg);
    color: var(--text-primary);
  }

  .dialog-text {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    line-height: var(--leading-normal);
  }

  .dialog-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }

  .dialog-actions button {
    flex: 1 1 auto;
    min-height: var(--answer-target-min);
  }
  @container (width < 16rem) {
    .dialog-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      justify-content: stretch;
    }
    .dialog-actions button {
      white-space: normal;
      overflow-wrap: anywhere;
    }
  }
</style>
