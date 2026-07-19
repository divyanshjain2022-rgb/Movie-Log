import { getMoviesListData } from "@/lib/server/movies-data";
import { MoviesClient } from "./movies-client";

export default async function MoviesPage() {
  const data = await getMoviesListData();
  return <MoviesClient {...data} />;
}
