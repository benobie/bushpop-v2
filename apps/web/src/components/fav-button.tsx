"use client";

// Tiny client island: the heart/save toggle on a product card. Local state
// only (no marketplace yet). Kept minimal so a server-rendered ProductCard
// stays server-rendered — just this heart hydrates.
import { Heart } from "lucide-react";
import { useState } from "react";

export function FavButton({ label = "Save" }: { label?: string }) {
  const [saved, setSaved] = useState(false);
  return (
    <button
      type="button"
      className={saved ? "fav on" : "fav"}
      aria-pressed={saved}
      aria-label={saved ? `${label} (saved)` : label}
      onClick={(e) => {
        e.preventDefault();
        setSaved((s) => !s);
      }}
    >
      <Heart size={16} fill={saved ? "currentColor" : "none"} strokeWidth={2} />
    </button>
  );
}
