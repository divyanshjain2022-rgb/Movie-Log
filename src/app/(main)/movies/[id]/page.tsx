import { notFound } from "next/navigation";
import { getMovieDetailData } from "@/lib/server/movie-detail-data";
import { MovieDetailClient } from "./movie-detail-client";

export default async function MovieDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { movie, rewatches } = await getMovieDetailData(id);
  if (!movie) notFound();
  return <MovieDetailClient id={id} initialMovie={movie} rewatches={rewatches} />;
}
