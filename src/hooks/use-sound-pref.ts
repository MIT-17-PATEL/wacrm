"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "wacrm.notificationSound";
const EVENT = "wacrm:notification-sound";

let memory: boolean | null = null;

function read(): boolean {
  if (memory !== null) return memory;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    memory = e.newValue === "1";
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Soft new-message sound (Settings › Appearance). Off by default, per device. */
export function useSoundPref(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, read, () => false);
  const setEnabled = useCallback((next: boolean) => {
    memory = next;
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // Private mode — the toggle just won't persist.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [enabled, setEnabled];
}

let ctx: AudioContext | null = null;

/**
 * A short, quiet two-tone "pop" synthesised with Web Audio (no asset to
 * load). Browsers block audio until the user has interacted with the
 * page; in that case this silently does nothing.
 */
export function playMessageSound() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      const start = now + i * 0.09;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.06, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
  } catch {
    // No audio support — the visual cues still show.
  }
}
