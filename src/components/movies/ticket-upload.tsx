"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, Camera, Loader2, FileImage } from "lucide-react";
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
      e.target.value = "";
    },
    [handleFile]
  );

  return (
    <div
      className={cn(
        "relative rounded-3xl p-8 text-center transition-all duration-300",
        isDragOver
          ? "bg-primary/8 ring-1 ring-primary/20"
          : "bg-card/30",
        isLoading && "pointer-events-none opacity-50"
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleInputChange}
        className="hidden"
        disabled={isLoading}
      />
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
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
          <p className="text-sm font-medium text-muted-foreground/70">
            Extracting ticket data...
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center gap-2 rounded-2xl bg-secondary/30 p-4 w-20 transition-all hover:bg-secondary/50 active:scale-95"
            >
              <Camera className="h-5 w-5 text-muted-foreground/60" strokeWidth={1.75} />
              <span className="text-[11px] font-medium text-muted-foreground/50">Camera</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-2 rounded-2xl bg-secondary/30 p-4 w-20 transition-all hover:bg-secondary/50 active:scale-95"
            >
              <FileImage className="h-5 w-5 text-muted-foreground/60" strokeWidth={1.75} />
              <span className="text-[11px] font-medium text-muted-foreground/50">Gallery</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-2 rounded-2xl bg-secondary/30 p-4 w-20 transition-all hover:bg-secondary/50 active:scale-95"
            >
              <Upload className="h-5 w-5 text-muted-foreground/60" strokeWidth={1.75} />
              <span className="text-[11px] font-medium text-muted-foreground/50">File</span>
            </button>
          </div>
          <div>
            <p className="text-sm font-semibold">Upload ticket</p>
            <p className="mt-1 text-xs text-muted-foreground/40">
              Image or PDF — tap or drag & drop
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
