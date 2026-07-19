import { getStatsMovies } from "@/lib/server/stats-data";
import { StatsClient } from "./stats-client";

export default async function StatsPage() {
  const movies = await getStatsMovies();
  return <StatsClient movies={movies} />;
}
