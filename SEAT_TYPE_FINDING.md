# PVR Seat Type `s=2` — The Missing Piece

## The Discovery

The "grey occupied seats" on the PVR website are **NOT sold seats**. They are seats with `s=2` in the `seatlayout` API response, meaning **"blocked by cinema"**.

PVR blocks sections/rows from sale for low-demand shows to consolidate the audience. The website renders these as grey (`seat-disable` CSS class), which looks identical to "occupied" — but zero tickets were actually sold.

## Proof (live on PVR website, 2026-05-31)

Show: PATI PATNI AUR WOH DO, 08:10 PM, INOX Megaplex Emerald Mall Lucknow  
Encrypted token: `wDARB1rxyAb3sLb3VURFoQ==`

### API response breakdown

| `s` value | `st` value | `c` (category) | Count | Meaning | PVR website CSS |
|-----------|-----------|----------------|-------|---------|-----------------|
| `0` | `0` | `null` | 68 | Aisle/gap | `seat_hidden` (invisible) |
| `1` | `0` | present | 177 | Available for booking | `seat-current-pvr` (green) |
| `2` | `0` | present | 35 | **Blocked by cinema** | `seat-disable` (grey) |

**Zero seats have `st != 0`** — nothing is actually sold.

### Which seats are blocked

| Row | `s=2` (blocked) seats | `s=1` (bookable) seats |
|-----|----------------------|----------------------|
| C | C1–C18 (entire row) | 0 |
| A | A4–A10 (7 seats) | 3 |
| E | E13–E18 (6 seats) | 12 |
| B | B15–B18 (4 seats) | 14 |

PVR blocked entire Row C and chunks of A, B, E — consolidating the audience into the remaining 177 bookable seats.

## The Bug in Our Code

`src/lib/pvr/client.ts`, function `normalizePvrSeatLayout`:

The code uses `c != null` (has price category) to identify real seats, then checks `st` for availability. **It ignores the `s` field entirely.** So `s=2` blocked seats are counted as available, which:

1. **Inflates `totalSeats`** (212 instead of 177 bookable)
2. **Inflates `availableSeats`** (212 instead of 177)
3. **Makes occupancy look near-zero** even for shows with some real sales — the denominator includes unbookable seats
4. **Renders blocked seats as "available" in our SeatMap** instead of greyed-out

## The Fix

### Seat field meanings (confirmed)

```
s=0              → gap/aisle (not a seat)
s=1, c != null   → real bookable seat
s=2, c != null   → blocked by cinema (has a category but not for sale)
st=0             → available
st != 0          → taken/sold
```

### Files to change

1. **`src/lib/pvr/types.ts`**
   - Add `"blocked"` to `PvrSeatStatus` type: `"available" | "taken" | "gap" | "blocked"`
   - Add `blockedSeatCount: number` to `PvrSeatQuote`

2. **`src/lib/pvr/client.ts`** — `normalizePvrSeatLayout`
   - Check `s` field on each seat: if `s === 2`, mark status as `"blocked"` instead of `"available"`
   - Do NOT count `s=2` seats in category `totalSeats` / `availableSeats`
   - Track `blockedSeatCount` separately

3. **`src/types/database.ts`** — `MovieSeatSnapshot`
   - Add `"blocked"` to the seat status union in `rows[].seats[].status`
   - Add optional `blockedSeats?: number` to the snapshot

4. **`src/components/movies/seat-map.tsx`**
   - Add rendering for `"blocked"` status (grey, like `bg-muted-foreground/30` or similar)
   - Add "blocked" to the legend
   - Update `SeatMapRow` interface to include `"blocked"` in status union

5. **`src/app/api/pvr/occupancy/route.ts`**
   - Occupancy should be `soldSeats / (totalSeats - blockedSeats)` — only bookable seats in denominator
   - Actually with the client.ts fix, `totalSeats` will already exclude blocked seats, so no change needed here

### Also fix (from handoff doc)

6. **Movie-id ambiguity** in occupancy route: `search.data.find()` picks the first fuzzy match. PVR can return multiple IDs for one title (e.g. DRISHYAM 3 = 35289 empty + 36301 real). Fix: try all matching IDs, use whichever returns sessions.

7. **Format/audi disambiguation**: The occupancy route matches only theater + time. Two same-time shows (2D vs IMAX) pick first. Use `format` and `screenName` from the log entry.

## Status of the Open Question (from OCCUPANCY_HANDOFF.md)

**Resolved.** PVR's `seatlayout` endpoint DOES return real occupancy via `st` values. The shows tested were genuinely near-empty. The "grey seats" were `s=2` blocked seats, not sold tickets. No hidden API endpoint exists — confirmed by:

- Full HAR analysis: only known PVR endpoints, no WebSockets, no SSR data
- Request headers: identical `Authorization: Bearer` (empty), no cookies, no special tokens  
- Live browser verification: DOM seat classes (`seat-disable` = `s=2`, `seat-current-pvr` = `s=1`) map 1:1 to API data
