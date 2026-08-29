/**
 * Whole days from `nowMs` until `dateStr`. Negative once the date has passed.
 *
 * The caller supplies "now" rather than this reading the clock, and that is
 * the whole point: computing it from Date.now() inside a render makes the
 * result depend on when React happened to re-render, and the server and the
 * browser produce different numbers for the same markup. Take "now" from the
 * server (a server component) or freeze it at mount (useNow), then pass it in.
 */
export function daysUntil(dateStr: string, nowMs: number): number {
  return Math.ceil((new Date(dateStr).getTime() - nowMs) / (1000 * 60 * 60 * 24));
}
