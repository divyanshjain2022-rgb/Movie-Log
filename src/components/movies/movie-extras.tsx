"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { User } from "lucide-react";

interface CastMember {
  name: string;
  character: string | null;
  profileUrl: string | null;
}

interface SourceRating {
  rating: number;
  votes: number | null;
}

interface ExtrasData {
  cast: CastMember[];
  ratings: {
    imdb: SourceRating | null;
    letterboxd: SourceRating | null;
    rottenTomatoes: { score: number; certified: boolean } | null;
    tmdb: SourceRating | null;
  };
  combined: { rating: number; votes: number } | null;
  imdbId: string | null;
}

function formatVotes(votes: number | null): string | null {
  if (!votes) return null;
  if (votes >= 1_000_000) return `${(votes / 1_000_000).toFixed(1)}M votes`;
  if (votes >= 1_000) return `${Math.round(votes / 1_000)}k votes`;
  return `${votes} votes`;
}

function RatingTile({
  source,
  value,
  suffix,
  detail,
}: {
  source: string;
  value: string;
  suffix?: string;
  detail?: string | null;
}) {
  return (
    <div className="glass rounded-2xl p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
        {source}
      </p>
      <p className="mt-1.5">
        <span className="marquee text-[26px] leading-none text-primary">{value}</span>
        {suffix && (
          <span className="ml-1 text-xs text-muted-foreground/70">{suffix}</span>
        )}
      </p>
      {detail && (
        <p className="mt-1 text-[11px] text-muted-foreground/60">{detail}</p>
      )}
    </div>
  );
}

export function MovieExtras({
  tmdbId,
  onCombined,
}: {
  tmdbId: number;
  onCombined?: (rating: number | null) => void;
}) {
  const [data, setData] = useState<ExtrasData | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/tmdb/extras?id=${tmdbId}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload && !payload.error) {
          const extras = payload as ExtrasData;
          setData(extras);
          onCombined?.(extras.combined?.rating ?? null);
        }
      })
      .catch(() => {
        // Best-effort enrichment — the page works fine without it.
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbId]);

  if (!data) return null;

  const { cast, ratings, combined } = data;
  const hasRatings =
    ratings.imdb || ratings.letterboxd || ratings.rottenTomatoes || ratings.tmdb;

  return (
    <div className="space-y-5">
      {cast.length > 0 && (
        <section>
          <h2 className="marquee mb-3 text-[17px] uppercase leading-none text-foreground/90">
            Cast
          </h2>
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {cast.map((member) => (
              <Link
                key={member.name}
                href={`/crew/${encodeURIComponent(member.name)}`}
                className="w-[92px] shrink-0 transition-transform active:scale-95"
              >
                {member.profileUrl ? (
                  <img
                    src={member.profileUrl}
                    alt={member.name}
                    loading="lazy"
                    className="aspect-[3/4] w-full rounded-2xl border border-white/[0.07] object-cover"
                  />
                ) : (
                  <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl bg-secondary/40">
                    <User className="h-7 w-7 text-muted-foreground/30" strokeWidth={1.5} />
                  </div>
                )}
                <p className="mt-1.5 line-clamp-2 text-xs font-semibold leading-tight">
                  {member.name}
                </p>
                {member.character && (
                  <p className="line-clamp-1 text-[10px] text-muted-foreground/60">
                    {member.character}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {hasRatings && (
        <section>
          <h2 className="marquee mb-3 text-[17px] uppercase leading-none text-foreground/90">
            How it&apos;s rated
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ratings.imdb && (
              <RatingTile
                source="IMDb"
                value={ratings.imdb.rating.toFixed(1)}
                suffix="/10"
                detail={formatVotes(ratings.imdb.votes)}
              />
            )}
            {ratings.rottenTomatoes && (
              <RatingTile
                source="Rotten Tomatoes"
                value={`${ratings.rottenTomatoes.score}%`}
                detail={ratings.rottenTomatoes.certified ? "Certified Fresh" : "Tomatometer"}
              />
            )}
            {ratings.letterboxd && (
              <RatingTile
                source="Letterboxd"
                value={ratings.letterboxd.rating.toFixed(2)}
                suffix="/5"
                detail={formatVotes(ratings.letterboxd.votes)}
              />
            )}
            {ratings.tmdb && (
              <RatingTile
                source="TMDB"
                value={ratings.tmdb.rating.toFixed(1)}
                suffix="/10"
                detail={formatVotes(ratings.tmdb.votes)}
              />
            )}
          </div>
          {combined && (
            <p className="mt-2 text-xs text-muted-foreground/60">
              Combined{" "}
              <span className="font-semibold text-foreground/80">
                {combined.rating.toFixed(1)}/10
              </span>{" "}
              — aggregated from {formatVotes(combined.votes)?.replace(" votes", "")} voters
              across the web.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
