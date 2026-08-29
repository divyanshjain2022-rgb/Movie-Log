"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared";
import {
  useFranchises,
  useCreateFranchise,
  useDeleteFranchise,
  useMovies,
} from "@/hooks";
import { tmdbImage } from "@/lib/tmdb-image";

export default function FranchisesPage() {
  const { franchises, isLoading, refetch } = useFranchises();
  const { movies } = useMovies();
  const { createFranchise, isLoading: isCreating } = useCreateFranchise();
  const { deleteFranchise } = useDeleteFranchise();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createFranchise({ name: name.trim() });
      toast.success("Franchise created");
      setShowAdd(false);
      setName("");
      refetch();
    } catch {
      toast.error("Failed to create franchise");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFranchise(id);
      toast.success("Franchise deleted");
      refetch();
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Franchises"
        showBack
        action={
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button size="icon" className="h-9 w-9">
                <Plus className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Franchise</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., MCU, Nolan Films..."
                    className="mt-1"
                  />
                </div>
                <Button onClick={handleCreate} disabled={isCreating || !name.trim()} className="w-full">
                  {isCreating ? "Creating..." : "Create"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="p-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : franchises.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">No franchises yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a franchise to group related movies
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {franchises.map((f) => {
              const fMovies = movies.filter((m) => m.franchise_id === f.id);
              const avgRating =
                fMovies.length > 0
                  ? fMovies.reduce((sum, m) => sum + (m.rating || 0), 0) / fMovies.length
                  : 0;

              return (
                <Link
                  key={f.id}
                  href={`/franchises/${f.id}`}
                  className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-secondary/50"
                >
                  {f.poster_url ? (
                    <img loading="lazy" decoding="async"
                      src={tmdbImage(f.poster_url, "w154")}
                      alt={f.name}
                      className="h-14 w-10 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-10 items-center justify-center rounded bg-secondary text-lg">
                      🎬
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fMovies.length} {fMovies.length === 1 ? "movie" : "movies"}
                      {avgRating > 0 && ` \u2022 Avg: ${avgRating.toFixed(1)}`}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete(f.id);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
