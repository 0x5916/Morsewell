import { createWebAudioEngine, type AudioEngine } from './audio/engine';
// Transfer only a silent, gesture-activated engine. Session entry never depends on this hint.
let pending: { href: string; audio: AudioEngine } | null = null;
let expiry: ReturnType<typeof setTimeout> | undefined;
export function armCheckStart(href: string, audio = createWebAudioEngine()) {
  clearTimeout(expiry);
  void pending?.audio.dispose();
  pending = { href, audio };
  void audio.prepare?.().catch(() => {});
  expiry = setTimeout(() => {
    void pending?.audio.dispose();
    pending = null;
  }, 15000);
}
export function consumeCheckStart(href: string): AudioEngine | undefined {
  clearTimeout(expiry);
  const intent = pending;
  pending = null;
  if (intent?.href === href) return intent.audio;
  void intent?.audio.dispose();
}

/** Only an unmodified activation of a labeled check link arms audio for this tab. */
export function prepareCheckLink(event: MouseEvent) {
  const link = event.currentTarget as HTMLAnchorElement;
  const query = new URLSearchParams(link.search);
  if (
    query.has('check') &&
    !query.has('resume') &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  )
    armCheckStart(link.pathname + link.search);
}
