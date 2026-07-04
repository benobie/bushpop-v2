/**
 * Abstract placeholder swatches for the design-system preview — no product
 * photography is checked into this repo, so screenshots compare chrome
 * (nav/footer/card/button structure + motion), not photo content.
 */
export function placeholderImage(hue: number, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600">
    <rect width="480" height="600" fill="hsl(${hue} 28% 88%)" />
    <rect width="480" height="600" fill="hsl(${hue} 40% 70%)" opacity="0.35" />
    <text x="240" y="300" font-family="sans-serif" font-size="22" fill="hsl(${hue} 30% 30%)" text-anchor="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
