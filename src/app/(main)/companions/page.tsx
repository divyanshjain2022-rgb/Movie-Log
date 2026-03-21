"use client";

import { useState } from "react";
import { Plus, Trash2, Edit, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared";
import {
  useCompanions,
  useCreateCompanion,
  useUpdateCompanion,
  useDeleteCompanion,
  useMovies,
} from "@/hooks";
import type { MovieWithRelations } from "@/types";

export default function CompanionsPage() {
  const { companions, isLoading, refetch } = useCompanions();
  const { movies } = useMovies();
  const { createCompanion, isLoading: isCreating } = useCreateCompanion();
  const { updateCompanion } = useUpdateCompanion();
  const { deleteCompanion } = useDeleteCompanion();

  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("🧑");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createCompanion(newName.trim(), newEmoji || "🧑");
      toast.success("Companion added");
      setNewName("");
      setNewEmoji("🧑");
      refetch();
    } catch {
      toast.error("Failed to add companion");
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await updateCompanion(id, { name: editName.trim() });
      toast.success("Updated");
      setEditingId(null);
      refetch();
    } catch {
      toast.error("Failed to update");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCompanion(id);
      toast.success("Companion removed");
      refetch();
    } catch {
      toast.error("Failed to delete");
    }
  };

  // Compute stats per companion from movie_companions
  const companionStats = companions.map((c) => {
    // Filter movies that have this companion
    const cMovies = movies.filter((m) =>
      (m as MovieWithRelations).movie_companions?.some(
        (mc) => mc.companion.id === c.id
      )
    );
    const rated = cMovies.filter((m) => m.rating != null);
    const avgRating =
      rated.length > 0
        ? rated.reduce((sum, m) => sum + (m.rating || 0), 0) / rated.length
        : 0;

    // Top theater
    const theaterCounts: Record<string, number> = {};
    cMovies.forEach((m) => {
      const name = m.theater?.name;
      if (name) theaterCounts[name] = (theaterCounts[name] || 0) + 1;
    });
    const topTheater = Object.entries(theaterCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    return { ...c, movieCount: cMovies.length, avgRating, topTheater };
  });

  return (
    <div className="min-h-screen">
      <PageHeader title="Companions" showBack />

      <div className="p-4 space-y-6">
        {/* Add Companion */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Add Companion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={newEmoji}
                onChange={(e) => setNewEmoji(e.target.value)}
                className="w-14 text-center text-lg"
                maxLength={2}
              />
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name..."
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <Button onClick={handleCreate} disabled={isCreating || !newName.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Companions List */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : companions.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <p className="text-muted-foreground">No companions yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add people you watch movies with
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {companionStats.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <span className="text-2xl">{c.avatar_emoji}</span>
                <div className="flex-1 min-w-0">
                  {editingId === c.id ? (
                    <div className="flex gap-1">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8"
                        autoFocus
                        onKeyDown={(e) => e.key === "Enter" && handleUpdate(c.id)}
                      />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleUpdate(c.id)}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.movieCount} {c.movieCount === 1 ? "movie" : "movies"}
                        {c.avgRating > 0 && ` \u2022 Avg: ${c.avgRating.toFixed(1)}`}
                        {c.topTheater && ` \u2022 ${c.topTheater}`}
                      </p>
                    </>
                  )}
                </div>
                {editingId !== c.id && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setEditingId(c.id); setEditName(c.name); }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
