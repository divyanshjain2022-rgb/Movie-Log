"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";

interface TMDBMovieBasic {
    tmdb_id: number;
    title: string;
    release_date?: string;
    poster_url?: string;
}

export interface TMDBMovieDetails {
    tmdb_id: number;
    title: string;
    runtime_minutes?: number;
    genres?: string[];
    language?: string;
    director?: string | null;
    poster_url?: string | null;
    release_date?: string;
    overview?: string;
}

interface TMDBSearchInputProps {
    value: string;
    onChange: (title: string, movieDetails?: TMDBMovieDetails) => void;
    placeholder?: string;
    disabled?: boolean;
}

export function TMDBSearchInput({
    value,
    onChange,
    placeholder = "Search for a movie...",
    disabled = false,
}: TMDBSearchInputProps) {
    const [query, setQuery] = useState(value);
    const [results, setResults] = useState<TMDBMovieBasic[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingDetails, setIsFetchingDetails] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setQuery(value);
    }, [value]);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const searchTMDB = async (searchQuery: string) => {
        if (searchQuery.length < 2) {
            setResults([]);
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch(`/api/tmdb?query=${encodeURIComponent(searchQuery)}`);
            if (res.ok) {
                const data = await res.json();
                setResults(data.results || []);
                setShowDropdown(true);
            }
        } catch (e) {
            console.error("TMDB search error:", e);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchMovieDetails = async (tmdbId: number): Promise<TMDBMovieDetails | null> => {
        try {
            const res = await fetch(`/api/tmdb?id=${tmdbId}`);
            if (res.ok) {
                return await res.json();
            }
        } catch (e) {
            console.error("TMDB details error:", e);
        }
        return null;
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setQuery(newValue);
        onChange(newValue); // Update parent with typed value

        // Debounce search
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            searchTMDB(newValue);
        }, 300);
    };

    const handleSelectMovie = async (movie: TMDBMovieBasic) => {
        setQuery(movie.title);
        setShowDropdown(false);
        setResults([]);

        // Fetch full movie details
        setIsFetchingDetails(true);
        const details = await fetchMovieDetails(movie.tmdb_id);
        setIsFetchingDetails(false);

        if (details) {
            onChange(details.title, details);
        } else {
            // Fallback: just pass title and basic info
            onChange(movie.title, {
                tmdb_id: movie.tmdb_id,
                title: movie.title,
                release_date: movie.release_date,
                poster_url: movie.poster_url,
            });
        }
    };

    return (
        <div ref={wrapperRef} className="relative">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={handleInputChange}
                    onFocus={() => results.length > 0 && setShowDropdown(true)}
                    placeholder={placeholder}
                    disabled={disabled || isFetchingDetails}
                    className="pl-9"
                />
                {(isLoading || isFetchingDetails) && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
            </div>

            {showDropdown && results.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-72 overflow-y-auto">
                    {results.map((movie) => (
                        <button
                            key={movie.tmdb_id}
                            type="button"
                            onClick={() => handleSelectMovie(movie)}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent focus:bg-accent"
                        >
                            {movie.poster_url ? (
                                <img
                                    src={movie.poster_url}
                                    alt={movie.title}
                                    className="h-12 w-8 rounded object-cover"
                                />
                            ) : (
                                <div className="h-12 w-8 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                                    No Img
                                </div>
                            )}
                            <div>
                                <div className="font-medium">{movie.title}</div>
                                {movie.release_date && (
                                    <div className="text-xs text-muted-foreground">
                                        {new Date(movie.release_date).getFullYear()}
                                    </div>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
