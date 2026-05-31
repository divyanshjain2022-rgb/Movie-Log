# PVR Occupancy / Seat-Map — Handoff & Open Problem

> **STATUS: RESOLVED & IMPLEMENTED (2026-05-31).** Occupancy is read from the `s` field
> (`1` = available, `2` = unavailable = sold *or* blocked), not `st` (which marks
> wheelchair/companion seats). Occupancy = unavailable ÷ total bookable. Seat map greys
> `s=2` seats. Matching hardened (all title ids + format/audi). Sections 1–5 below are the
> investigation history; section 5c + this banner are the conclusion.

Repo: `github.com/divyanshjain2022-rgb/Movie-Log`
Working branch (deploys to Vercel prod `movie-log-eight.vercel.app`): **`codex-personalize-recommendations`**
Local clone: `/Users/sudeepjain/Downloads/Movie-Log`

This documents the occupancy + seat-map feature, the PVR API findings from live testing, and the **unresolved problem**: the app reports near-zero occupancy for shows the user believes are busy, and we have not been able to obtain real sold-seat data from PVR.

---

## 1. The core problem (unresolved)

- The "Hall occupancy" feature captures **~0–1% full** for essentially every show.
- The PVR website appears to show those same shows with many **grey "occupied"** seats (see user's screenshots).
- When we capture the **browser's own** `seatlayout` response for the exact same show, it shows the **same near-empty data** the server gets (e.g. `315 seats, 2 sold`). Requests from this sandbox route through the **user's residential IP**, so it is **not** an IP/geo difference.
- So either: (a) PVR genuinely returns near-empty seat data via the only seat endpoint the site uses, and the grey seats are UI styling — i.e. the app is "correct" but useless; **or** (b) there is a real-occupancy source we have not found. **This is the open question.**

Every show sampled so far has been genuinely near-empty (0–2 sold), so we have **never verified the busy-show case**. The decisive missing test: capture `seatlayout` for a show that is **visibly heavily booked** and count `"st":1` / `"st":2`. If high → occupancy works. If still ~2 → PVR no longer exposes sold seats.

---

## 2. Verified PVR API findings (live, 2026-05-31)

### a) `content/msessions` — seat counts were REMOVED
- POST `https://api3.pvrcinemas.com/api/v1/booking/content/msessions`
- Show objects (`output.movieCinemaSessions[].experienceSessions[].shows[]`) carry:
  `screenName` (e.g. `AUDI 05` = "Screen 5"), `movieFormat`, `showTime`, `language`, `status`/`statusTxt`, `encrypted` (seat-layout token), etc.
- **They NO LONGER contain `totalSeats` / `availableSeats`.** A screen-level `occupancy` field exists at `cinema.screens.<id>.occupancy` but returns **0**.
- The box-office script (`scripts/box_office_tracker.py`) relied on `show.totalSeats - show.availableSeats`. Its **March 2026 CSV has real numbers** (e.g. Delhi 74,831/142,605 = 52.5%), proving the fields existed then. **PVR removed them between ~23 Mar and 31 May 2026.** The script now computes 0 for everything.

### b) `ticketing/seatlayout` — full layout, but near-empty occupancy
- POST `https://api3.pvrcinemas.com/api/v1/booking/ticketing/seatlayout`
  body: `{"dated":"YYYY-MM-DD","encrypted":"<token>","onPage":false,"layoutType":"NEW"}`
- Returns a **full, real layout** (`output.rows`, `output.priceList`) — NOT a degraded template (earlier wrong theory; retracted).
- Seat encoding (per seat in `row.s[]`):
  - `c` / `pc` = price category code (e.g. `CL-CLUB`). **A real bookable seat HAS a category; cells with `c == null` are aisles/gaps.** (Do NOT use `st` to detect seats — aisles also have `st:0`.)
  - `st` = status: **`0` = available, non-zero = taken.**
  - `s` = seat type: `0` = gap, `1`/`2` = seat variants (both real seats).
  - `sn` = seat id (e.g. `N26`); `b` = "CLASS|ROW:NUM" string.
  - Row label is `row.n` (e.g. `N`,`M`…`A`). Rows with `row.t == "area"` are section headers, not seat rows.
- **Observed occupancy is near-zero on every sampled show** (Pati Patni shows: `313 free / 2 sold`; INOX Dhurandhar: `206 free / 0 sold`). Both server fetch and the user's browser HAR return identical data.
- Past shows: `msessions` still lists a show for ~24–36h after, but `seatlayout` returns HTTP 200 with an empty layout once the show has **started** ("Session Not Found"). So occupancy is only fetchable **before showtime**, never as a post-watch backfill.

---

## 3. Files (all paths under `/Users/sudeepjain/Downloads/Movie-Log/`)

### Occupancy feature
| File | What it does |
|---|---|
| `supabase/migrations/010_movie_occupancy.sql` | Adds `movies.occupancy` (numeric %) + `movies.seat_map` (jsonb). **Must be run on Supabase.** |
| `src/types/database.ts` | `MovieSeatSnapshot` interface; `occupancy` + `seat_map` on movies Row/Insert/Update. |
| `src/app/api/pvr/occupancy/route.ts` | **POST** capture endpoint. Matches a logged movie → live PVR show → seat layout → computes % sold. **Main logic to scrutinize.** |
| `src/app/(main)/movies/[id]/page.tsx` | Movie detail page — "Hall occupancy" section + "Capture from PVR"/"Recapture" button (`handleCaptureOccupancy`). |
| `src/app/(main)/movies/new/page.tsx` | Best-effort auto-capture on save for shows dated today (`handleSubmit`). |

### Seat-map + shared PVR plumbing
| File | What it does |
|---|---|
| `src/lib/pvr/client.ts` | `normalizePvrSeatLayout` — parses seat grid (the `c`/`st`/`s`/`n` logic above) into `PvrSeatQuote`. |
| `src/lib/pvr/types.ts` | `PvrSeatQuote`, `PvrSeatRow`, `PvrSeatCell`, `PvrSeatCategory`; recommendation types. |
| `src/components/movies/seat-map.tsx` | Reusable `<SeatMap>` — colour-by-class grid + price classes + legend. Used by both the recommendations seat modal and the movie detail page. |
| `src/app/api/pvr/seat-layout/route.ts` | **POST** — fetch one show's seat layout on demand. |
| `src/lib/pvr/concurrency.ts` | `settledWithConcurrency` — bounded-concurrency runner (PVR rate-limits parallel bursts). |
| `src/app/api/pvr/recommendations/route.ts` | Main recommendations endpoint (candidate cap = 16; throttled fan-out). |
| `src/app/api/pvr/movie-session/route.ts` | Single-movie "pull showtimes / exact price" endpoint. |
| `src/lib/pvr/recommendation-user-data.ts` | Shared Supabase loader + show filters used by the routes. |
| `src/lib/pvr/recommendations.ts` | Ranking engine (taste-first `personalScore`, `allOptions`). |
| `src/app/(main)/recommendations/page.tsx` | Recommendations UI (sections, collapsible cards, dismiss, pull, seat modal). |

### Reference (the working scraper that PVR broke)
| File | What it does |
|---|---|
| `scripts/box_office_tracker.py` | Read `totalSeats`/`availableSeats` from `msessions` (now removed). `scripts/box_office_data/*.csv` = real March output proving it once worked. |

---

## 4. `occupancy` endpoint — how matching works (and its weak spots)

`src/app/api/pvr/occupancy/route.ts`, POST body `{ city, title, theaterName, date, showtime, format }`:
1. `content/search` for the city → first movie whose title fuzzy-matches `title` → PVR movie id.
2. `content/msessions` for that id + `date` → pick the show where the normalized cinema name contains `theaterName` AND `HH:MM` matches `showtime` (fallback: theater-only).
3. `ticketing/seatlayout` with that show's `encrypted` token → sum `totalSeats`/`availableSeats` from categories → `occupancy = sold/total`.
4. If layout is empty (`totalSeats == 0`) → returns `{found:false, reason:"…before showtime"}` (closed/past show).

**Known fragilities (need hardening regardless of the data question):**
- **Movie-id ambiguity:** search can return multiple ids for one title (e.g. `DRISHYAM 3` = `35289` *empty* and `36301` *real*). Code picks the **first** fuzzy match → may pick the dead one. Fix: try all matching ids, use whichever returns sessions.
- **No format/audi disambiguation:** matches only theater + time. A cinema with two same-time shows (2D vs IMAX, different audis) → picks first. The log has `format` + `audi` (`Screen 5` → `AUDI 05`) — use them.

---

## 5. Reproduce the tests (curl)

```bash
# 1. find a movie id (now-showing list)
curl -s -X POST https://api3.pvrcinemas.com/api/v1/booking/content/search \
  -H 'Content-Type: application/json' -H 'Authorization: Bearer' -H 'chain: PVR' \
  -H 'appVersion: 1.0' -H 'platform: WEBSITE' -H 'city: Lucknow' -H 'country: INDIA' \
  -H 'Origin: https://www.pvrcinemas.com' -H 'User-Agent: Mozilla/5.0' \
  -d '{"city":"Lucknow","lat":"26.8467","lng":"80.9462","type":"HOME"}'

# 2. sessions for a movie (note: show objects have NO totalSeats/availableSeats anymore)
curl ... /content/msessions -d '{"city":"Lucknow","mid":"<ID>","experience":"ALL","specialTag":"ALL","lat":"26.8467","lng":"80.9462","lang":"ALL","format":"ALL","dated":"NA","time":"08:00-24:00","cinetype":"ALL","hc":"ALL","adFree":false}'

# 3. seat layout for a show's encrypted token (count "st":1/"st":2 = sold)
curl ... /ticketing/seatlayout -d '{"dated":"2026-05-31","encrypted":"<TOKEN>","onPage":false,"layoutType":"NEW"}'
```
Seat status: `st:0` available, non-zero taken; real seat ⇔ `c != null`.

---

## 5b. Ruled out: a booking-session / call-sequence unlock
Hypothesis: real occupancy needs a series of calls first (create transaction → seat-lock → seatlayout). **Disproven by the HAR (`new ha.har`, 151 reqs).** Full ordered PVR sequence shows the site calls `ticketing/seatlayout` **directly** (preceded only by `content/city`/`splash`/`msessions`), and a search across ALL hosts for `transaction|order|seatlock|blockseat|seatstatus|init|reserve|lock` returns **nothing**. The `seatlayout` response carries a `transId`, but the site never makes a follow-up call with it. So there is no preparatory sequence; the browser's direct `seatlayout` response IS the near-empty data we also get.
**Remaining blind spot:** HAR does not capture `wss://` WebSocket frames. If PVR pushes live seat state over a socket, that wouldn't show here — but it also wouldn't explain the initial grey seats, which render from the (near-empty) `seatlayout` response. Worth a quick check of the Network → WS tab on a busy show.

## 5c. CORRECTED seat field semantics (verified on Pati Patni 3:10 PM Lulu, token FE50YVJW4ACXCj…)
Per-row breakdown of that exact show: rows A–D fully open, E partial, **F–M almost entirely blocked → 139 bookable (`s=1`), 176 blocked (`s=2`), 2 `st!=0`, matching image 8's grey back rows.**

- `s` = **seat type / sale-state**: `0` gap/aisle · `1` bookable · `2` **blocked by cinema** (grey `seat-disable` on site; consolidation block, can be 10→176 seats).
- `st` = **special-seat marker, NOT sold**: `0` normal · `1`/`2` = **wheelchair / companion** accessibility seats. The two `st!=0` seats were `L1`/`L2` at the row-L end (where image 8 shows the wheelchair+companion icons). Every screen has ~1 of each; INOX had 0. **Earlier code (and 4.6's doc) read `st!=0` as "sold" — that is wrong.**
- `bu`, `cos`, `en`, `hc` are **uniformly `false`** across all seats → **no field in the current response marks a SOLD seat.**

**Implication:** there is currently **no readable "sold/occupancy" signal** in `seatlayout` (and `msessions` lost `totalSeats`/`availableSeats` after March 2026). PVR changed/removed the param. We can compute **bookable vs blocked** but NOT true paid occupancy. To recover real occupancy: capture a show with **confirmed real sales** and diff which field flips on a sold seat (candidates: `bu`, or `s`/`st` taking a new value). All sampled 2026 shows have genuine 0 sales, so nothing has flipped yet.

## 6. What opus 4.6 should investigate

1. **Does PVR expose real occupancy anywhere now?** Capture `seatlayout` (and a full HAR) for a show that is **demonstrably heavily booked** on the PVR site. Compare `st!=0` count to the visible grey seats.
   - If they match → occupancy works; app is correct; just harden matching (§4).
   - If `seatlayout` shows ~empty while the site shows full → find the call/source the site uses (re-inspect every request on the seat page; check websockets, a seat-lock/availability endpoint, or an authenticated token). Note: prior HARs showed the seat page's ONLY PVR data call is `seatlayout`, logged-out, no cookies.
2. **Is `totalSeats`/`availableSeats` recoverable from `msessions`?** Try other params/versions/endpoints, or an authenticated `Authorization` (real PVR JWT) instead of `Bearer`.
3. If occupancy is genuinely unavailable: decide whether to **drop** the occupancy %, keep only the **seat-map + prices** snapshot, or **park** it behind an "unavailable" note. Migration `010` columns can stay or be reverted.

## 7. Status
- `tsc`, eslint (only pre-existing `<img>` + `as any` warnings), and `next build` all pass.
- All work is committed/pushed to `codex-personalize-recommendations`.
- Migration `010_movie_occupancy.sql` may still need to be applied to Supabase.
