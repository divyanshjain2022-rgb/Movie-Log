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

    // If movie ID is provided, get movie details
    if (movieId) {
      const detailResponse = await fetch(
        `${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&append_to_response=credits`
      );

      if (!detailResponse.ok) {
        return NextResponse.json(
          { error: "Movie not found" },
          { status: 404 }
        );
      }

      const movie = await detailResponse.json();
      const director = movie.credits?.crew?.find(
        (c: { job: string }) => c.job === "Director"
      );

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
