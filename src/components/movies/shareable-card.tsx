"use client";

import { useRef, useState } from "react";
import { Download, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getRatingColor, getRatingLabel } from "@/lib/formula";
import { cn } from "@/lib/utils";
import type { MovieWithRelations } from "@/types";

// Proxy TMDB images through our rewrite to avoid CORS issues with html2canvas
function proxyPosterUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  // https://image.tmdb.org/t/p/w500/abc.jpg → /api/img/w500/abc.jpg
  const match = url.match(/image\.tmdb\.org\/t\/p\/(.+)/);
  if (match) return `/api/img/${match[1]}`;
  return url;
}

interface ShareableCardProps {
  movie: MovieWithRelations;
  children: React.ReactNode;
}

type CardRatio = "square" | "story";

export function ShareableCard({ movie, children }: ShareableCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [ratio, setRatio] = useState<CardRatio>("square");
  const [isGenerating, setIsGenerating] = useState(false);

  const generateImage = async () => {
    if (!cardRef.current) return null;

    setIsGenerating(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: null,
        useCORS: true,
        allowTaint: false,
        logging: false,
        proxy: "/api/img",
      });
      return canvas;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    const canvas = await generateImage();
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = `${movie.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-card.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast.success("Card downloaded!");
  };

  const handleShare = async () => {
    const canvas = await generateImage();
    if (!canvas) return;

    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("Failed to create blob");

      if (navigator.share && navigator.canShare) {
        const file = new File([blob], `${movie.title}-card.png`, {
          type: "image/png",
        });
        const shareData = {
          title: movie.title,
          text: `${movie.title} - ${movie.rating?.toFixed(1)}/10`,
          files: [file],
        };

        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return;
        }
      }

      // Fallback: download
      handleDownload();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        handleDownload();
      }
    }
  };

  const isStory = ratio === "story";
  const cardWidth = isStory ? "w-[270px]" : "w-[300px]";
  const cardHeight = isStory ? "h-[480px]" : "h-[300px]";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Share Movie Card</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Ratio Select */}
          <Select value={ratio} onValueChange={(v) => setRatio(v as CardRatio)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="square">Square (1:1)</SelectItem>
              <SelectItem value="story">Story (9:16)</SelectItem>
            </SelectContent>
          </Select>

          {/* Card Preview */}
          <div className="flex justify-center overflow-hidden rounded-xl">
            <div
              ref={cardRef}
              className={cn(
                "relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900",
                cardWidth,
                cardHeight
              )}
            >
              {/* Background poster blur */}
              {movie.poster_url && (
                <div
                  className="absolute inset-0 opacity-20 blur-xl scale-110"
                  style={{
                    backgroundImage: `url(${proxyPosterUrl(movie.poster_url)})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
              )}

              <div className={cn(
                "relative flex h-full flex-col justify-between p-5",
                isStory ? "pt-10" : ""
              )}>
                {/* Top: Movie info */}
                <div className={cn("flex gap-3", isStory ? "flex-col items-center text-center" : "")}>
                  {movie.poster_url && (
                    <img
                      src={proxyPosterUrl(movie.poster_url)!}
                      alt={movie.title}
                      className={cn(
                        "rounded-lg object-cover shadow-xl",
                        isStory ? "h-48 w-32" : "h-28 w-20"
                      )}
                      crossOrigin="anonymous"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className={cn(
                      "font-bold text-white",
                      isStory ? "text-xl mt-3" : "text-lg"
                    )}>
                      {movie.title}
                    </h3>
                    {movie.genres && (
                      <p className="mt-1 text-xs text-white/60">
                        {movie.genres.slice(0, 3).join(" \u2022 ")}
                      </p>
                    )}
                    {!isStory && movie.director && (
                      <p className="mt-1 text-xs text-white/60">
                        Dir: {movie.director}
                      </p>
                    )}
                  </div>
                </div>

                {/* Bottom: Rating + review */}
                <div className={cn(isStory ? "text-center" : "")}>
                  {movie.rating && (
                    <div className={cn("flex items-center gap-2", isStory ? "justify-center" : "")}>
                      <span className={cn(
                        "text-3xl font-bold",
                        getRatingColor(movie.rating)
                      )}>
                        {movie.rating.toFixed(1)}
                      </span>
                      <span className="text-sm text-white/70">
                        / 10 \u2022 {getRatingLabel(movie.rating)}
                      </span>
                    </div>
                  )}
                  {movie.review && (
                    <p className="mt-2 text-xs italic text-white/60 line-clamp-2">
                      &ldquo;{movie.review}&rdquo;
                    </p>
                  )}
                  <p className="mt-2 text-[10px] text-white/30">
                    {new Date(movie.date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                    {movie.format?.name && ` \u2022 ${movie.format.name}`}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={handleDownload}
              disabled={isGenerating}
              className="flex-1"
            >
              <Download className="mr-2 h-4 w-4" />
              {isGenerating ? "..." : "Download PNG"}
            </Button>
            <Button
              onClick={handleShare}
              disabled={isGenerating}
              variant="outline"
              className="flex-1"
            >
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
