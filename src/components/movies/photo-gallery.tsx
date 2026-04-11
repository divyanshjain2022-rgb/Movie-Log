"use client";

import { useState, useRef } from "react";
import { Camera, X, Trash2, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMoviePhotos, useUploadPhoto, useDeletePhoto } from "@/hooks";
import type { MoviePhoto } from "@/types";

const PHOTO_TYPES = [
  { value: "ticket", label: "Ticket" },
  { value: "selfie", label: "Selfie" },
  { value: "fnb", label: "F&B" },
  { value: "general", label: "General" },
] as const;

interface PhotoGalleryProps {
  movieId: string;
}

export function PhotoGallery({ movieId }: PhotoGalleryProps) {
  const { photos, isLoading, refetch } = useMoviePhotos(movieId);
  const { uploadPhoto, isLoading: isUploading } = useUploadPhoto();
  const { deletePhoto, isLoading: isDeleting } = useDeletePhoto();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoType, setPhotoType] = useState<"ticket" | "selfie" | "fnb" | "general">("general");
  const [lightboxPhoto, setLightboxPhoto] = useState<(MoviePhoto & { url: string }) | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5MB)");
      return;
    }

    try {
      await uploadPhoto(movieId, file, photoType);
      toast.success("Photo uploaded");
      refetch();
    } catch {
      toast.error("Failed to upload photo");
    }

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (photo: MoviePhoto & { url: string }) => {
    try {
      await deletePhoto(photo);
      toast.success("Photo deleted");
      setLightboxPhoto(null);
      refetch();
    } catch {
      toast.error("Failed to delete photo");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Photos</h2>
        <div className="flex items-center gap-2">
          <Select
            value={photoType}
            onValueChange={(v) => setPhotoType(v as typeof photoType)}
          >
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PHOTO_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            <Camera className="mr-1 h-4 w-4" />
            {isUploading ? "..." : "Add"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-secondary" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
        >
          <ImageIcon className="h-8 w-8" />
          <span className="text-sm">Add photos</span>
        </button>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <button
              key={photo.id}
              onClick={() => setLightboxPhoto(photo)}
              className="relative aspect-square overflow-hidden rounded-lg"
            >
              <img
                src={photo.url}
                alt={photo.caption || "Movie photo"}
                className="h-full w-full object-cover"
              />
              <Badge
                variant="secondary"
                className="absolute bottom-1 left-1 text-[10px] px-1 py-0 bg-black/50 text-white border-0"
              >
                {photo.photo_type}
              </Badge>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={!!lightboxPhoto} onOpenChange={() => setLightboxPhoto(null)}>
        <DialogContent className="max-w-lg p-2">
          <DialogTitle className="sr-only">Photo viewer</DialogTitle>
          {lightboxPhoto && (
            <div className="relative">
              <img
                src={lightboxPhoto.url}
                alt={lightboxPhoto.caption || "Photo"}
                className="w-full rounded-lg"
              />
              <div className="absolute top-2 right-2 flex gap-1">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 bg-black/50 hover:bg-black/70"
                  onClick={() => handleDelete(lightboxPhoto)}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4 text-white" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 bg-black/50 hover:bg-black/70"
                  onClick={() => setLightboxPhoto(null)}
                >
                  <X className="h-4 w-4 text-white" />
                </Button>
              </div>
              {lightboxPhoto.caption && (
                <p className="mt-2 text-sm text-center text-muted-foreground">
                  {lightboxPhoto.caption}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
