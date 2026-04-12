import type {
  MovieFitResult,
  PredictionConfidenceLabel,
  PvrMovie,
  PvrShow,
  RecommendationUserData,
} from "@/lib/pvr/types";
import { normalizeAudiValue } from "@/lib/audi";

interface AverageStat {
  sum: number;
  count: number;
}

interface FranchiseStat {
  name: string;
  sum: number;
  count: number;
}

interface WatchedTitleStat {
  bestRating: number;
}

interface WatchlistStat {
  priority: number;
}

export interface ShowPredictionAdjustment {
  delta: number;
  confidenceBoost: number;
  reason: string | null;
}

export interface PersonalPredictionModel {
  globalAverage: number;
  ratingStdDev: number;
  historyCount: number;
  watchedTitles: Map<string, WatchedTitleStat>;
  watchlist: Map<string, WatchlistStat>;
  genreMeans: Map<string, AverageStat>;
  genrePairMeans: Map<string, AverageStat>;
  languageMeans: Map<string, AverageStat>;
  directorMeans: Map<string, AverageStat>;
  castMeans: Map<string, AverageStat>;
  keywordMeans: Map<string, AverageStat>;
  franchiseMeans: Map<string, FranchiseStat>;
  formatMeans: Map<string, AverageStat>;
  audiMeans: Map<string, AverageStat>;
  theaterMeans: Map<string, AverageStat>;
  timeBucketMeans: Map<string, AverageStat>;
  weekdayMeans: Map<string, AverageStat>;
  tmdbDeltaOverall: AverageStat | null;
  tmdbDeltaByGenre: Map<string, AverageStat>;
  tmdbDeltaByLanguage: Map<string, AverageStat>;
  tmdbDeltaByDirector: Map<string, AverageStat>;
  tmdbDeltaByCast: Map<string, AverageStat>;
  explicitTheaterAdjustments: Map<string, AverageStat>;
  explicitAudiAdjustments: Map<string, AverageStat>;
  formatNamesById: Map<string, string>;
  theaterNamesById: Map<string, string>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function titleMatches(a: string, b: string): boolean {
  const left = normalizeKey(a);
  const right = normalizeKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.includes(right) || right.includes(left);
}

function addStat(map: Map<string, AverageStat>, rawKey: string | null | undefined, value: number, weight = 1): void {
  if (!rawKey || !Number.isFinite(value)) return;
  const key = normalizeKey(rawKey);
  if (!key) return;
  const current = map.get(key) || { sum: 0, count: 0 };
  current.sum += value * weight;
  current.count += weight;
  map.set(key, current);
}

function getRecencyWeight(dateStr: string): number {
  const daysSince = (Date.now() - new Date(dateStr).getTime()) / 86_400_000;
  if (!Number.isFinite(daysSince) || daysSince < 0) return 1;
  return 0.4 + 0.6 * Math.exp(-daysSince / 365);
}

function makeGenrePairs(genres: string[]): string[] {
  if (!genres || genres.length < 2) return [];
  const sorted = genres.map(normalizeKey).filter(Boolean).sort();
  const pairs: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      pairs.push(`${sorted[i]}|${sorted[j]}`);
    }
  }
  return pairs;
}

function average(stat: AverageStat | null | undefined): number | null {
  if (!stat || stat.count <= 0) return null;
  return stat.sum / stat.count;
}

function shrinkTowardMean(
  stat: AverageStat | null | undefined,
  priorMean: number,
  priorWeight = 3
): number | null {
  if (!stat || stat.count <= 0) return null;
  return (priorMean * priorWeight + stat.sum) / (priorWeight + stat.count);
}

export function getPredictionConfidenceLabel(
  confidence: number
): PredictionConfidenceLabel {
  if (confidence >= 0.72) return "high";
  if (confidence >= 0.46) return "medium";
  return "low";
}

function getWeekday(date: string | null): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-US", { weekday: "long" });
}

function getTimeBucket(showtime: string | null): string | null {
  if (!showtime) return null;
  const match = showtime.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3]?.toUpperCase();

  if (period === "PM" && hour < 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;

  const value = hour + minute / 60;
  if (value < 12) return "morning";
  if (value < 17) return "afternoon";
  if (value < 22) return "evening";
  return "late";
}

function getTheaterName(
  theaterId: string | null,
  theaterNamesById: Map<string, string>
): string | null {
  if (!theaterId) return null;
  return theaterNamesById.get(theaterId) || null;
}

function toExplicitAdjustment(values: Array<number | null | undefined>): number | null {
  const valid = values.filter(
    (value): value is number => typeof value === "number" && value > 0
  );
  if (valid.length === 0) return null;
  const avg = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  return clamp((avg - 3.2) * 0.45, -0.8, 0.9);
}

function pushReason(reasons: string[], reason: string | null | undefined): void {
  if (!reason) return;
  if (!reasons.includes(reason)) reasons.push(reason);
}

function weightedAverage(signals: Array<{ value: number; weight: number }>, fallback: number): number {
  const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0);
  if (totalWeight <= 0) return fallback;
  return signals.reduce((sum, signal) => sum + signal.value * signal.weight, 0) / totalWeight;
}

function blendedDelta(
  deltas: Array<{ value: number; weight: number }>
): number {
  const totalWeight = deltas.reduce((sum, signal) => sum + signal.weight, 0);
  if (totalWeight <= 0) return 0;
  return deltas.reduce((sum, signal) => sum + signal.value * signal.weight, 0) / totalWeight;
}

export function buildPersonalPredictionModel(
  userData: RecommendationUserData
): PersonalPredictionModel {
  const ratedMovies = userData.movies.filter(
    (movie) => typeof movie.rating === "number" && movie.rating > 0
  );
  const globalAverage = ratedMovies.length > 0
    ? ratedMovies.reduce((sum, movie) => sum + (movie.rating || 0), 0) / ratedMovies.length
    : 6.7;

  // Compute rating standard deviation for spread calibration
  const ratingVariance = ratedMovies.length > 1
    ? ratedMovies.reduce((sum, movie) => sum + Math.pow((movie.rating || 0) - globalAverage, 2), 0) / ratedMovies.length
    : 2.25;
  const ratingStdDev = Math.sqrt(ratingVariance);

  const formatNamesById = new Map(
    userData.formats.map((format) => [format.id, format.name])
  );
  const theaterNamesById = new Map(
    userData.theaters.map((theater) => [theater.id, theater.name])
  );

  const watchedTitles = new Map<string, WatchedTitleStat>();
  const watchlist = new Map<string, WatchlistStat>();
  const genreMeans = new Map<string, AverageStat>();
  const genrePairMeans = new Map<string, AverageStat>();
  const languageMeans = new Map<string, AverageStat>();
  const directorMeans = new Map<string, AverageStat>();
  const castMeans = new Map<string, AverageStat>();
  const keywordMeans = new Map<string, AverageStat>();
  const franchiseMeans = new Map<string, FranchiseStat>();
  const formatMeans = new Map<string, AverageStat>();
  const audiMeans = new Map<string, AverageStat>();
  const theaterMeans = new Map<string, AverageStat>();
  const timeBucketMeans = new Map<string, AverageStat>();
  const weekdayMeans = new Map<string, AverageStat>();
  const tmdbDeltaByGenre = new Map<string, AverageStat>();
  const tmdbDeltaByLanguage = new Map<string, AverageStat>();
  const tmdbDeltaByDirector = new Map<string, AverageStat>();
  const tmdbDeltaByCast = new Map<string, AverageStat>();
  const explicitTheaterAdjustments = new Map<string, AverageStat>();
  const explicitAudiAdjustments = new Map<string, AverageStat>();

  let tmdbDeltaOverall: AverageStat | null = null;

  // Build franchise name lookup from user data
  const franchiseNamesById = new Map<string, string>();
  if (userData.franchises) {
    for (const f of userData.franchises) {
      franchiseNamesById.set(f.id, f.name);
    }
  }

  for (const movie of ratedMovies) {
    const rating = movie.rating || 0;
    const titleKey = normalizeKey(movie.title);
    // Recency decay: recent movies get more weight
    const rw = getRecencyWeight(movie.date);

    if (titleKey) {
      const current = watchedTitles.get(titleKey) || { bestRating: 0 };
      current.bestRating = Math.max(current.bestRating, rating);
      watchedTitles.set(titleKey, current);
    }

    for (const genre of movie.genres || []) addStat(genreMeans, genre, rating, rw);
    // Genre-pair interactions
    for (const pair of makeGenrePairs(movie.genres || [])) {
      const current = genrePairMeans.get(pair) || { sum: 0, count: 0 };
      current.sum += rating * rw;
      current.count += rw;
      genrePairMeans.set(pair, current);
    }
    addStat(languageMeans, movie.language, rating, rw);
    addStat(directorMeans, movie.director, rating, rw);

    // Cast affinity
    for (const actor of movie.castMembers || []) {
      addStat(castMeans, actor, rating, rw);
    }

    // Keyword means
    for (const kw of movie.keywords || []) {
      addStat(keywordMeans, kw, rating, rw);
    }

    // Franchise means
    if (movie.franchiseId) {
      const fname = franchiseNamesById.get(movie.franchiseId) || movie.franchiseId;
      const fkey = normalizeKey(fname);
      if (fkey) {
        const current = franchiseMeans.get(fkey) || { name: fname, sum: 0, count: 0 };
        current.sum += rating * rw;
        current.count += rw;
        franchiseMeans.set(fkey, current);
      }
    }

    const formatName = movie.formatId ? formatNamesById.get(movie.formatId) || null : null;
    addStat(formatMeans, formatName, rating, rw);
    addStat(audiMeans, normalizeAudiValue(movie.audi), rating, rw);

    const theaterName = getTheaterName(movie.theaterId, theaterNamesById);
    addStat(theaterMeans, theaterName, rating, rw);
    addStat(timeBucketMeans, getTimeBucket(movie.showtime), rating, rw);
    addStat(weekdayMeans, getWeekday(movie.date), rating, rw);

    if (typeof movie.tmdbRating === "number" && movie.tmdbRating > 0) {
      const delta = rating - movie.tmdbRating;
      tmdbDeltaOverall = tmdbDeltaOverall || { sum: 0, count: 0 };
      tmdbDeltaOverall.sum += delta * rw;
      tmdbDeltaOverall.count += rw;

      for (const genre of movie.genres || []) addStat(tmdbDeltaByGenre, genre, delta, rw);
      addStat(tmdbDeltaByLanguage, movie.language, delta, rw);
      addStat(tmdbDeltaByDirector, movie.director, delta, rw);
      for (const actor of movie.castMembers || []) {
        addStat(tmdbDeltaByCast, actor, delta, rw);
      }
    }
  }

  for (const item of userData.watchlist.filter((entry) => !entry.watchedMovieId)) {
    const key = normalizeKey(item.title);
    if (!key) continue;
    watchlist.set(key, { priority: item.priority });
  }

  for (const rating of userData.theaterRatings) {
    const theaterName = theaterNamesById.get(rating.theaterId);
    const explicitAdjustment = toExplicitAdjustment([
      rating.sound,
      rating.seat,
      rating.screen,
      rating.cleanliness,
    ]);
    if (!theaterName || explicitAdjustment === null) continue;

    addStat(explicitTheaterAdjustments, theaterName, explicitAdjustment);
    if (rating.audi) {
      addStat(
        explicitAudiAdjustments,
        `${theaterName}|${normalizeAudiValue(rating.audi) || rating.audi}`,
        explicitAdjustment
      );
    }
  }

  return {
    globalAverage,
    ratingStdDev,
    historyCount: ratedMovies.length,
    watchedTitles,
    watchlist,
    genreMeans,
    genrePairMeans,
    languageMeans,
    directorMeans,
    castMeans,
    keywordMeans,
    franchiseMeans,
    formatMeans,
    audiMeans,
    theaterMeans,
    timeBucketMeans,
    weekdayMeans,
    tmdbDeltaOverall,
    tmdbDeltaByGenre,
    tmdbDeltaByLanguage,
    tmdbDeltaByDirector,
    tmdbDeltaByCast,
    explicitTheaterAdjustments,
    explicitAudiAdjustments,
    formatNamesById,
    theaterNamesById,
  };
}

function matchingWatchlistItem(
  movie: PvrMovie,
  model: PersonalPredictionModel
): WatchlistStat | null {
  for (const [title, item] of model.watchlist) {
    if (titleMatches(movie.title, title)) return item;
  }
  return null;
}

function matchingWatchedTitle(
  movie: PvrMovie,
  model: PersonalPredictionModel
): WatchedTitleStat | null {
  for (const [title, watched] of model.watchedTitles) {
    if (titleMatches(movie.title, title)) return watched;
  }
  return null;
}

export function predictMoviePersonalFit(
  movie: PvrMovie,
  model: PersonalPredictionModel
): MovieFitResult {
  const watched = matchingWatchedTitle(movie, model);
  if (watched) {
    return {
      predictedRating: watched.bestRating || model.globalAverage,
      confidence: 0.96,
      confidenceLabel: "high",
      crowdDelta: movie.tmdbRating ? round1((watched.bestRating || model.globalAverage) - movie.tmdbRating) : null,
      reasons: ["Already watched"],
      excluded: true,
    };
  }

  const reasons: string[] = [];
  // Reduced prior weight from 4→2 to let specific signals dominate
  const signals: Array<{ value: number; weight: number }> = [
    { value: model.globalAverage, weight: 2 },
  ];
  let supportWeight = 0;

  // --- Genre signal ---
  const genrePredictions = movie.genres
    .map((genre) => ({
      genre,
      stat: model.genreMeans.get(normalizeKey(genre)),
    }))
    .filter((entry) => entry.stat && entry.stat.count > 0)
    .map((entry) => ({
      genre: entry.genre,
      mean: shrinkTowardMean(entry.stat, model.globalAverage, 3) || model.globalAverage,
      count: entry.stat?.count || 0,
    }));

  if (genrePredictions.length > 0) {
    const genreValue = weightedAverage(
      genrePredictions.map((entry) => ({
        value: entry.mean,
        weight: Math.min(1.8, 0.7 + entry.count * 0.25),
      })),
      model.globalAverage
    );
    const genreWeight = Math.min(
      3,
      genrePredictions.reduce((sum, entry) => sum + entry.count, 0) * 0.3
    );
    signals.push({ value: genreValue, weight: genreWeight });
    supportWeight += genreWeight;

    const bestGenre = genrePredictions.sort((a, b) => b.count - a.count)[0];
    if (bestGenre.mean >= model.globalAverage + 0.35) {
      pushReason(reasons, `You usually rate ${bestGenre.genre} above your average`);
    }
  }

  // --- Genre-pair synergy signal ---
  const pairKeys = makeGenrePairs(movie.genres);
  const pairPredictions = pairKeys
    .map((pair) => ({ pair, stat: model.genrePairMeans.get(pair) }))
    .filter((entry) => entry.stat && entry.stat.count >= 2)
    .map((entry) => ({
      pair: entry.pair,
      mean: shrinkTowardMean(entry.stat, model.globalAverage, 2) || model.globalAverage,
      count: entry.stat?.count || 0,
    }));

  if (pairPredictions.length > 0) {
    const bestPair = pairPredictions.sort((a, b) => b.count - a.count)[0];
    const pairWeight = Math.min(1.2, 0.5 + bestPair.count * 0.15);
    signals.push({ value: bestPair.mean, weight: pairWeight });
    supportWeight += pairWeight;

    if (bestPair.mean >= model.globalAverage + 0.3) {
      const pairLabel = bestPair.pair.split("|").map((g) => g[0].toUpperCase() + g.slice(1)).join(" + ");
      pushReason(reasons, `Your ${pairLabel} combo averages strong`);
    }
  }

  // --- Language signal ---
  const languageStat = movie.languages
    .map((language) => model.languageMeans.get(normalizeKey(language)))
    .find((stat) => Boolean(stat?.count));
  const languageValue = shrinkTowardMean(languageStat, model.globalAverage, 3);
  if (languageValue !== null) {
    const languageWeight = Math.min(1.6, 0.8 + (languageStat?.count || 0) * 0.15);
    signals.push({ value: languageValue, weight: languageWeight });
    supportWeight += languageWeight;

    if (movie.languages[0] && languageValue >= model.globalAverage + 0.25) {
      pushReason(reasons, `Good match for your ${movie.languages[0]} ratings`);
    }
  }

  // --- Director signal ---
  const directorStat = movie.director
    ? model.directorMeans.get(normalizeKey(movie.director))
    : null;
  const directorValue = shrinkTowardMean(directorStat, model.globalAverage, 2);
  if (directorValue !== null) {
    const directorWeight = Math.min(1.8, 0.9 + (directorStat?.count || 0) * 0.2);
    signals.push({ value: directorValue, weight: directorWeight });
    supportWeight += directorWeight;

    if (movie.director && directorValue >= model.globalAverage + 0.35) {
      pushReason(reasons, `Strong history with ${movie.director}`);
    }
  }

  // --- Cast affinity signal ---
  const castPredictions = (movie.cast || [])
    .map((actor) => ({
      actor,
      stat: model.castMeans.get(normalizeKey(actor)),
    }))
    .filter((entry) => entry.stat && entry.stat.count >= 2)
    .map((entry) => ({
      actor: entry.actor,
      mean: shrinkTowardMean(entry.stat, model.globalAverage, 2) || model.globalAverage,
      count: entry.stat?.count || 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);

  if (castPredictions.length > 0) {
    const castValue = weightedAverage(
      castPredictions.map((entry) => ({
        value: entry.mean,
        weight: Math.min(1.5, 0.7 + entry.count * 0.2),
      })),
      model.globalAverage
    );
    const castWeight = Math.min(2.0, castPredictions.reduce((sum, entry) => sum + entry.count, 0) * 0.2);
    signals.push({ value: castValue, weight: castWeight });
    supportWeight += castWeight;

    const topActor = castPredictions[0];
    if (topActor.mean >= model.globalAverage + 0.35) {
      pushReason(reasons, `Strong history with ${topActor.actor} (avg ${round1(topActor.mean)} over ${Math.round(topActor.count)} films)`);
    }
  }

  // --- Keyword/theme signal ---
  const keywordPredictions = (movie.keywords || [])
    .map((kw) => ({ kw, stat: model.keywordMeans.get(normalizeKey(kw)) }))
    .filter((entry) => entry.stat && entry.stat.count >= 2)
    .map((entry) => ({
      kw: entry.kw,
      mean: shrinkTowardMean(entry.stat, model.globalAverage, 3) || model.globalAverage,
      count: entry.stat?.count || 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  if (keywordPredictions.length > 0) {
    const kwValue = weightedAverage(
      keywordPredictions.map((entry) => ({
        value: entry.mean,
        weight: Math.min(1.0, 0.4 + entry.count * 0.12),
      })),
      model.globalAverage
    );
    const kwWeight = Math.min(1.0, keywordPredictions.reduce((sum, entry) => sum + entry.count, 0) * 0.1);
    signals.push({ value: kwValue, weight: kwWeight });
    supportWeight += kwWeight;

    const bestKw = keywordPredictions[0];
    if (bestKw.mean >= model.globalAverage + 0.4) {
      pushReason(reasons, `Your '${bestKw.kw}' movies average ${round1(bestKw.mean)}`);
    }
  }

  // --- Franchise signal ---
  for (const [fkey, fstat] of model.franchiseMeans) {
    if (fstat.count < 2) continue;
    if (titleMatches(movie.title, fstat.name)) {
      const fMean = (fstat.sum / fstat.count);
      const shrunkMean = (model.globalAverage * 2 + fstat.sum) / (2 + fstat.count);
      const fWeight = Math.min(1.5, 0.6 + fstat.count * 0.2);
      signals.push({ value: shrunkMean, weight: fWeight });
      supportWeight += fWeight;
      if (shrunkMean >= model.globalAverage + 0.3) {
        pushReason(reasons, `You average ${round1(fMean)} across ${Math.round(fstat.count)} ${fstat.name} films`);
      }
      break;
    }
  }

  // --- TMDB calibration signal ---
  if (typeof movie.tmdbRating === "number" && movie.tmdbRating > 0) {
    const tmdbDeltas: Array<{ value: number; weight: number }> = [];
    const overallDelta = average(model.tmdbDeltaOverall);
    if (overallDelta !== null) tmdbDeltas.push({ value: overallDelta, weight: 1.2 });

    for (const genre of movie.genres) {
      const stat = model.tmdbDeltaByGenre.get(normalizeKey(genre));
      const delta = average(stat);
      if (delta !== null) {
        tmdbDeltas.push({
          value: delta,
          weight: Math.min(1.4, 0.6 + (stat?.count || 0) * 0.15),
        });
      }
    }

    for (const language of movie.languages) {
      const stat = model.tmdbDeltaByLanguage.get(normalizeKey(language));
      const delta = average(stat);
      if (delta !== null) {
        tmdbDeltas.push({
          value: delta,
          weight: Math.min(1.1, 0.45 + (stat?.count || 0) * 0.14),
        });
      }
    }

    if (movie.director) {
      const stat = model.tmdbDeltaByDirector.get(normalizeKey(movie.director));
      const delta = average(stat);
      if (delta !== null) {
        tmdbDeltas.push({
          value: delta,
          weight: Math.min(1.2, 0.5 + (stat?.count || 0) * 0.2),
        });
      }
    }

    // Cast TMDB delta
    for (const actor of (movie.cast || []).slice(0, 2)) {
      const stat = model.tmdbDeltaByCast.get(normalizeKey(actor));
      const delta = average(stat);
      if (delta !== null) {
        tmdbDeltas.push({
          value: delta,
          weight: Math.min(0.9, 0.4 + (stat?.count || 0) * 0.12),
        });
      }
    }

    const tmdbPredicted = clamp(
      movie.tmdbRating + blendedDelta(tmdbDeltas),
      1,
      10
    );
    const tmdbWeight = 1.6 + Math.min((movie.tmdbVoteCount || 0) / 1500, 1.4);
    signals.push({ value: tmdbPredicted, weight: tmdbWeight });
    supportWeight += tmdbWeight;

    const crowdDelta = round1(tmdbPredicted - movie.tmdbRating);
    if (Math.abs(crowdDelta) >= 0.35) {
      pushReason(
        reasons,
        crowdDelta > 0
          ? "You tend to rate this kind of movie above TMDB"
          : "You tend to rate this kind of movie below TMDB"
      );
    }
  }

  let predictedRating = weightedAverage(signals, model.globalAverage);
  const watchlistItem = matchingWatchlistItem(movie, model);
  if (watchlistItem) {
    predictedRating += [0.2, 0.45, 0.75][watchlistItem.priority] || 0.2;
    pushReason(
      reasons,
      watchlistItem.priority >= 2 ? "High priority on your watchlist" : "On your watchlist"
    );
  }

  // --- Spread calibration ---
  // If predictions are compressed (low std dev), scale away from center
  // to match the user's actual rating spread
  if (model.historyCount >= 12 && model.ratingStdDev > 0.5) {
    const deviation = predictedRating - model.globalAverage;
    // Amplify deviations by up to 1.5x to match user's natural spread
    const spreadFactor = clamp(model.ratingStdDev / 1.2, 1.0, 1.6);
    predictedRating = model.globalAverage + deviation * spreadFactor;
  }

  // --- Low-signal TMDB anchoring ---
  // When we have few personal signals, lean toward TMDB instead of
  // defaulting to the inflated global average
  if (supportWeight < 3 && typeof movie.tmdbRating === "number" && movie.tmdbRating > 0) {
    const tmdbAnchor = movie.tmdbRating + (average(model.tmdbDeltaOverall) || 0);
    const anchorBlend = clamp(1 - supportWeight / 3, 0.15, 0.5);
    predictedRating = predictedRating * (1 - anchorBlend) + tmdbAnchor * anchorBlend;
    if (supportWeight < 1) {
      pushReason(reasons, "Limited personal signal — leaning on crowd rating");
    }
  }

  predictedRating = round1(clamp(predictedRating, 1, 10));

  const confidence = clamp(
    0.22 +
      Math.min(model.historyCount / 24, 1) * 0.28 +
      Math.min(supportWeight / 8.5, 1) * 0.4 +
      (movie.tmdbRating ? 0.08 : 0),
    0.2,
    0.96
  );

  if (reasons.length === 0) {
    pushReason(reasons, "Predicted from your Movie Log history");
  }

  return {
    predictedRating,
    confidence: Math.round(confidence * 100) / 100,
    confidenceLabel: getPredictionConfidenceLabel(confidence),
    crowdDelta: movie.tmdbRating ? round1(predictedRating - movie.tmdbRating) : null,
    reasons: reasons.slice(0, 3),
    excluded: false,
  };
}

export function predictShowAdjustment(
  show: PvrShow,
  model: PersonalPredictionModel
): ShowPredictionAdjustment {
  const deltas: Array<{ value: number; weight: number; reason: string }> = [];
  const theaterKey = normalizeKey(show.cinemaName);

  const formatStat = model.formatMeans.get(normalizeKey(show.format));
  const formatMean = shrinkTowardMean(formatStat, model.globalAverage, 3);
  if (formatMean !== null) {
    const formatDelta = clamp((formatMean - model.globalAverage) * 0.35, -0.6, 0.6);
    deltas.push({
      value: formatDelta,
      weight: 1 + Math.min((formatStat?.count || 0) * 0.1, 0.8),
      reason:
        formatDelta > 0.2
          ? `${show.format} usually lifts your rating`
          : formatDelta < -0.2
            ? `${show.format} is weaker for you`
            : `${show.format} is neutral for you`,
    });
  }

  if (show.screenName) {
    const screenKey = normalizeAudiValue(show.screenName) || show.screenName;
    const audiStat = model.audiMeans.get(normalizeKey(screenKey));
    const audiMean = shrinkTowardMean(audiStat, model.globalAverage, 2);
    if (audiMean !== null) {
      const audiDelta = clamp((audiMean - model.globalAverage) * 0.24, -0.3, 0.3);
      deltas.push({
        value: audiDelta,
        weight: 0.85 + Math.min((audiStat?.count || 0) * 0.12, 0.45),
        reason:
          audiDelta > 0.14
            ? `${show.screenName} usually works for you`
            : `${show.screenName} screen history`,
      });
    }
  }

  const timeBucket = getTimeBucket(show.showTime);
  const timeStat = timeBucket ? model.timeBucketMeans.get(timeBucket) : null;
  const timeMean = shrinkTowardMean(timeStat, model.globalAverage, 3);
  if (timeMean !== null) {
    const timeDelta = clamp((timeMean - model.globalAverage) * 0.25, -0.35, 0.35);
    deltas.push({
      value: timeDelta,
      weight: 0.8 + Math.min((timeStat?.count || 0) * 0.08, 0.5),
      reason:
        timeDelta > 0.15
          ? `${timeBucket?.[0]?.toUpperCase()}${timeBucket?.slice(1)} shows usually work for you`
          : `${timeBucket?.[0]?.toUpperCase()}${timeBucket?.slice(1)} slot`,
    });
  }

  const weekday = getWeekday(show.showDate);
  const weekdayStat = weekday ? model.weekdayMeans.get(weekday) : null;
  const weekdayMean = shrinkTowardMean(weekdayStat, model.globalAverage, 3);
  if (weekdayMean !== null) {
    const weekdayDelta = clamp((weekdayMean - model.globalAverage) * 0.18, -0.2, 0.2);
    deltas.push({
      value: weekdayDelta,
      weight: 0.6 + Math.min((weekdayStat?.count || 0) * 0.07, 0.35),
      reason:
        weekdayDelta > 0.12
          ? `${weekday} watches tend to land well`
          : `${weekday} viewing pattern`,
    });
  }

  const theaterStat = model.theaterMeans.get(theaterKey);
  const theaterMean = shrinkTowardMean(theaterStat, model.globalAverage, 3);
  if (theaterMean !== null) {
    const theaterDelta = clamp((theaterMean - model.globalAverage) * 0.28, -0.45, 0.45);
    deltas.push({
      value: theaterDelta,
      weight: 0.9 + Math.min((theaterStat?.count || 0) * 0.1, 0.5),
      reason:
        theaterDelta > 0.18
          ? `${show.cinemaName} tends to rate well for you`
          : `Theater effect from ${show.cinemaName}`,
    });
  }

  const explicitTheaterDelta = average(model.explicitTheaterAdjustments.get(theaterKey));
  if (explicitTheaterDelta !== null) {
    deltas.push({
      value: explicitTheaterDelta * 0.4,
      weight: 0.95,
      reason:
        explicitTheaterDelta > 0
          ? `Your theater ratings like ${show.cinemaName}`
          : `Your theater ratings are mixed on ${show.cinemaName}`,
    });
  }

  if (show.screenName) {
    const screenKey = normalizeAudiValue(show.screenName) || show.screenName;
    const explicitAudiDelta = average(
      model.explicitAudiAdjustments.get(`${theaterKey}|${normalizeKey(screenKey)}`)
    );
    if (explicitAudiDelta !== null) {
      deltas.push({
        value: explicitAudiDelta * 0.45,
        weight: 0.85,
        reason:
          explicitAudiDelta > 0
            ? `${show.screenName} gets a boost from your audi ratings`
            : `${show.screenName} has a weaker audi history`,
      });
    }
  }

  if (deltas.length === 0) {
    return { delta: 0, confidenceBoost: 0, reason: null };
  }

  const delta = clamp(
    deltas.reduce((sum, item) => sum + item.value * item.weight, 0) /
      deltas.reduce((sum, item) => sum + item.weight, 0),
    -0.8,
    0.8
  );
  const strongest = [...deltas].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];

  return {
    delta,
    confidenceBoost: Math.min(0.18, deltas.length * 0.04),
    reason: Math.abs(strongest.value) >= 0.14 ? strongest.reason : null,
  };
}
