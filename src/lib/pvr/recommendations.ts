import {
  calculateValueScore,
  DEFAULT_FORMULA_PARAMS,
  formatCurrency,
} from "@/lib/formula";
import {
  buildPersonalPredictionModel,
  getPredictionConfidenceLabel,
  predictMoviePersonalFit,
  predictShowAdjustment,
} from "@/lib/pvr/personal-predictor";
import type {
  MovieFitResult,
  MovieRecommendation,
  PvrMovie,
  PvrSeatQuote,
  PvrShow,
  RecommendationOption,
  RecommendationUserData,
  UserMovieForRecommendation,
} from "@/lib/pvr/types";
import type { FormulaParams } from "@/types";

const MAX_OPTIONS_PER_MOVIE = 4;
const DEFAULT_TARGET_PRICE = 300;

interface AverageStat {
  sum: number;
  count: number;
}

interface WatchedTitleStat {
  bestRating: number;
  rewatchFriendly: boolean;
}

interface PreferenceProfile {
  averageRating: number;
  genreRatings: Map<string, AverageStat>;
  languageRatings: Map<string, AverageStat>;
  formatPrices: Map<string, number[]>;
  languagePrices: Map<string, number[]>;
  globalPrices: number[];
  watchedTitles: Map<string, WatchedTitleStat>;
  watchlist: Map<string, { priority: number; genres: string[]; releaseDate: string | null }>;
  formatWeights: Map<string, number>;
  theaterScores: Map<string, number>;
  formulaParams: FormulaParams;
}

export interface RankedMovieCandidate {
  movie: PvrMovie;
  fit: MovieFitResult;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(stat: AverageStat | undefined): number | null {
  if (!stat || stat.count === 0) return null;
  return stat.sum / stat.count;
}

function addStat(map: Map<string, AverageStat>, key: string | null | undefined, rating: number): void {
  if (!key) return;
  const normalized = normalizeKey(key);
  if (!normalized) return;
  const current = map.get(normalized) || { sum: 0, count: 0 };
  current.sum += rating;
  current.count += 1;
  map.set(normalized, current);
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(value: string): string[] {
  return normalizeKey(value).split(" ").filter(Boolean);
}

function titleMatches(a: string, b: string): boolean {
  const left = normalizeKey(a);
  const right = normalizeKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.includes(right) || right.includes(left);
}

function median(values: number[]): number | null {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function ticketOnlyCost(movie: UserMovieForRecommendation): number {
  return Math.max(
    (movie.ticketCost || 0) +
      (movie.convenienceFee || 0) -
      (movie.passportSavings || 0),
    0
  );
}

function movieFormatName(
  movie: UserMovieForRecommendation,
  userData: RecommendationUserData
): string | null {
  if (!movie.formatId) return null;
  return userData.formats.find((format) => format.id === movie.formatId)?.name || null;
}

function buildTheaterScores(userData: RecommendationUserData): Map<string, number> {
  const ratingsByTheater = new Map<string, number[]>();
  for (const rating of userData.theaterRatings) {
    const values = [rating.sound, rating.seat, rating.screen, rating.cleanliness].filter(
      (value): value is number => typeof value === "number" && value > 0
    );
    if (values.length === 0) continue;
    const averageRating = values.reduce((sum, value) => sum + value, 0) / values.length;
    const current = ratingsByTheater.get(rating.theaterId) || [];
    current.push(averageRating);
    ratingsByTheater.set(rating.theaterId, current);
  }

  const scores = new Map<string, number>();
  for (const theater of userData.theaters) {
    const values = ratingsByTheater.get(theater.id) || [];
    const score = values.length > 0
      ? (values.reduce((sum, value) => sum + value, 0) / values.length) * 20
      : 65;
    scores.set(normalizeKey(theater.name), clamp(score, 35, 100));
  }

  return scores;
}

export function buildPreferenceProfile(userData: RecommendationUserData): PreferenceProfile {
  const ratedMovies = userData.movies.filter(
    (movie) => typeof movie.rating === "number" && movie.rating > 0
  );
  const averageRating = ratedMovies.length > 0
    ? ratedMovies.reduce((sum, movie) => sum + (movie.rating || 0), 0) / ratedMovies.length
    : 6.7;

  const genreRatings = new Map<string, AverageStat>();
  const languageRatings = new Map<string, AverageStat>();
  const formatPrices = new Map<string, number[]>();
  const languagePrices = new Map<string, number[]>();
  const globalPrices: number[] = [];
  const watchedTitles = new Map<string, WatchedTitleStat>();
  const rewatchValues = new Map(userData.rewatchOptions.map((option) => [option.id, option.value]));

  for (const movie of userData.movies) {
    const rating = movie.rating || 0;
    if (rating > 0) {
      for (const genre of movie.genres || []) addStat(genreRatings, genre, rating);
      addStat(languageRatings, movie.language, rating);
    }

    const titleKey = normalizeKey(movie.title);
    if (titleKey) {
      const current = watchedTitles.get(titleKey) || {
        bestRating: 0,
        rewatchFriendly: false,
      };
      current.bestRating = Math.max(current.bestRating, rating);
      current.rewatchFriendly =
        current.rewatchFriendly ||
        rating >= 8.5 ||
        (movie.rewatchId ? (rewatchValues.get(movie.rewatchId) || 0) >= 4 : false);
      watchedTitles.set(titleKey, current);
    }

    const cost = ticketOnlyCost(movie);
    if (cost <= 0) continue;
    globalPrices.push(cost);

    const formatName = movieFormatName(movie, userData);
    if (formatName) {
      const key = normalizeKey(formatName);
      const values = formatPrices.get(key) || [];
      values.push(cost);
      formatPrices.set(key, values);
    }

    if (movie.language) {
      const key = normalizeKey(movie.language);
      const values = languagePrices.get(key) || [];
      values.push(cost);
      languagePrices.set(key, values);
    }
  }

  const watchlist = new Map<string, { priority: number; genres: string[]; releaseDate: string | null }>();
  for (const item of userData.watchlist.filter((entry) => !entry.watchedMovieId)) {
    watchlist.set(normalizeKey(item.title), {
      priority: item.priority,
      genres: item.genres || [],
      releaseDate: item.releaseDate,
    });
  }

  const formatWeights = new Map<string, number>();
  for (const format of userData.formats) {
    formatWeights.set(normalizeKey(format.name), format.weight || 1);
  }

  return {
    averageRating,
    genreRatings,
    languageRatings,
    formatPrices,
    languagePrices,
    globalPrices,
    watchedTitles,
    watchlist,
    formatWeights,
    theaterScores: buildTheaterScores(userData),
    formulaParams: userData.formulaParams || DEFAULT_FORMULA_PARAMS,
  };
}

function matchingWatchlistItem(movie: PvrMovie, profile: PreferenceProfile) {
  for (const [title, item] of profile.watchlist) {
    if (titleMatches(movie.title, title)) return item;
  }
  return null;
}

function matchingWatchedTitle(movie: PvrMovie, profile: PreferenceProfile) {
  for (const [title, watched] of profile.watchedTitles) {
    if (titleMatches(movie.title, title)) return watched;
  }
  return null;
}

export function predictMovieFit(movie: PvrMovie, profile: PreferenceProfile): MovieFitResult {
  const watched = matchingWatchedTitle(movie, profile);
  if (watched) {
    return {
      predictedRating: watched.bestRating || profile.averageRating,
      confidence: 0.96,
      confidenceLabel: "high",
      crowdDelta: null,
      reasons: ["Already watched"],
      excluded: true,
    };
  }

  let predictedRating = profile.averageRating;
  const reasons: string[] = [];

  const genreAverages = movie.genres
    .map((genre) => average(profile.genreRatings.get(normalizeKey(genre))))
    .filter((value): value is number => typeof value === "number");
  if (genreAverages.length > 0) {
    const genreAverage = genreAverages.reduce((sum, value) => sum + value, 0) / genreAverages.length;
    predictedRating = predictedRating * 0.65 + genreAverage * 0.35;
    if (genreAverage >= profile.averageRating + 0.4) {
      reasons.push(`Strong history with ${movie.genres.slice(0, 2).join(", ")}`);
    }
  }

  const languageAverages = movie.languages
    .map((language) => average(profile.languageRatings.get(normalizeKey(language))))
    .filter((value): value is number => typeof value === "number");
  if (languageAverages.length > 0) {
    const languageAverage = languageAverages.reduce((sum, value) => sum + value, 0) / languageAverages.length;
    predictedRating = predictedRating * 0.8 + languageAverage * 0.2;
    if (languageAverage >= profile.averageRating + 0.3) {
      reasons.push(`Good match for your ${movie.languages[0]} ratings`);
    }
  }

  const watchlistItem = matchingWatchlistItem(movie, profile);
  if (watchlistItem) {
    predictedRating += [0.25, 0.55, 0.85][watchlistItem.priority] || 0.25;
    reasons.push(
      watchlistItem.priority >= 2 ? "High priority on your watchlist" : "On your watchlist"
    );
  }

  if (movie.releaseDate) {
    const releaseTime = Date.parse(movie.releaseDate);
    if (Number.isFinite(releaseTime)) {
      const daysAway = Math.round((releaseTime - Date.now()) / 86_400_000);
      if (daysAway >= 0 && daysAway <= 14) reasons.push("Releasing soon at PVR");
    }
  }

  if (reasons.length === 0) {
    reasons.push("Ranked from your overall Movie Log ratings");
  }

  return {
    predictedRating: Math.round(clamp(predictedRating, 1, 10) * 10) / 10,
    confidence: 0.5,
    confidenceLabel: "medium",
    crowdDelta: null,
    reasons: reasons.slice(0, 3),
    excluded: false,
  };
}

export function rankPvrMovies(
  movies: PvrMovie[],
  userData: RecommendationUserData,
  limit = 16
): RankedMovieCandidate[] {
  const model = buildPersonalPredictionModel(userData);

  return movies
    .map((movie) => ({ movie, fit: predictMoviePersonalFit(movie, model) }))
    .filter((candidate) => !candidate.fit.excluded)
    .sort((a, b) => {
      if (b.fit.predictedRating !== a.fit.predictedRating) {
        return b.fit.predictedRating - a.fit.predictedRating;
      }
      return b.fit.confidence - a.fit.confidence;
    })
    .slice(0, limit);
}

function matchFormatWeight(format: string, profile: PreferenceProfile): number {
  const normalized = normalizeKey(format);
  let bestWeight = profile.formatWeights.get(normalized);
  if (bestWeight) return bestWeight;

  for (const [key, weight] of profile.formatWeights) {
    if (normalized.includes(key) || key.includes(normalized)) {
      bestWeight = Math.max(bestWeight || 0, weight);
    }
  }

  if (bestWeight) return bestWeight;
  if (/imax/.test(normalized)) return 1.6;
  if (/4dx|mx4d/.test(normalized)) return 1.3;
  if (/pxl/.test(normalized)) return 1.4;
  if (/atmos|laser/.test(normalized)) return 1.2;
  if (/luxe|insignia/.test(normalized)) return 1.25;
  if (/3d/.test(normalized)) return 1.1;
  return 1;
}

function getTargetPrice(
  show: PvrShow,
  profile: PreferenceProfile,
  formatWeight: number
): number {
  const formatKeys = [normalizeKey(show.format), ...tokens(show.format)];
  for (const key of formatKeys) {
    const value = median(profile.formatPrices.get(key) || []);
    if (value !== null) return value;
  }

  if (show.language) {
    const value = median(profile.languagePrices.get(normalizeKey(show.language)) || []);
    if (value !== null) return value;
  }

  const global = median(profile.globalPrices);
  if (global !== null) return global * Math.max(formatWeight, 1);
  return DEFAULT_TARGET_PRICE * Math.max(formatWeight, 1);
}

function getShowTimeScore(show: PvrShow): { score: number; advice: string } {
  const match = show.showTime.match(/(\d{1,2}):(\d{2})/);
  if (!match) return { score: 55, advice: "Time needs review" };

  const hour = Number(match[1]) + Number(match[2]) / 60;
  if (hour >= 18 && hour <= 21.75) return { score: 100, advice: "Prime evening slot" };
  if (hour >= 16.5 && hour < 18) return { score: 82, advice: "Good early evening slot" };
  if (hour > 21.75 && hour <= 23.5) return { score: 68, advice: "Late show, still workable" };
  if (hour >= 12 && hour < 16.5) return { score: 62, advice: "Afternoon value slot" };
  if (hour >= 8 && hour < 12) return { score: 48, advice: "Morning slot" };
  return { score: 35, advice: "Very late slot" };
}

function getTheaterScore(show: PvrShow, profile: PreferenceProfile): number {
  const showName = normalizeKey(show.cinemaName);
  let bestScore = 55;

  for (const [theaterName, score] of profile.theaterScores) {
    if (showName.includes(theaterName) || theaterName.includes(showName)) {
      bestScore = Math.max(bestScore, score);
    }
  }

  return bestScore;
}

function getAvailability(show: PvrShow, quote?: PvrSeatQuote): { score: number; label: string } {
  const available = quote?.availableSeatCount ?? show.availableSeats;
  const total = show.totalSeats;

  if (available === null || available === undefined) {
    return { score: 55, label: "Availability not confirmed" };
  }

  if (available <= 0) return { score: 0, label: "Sold out or nearly sold out" };

  if (total && total > 0) {
    const ratio = available / total;
    if (ratio >= 0.45) return { score: 100, label: `${available} seats available` };
    if (ratio >= 0.25) return { score: 82, label: `${available} seats available` };
    if (ratio >= 0.1) return { score: 58, label: `${available} seats left` };
    return { score: 35, label: `${available} seats left` };
  }

  if (available >= 40) return { score: 88, label: `${available} seats available` };
  if (available >= 12) return { score: 68, label: `${available} seats available` };
  return { score: 42, label: `${available} seats left` };
}

function getLanguageScore(movie: PvrMovie, show: PvrShow, profile: PreferenceProfile): number {
  const languages = show.language ? [show.language] : movie.languages;
  const averages = languages
    .map((language) => average(profile.languageRatings.get(normalizeKey(language))))
    .filter((value): value is number => typeof value === "number");

  if (averages.length === 0) return 60;
  const value = averages.reduce((sum, item) => sum + item, 0) / averages.length;
  return clamp((value / 10) * 100, 35, 100);
}

function getPriceScore(price: number | null, targetPrice: number): number {
  if (!price || price <= 0) return 45;
  if (price <= targetPrice * 0.8) return 100;
  if (price <= targetPrice) return 88;
  if (price <= targetPrice * 1.15) return 72;
  if (price <= targetPrice * 1.35) return 52;
  return 32;
}

function getPriceAdvice(
  show: PvrShow,
  price: number | null,
  targetPrice: number,
  formatWeight: number,
  quote?: PvrSeatQuote
) {
  const category = quote?.recommendedCategory || null;
  const bestValueClass = category
    ? `${category.description} at ${formatCurrency(category.price)}`
    : null;

  let targetPriceText = "No reliable target price yet";
  if (price && price <= targetPrice * 0.9) {
    targetPriceText = `${formatCurrency(price)} is below your usual ${formatCurrency(targetPrice)} target`;
  } else if (price && price <= targetPrice * 1.1) {
    targetPriceText = `${formatCurrency(price)} is close to your usual ${formatCurrency(targetPrice)} target`;
  } else if (price) {
    targetPriceText = `${formatCurrency(price)} is above your usual ${formatCurrency(targetPrice)} target`;
  }

  const normalizedFormat = normalizeKey(show.format);
  let upgradeAdvice: string | null = null;
  if (/imax|4dx|mx4d|pxl|atmos|luxe|insignia|laser/.test(normalizedFormat)) {
    if (price && price <= targetPrice * 1.25 && formatWeight >= 1.2) {
      upgradeAdvice = `${show.format} looks worth the premium`;
    } else if (price && price > targetPrice * 1.5) {
      upgradeAdvice = `${show.format} is a premium pick, but the price is stretched`;
    } else {
      upgradeAdvice = `${show.format} improves the experience if you want the upgrade`;
    }
  }

  return {
    bestValueClass,
    targetPrice: targetPriceText,
    upgradeAdvice,
  };
}

function getFormatAdvice(show: PvrShow, formatWeight: number): string {
  if (formatWeight >= 1.5) return `${show.format} is one of your strongest formats`;
  if (formatWeight >= 1.2) return `${show.format} gets a format boost`;
  return `${show.format} keeps the ticket cost efficient`;
}

function selectDiverseOptions(options: RecommendationOption[]): RecommendationOption[] {
  const selected: RecommendationOption[] = [];
  const usedBuckets = new Set<string>();

  for (const option of options) {
    const hour = Number(option.show.showTime.split(":")[0] || 0);
    const timeBucket = hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 22 ? "evening" : "late";
    const bucket = [
      normalizeKey(option.show.format),
      normalizeKey(option.show.language || "any"),
      timeBucket,
    ].join("|");
    if (usedBuckets.has(bucket)) continue;
    selected.push(option);
    usedBuckets.add(bucket);
    if (selected.length >= MAX_OPTIONS_PER_MOVIE) return selected;
  }

  for (const option of options) {
    if (selected.some((selectedOption) => selectedOption.show.showKey === option.show.showKey)) {
      continue;
    }
    selected.push(option);
    if (selected.length >= MAX_OPTIONS_PER_MOVIE) break;
  }

  return selected;
}

export function buildRecommendations(
  candidates: RankedMovieCandidate[],
  shows: PvrShow[],
  userData: RecommendationUserData,
  seatQuotes: Map<string, PvrSeatQuote>,
  limit = 40
): MovieRecommendation[] {
  const profile = buildPreferenceProfile(userData);
  const model = buildPersonalPredictionModel(userData);
  const moviesById = new Map(candidates.map((candidate) => [candidate.movie.id, candidate]));
  const optionsByMovie = new Map<string, RecommendationOption[]>();

  for (const show of shows) {
    const candidate = moviesById.get(show.movieId);
    if (!candidate) continue;

    const quote = seatQuotes.get(show.showKey);
    const formatWeight = matchFormatWeight(show.format, profile);
    const formatScore = clamp(((formatWeight - 0.85) / 0.85) * 100, 45, 100);
    const languageScore = getLanguageScore(candidate.movie, show, profile);
    const formatLanguageScore = formatScore * 0.7 + languageScore * 0.3;
    const time = getShowTimeScore(show);
    const theaterScore = getTheaterScore(show, profile);
    const availability = getAvailability(show, quote);
    const price = quote?.recommendedCategory?.price || quote?.minPrice || show.priceRange.min;
    const targetPrice = getTargetPrice(show, profile, formatWeight);
    const priceScore = getPriceScore(price, targetPrice);
    const showAdjustment = predictShowAdjustment(show, model);
    // Release-day hype: opening weekend energy boosts the experience
    let releaseHypeBoost = 0;
    if (candidate.movie.releaseDate) {
      const releaseTime = Date.parse(candidate.movie.releaseDate);
      const showTime = Date.parse(show.showDate);
      if (Number.isFinite(releaseTime) && Number.isFinite(showTime)) {
        const daysAfterRelease = Math.round((showTime - releaseTime) / 86_400_000);
        if (daysAfterRelease >= 0 && daysAfterRelease <= 3) releaseHypeBoost = 0.15;
        else if (daysAfterRelease > 3 && daysAfterRelease <= 7) releaseHypeBoost = 0.08;
      }
    }
    const predictedPersonalRating = round1(
      clamp(candidate.fit.predictedRating + showAdjustment.delta + releaseHypeBoost, 1, 10)
    );
    const predictionConfidence = round2(
      clamp(candidate.fit.confidence + showAdjustment.confidenceBoost, 0.2, 0.99)
    );
    const predictionConfidenceLabel = getPredictionConfidenceLabel(predictionConfidence);

    const score =
      (predictedPersonalRating / 10) * 100 * 0.4 +
      formatLanguageScore * 0.18 +
      time.score * 0.12 +
      theaterScore * 0.1 +
      availability.score * 0.1 +
      priceScore * 0.1;
    const valueScore = price
      ? calculateValueScore(predictedPersonalRating, price, formatWeight, profile.formulaParams)
      : 0;

    const option: RecommendationOption = {
      show,
      score: Math.round(score),
      valueScore,
      predictedPersonalRating,
      predictionConfidence,
      predictionConfidenceLabel,
      crowdDelta: candidate.fit.crowdDelta,
      exactPrice: Boolean(quote),
      displayPrice: price,
      targetPrice,
      recommendedCategory: quote?.recommendedCategory || null,
      priceAdvice: getPriceAdvice(show, price, targetPrice, formatWeight, quote),
      formatAdvice: showAdjustment.reason || getFormatAdvice(show, formatWeight),
      timingAdvice: time.advice,
      availabilityLabel: availability.label,
      needsExactPrice: !quote && Boolean(show.encrypted),
    };

    const current = optionsByMovie.get(show.movieId) || [];
    current.push(option);
    optionsByMovie.set(show.movieId, current);
  }

  const recommendations: MovieRecommendation[] = [];
  for (const candidate of candidates) {
    const options = (optionsByMovie.get(candidate.movie.id) || []).sort(
      (a, b) => b.score - a.score || b.valueScore - a.valueScore
    );
    if (options.length === 0) continue;

    const selectedOptions = selectDiverseOptions(options);
    const bestOption = selectedOptions[0];

    const watchlistItem = matchingWatchlistItem(candidate.movie, profile);
    const onWatchlist = Boolean(watchlistItem);
    const watchlistPriority = watchlistItem ? watchlistItem.priority : null;

    // Taste-first ranking: predicted personal rating dominates, with logistics
    // (the already-optimised best showtime score) as a light tiebreak. A small
    // watchlist bump keeps explicitly-wanted titles near the top.
    const watchlistBoost = onWatchlist ? 4 + (watchlistPriority || 0) * 2 : 0;
    const personalScore = Math.round(
      (bestOption.predictedPersonalRating / 10) * 100 * 0.82 +
        bestOption.predictionConfidence * 100 * 0.08 +
        bestOption.score * 0.1 +
        watchlistBoost
    );

    recommendations.push({
      movie: { ...candidate.movie, onWatchlist, watchlistPriority },
      predictedRating: bestOption.predictedPersonalRating,
      predictionConfidence: bestOption.predictionConfidence,
      predictionConfidenceLabel: bestOption.predictionConfidenceLabel,
      crowdDelta: bestOption.crowdDelta,
      reasons: candidate.fit.reasons,
      options: selectedOptions,
      bestOption,
      personalScore,
      onWatchlist,
      watchlistPriority,
    });
  }

  return recommendations
    .sort((a, b) => b.personalScore - a.personalScore)
    .slice(0, limit);
}

export function getShowsForExactPricing(
  recommendations: MovieRecommendation[],
  limit = 8
): PvrShow[] {
  const shows: PvrShow[] = [];
  const seen = new Set<string>();

  for (const recommendation of recommendations) {
    for (const option of recommendation.options) {
      if (!option.show.encrypted || seen.has(option.show.showKey)) continue;
      shows.push(option.show);
      seen.add(option.show.showKey);
      if (shows.length >= limit) return shows;
    }
  }

  return shows;
}
