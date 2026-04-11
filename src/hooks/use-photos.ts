"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MoviePhoto, MoviePhotoInsert } from "@/types";

const supabase = createClient();

export function useMoviePhotos(movieId: string) {
  const [photos, setPhotos] = useState<(MoviePhoto & { url: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPhotos = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("movie_photos")
        .select("*")
        .eq("movie_id", movieId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Generate signed URLs
      const photosWithUrls = await Promise.all(
        (data || []).map(async (photo: MoviePhoto) => {
          const { data: urlData } = await supabase.storage
            .from("movie-photos")
            .createSignedUrl(photo.storage_path, 3600);
          return { ...photo, url: urlData?.signedUrl || "" };
        })
      );

      setPhotos(photosWithUrls);
    } finally {
      setIsLoading(false);
    }
  }, [movieId]);

  useEffect(() => {
    if (movieId) fetchPhotos();
  }, [movieId, fetchPhotos]);

  return { photos, isLoading, refetch: fetchPhotos };
}

export function useUploadPhoto() {
  const [isLoading, setIsLoading] = useState(false);

  const uploadPhoto = useCallback(
    async (
      movieId: string,
      file: File,
      photoType: "ticket" | "selfie" | "fnb" | "general" = "general",
      caption?: string
    ) => {
      try {
        setIsLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        // Upload to storage
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${user.id}/${movieId}/${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("movie-photos")
          .upload(path, file, { contentType: file.type });

        if (uploadError) throw uploadError;

        // Create DB record
        const { data, error } = await supabase
          .from("movie_photos")
          .insert({
            user_id: user.id,
            movie_id: movieId,
            storage_path: path,
            photo_type: photoType,
            caption,
          } as never)
          .select()
          .single();

        if (error) throw error;
        return data;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { uploadPhoto, isLoading };
}

export function useDeletePhoto() {
  const [isLoading, setIsLoading] = useState(false);

  const deletePhoto = useCallback(async (photo: MoviePhoto) => {
    try {
      setIsLoading(true);

      // Delete from storage
      await supabase.storage.from("movie-photos").remove([photo.storage_path]);

      // Delete from DB
      const { error } = await supabase
        .from("movie_photos")
        .delete()
        .eq("id", photo.id);

      if (error) throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { deletePhoto, isLoading };
}
