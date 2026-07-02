"use client";

import { useCallback, useRef, useState } from "react";
import { createBrowserApiClient } from "@bushpop/api-client/browser";

interface UploadedPhoto {
  imageId: string;
  url: string;
  status: "uploading" | "ready" | "error";
}

interface PhotoUploaderProps {
  itemId: string;
  onUploadComplete?: (imageId: string) => void;
}

export function PhotoUploader({ itemId, onUploadComplete }: PhotoUploaderProps) {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const positionCounter = useRef(0);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError("Only image files are accepted (JPEG, PNG, WebP).");
        return;
      }

      const contentType = file.type as "image/jpeg" | "image/png" | "image/webp";
      const api = createBrowserApiClient();

      // 1. Get presigned upload URL
      const { data: urlData, error: urlError } = await api.POST(
        "/api/v1/seller/inventory/{id}/images/upload-url",
        {
          params: { path: { id: itemId } },
          body: { contentType },
        },
      );

      if (urlError || !urlData) {
        setError("Failed to get upload URL. Please try again.");
        return;
      }

      const { uploadUrl, imageId } = urlData;

      // Add placeholder to UI
      setPhotos((prev) => [
        ...prev,
        { imageId, url: URL.createObjectURL(file), status: "uploading" },
      ]);

      // 2. PUT to R2
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });

      if (!putRes.ok) {
        setPhotos((prev) =>
          prev.map((p) => (p.imageId === imageId ? { ...p, status: "error" } : p)),
        );
        setError("Upload to storage failed. Please try again.");
        return;
      }

      // 3. Confirm — use an incrementing ref to avoid position collisions on concurrent uploads
      const position = positionCounter.current++;
      const isPrimary = position === 0;
      const { error: confirmError } = await api.POST(
        "/api/v1/seller/inventory/{id}/images/{imageId}/confirm",
        {
          params: { path: { id: itemId, imageId } },
          body: { position, isPrimary },
        },
      );

      if (confirmError) {
        setPhotos((prev) =>
          prev.map((p) => (p.imageId === imageId ? { ...p, status: "error" } : p)),
        );
        setError("Failed to confirm upload. Please try again.");
        return;
      }

      setPhotos((prev) =>
        prev.map((p) => (p.imageId === imageId ? { ...p, status: "ready" } : p)),
      );
      setError(null);
      onUploadComplete?.(imageId);
    },
    [itemId, photos.length, onUploadComplete],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      Array.from(files).forEach((file) => uploadFile(file));
    },
    [uploadFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const removePhoto = useCallback(async (imageId: string) => {
    const api = createBrowserApiClient();
    await api.DELETE("/api/v1/seller/inventory/{id}/images/{imageId}", {
      params: { path: { id: itemId, imageId } },
    });
    setPhotos((prev) => prev.filter((p) => p.imageId !== imageId));
  }, [itemId]);

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <label
        className={[
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors",
          isDragging
            ? "border-brand-500 bg-brand-50"
            : "border-brand-200 hover:border-brand-400 hover:bg-brand-50",
        ].join(" ")}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <svg className="mb-3 h-10 w-10 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <p className="text-sm font-medium text-brand-700">Drag photos here or click to browse</p>
        <p className="mt-1 text-xs text-brand-400">JPEG, PNG or WebP — up to 10 photos</p>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {/* Error */}
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>
      )}

      {/* Photo grid */}
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {photos.map((photo) => (
            <li key={photo.imageId} className="relative aspect-square overflow-hidden rounded-lg bg-brand-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt="Uploaded photo"
                className={[
                  "h-full w-full object-cover transition-opacity",
                  photo.status === "uploading" ? "opacity-50" : "opacity-100",
                ].join(" ")}
              />
              {photo.status === "uploading" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                </div>
              )}
              {photo.status === "error" && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-900/60">
                  <span className="text-xs font-semibold text-white">Error</span>
                </div>
              )}
              {photo.status === "ready" && (
                <button
                  type="button"
                  onClick={() => removePhoto(photo.imageId)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-brand-700 shadow hover:bg-white"
                  aria-label="Remove photo"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
