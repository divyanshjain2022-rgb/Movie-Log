import { NextRequest, NextResponse } from "next/server";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export async function GET(request: NextRequest) {
  try {
    if (!TMDB_API_KEY) {
      return NextResponse.json(
        { error: "TMDB_API_KEY not configured" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");
    const movieId = searchParams.get("id");

    // If movie ID is provided, get movie details with full enrichment
    if (movieId) {
      const detailResponse = await fetch(
        `${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&append_to_response=credits,keywords,videos,release_dates`,
        { cache: "no-store" }
      );

      if (!detailResponse.ok) {
        return NextResponse.json(
          { error: "Movie not found" },
          { status: 404 }
        );
      }

      const movie = await detailResponse.json();

      // Extract crew members
      const crew = movie.credits?.crew || [];
      const director = crew.find(
        (c: { job: string }) => c.job === "Director"
      );
      const composer = crew.find(
        (c: { job: string; department: string }) =>
          c.department === "Sound" && (c.job === "Original Music Composer" || c.job === "Music")
      );
      const cinematographer = crew.find(
        (c: { job: string; department: string }) =>
          c.department === "Camera" && c.job === "Director of Photography"
      );

      // Extract top 5 cast
      const castMembers = (movie.credits?.cast || [])
        .slice(0, 5)
        .map((c: { name: string }) => c.name);

      // Extract keywords
      const keywords = (movie.keywords?.keywords || [])
        .map((k: { name: string }) => k.name);

      // Extract trailer (prefer YouTube)
      const videos = movie.videos?.results || [];
      const trailer = videos.find(
        (v: { type: string; site: string }) =>
          v.type === "Trailer" && v.site === "YouTube"
      ) || videos.find(
        (v: { type: string; site: string }) =>
          v.type === "Teaser" && v.site === "YouTube"
      );
      const trailerUrl = trailer
        ? `https://www.youtube.com/watch?v=${trailer.key}`
        : null;

      // Extract certification for India (IN) or fallback to US
      const releaseDates = movie.release_dates?.results || [];
      const inRelease = releaseDates.find(
        (r: { iso_3166_1: string }) => r.iso_3166_1 === "IN"
      );
      const usRelease = releaseDates.find(
        (r: { iso_3166_1: string }) => r.iso_3166_1 === "US"
      );
      const certRelease = inRelease || usRelease;
      const certification = certRelease?.release_dates?.[0]?.certification || null;

      // Collection/franchise info
      const collection = movie.belongs_to_collection
        ? {
            id: movie.belongs_to_collection.id,
            name: movie.belongs_to_collection.name,
            poster_url: movie.belongs_to_collection.poster_path
              ? `https://image.tmdb.org/t/p/w500${movie.belongs_to_collection.poster_path}`
              : null,
          }
        : null;

      return NextResponse.json({
        tmdb_id: movie.id,
        title: movie.title,
        runtime_minutes: movie.runtime,
        genres: movie.genres?.map((g: { name: string }) => g.name) || [],
        language: movie.original_language,
        director: director?.name || null,
        poster_url: movie.poster_path
          ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
          : null,
        release_date: movie.release_date,
        overview: movie.overview,
        // Enriched fields
        cast_members: castMembers,
        composer: composer?.name || null,
        cinematographer: cinematographer?.name || null,
        budget: movie.budget || null,
        box_office: movie.revenue || null,
        tmdb_rating: movie.vote_average || null,
        tmdb_vote_count: movie.vote_count || null,
        certification,
        trailer_url: trailerUrl,
        keywords,
        collection,
      });
    }

    // If query is provided, search for movies
    if (query) {
      const searchResponse = await fetch(
        `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`
      );

      if (!searchResponse.ok) {
        return NextResponse.json(
          { error: "Search failed" },
          { status: 500 }
        );
      }

      const results = await searchResponse.json();

      // Return top 5 results with basic info
      const movies = results.results.slice(0, 5).map((movie: {
        id: number;
        title: string;
        release_date?: string;
        poster_path?: string;
      }) => ({
        tmdb_id: movie.id,
        title: movie.title,
        release_date: movie.release_date,
        poster_url: movie.poster_path
          ? `https://image.tmdb.org/t/p/w200${movie.poster_path}`
          : null,
      }));

      return NextResponse.json({ results: movies });
    }

    // Upcoming movies
    const upcoming = searchParams.get("upcoming");
    if (upcoming === "true") {
      const upcomingResponse = await fetch(
        `${TMDB_BASE_URL}/movie/upcoming?api_key=${TMDB_API_KEY}&region=IN`
      );

      if (!upcomingResponse.ok) {
        return NextResponse.json({ error: "Failed to fetch upcoming" }, { status: 500 });
      }

      const results = await upcomingResponse.json();
      const upcomingMovies = results.results.slice(0, 10).map((movie: {
        id: number;
        title: string;
        release_date?: string;
        poster_path?: string;
        genre_ids?: number[];
      }) => ({
        tmdb_id: movie.id,
        title: movie.title,
        release_date: movie.release_date,
        poster_url: movie.poster_path
          ? `https://image.tmdb.org/t/p/w200${movie.poster_path}`
          : null,
      }));

      return NextResponse.json({ results: upcomingMovies });
    }

    return NextResponse.json(
      { error: "Query or movie ID required" },
      { status: 400 }
    );
  } catch (error) {
    console.error("TMDB error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
