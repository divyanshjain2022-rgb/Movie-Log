# Session Summary — Recommendations rework + Seat-map/Occupancy (2026-05-31)

**Repo:** `github.com/divyanshjain2022-rgb/Movie-Log`
**Branch (all work, deploys to Vercel prod `movie-log-eight.vercel.app`):** `codex-personalize-recommendations`
**Local clone:** `/Users/sudeepjain/Downloads/Movie-Log`

All changes were committed on top of the existing dismiss/"not interested" feature already on this branch. 9 commits this session (`3895f41` → `f163978`).

---

## 1. Recommendations page — overhaul

**Problem:** recommendations didn't surface what the user actually wanted; watchlist titles were buried; "Also playing" was bare posters; everything was one flat always-expanded list.

**Done:**
- **Taste-first ranking** (`src/lib/pvr/recommendations.ts`): new `personalScore` dominated by predicted personal rating (was a logistics-heavy blend), so picks reflect enjoyment, not just convenient showtimes.
- **"From your watchlist" section**: playing-now watchlist matches as full cards + previously-unrendered upcoming watchlist titles. Watchlist matching + flags plumbed through `route.ts` and `types.ts`.
- **Collapsible movie cards**: scannable header (predicted rating, confidence, top reason, watchlist badge, "N shows · from ₹X"); one open at a time, top pick open by default.
- **Dismiss feature preserved**: header became a `role="button"` div so the existing `ThumbsDown` + `DismissalModal` no longer nest inside another button; dismissed movies stay hidden across all sections.
- **Lazy-loaded posters.**

Files: `src/app/(main)/recommendations/page.tsx`, `src/lib/pvr/recommendations.ts`, `src/lib/pvr/types.ts`, `src/app/api/pvr/recommendations/route.ts`.

---

## 2. On-demand "pull to For you" + reliability

**Problem:** an eager 40-candidate fan-out hammered PVR → rate-limited → most session/price checks failed → empty list, "Price pending", "no shows on reload".

**Done:**
- Reverted candidate cap **40 → 16**.
- **Bounded-concurrency runner** `src/lib/pvr/concurrency.ts` (`settledWithConcurrency`): session fetches 4-at-a-time, seat-layouts 3-at-a-time, small gap → far fewer rate-limit failures.
- **`POST /api/pvr/movie-session`**: fetch one movie's showtimes + exact price on demand.
- **"More now playing" list** with a **"Get showtimes"** button per title → pulls that movie in as a full card at the top of "For you" (per-movie loading + "no showtimes" states; cleared on filter change).
- Extracted shared Supabase loader/show-filters into `src/lib/pvr/recommendation-user-data.ts` (used by both routes).

---

## 3. Smaller UX additions

- **Per-card "Get exact prices"** — re-fetches a single movie via `movie-session` to fill pending prices reliably.
- **Date quick-chips** — Today / Tomorrow / Weekend.
- **Add to watchlist** — bookmark button on cards and the now-playing list (toast, hidden when already on watchlist), via `useCreateWatchlistItem`.
- **Badge legend** — "What do these mean?" explaining predicted / confidence / vs TMDB / Value / fast vs exact price.
- **Smarter empty states** — distinguishes *no ranked picks but titles below* / *PVR didn't respond (refresh)* / *filters too narrow (clear filters)*; plus a Clear-filters chip when filters are active.
- **Show-all-showtimes toggle** — `buildRecommendations` keeps the full `allOptions` (capped 40) alongside the diverse top-4; cards get "Show all N showtimes / Show fewer".

---

## 4. Seat layout (real, working)

- **`POST /api/pvr/seat-layout`** — fetch one show's layout on demand.
- **`normalizePvrSeatLayout`** (`src/lib/pvr/client.ts`) preserves the grid (`PvrSeatRow`/`PvrSeatCell`).
- **`<SeatMap>`** component (`src/components/movies/seat-map.tsx`) — colour-by-class grid, row labels, "Screen" marker, price classes, legend. Shared by the recommendations seat modal and the movie detail page.
- **Parser corrected against the live PVR response** (see §6 for the field semantics): rows with `t:"area"` skipped, row label is `n`, etc.

---

## 5. Hall occupancy on logged movies

- **Migration `010_movie_occupancy.sql`** — `movies.occupancy` (numeric %) + `movies.seat_map` (jsonb). **Applied to Supabase.**
- **`MovieSeatSnapshot`** type + columns on movies Row/Insert/Update (`src/types/database.ts`).
- **`POST /api/pvr/occupancy`** — matches a logged movie → live PVR show → seat layout → computes % taken + stores a seat-map snapshot.
- **Movie detail page**: "Hall occupancy" section (% + seat map) with a **"Capture from PVR" / "Recapture"** button.
- **New-movie page**: best-effort auto-capture on save for shows dated today.
- Only works **before showtime** (PVR closes the seat map once a show starts → returns "Session Not Found"; handled with a clear message).

---

## 6. The occupancy investigation (and the key finding)

A long debugging arc — app reported ~0% for shows that looked busy on PVR. Steps and dead-ends are in `OCCUPANCY_HANDOFF.md`. Outcome (verified live against the PVR API):

**Seat field semantics (the crux):**
- `c`/`pc` = price category → a cell with one is a real seat; without = **aisle/gap**.
- **`s` = sale-state: `1` = available, `2` = unavailable (SOLD *or* cinema-blocked).** This is the real occupancy signal.
- **`st` = special-seat marker: `0` normal, `1`/`2` = wheelchair/companion — NOT sold.** (Original code wrongly read `st!=0` as sold → only ever saw the ~2 accessibility seats, and rendered the blocked seats as available.)
- row label = `n`; `t:"area"` rows are section headers.

**Why it looked broken:** PVR **blocks back rows** (`s=2`) to consolidate low-demand audiences — 10 up to 170+ seats — which render grey on PVR's site and *look* occupied but aren't sold. Real sales were genuinely ~0 on the 2026 shows sampled. Also: PVR **removed `totalSeats`/`availableSeats` from `msessions`** after March 2026 (which broke `scripts/box_office_tracker.py`).

**The fix (commit `f163978`):** occupancy now reads `s` (`available = s != 2`, `taken = s == 2`); `st` ignored. Occupancy = taken ÷ total. Seat map greys `s=2`. Verified on Pati Patni 3:10 PM Lulu = **178/315 = 56.5%**, matching the grey back rows on PVR's own map.

**Matching hardened:** tries all title-matching movie ids (handles duplicate/dead ids); disambiguates the show by score — same time > same format > same audi (screen number); format + audi passed from the log entry.

---

## 7. Commits (this session)

| Hash | Summary |
|---|---|
| `3895f41` | Taste-first recommendations, watchlist section, fuller "Also playing" |
| `24bc440` | On-demand "pull to For you"; revert eager 40-candidate fan-out |
| `4a57812` | Throttle PVR calls, per-card exact-price, date chips, add-to-watchlist, legend, empty states |
| `8033111` | Seat layout: price-class breakdown + visual seat map per show |
| `80456be` | Show-all-showtimes toggle + readable seat map |
| `5276af1` | Fix seat map against real PVR layout (aisles, row labels, accurate counts) |
| `b0a676c` | Log hall occupancy + seat-map snapshot on movies |
| `4945b1b` | Occupancy: handle past/closed shows honestly |
| `f163978` | Fix occupancy: read sale-state from `s` (1=available, 2=sold/blocked) |

---

## 8. New/changed files (key)

- `src/app/(main)/recommendations/page.tsx`, `src/lib/pvr/recommendations.ts`, `src/lib/pvr/types.ts`
- `src/app/api/pvr/recommendations/route.ts`, `src/app/api/pvr/movie-session/route.ts`, `src/app/api/pvr/seat-layout/route.ts`, `src/app/api/pvr/occupancy/route.ts`
- `src/lib/pvr/recommendation-user-data.ts`, `src/lib/pvr/concurrency.ts`, `src/lib/pvr/client.ts`
- `src/components/movies/seat-map.tsx`
- `src/app/(main)/movies/[id]/page.tsx`, `src/app/(main)/movies/new/page.tsx`
- `src/types/database.ts`, `supabase/migrations/010_movie_occupancy.sql`
- Docs: `OCCUPANCY_HANDOFF.md`, `SEAT_TYPE_FINDING.md` (from opus 4.6), `SESSION_SUMMARY.md` (this file)

---

## 9. Status & follow-ups

- **Verified:** `tsc`, eslint (only pre-existing `<img>` + `as any` warnings), and `next build` all pass; all pushed.
- **Migration 010:** applied to Supabase ✅.
- **Known limits:** occupancy capture only works before showtime; true *sold* vs *blocked* can't be separated (both are `s=2`) — acceptable per decision (95% signal). PVR no longer exposes box-office seat counts.
- **Optional next:** verify occupancy on a genuinely busy show; consider distinguishing `s=2`-sold from `s=2`-blocked only if PVR ever re-exposes it; two pre-existing `as any` lint warnings in the detail page left untouched.
