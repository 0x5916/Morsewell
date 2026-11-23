import type { Page } from '@playwright/test';

/**
 * Headless Firefox on Linux has no audio device: AudioContext.resume() never
 * resolves and the introduction would remain on “Listening…” forever. This
 * test exercises guided session transitions, while audio.preview.spec.ts
 * keeps real Web Audio lifecycle coverage.
 */
export async function installDeterministicAudioClock(page: Page) {
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
