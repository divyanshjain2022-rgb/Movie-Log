"use client";

import { useSyncExternalStore } from "react";

/**
 * The current time for client components that have no server-rendered "now"
 * to work from. Returns null during the server render and becomes a number
 * once mounted in the browser.
 *
 * The clock is genuinely outside React — the server cannot know the reader's
 * "now", and reading it during render produces a value that disagrees with
 * the server HTML and drifts on every re-render. useSyncExternalStore is the
 * primitive for exactly that: a server snapshot of null, and a client
 * snapshot that must be stable across calls or React re-renders forever, so
 * the timestamp is taken once and reused.
 *
 * Frozen for the life of the page, which suits day-granular questions like
 * "does this gift card expire soon". Where a server component already knows
 * the time — the dashboard passes HomeData.now — pass it down instead.
 */
let clientNow: number | null = null;

const subscribe = () => () => {};
const getSnapshot = () => (clientNow ??= Date.now());
const getServerSnapshot = () => null;

export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
