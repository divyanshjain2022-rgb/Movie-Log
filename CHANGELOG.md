# Changelog

Notable changes to CinemaLog. Newest first.

Deploy note: pushes to `codex-personalize-recommendations` create **Preview**
deployments, because the Vercel production branch is set to `main`. Going live
means promoting the build (`npx vercel promote <url>`) or changing that
setting. Nothing here needs a database migration.

## 2026-08-29

### Telegram bot

**Back on Gemini.** The Hetzner/Kimi inference layer added on 2026-08-11 is
reverted and `src/lib/inference.ts` is deleted, so there is one AI provider
again rather than two (the OCR routes never left Gemini). `gemini-3.6-flash` is
the primary model, with `gemini-3.5-flash`, `gemini-3.1-flash-lite` and
`gemini-3.7-flash` behind it.

The fallback chain is ordered by measured latency rather than version number.
Benchmarked against the real system prompt and all 24 tool declarations, with
every model returning the identical tool call and token counts:

| model | round-trip latency |
| --- | --- |
| `gemini-3.5-flash` | 1976 / 2137 / 2139 ms |
| `gemini-3.1-flash-lite` | 2284 ms |
| `gemini-3.6-flash` | 4438 / 12648 / 37807 / 58400 ms |
| `gemini-3.7-flash` | 503 "high demand" on 3 of 5 attempts |

**Slow calls can no longer kill a request.** 3.6's latency is erratic rather
than uniformly slow, and the 58 second case exceeded the webhook's
`maxDuration` of 60, so one unlucky call spent the whole budget and the request
died without replying. Every attempt now carries an 18 second `abortSignal`
inside a 45 second turn budget, and a stall walks the fallback chain the same
way a 429 or a 503 does. A slow primary now costs 18 seconds followed by a two
second answer instead of a dead request.

**Tool calls run in parallel.** The model asks for several tools in one round
and they are independent reads, but the loop awaited them one at a time so the
latencies added up.

**Tool results are 22% smaller.** Tool output is fed straight back to the model
as input tokens, so null fields are paid for twice: once in latency, once
against the daily quota. Stripping nulls and empty strings takes a 25 movie
`get_recent_movies` payload from 6299 to 4899 tokens. Empty arrays, empty
objects, `false` and `0` are kept deliberately: `movies: []` is what the system
prompt keys its anti-hallucination rule off, so deleting it would let the model
invent films.

**Fallback now covers 503 and 500, not only 429.** A 503 previously threw
straight out of `converse()` and returned a 500 from the webhook.

### Bot data access

Tools go from 12 to 24. Six tables the bot could not see at all are now
readable: passports, budgets, companions, itemised food and drink, franchises
and hall ratings. Because the system prompt forbids answering from memory,
questions about them were not vague, they were refusals.

- New reads: `get_passports` (uses spent and left, savings, whether it has paid
  for itself), `get_budgets` (budget against actual spend per month),
  `get_companions`, `get_fnb_breakdown` (per item quantity and spend rather
  than one total), `get_franchises`, `get_theater_ratings`.
- `get_recent_movies` returned 9 fields of a roughly 50 column row. It now
  returns the whole log entry, minus the long TMDB prose, which stays in
  `get_movie_details`.
- `get_stats` gains `since`/`until` plus breakdowns by month, theater, format,
  language, genre, mood and companion.
- New writes: `set_budget`, `log_passport`, `add_companion`, `rate_theater`,
  `set_watchlist_priority`, `remove_from_watchlist`. `update_movie` gains
  `watched_with`, `is_rewatch`, `status`, `language`, `director`, `booking_id`,
  and by name the mood, strongest and weakest part, rewatch option and
  franchise.
- Every write keeps the existing contract: whitelisted fields, a `bot_edits`
  audit row, and `undo_last_edit`. Removal is the only destructive tool, so it
  snapshots the whole row into the audit entry before deleting and undo
  re-inserts it.

**Fixed: the bot reported an empty watchlist to every question.**
`get_watchlist` selected `created_at`, but the column is `added_at`. PostgREST
rejected the query, `data || []` swallowed the error, and the result was always
`[]`.

**Fixed: inflated spending figures.** `get_stats` returned `totalSpend` and
`fnbSpend` with nothing saying they overlap, so the model added them together.
`movies.total_cost` is a generated column that already includes `fnb_cost`.

### Occupancy capture

The auto-capture cron already existed, but one of its two stages could never
work. PVR's seat map returns empty the moment a show starts, so occupancy is
readable only before showtime and never as a backfill. The "post" stage fired
20 to 35 minutes into the show. It always failed, and its failure branch sent a
"couldn't capture" alert whenever a show had no earlier snapshot, so the one
alert that meant something also fired on every routine miss.

That left a single real attempt per show, in one 15 minute window. GitHub's
scheduler drops runs (the workflow comment records `*/15` actually firing every
60 to 105 minutes), and a dropped run meant no data at all. Capture now runs
once per 15 minute bucket across the 75 minutes before showtime, each reading
overwriting the last because closer to showtime is closer to real turnout.

Simulated against the real tick offsets over realistic showtimes:

| runs dropped | old: no capture | new: no capture |
| --- | --- | --- |
| 25% | 24.1% | 0.1% |
| 50% | 48.6% | 3.1% |
| 75% | 73.4% | 23.9% |

Notifications are one per movie now, on the first reading that lands. The
failure alert fires only after showtime and only when nothing was ever read.

### Progressive web app

CinemaLog advertised itself as installable and was not. `layout.tsx` linked
`/manifest.json`, which did not exist in `public/` and had no route, so the
request fell through to the auth middleware and came back as a 307 to `/login`.
Browsers were offered an HTML login page where a manifest should be.

- `app/manifest.ts` emits a real `/manifest.webmanifest`: standalone display,
  `#09090b` ground, three icons, and shortcuts to log a movie, tonight's picks
  and the watchlist.
- Icons regenerated at 192 and 512, a maskable 512 with the mark inside the
  safe zone, a 180 apple touch icon and a 96 favicon. They are a clapperboard
  in the app's own amber on near black, built by `scripts/generate-icons.mjs`
  so they can be rebuilt rather than hand edited.
- `themeColor` moves from `#0d1117` to `#09090b`. The old value predated the
  current identity and drew a visible seam above the app in standalone mode.
- The middleware matcher skips `sw.js`, `manifest.webmanifest` and
  `offline.html`. Without that they get the same redirect the manifest did, and
  a worker served as an HTML login page never registers.
- `sw.js` is sent as `no-store` (a cached worker is a stuck worker) and the
  icons as immutable.

The service worker **never caches pages**, and that is the point. Every page
here is a server rendered view of one person's spending, ratings and gift card
balances behind an auth cookie. A cached copy outlives the session that was
allowed to see it, and signing out cannot reach it. Navigations are network
only with an offline card as the fallback, and only content hashed build assets
are cached. It also accepts a `clear-caches` message so sign out can wipe what
it holds.

### Performance

**Auth on every request.** The middleware called `supabase.auth.getUser()`,
which sends the access token to Supabase's auth server and waits. It runs on
every navigation, so each page view paid a round trip before rendering could
start. The project signs its JWTs with an ES256 key, so `getClaims()` verifies
the signature locally with WebCrypto against a JWKS that auth-js caches at
module level, meaning one fetch per warm instance instead of one per request.
Session refresh is unchanged. The same swap is applied in
`recommendation-user-data`, which sits in front of the slowest page.

**Poster weight.** Nothing in the app uses `next/image` (the `remotePatterns`
config was dead), so every poster is a raw `<img>` pointing at whatever width
TMDB was asked for, with no optimizer in front. Posters are stored at w500,
measured at 107.7 KB each, and they render in boxes 32 to 73 px wide. A 25 row
list pulled roughly 2.7 MB to paint about 130 KB of pixels.
`src/lib/tmdb-image.ts` re-points each URL at the rendition matching its box
(w154 is 12.3 KB, w185 is 17.1 KB) and no-ops on anything that is not a sized
TMDB URL, so PVR posters and Supabase storage paths pass through untouched. 14
call sites.

16 poster tags also gained `loading="lazy"` and `decoding="async"`, having had
none, so every poster on a list page downloaded eagerly. The movie detail hero
got `fetchPriority="high"` instead, since it is that route's LCP element.

Checked and deliberately left alone: html2canvas and recharts are already
dynamically imported, lucide-react is already in Next's default
`optimizePackageImports`, and the home page queries already run in one
`Promise.all`.

### Navigation

Saving on the edit page called `router.push`, so the edit form stayed in
history and Back walked into the form that had just been submitted. Three
instances of the same bug:

| flow | Back used to land on |
| --- | --- |
| edit, then save | the edit form again |
| new, then save | the submitted new movie form |
| detail, then delete | the detail page of a deleted movie |

All three use `router.replace` now, since a completed step is not a place to
return to. Each is followed by `router.refresh()`, because `staleTimes.dynamic`
caches the server payload for 30 seconds, which is long enough to land on the
movie and be shown the values just edited away.

### React 19 correctness

All 32 outstanding lint errors are fixed. The two that cost real data:

- **`FnbForm` was defined inside `FnbPage`**, so it was a new component type on
  every render and React remounted the whole form each time. The gift card
  amount field is controlled by state, so every keystroke in it remounted the
  form, and the date, cost and notes fields are uncontrolled and reset to their
  defaults. Logging a food and drink purchase with a gift card wiped what had
  already been typed. It is a module level component now, with the seven values
  it closed over passed as props.
- **A bullet was written as the escape sequence `\u2022` inside JSX text** in
  two places. In JSX text that is not an escape, it is six literal characters,
  so the page printed `\u2022` instead of the bullet. One was the movie detail
  page, the other was the shareable card, which means exported images read
  `/ 10 \u2022 Great`. The other ten sites are inside template or string
  literals, where the escape does work, and were always fine.

Also fixed:

- `Date.now()` during render computed gift card expiry, which is a hydration
  mismatch: the server and the browser produce different numbers for the same
  markup, and the value drifts on any re-render. The dashboard is server
  rendered, so `HomeData` now carries the server's timestamp. The gift cards
  page fetches client side and uses a new `useNow()` built on
  `useSyncExternalStore`.
- `StatCard` was defined during render in `year-wrapped` and used seven times.
  Hoisted.
- Two `setState` in effect cases, both correcting the selected year when the
  available years change, are derived during render instead.
- Six data hooks ran their reads in `try/finally` with no `catch`, so a failed
  fetch escaped an effect as an unhandled rejection. Those were the console
  exceptions on the dashboard. They record the error and return empty now.
  Mutations still throw, because their callers catch and show a toast.
- 19 `any` types removed. Most were unnecessary: `ListMovie` already declared
  every field `movie-card` was casting away, and `movie_gift_cards` already
  declared `purpose`. The one real defect was `getEffectiveCost` declaring
  `discount_percent` as non-null when the column is nullable, which is what
  forced callers to cast in the first place.

### Known limitations

- The 12 new bot tools have not run through a live Telegram round trip. Every
  new or changed SQL select was validated against the live database before
  commit (15 of 16 passed, the one failure being the old watchlist bug).
- The occupancy change is verified by simulation and by PVR's documented
  behaviour, not by a live capture.
- The model latency figures describe Google's serving load on 2026-08-29, with
  3.6 and 3.7 both recently launched. Re-measure before assuming a later
  slowdown is a regression.
- `NEXT_SESSION.md` is dated 2026-07-19 and is stale on several points,
  including claiming the occupancy cron does not exist. Check the git log
  before trusting it.
- Still open: home, movies and stats each fetch the entire movie log on every
  page load, there are no tests, and `vercel.json` carries a dead header rule
  for `/manifest.json`.
