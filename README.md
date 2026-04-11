# CinemaLog

CinemaLog is a personal movie logging app for tracking theater visits, ratings, formats, ticket prices, gift cards, F&B spend, PVR Passport savings, watchlist items, and cinema preferences. It is built as a private-first Next.js app with Supabase for user data and a server-side PVR integration for live movie recommendations.

The app is designed around one main question:

> Which movie should I watch, where should I watch it, what format should I pick, and is the ticket price worth it?

## Table of Contents

- [Core Features](#core-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Running Without Supabase Keys](#running-without-supabase-keys)
- [Supabase Setup](#supabase-setup)
- [PVR Recommendation Engine](#pvr-recommendation-engine)
- [Watchlist and Upcoming PVR Movies](#watchlist-and-upcoming-pvr-movies)
- [OCR Features](#ocr-features)
- [TMDB Enrichment](#tmdb-enrichment)
- [Value Score Formula](#value-score-formula)
- [App Routes](#app-routes)
- [API Routes](#api-routes)
- [Development Workflow](#development-workflow)
- [Deployment](#deployment)
- [Data and Privacy Notes](#data-and-privacy-notes)
- [PVR Integration Risk Notes](#pvr-integration-risk-notes)
- [Troubleshooting](#troubleshooting)

## Core Features

### Movie Log

- Add watched movies with date, showtime, theater, screen/audi, seat, format, language, rating, mood, review, and remarks.
- Track ticket cost, convenience fees, F&B spend, other expenses, gift card use, and Passport savings.
- Store TMDB enrichment such as runtime, poster, genres, director, cast, composer, cinematographer, certification, keywords, trailer URL, budget, box office, and TMDB rating.
- Mark rewatches and connect movies to franchises.
- Attach companions to a movie.
- Upload and view movie-related photos such as tickets, selfies, F&B receipts, and general memories.

### Dashboard

- Yearly spending and movie-count summary.
- Cost mode toggles for ticket-only, ticket plus F&B, and all-cost views.
- Recent movies.
- Gift card status.
- Quick links to major workflows, including PVR recommendations.

### Statistics

- Format breakdown.
- Theater breakdown.
- Genre breakdown.
- Day-of-week and time-of-day viewing patterns.
- Cost-per-minute by format.
- Price trends.
- Monthly summaries.
- Rating distribution.
- Ticket price fluctuation.
- Your rating compared with TMDB rating.
- Director statistics.

### Gift Cards

- Track gift card face value, amount paid, discount percentage, platform, purchase date, expiry date, code, and notes.
- Track usage against movies and F&B.
- See balances and active/expired/exhausted status.
- OCR support for extracting gift card details from screenshots or PDFs.

### F&B

- Log food and beverage purchases independently or attach them to movies.
- Track item names, quantities, prices, theater, remarks, and gift card usage.

### Settings

- Configure theaters and theater capabilities.
- Rate theaters or individual audis by sound, seats, screen, and cleanliness.
- Configure formats and format weights.
- Configure moods, aspects, and rewatch options.
- Configure the value score formula.
- Track monthly budgets.
- Track PVR Passport purchases and savings.
- Import and export data.

## Tech Stack

- Framework: Next.js 16 App Router
- UI: React 19, Tailwind CSS 4, Radix UI primitives
- Database/auth/storage: Supabase
- Charts: Recharts
- Forms: React Hook Form and Zod
- OCR: Google GenAI Gemini endpoint through server routes
- Movie enrichment: TMDB API
- Live cinema data: server-side PVR website API adapter
- Language: TypeScript

## Project Structure

```text
.
|-- src
|   |-- app
|   |   |-- (auth)                 # Login routes
|   |   |-- (main)                 # Authenticated app pages
|   |   `-- api                    # Server API routes
|   |-- components
|   |   |-- dashboard              # Dashboard widgets
|   |   |-- movies                 # Movie form, cards, OCR upload, photos
|   |   |-- shared                 # Shared layout/navigation components
|   |   `-- ui                     # Local UI primitives
|   |-- hooks                      # Supabase-backed client hooks
|   |-- lib
|   |   |-- pvr                    # PVR client, types, cities, recommendation engine
|   |   |-- supabase               # Supabase config/client helpers
|   |   |-- formula.ts             # Value score and money helpers
|   |   `-- utils.ts
|   `-- types                      # Database and app types
|-- supabase
|   |-- schema.sql                 # Base schema
|   `-- migrations                 # Incremental feature migrations
|-- public
|-- package.json
|-- next.config.ts
`-- vercel.json
```

## Quick Start

### Prerequisites

- Node.js 20 or newer is recommended.
- npm, included with Node.js.
- A Supabase project for full persistence.
- Optional API keys for TMDB and Google OCR features.

### Install Dependencies

```bash
npm install
```

### Start the Dev Server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

### Build for Production

```bash
npm run build
```

### Run Lint

```bash
npm run lint
```

## Environment Variables

Create a local `.env.local` file in the project root.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
TMDB_API_KEY=
GOOGLE_CLOUD_API_KEY=
PVR_BEARER_TOKEN=
```

### Required for Full App Behavior

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes for deployed/full app | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes for deployed/full app | Supabase browser/server anon key. |

### Optional Integrations

| Variable | Required | Purpose |
| --- | --- | --- |
| `TMDB_API_KEY` | Optional | Enables TMDB search and enrichment. Without it, TMDB routes return a configuration error. |
| `GOOGLE_CLOUD_API_KEY` | Optional | Enables ticket and gift card OCR routes. Without it, OCR routes return a configuration error. |
| `PVR_BEARER_TOKEN` | Optional | Optional bearer token used by the PVR adapter. Current website-facing calls can work with an empty bearer header, but this may change. |

Do not commit `.env.local` or production secrets.

## Running Without Supabase Keys

The app includes a development-only fallback for local work when Supabase keys are not present.

When `NODE_ENV !== "production"` and Supabase config is missing:

- Middleware allows the app to load without redirecting to Supabase auth.
- PVR recommendations use local mock Movie Log data from `src/lib/pvr/local-user-data.ts`.
- Watchlist creation uses browser `localStorage` through the `cinemalog-local-watchlist` key.

This is intended for UI development and PVR recommendation testing only. It is not a production mode.

In production, missing Supabase config is treated as a deployment error:

- Protected pages redirect to `/login`.
- Supabase-backed API routes return errors instead of silently using local data.

## Supabase Setup

### 1. Create a Supabase Project

Create a Supabase project and copy:

- Project URL into `NEXT_PUBLIC_SUPABASE_URL`
- Anon public key into `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. Apply the Database Schema

Run the base schema first:

```text
supabase/schema.sql
```

Then apply migrations in numeric order:

```text
supabase/migrations/002_missing_fields_and_payments.sql
supabase/migrations/003_tmdb_enrichment.sql
supabase/migrations/004_feature_expansion.sql
supabase/migrations/005_gc_purpose.sql
supabase/migrations/006_passport_and_total_cost_fix.sql
```

The schema and migrations create the following major tables:

- `movies`
- `formats`
- `theaters`
- `moods`
- `aspects`
- `rewatch_options`
- `platforms`
- `gift_cards`
- `movie_gift_cards`
- `fnb_gift_cards`
- `fnb_purchases`
- `fnb_items`
- `fnb_purchase_items`
- `formula_configs`
- `watchlist`
- `budgets`
- `franchises`
- `companions`
- `movie_companions`
- `movie_photos`
- `theater_ratings`
- `passports`

### 3. Row Level Security

The schema enables RLS for personal data tables and adds policies so users can manage only their own rows. The app expects all user-owned records to include `user_id`.

### 4. Seed Defaults

The base schema defines `seed_user_defaults(p_user_id UUID)`. Use it after creating a user to insert starter formats, moods, aspects, rewatch options, and the default value formula.

Example:

```sql
select seed_user_defaults('USER_UUID_HERE');
```

## PVR Recommendation Engine

The PVR recommendation engine is the app's live cinema layer. It is intentionally server-side so browser code does not call PVR directly.

### What It Does

The recommendations page combines:

- Your logged movies.
- Your watchlist.
- Your format preferences.
- Your theater and audi ratings.
- Your historical ticket prices.
- Live PVR movies.
- Live PVR sessions.
- Live PVR seat/category price data for top picks.

It then recommends the best show options per movie.

### Page

```text
/recommendations
```

The page includes:

- City selector.
- Date selector.
- Language filter.
- Format filter.
- Time-window filter.
- Ranked movie recommendations.
- 3 to 4 best show options per recommended movie.
- Price range or exact class recommendation.
- Value score.
- Availability label.
- Format advice.
- Price advice.
- "Open on PVR" redirect.

### PVR Data Flow

```text
Browser
  -> /api/pvr/recommendations
    -> PVR search/current movies
    -> PVR coming soon movies
    -> PVR sessions for candidate movies
    -> PVR seat layout for top shows only
    -> normalized recommendations
  <- ranked results
```

### PVR Server Modules

| File | Purpose |
| --- | --- |
| `src/lib/pvr/client.ts` | PVR HTTP client, headers, caching, response normalization, redirect URLs. |
| `src/lib/pvr/recommendations.ts` | Scoring, fit prediction, value score, price advice, availability labels. |
| `src/lib/pvr/types.ts` | Normalized PVR and recommendation TypeScript types. |
| `src/lib/pvr/cities.ts` | Supported city list and India date helper. |
| `src/lib/pvr/local-user-data.ts` | Development fallback profile for no-Supabase local mode. |

### PVR Endpoints Used

The adapter wraps website-facing PVR endpoints under:

```text
https://api3.pvrcinemas.com/api/v1/booking
```

Current adapter calls:

- `content/comingsoon`
- `content/search`
- `content/msessions`
- `ticketing/seatlayout`

All calls include PVR-style request headers such as:

- `chain: PVR`
- `appVersion: 1.0`
- `platform: WEBSITE`
- `city`
- `country: INDIA`
- `Origin: https://www.pvrcinemas.com`
- `Authorization: Bearer <PVR_BEARER_TOKEN or empty>`

### PVR Cache Durations

The adapter uses short in-memory cache windows:

| Data | TTL |
| --- | --- |
| Coming soon movies | 15 minutes |
| Search/current movies | 5 minutes |
| Sessions | 5 minutes |
| Seat layout | 90 seconds |
| Stale grace | 30 minutes |

The recommendations response includes cache metadata so the UI can show stale or partially refreshed states.

### Normalized PVR Types

The app normalizes PVR payloads into internal types:

```ts
type PvrMovie = {
  id: string;
  title: string;
  releaseDate: string | null;
  languages: string[];
  genres: string[];
  posterUrl: string | null;
  redirectUrl: string;
  source: "pvr";
};
```

```ts
type PvrShow = {
  showKey: string;
  movieId: string;
  movieTitle: string;
  city: string;
  cinemaName: string;
  cinemaId: string | null;
  screenId: string | null;
  screenName: string | null;
  showDate: string;
  showTime: string;
  format: string;
  language: string | null;
  encrypted: string | null;
  totalSeats: number | null;
  availableSeats: number | null;
  priceRange: {
    min: number | null;
    max: number | null;
    values: number[];
  };
  redirectUrl: string;
};
```

```ts
type PvrSeatQuote = {
  showKey: string;
  categories: Array<{
    code: string;
    description: string;
    price: number;
    totalSeats: number;
    availableSeats: number;
    soldSeats: number;
    qualityWeight: number;
  }>;
  recommendedCategory: PvrSeatCategory | null;
  minPrice: number | null;
  maxPrice: number | null;
  availableSeatCount: number;
};
```

### Recommendation Scoring

Each option is scored using a transparent weighted model:

| Factor | Weight |
| --- | ---: |
| Movie fit | 35% |
| Format/language match | 20% |
| Time convenience | 15% |
| Theater preference/rating | 10% |
| Seat availability | 10% |
| Price value | 10% |

The engine excludes movies that already exist in your watched Movie Log. Matching is fuzzy enough to catch punctuation and spacing differences.

### Movie Fit

Movie fit is predicted from:

- Your average rating.
- Genre-specific rating history.
- Language-specific rating history.
- Watchlist priority.
- Release recency.
- Already-watched title checks.

Examples of generated reasons:

- `Strong history with Action, Thriller`
- `Good match for your Hindi ratings`
- `High priority on your watchlist`
- `Releasing soon at PVR`
- `Ranked from your overall Movie Log ratings`

### Price Recommendation Logic

For broad ranking, the engine uses session price ranges when available.

For top candidates, it calls `seatlayout` to get exact categories and prices. That enables:

- `bestValueClass`: recommended seat category.
- `targetPrice`: expected price based on your historical ticket costs.
- `upgradeAdvice`: whether premium formats such as IMAX, 4DX, PXL, Atmos, Luxe, or Insignia are worth the price delta.

The value score reuses the app's value formula:

```text
(rating ^ exponent * format_weight) / effective_cost * 100
```

### Redirects

The default PVR redirect format is:

```text
https://www.pvrcinemas.com/moviesessions/{city}/{encodedTitle}/{pvrMovieId}
```

If PVR returns a better direct URL, the adapter can normalize and use it.

## Watchlist and Upcoming PVR Movies

The watchlist page is linked with the PVR upcoming movies API.

```text
/watchlist
```

The page supports:

- Manual watchlist entries.
- TMDB search-based entries.
- PVR upcoming movie cards by city.
- Adding PVR upcoming movies directly into the watchlist.
- Opening a PVR movie page from an upcoming card.
- Fuzzy "On list" detection so duplicate titles are avoided.

PVR-added watchlist items store the PVR movie id in `notes`:

```text
PVR ID: <id>
```

No new Supabase table is required for PVR v1.

## OCR Features

CinemaLog has OCR routes for:

- Movie tickets and booking confirmations.
- Gift cards and vouchers.

OCR is powered by `@google/genai` and `GOOGLE_CLOUD_API_KEY`.

### Ticket OCR

Route:

```text
POST /api/ocr
```

The ticket OCR prompt is tuned for Indian cinema tickets, including:

- PVR INOX tax invoice PDFs.
- PVR INOX app screenshots.
- BookMyShow-style booking confirmations.

It extracts:

- Movie title.
- Date.
- Showtime.
- Theater.
- Audi/screen.
- Format.
- Seat.
- Booking id.
- Ticket cost.
- Convenience fee.

### Gift Card OCR

Route:

```text
POST /api/ocr/gift-card
```

It extracts:

- Card number.
- PIN.
- Face value.
- Expiry date.
- Platform.

The gift card OCR route is configured for Edge runtime to allow a longer request window on Vercel Hobby deployments.

## TMDB Enrichment

TMDB is used for manual movie enrichment and search flows. The PVR recommendation flow does not depend on TMDB upcoming movies.

Route:

```text
GET /api/tmdb
```

Supported query styles:

```text
/api/tmdb?query=oppenheimer
/api/tmdb?id=872585
/api/tmdb?upcoming=true
```

TMDB enrichment can populate:

- Runtime.
- Genres.
- Language.
- Director.
- Poster.
- Release date.
- Overview.
- Cast.
- Composer.
- Cinematographer.
- Budget.
- Box office.
- TMDB rating and vote count.
- Certification.
- Trailer URL.
- Keywords.
- Collection/franchise metadata.

## Value Score Formula

The value score is used throughout the app to measure how much enjoyment you got per rupee.

Default formula:

```text
(rating ^ exponent * format_weight) / effective_cost * 100
```

The exponent is tiered by rating:

| Rating tier | Default exponent |
| --- | ---: |
| Up to 6 | 1.3 |
| Up to 7 | 1.4 |
| Up to 8 | 1.5 |
| Up to 9 | 1.8 |
| Up to 10 | 1.9 |

Default cost floor:

```text
100
```

Effective cost can include:

- Ticket cost.
- Convenience fee.
- F&B cost.
- Other expenses.
- Passport savings.
- Gift card discount savings.

The formula is configurable from:

```text
/settings/formula
```

## App Routes

### Main Routes

| Route | Purpose |
| --- | --- |
| `/` | Dashboard. |
| `/movies` | Movie list and filters. |
| `/movies/new` | Add movie, OCR ticket upload, TMDB search. |
| `/movies/[id]` | Movie detail page. |
| `/movies/[id]/edit` | Edit a movie. |
| `/recommendations` | Live PVR recommendations. |
| `/watchlist` | Watchlist and PVR upcoming movies. |
| `/stats` | Analytics and charts. |
| `/calendar` | Calendar view. |
| `/year-wrapped` | Yearly recap. |
| `/gift-cards` | Gift card tracking. |
| `/fnb` | F&B purchase tracking. |
| `/companions` | Watch companion management. |
| `/franchises` | Franchise management. |
| `/franchises/[id]` | Franchise timeline. |
| `/crew/[name]` | Crew/person stats. |
| `/settings` | Settings hub. |

### Settings Routes

| Route | Purpose |
| --- | --- |
| `/settings/export` | Export CSV/PDF data. |
| `/settings/import` | Import movie data from CSV. |
| `/settings/budget` | Monthly budgets. |
| `/settings/passport` | PVR Passport tracking. |
| `/settings/theaters` | Theaters and capabilities. |
| `/settings/formats` | Formats and format weights. |
| `/settings/moods` | Mood options. |
| `/settings/aspects` | Strongest/weakest movie aspects. |
| `/settings/rewatch` | Rewatch options. |
| `/settings/formula` | Value score formula configuration. |

### Auth Route

| Route | Purpose |
| --- | --- |
| `/login` | Supabase login. |

## API Routes

### PVR

#### `GET /api/pvr/comingsoon`

Query params:

| Param | Default | Purpose |
| --- | --- | --- |
| `city` | `Lucknow` | PVR city. |
| `languages` | empty | PVR language filter. |
| `genres` | empty | PVR genre filter. |
| `text` | empty | Search text. |

Response:

```json
{
  "city": "Lucknow",
  "movies": [],
  "cache": {
    "cached": false,
    "stale": false,
    "fetchedAt": "2026-04-11T00:00:00.000Z",
    "ttlSeconds": 900
  }
}
```

#### `GET /api/pvr/sessions`

Query params:

| Param | Required | Default | Purpose |
| --- | --- | --- | --- |
| `movieId` | Yes | none | PVR movie id. |
| `title` | No | `Movie` | Movie title for normalization and redirects. |
| `city` | No | `Lucknow` | PVR city. |
| `date` | No | Current date in India | Show date. |
| `language` | No | `ALL` | Language filter. |
| `format` | No | `ALL` | Format filter. |
| `time` | No | `08:00-24:00` | Time window. |

#### `POST /api/pvr/seatlayout`

Body:

```json
{
  "city": "Lucknow",
  "dated": "2026-04-11",
  "encrypted": "PVR_ENCRYPTED_SHOW_ID",
  "showKey": "NORMALIZED_SHOW_KEY"
}
```

Returns normalized category pricing and availability.

#### `GET /api/pvr/recommendations`

Query params:

| Param | Default | Purpose |
| --- | --- | --- |
| `city` | `Lucknow` | PVR city. |
| `date` | Current date in India | Show date. |
| `language` | `ALL` | Preferred language. |
| `format` | `ALL` | Preferred format. |
| `time` | `08:00-24:00` | Time window. |
| `text` | empty | Search term. |
| `genre` | empty | Genre filter. |

Response includes:

- `recommendations`
- `upcoming`
- `otherPlaying`
- `diagnostics`
- `cache`

### TMDB

```text
GET /api/tmdb?query=<movie title>
GET /api/tmdb?id=<tmdb id>
GET /api/tmdb?upcoming=true
```

Requires `TMDB_API_KEY`.

### OCR

```text
POST /api/ocr
POST /api/ocr/gift-card
```

Requires `GOOGLE_CLOUD_API_KEY`.

### Seed

```text
POST /api/seed
```

Seeds defaults for the current Supabase user.

## Development Workflow

### Common Commands

```bash
npm run dev
npm run build
npm run lint
```

### TypeScript

The project is TypeScript-first. A direct typecheck can be run with:

```bash
npx tsc --noEmit
```

### Recommended Verification Before Pushing

Run:

```bash
npm run lint
npm run build
```

For PVR changes, also manually check:

```text
/recommendations?city=Lucknow
/watchlist
/api/pvr/comingsoon?city=Lucknow
/api/pvr/recommendations?city=Lucknow
```

### Working With Dirty Trees

This repo may have local generated files or in-progress edits. Before making changes:

```bash
git status --short
```

Keep README, code, and migration edits scoped. Do not revert unrelated local changes unless you explicitly intend to.

## Deployment

The app is suitable for Vercel deployment.

### Required Vercel Environment Variables

At minimum:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

For full features:

```text
TMDB_API_KEY
GOOGLE_CLOUD_API_KEY
PVR_BEARER_TOKEN
```

### Production Behavior

In production:

- Supabase config is required.
- Auth middleware protects app routes.
- Missing TMDB or OCR keys only affect those specific API routes.
- PVR routes are server-side and use short in-memory caching.

### `vercel.json`

The current Vercel config sets a manifest content-type header:

```json
{
  "headers": [
    {
      "source": "/manifest.json",
      "headers": [
        {
          "key": "Content-Type",
          "value": "application/manifest+json"
        }
      ]
    }
  ]
}
```

## Data and Privacy Notes

CinemaLog is built as a personal tool. It stores sensitive personal viewing and spending data, including:

- Movie history.
- Ticket costs.
- Gift card codes.
- F&B spend.
- Theater preferences.
- Watch companions.
- Uploaded ticket/photos if enabled.

Recommended practices:

- Keep Supabase RLS enabled.
- Do not expose service-role keys to the browser.
- Do not commit `.env.local`.
- Avoid sharing production database access.
- Treat gift card codes and PINs like payment credentials.
- Keep PVR live data transient; v1 does not persist show, seat, or price data in Supabase.

## PVR Integration Risk Notes

The PVR integration uses website-facing endpoints, not a formal public partner API. For a private, personal-use app with short cache windows and low request volume, the practical risk is lower than a public or commercial product, but it is still not zero.

Recommended guardrails:

- Keep the tool personal/private.
- Keep all PVR calls server-side.
- Keep request volume low.
- Use short caching and avoid polling aggressively.
- Do not bypass CAPTCHA, auth, encryption, rate limits, or bot protections.
- Do not resell, republish, or bulk-export PVR pricing, availability, or revenue-like analytics.
- Use "Open on PVR" redirects for booking instead of attempting checkout automation.
- Add a kill switch before public deployment if PVR endpoints become unstable.
- Seek permission or a formal API arrangement before turning this into a public or commercial feature.

Risk estimate by use case:

| Use case | Practical risk |
| --- | --- |
| Private personal tool, low-rate, read-only, redirects to PVR | Medium-low |
| Shared with a small group, still non-commercial | Medium |
| Public deployed app using live PVR inventory/prices | Medium-high |
| Commercial product, scraping at scale, analytics/resale of PVR data | High |
| Auth bypass, CAPTCHA bypass, checkout automation, or token circumvention | Very high |

This is an engineering risk summary, not legal advice.

## Troubleshooting

### App Redirects to Login Locally

Check whether Supabase env vars are partially configured. Local fallback only activates when Supabase config is missing or placeholder-like.

If you want full local auth, set:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

If you want no-Supabase local mode, remove both variables from `.env.local`.

### TMDB Search Returns Configuration Error

Set:

```text
TMDB_API_KEY
```

Then restart the dev server.

### OCR Returns Missing API Key

Set:

```text
GOOGLE_CLOUD_API_KEY
```

Then restart the dev server.

### PVR Recommendations Return Few or No Shows

Check:

- City is supported in `src/lib/pvr/cities.ts`.
- Date is valid and not too far out.
- Language and format filters are not too restrictive.
- PVR currently has sessions for that movie/city/date.
- PVR has not changed the response shape.
- Seat layout calls may fail for shows without an `encrypted` show id.

### PVR Data Looks Stale

The recommendations API returns cache metadata. If `stale` is true, the adapter used a stale cache entry because the live call did not refresh successfully.

Restarting the dev server clears the in-memory cache.

### Watchlist PVR Add Works Locally but Not in Production

In no-Supabase development mode, watchlist entries are stored in `localStorage`. Production uses Supabase. Make sure:

- Supabase env vars are configured.
- `watchlist` migration has been applied.
- The user is authenticated.
- RLS policies are present.

### Build Fails With Missing Module Errors

Run:

```bash
npm install
```

Then:

```bash
npm run build
```

If the error points to a deleted local file, inspect:

```bash
git status --short
```

and restore or re-add only the file you intentionally need.

### Supabase Types Are Out of Sync

The app uses hand-maintained database types in:

```text
src/types/database.ts
```

When changing migrations, update the matching TypeScript table types.

## Notes for Future Work

Potential next improvements:

- Persist a preferred PVR city per user.
- Add a server-side PVR kill switch env var.
- Add focused unit tests for PVR normalization and recommendation scoring.
- Add a compact recommendation explanation debugger for each score component.
- Store a first-class `pvr_id` on watchlist items if PVR integration becomes permanent.
- Add retry/backoff controls for PVR calls.
- Add formal API integration if PVR provides partner access.
