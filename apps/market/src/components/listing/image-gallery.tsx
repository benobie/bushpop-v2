"use client";

import Image from "next/image";
import { useState } from "react";

interface GalleryImage {
  id: string;
  url: string;
  position: number;
  isPrimary: boolean;
  aspectRatio?: number | null;
}

interface ImageGalleryProps {
  images: GalleryImage[];
  title: string;
}

export function ImageGallery({ images, title }: ImageGalleryProps) {
  const sorted = [...images].sort((a, b) => {
    if (a.isPrimary) return -1;
    if (b.isPrimary) return 1;
    return a.position - b.position;
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const active = sorted[activeIndex];
  const aspectRatio = active?.aspectRatio ?? 0.75;

  if (sorted.length === 0) {
    return (
      <div
        className="w-full rounded-xl bg-bp-surface-2 flex items-center justify-center text-bp-ink-3"
        style={{ aspectRatio }}
      >
        <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Hero image — CSS aspect-ratio for CLS prevention (FM-R3-4) */}
      <div
        className="relative w-full overflow-hidden rounded-xl bg-bp-surface-2"
        style={{ aspectRatio: aspectRatio ?? 0.75 }}
      >
        {active && (
          <Image
            src={active.url}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 640px"
            priority
            fetchPriority="high"
          />
        )}
      </div>

      {/* Thumbnail strip */}
      {sorted.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sorted.map((img, idx) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActiveIndex(idx)}
              className={[
                "relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all",
                idx === activeIndex
                  ? "border-bp-obsidian"
                  : "border-transparent opacity-60 hover:opacity-100",
              ].join(" ")}
              aria-label={`View photo ${idx + 1}`}
            >
              <Image
                src={img.url}
                alt={`${title} — photo ${idx + 1}`}
                fill
                className="object-cover"
                sizes="64px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
