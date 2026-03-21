"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, Camera, Loader2, FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TicketUploadProps {
  onUpload: (file: File) => Promise<void>;
  isLoading?: boolean;
}

const ACCEPTED_TYPES = "image/*,application/pdf";

export function TicketUpload({ onUpload, isLoading = false }: TicketUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const isImage = file.type.startsWith("image/");
      const isPDF = file.type === "application/pdf";
      if (!isImage && !isPDF) {
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
      // Reset so the same file can be re-selected
      e.target.value = "";
    },
    [handleFile]
  );

  return (
    <div
      className={cn(
        "relative rounded-lg border-2 border-dashed p-6 text-center transition-colors",
        isDragOver
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50",
        isLoading && "pointer-events-none opacity-50"
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Hidden file inputs */}
      {/* Gallery/files input - no capture attribute so user gets file picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleInputChange}
        className="hidden"
        disabled={isLoading}
      />
      {/* Camera input - capture attribute for direct camera on mobile */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInputChange}
        className="hidden"
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
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-xl bg-secondary p-4 transition-colors hover:bg-secondary/80 active:scale-95"
            >
              <Camera className="h-6 w-6 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Camera</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-xl bg-secondary p-4 transition-colors hover:bg-secondary/80 active:scale-95"
            >
              <FileImage className="h-6 w-6 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Gallery</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-xl bg-secondary p-4 transition-colors hover:bg-secondary/80 active:scale-95"
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">File/PDF</span>
            </button>
          </div>
          <div>
            <p className="font-medium">Upload ticket</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Image or PDF — tap a button or drag and drop
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
