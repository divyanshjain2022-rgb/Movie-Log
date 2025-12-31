"use client";

import { useState, useCallback } from "react";
import { Upload, Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TicketUploadProps {
  onUpload: (file: File) => Promise<void>;
  isLoading?: boolean;
}

export function TicketUpload({ onUpload, isLoading = false }: TicketUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        return;
      }
      await onUpload(file);
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  return (
    <div
      className={cn(
        "relative rounded-lg border-2 border-dashed p-8 text-center transition-colors",
        isDragOver
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50",
        isLoading && "pointer-events-none opacity-50"
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInputChange}
        className="absolute inset-0 cursor-pointer opacity-0"
        disabled={isLoading}
      />

      {isLoading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Extracting ticket data...
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-2">
            <div className="rounded-full bg-secondary p-3">
              <Camera className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="rounded-full bg-secondary p-3">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
          <div>
            <p className="font-medium">Tap to upload ticket</p>
            <p className="mt-1 text-sm text-muted-foreground">
              or drag and drop an image
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
