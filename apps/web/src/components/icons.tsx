// Custom glyphs not in the Phosphor set — ported verbatim from the prototype
// sprite (~/projects/Bushpop/design/home/_icons-sprite.html #i-scross).
// Pure RSC (static SVG, no client JS).
export function SouthernCrossIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
  // Accepted (and ignored) so this drop-in matches the Phosphor icon prop
  // shape used alongside it in shared { Icon, label } render loops.
  weight?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M128 2 L135.3 20.7 L154 28 L135.3 35.3 L128 54 L120.7 35.3 L102 28 L120.7 20.7 Z M128 202 L135.3 220.7 L154 228 L135.3 235.3 L128 254 L120.7 235.3 L102 228 L120.7 220.7 Z M48 114 L55.3 132.7 L74 140 L55.3 147.3 L48 166 L40.7 147.3 L22 140 L40.7 132.7 Z M208 86 L215.3 104.7 L234 112 L215.3 119.3 L208 138 L200.7 119.3 L182 112 L200.7 104.7 Z M156 159 L159.6 168.4 L169 172 L159.6 175.6 L156 185 L152.4 175.6 L143 172 L152.4 168.4 Z" />
    </svg>
  );
}
