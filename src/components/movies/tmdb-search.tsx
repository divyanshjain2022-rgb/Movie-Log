"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Film, Loader2, X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TMDBMovie {
  tmdb_id: number;
  title: string;
  release_date?: string;
  poster_url?: string;
}

interface TMDBMovieDetails {
  tmdb_id: number;
  title: string;
  runtime_minutes?: number;
  genres?: string[];
  language?: string;
  director?: string;
  poster_url?: string;
  release_date?: string;
  overview?: string;
}

interface TMDBSearchProps {
  initialTitle?: string;
  onSelect: (movie: TMDBMovieDetails) => void;
  onTitleChange?: (title: string) => void;
  selectedTmdbId?: number | null;
}

export function TMDBSearch({ initialTitle = "", onSelect, onTitleChange, selectedTmdbId }: TMDBSearchProps) {
  const [query, setQuery] = useState(initialTitle);
  const [results, setResults] = useState<TMDBMovie[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<TMDBMovie | null>(null);

  // Debounced search
  const searchMovies = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/tmdb?query=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const data = await response.json();
        setResults(data.results || []);
        setShowResults(true);
      }
    } catch (error) {
      console.error("TMDB search error:", error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Search when query changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query !== selectedMovie?.title) {
        searchMovies(query);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query, searchMovies, selectedMovie?.title]);

  // Auto-search when initialTitle is provided (e.g., from OCR)
  useEffect(() => {
    if (initialTitle && initialTitle !== query) {
      setQuery(initialTitle);
      searchMovies(initialTitle);
    }
  }, [initialTitle]);

  const handleSelectMovie = async (movie: TMDBMovie) => {
    setSelectedMovie(movie);
    setQuery(movie.title);
    setShowResults(false);
    setIsLoadingDetails(true);

    try {
      // Fetch full movie details
      const response = await fetch(`/api/tmdb?id=${movie.tmdb_id}`);
      if (response.ok) {
        const details: TMDBMovieDetails = await response.json();
        onSelect(details);
      }
    } catch (error) {
      console.error("TMDB details error:", error);
      // Still update with basic info
      onSelect({
        tmdb_id: movie.tmdb_id,
        title: movie.title,
        poster_url: movie.poster_url,
        release_date: movie.release_date,
      });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setSelectedMovie(null);
    setResults([]);
    onTitleChange?.("");
  };

  return (
    <div className="relative">
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onTitleChange?.(e.target.value);
          }}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="Search for a movie..."
          className="pl-10 pr-10"
        />
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}

        {!isSearching && query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Selected movie indicator */}
      {selectedMovie && !showResults && (
        <div className="mt-2 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          {selectedMovie.poster_url ? (
            <img
              src={selectedMovie.poster_url}
              alt={selectedMovie.title}
              className="h-12 w-8 rounded object-cover"
            />
          ) : (
            <div className="flex h-12 w-8 items-center justify-center rounded bg-secondary">
              <Film className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selectedMovie.title}</p>
            {selectedMovie.release_date && (
              <p className="text-xs text-muted-foreground">
                {new Date(selectedMovie.release_date).getFullYear()}
              </p>
            )}
          </div>
          {isLoadingDetails ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <Check className="h-4 w-4 text-primary" />
          )}
        </div>
      )}

      {/* Search results dropdown */}
      {showResults && results.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-[300px] overflow-auto rounded-xl border border-border bg-card shadow-xl">
          {results.map((movie) => (
            <button
              key={movie.tmdb_id}
              type="button"
              onClick={() => handleSelectMovie(movie)}
              className={cn(
                "flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-secondary/50",
                selectedTmdbId === movie.tmdb_id && "bg-primary/10"
              )}
            >
              {movie.poster_url ? (
                <img
                  src={movie.poster_url}
                  alt={movie.title}
                  className="h-14 w-10 rounded object-cover shadow"
                />
              ) : (
                <div className="flex h-14 w-10 items-center justify-center rounded bg-secondary">
                  <Film className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{movie.title}</p>
                {movie.release_date && (
                  <p className="text-sm text-muted-foreground">
                    {new Date(movie.release_date).getFullYear()}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* No results message */}
      {showResults && query.length >= 2 && results.length === 0 && !isSearching && (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-xl border border-border bg-card p-4 text-center shadow-xl">
          <p className="text-sm text-muted-foreground">No movies found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            You can still enter the title manually
          </p>
        </div>
      )}

      {/* Click outside to close */}
      {showResults && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowResults(false)}
        />
      )}
    </div>
  );
}
