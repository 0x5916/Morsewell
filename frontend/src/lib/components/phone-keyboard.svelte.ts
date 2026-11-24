import { browser } from '$app/env';
import { MediaQuery } from 'svelte/reactivity';
import { UI_STORAGE_KEYS } from '../storageKeys';

let choice = $state<'app' | 'system'>();
let lessonKeysOnly = $state(true);

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Keep the choice for this tab when storage is unavailable.
  }
}

export function phoneKeyboard() {
  const touch = new MediaQuery('(pointer: coarse) and (hover: none)', false);
  if (browser && choice === undefined) {
    try {
      choice =
        localStorage.getItem(UI_STORAGE_KEYS.trainingKeyboard) === 'system' ? 'system' : 'app';
      lessonKeysOnly = localStorage.getItem(UI_STORAGE_KEYS.lessonKeysOnly) !== 'false';
    } catch {
      choice = 'app';
    }
  }
  return {
    get available() {
      return browser && touch.current && Math.min(screen.width, screen.height) < 640;
    },
    get active() {
      return this.available && choice === 'app';
    },
    get lessonKeysOnly() {
      return lessonKeysOnly;
    },
    set lessonKeysOnly(enabled: boolean) {
      lessonKeysOnly = enabled;
      remember(UI_STORAGE_KEYS.lessonKeysOnly, String(enabled));
    },
    switchMode() {
      choice = choice === 'system' ? 'app' : 'system';
      remember(UI_STORAGE_KEYS.trainingKeyboard, choice);
    }
  };
}
