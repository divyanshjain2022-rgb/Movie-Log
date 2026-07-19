# Next Session — Improvements & Known Issues

_Written 2026-07-19. All commits below are **pushed and deployed to production** (movie-log-eight.vercel.app)._

## Deployed this session

| Commit | What it does |
|---|---|
| `918c94e` | Recommendations page: chronological Upcoming, persisted dismissals + Undo, filter persistence, occupancy display, event badges, keep-data-while-refetching |
| `3a37ea0` | Glassmorphism pass: ambient backdrop, glass surfaces, floating pill nav |
| `cd3b50f` | Cinematic overhaul: Bebas Neue marquee typography, film grain, gold identity |
| `a0adbe8` | Movie detail: cast photo strip + IMDb/RT/Letterboxd ratings + combined score |
| `f8a6206` | Occupancy capture: IMAX fix (token theater matching), ±15 min tolerance, honest failure messages |
| `7287dec` | Value score: fixed stale/inconsistent computation, smoothed tier cliffs, cost-curve knob, value tier labels |

**First action next session: verify the movie detail page on the live site** — the cast/ratings section couldn't be verified locally because there's no Supabase session (the API behind it was verified against Oppenheimer + Jawan).

## Post-deploy user actions

- **Settings → Formula → "Recalculate all"** — one time, so historic movies get re-scored with the corrected cost math (passport + GC savings) and the smooth exponent curve. Until then, old scores are on the old formula.
- Check one IMAX movie's **"Capture occupancy"** button against a real logged ticket.

## Bugs to fix (pre-existing, found but not touched this session)

1. **React 19 lint errors in `fnb/page.tsx`, `stats/page.tsx`, `gift-cards/page.tsx`** — "Cannot create components during render" (components defined inside render lose state on every parent render) and "Calling setState synchronously within an effect". These are real bug classes, not style nits. ~10 errors total.
2. **Home page console exceptions when data hooks fail** — `usePassports.fetchPassports` and `useBudgets.fetchBudgets` throw unhandled exceptions (visible in dev overlay "1 Issue"). Add error handling in those hooks.
3. **Pre-existing `any` types** in `movies/[id]/page.tsx` (lines ~759/793), home page `getMovieCost`, `movie-card.tsx` — small cleanup.
4. **`SESSION_SUMMARY.md`** sits untracked in the repo root from an old session — delete or commit it.
5. **Gift-card OCR route has no model fallback** — ticket OCR falls back `gemini-3.5-flash → gemini-3-flash-preview` on 429/503; gift-card route uses a single model. Mirror the fallback list.

## Fragile things to watch

- **IMDb ratings** come from an old static JSONP endpoint (`p.media-imdb.com/static-content/...`) because imdb.com bot-walls direct fetches (empty HTTP 202). It works today but is legacy — if it dies, wire an OMDb API key (free, also returns RT + Metacritic) as fallback.
- **RT scraping** parses `<search-page-media-row>` attributes from the search page; markup can change. Title-only fallback match could pick a same-name film from the wrong year.
- **PVR `msessions` no longer returns seat totals** (since Mar 2026) — availability labels without a seat quote say "Availability not confirmed" for most options. Only ~8 shows per load get exact quotes.
- **Letterboxd** scrape via `letterboxd.com/tmdb/{id}` JSON-LD — robust today, unofficial forever.

## Improvements for next session (prioritized)

### High value
1. **Split the recommendations API** — render ranked movies instantly, stream showtimes/seat quotes in after. The single request is still 5–8s; keep-previous-data masks it on refetch but first load is slow.
2. **Auto-capture occupancy before showtime** — the seat map dies the moment the show starts, and capture depends on remembering to tap the button in time. A Vercel cron (or capture-at-log-time scheduling) hitting `/api/pvr/occupancy` ~20 min before each logged upcoming show would make the data reliable. This also revives what `scripts/box_office_tracker.py` lost when msessions dropped seat totals.
3. **Extend the cinematic design system to the remaining pages** — stats, F&B, calendar, watchlist, gift-cards, settings, year-wrapped still use the old flat typography. The `marquee` / `glass` / gold-gradient utilities exist; it's mostly find-and-replace with judgment. Year-wrapped especially deserves the marquee treatment.
4. **Automated tests for the pure functions** — zero tests exist. `calculateValueScore` (continuity, monotonicity), `titleMatches` (sequel cases), `normalizePvrMovies/Sessions/SeatLayout` (against saved fixture JSON from this session's scratchpad), theater token matching. All pure, fast to test, and they guard the scraping/parsing logic most likely to regress silently.

### Medium
5. **Server-side PVR response cache** (Supabase table or Vercel KV) — the in-memory cache dies with each serverless instance, so most prod requests hit PVR cold. Also politer to their API.
6. **Movie extras loading state** — the cast/ratings section pops in with no skeleton; add one, and consider persisting fetched ratings to the movie row so they show instantly (and survive scraper breakage).
7. **Cast section dedupe** — the header still shows the old comma-separated `cast_members` text links right above the new photo strip; drop the text version when the strip renders.
8. **Event handling in the pull flow** — "Get showtimes" on a live event (FIFA final) still taste-ranks it via the predictor; `movie-session` route should skip prediction for `eventCategory` items like the main route now does.
9. **PWA polish** — `themeColor: "#0d1117"` predates the current `#09090b`/amber identity; manifest icons could match the marquee brand.

### Nice to have
10. **Auto-recalculate value scores on formula save** (currently a separate button; easy to forget).
11. **Enrich Upcoming posters** — TMDB enrichment caps at 24 movies; most of the 20 Upcoming cards rely on PVR posters. Lazy-enrich on scroll or raise the cap for the upcoming slice.
12. **Watchlist priority from the recommendations page** — "Add to watchlist" always creates priority 1; a long-press/menu to pick priority would feed the recommender better.
13. **Recommendations diagnostics panel** — the debug-candidates view built (and deleted) this session was genuinely useful; a hidden `?debug=1` mode showing candidate ranking with reasons would speed up future tuning.
14. **Letterboxd/IMDb links on the ratings tiles** — the data's already there (`imdbId`, tmdb id); tiles could deep-link to each site's page.
