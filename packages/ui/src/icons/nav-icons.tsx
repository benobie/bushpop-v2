import * as React from "react";
import type { CustomIconProps } from "./custom";

/**
 * Local icon set — ported byte-exact from design/home/_icons-sprite.html and
 * design/home/_nav.js's `SYM` injector (the prototype's own icon paths), not
 * @phosphor-icons/react. Swapped out (05/07/2026) after @phosphor-icons/react's
 * barrel-evaluated IconContext (a top-level React.createContext call) broke
 * Next 16's page-data-collection pass under cacheComponents/Turbopack
 * ("(0, e.createContext) is not a function") — every route importing
 * anything from @bushpop/ui failed to build. Hand-authored SVGs sidestep it
 * entirely and are pixel-exact to the prototype (the actual acceptance bar),
 * with zero added runtime dependency. House/User have no prototype source
 * (mobile bottom bar is new, not in design/home/) — simple original glyphs.
 */
function createIcon(displayName: string, path: React.ReactNode) {
  const Icon = React.forwardRef<SVGSVGElement, CustomIconProps>(({ size = 24, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      {path}
    </svg>
  ));
  Icon.displayName = displayName;
  return Icon;
}

export const MenuIcon = createIcon(
  "MenuIcon",
  <path d="M228 64a12 12 0 0 1-12 12H40a12 12 0 0 1 0-24h176a12 12 0 0 1 12 12Zm-12 52H40a12 12 0 0 0 0 24h176a12 12 0 0 0 0-24Zm0 64H40a12 12 0 0 0 0 24h176a12 12 0 0 0 0-24Z" />,
);

export const CloseIcon = createIcon(
  "CloseIcon",
  <path d="M208.49 191.51a12 12 0 0 1-17 17L128 145l-63.51 63.49a12 12 0 0 1-17-17L111 128L47.51 64.49a12 12 0 0 1 17-17L128 111l63.51-63.52a12 12 0 0 1 17 17L145 128Z" />,
);

export const ArrowRightIcon = createIcon(
  "ArrowRightIcon",
  <path d="m224.49 136.49l-72 72a12 12 0 0 1-17-17L187 140H40a12 12 0 0 1 0-24h147l-51.49-51.52a12 12 0 0 1 17-17l72 72a12 12 0 0 1-.02 17.01" />,
);

export const ArrowLeftIcon = createIcon(
  "ArrowLeftIcon",
  <path d="M224 128a12 12 0 0 1-12 12H69l51.52 51.51a12 12 0 0 1-17 17l-72-72a12 12 0 0 1 0-17l72-72a12 12 0 0 1 17 17L69 116h143a12 12 0 0 1 12 12" />,
);

export const SearchIcon = createIcon(
  "SearchIcon",
  <path d="M232.49 215.51L185 168a92.12 92.12 0 1 0-17 17l47.53 47.54a12 12 0 0 0 17-17ZM44 112a68 68 0 1 1 68 68a68.07 68.07 0 0 1-68-68" />,
);

export const HeartIcon = createIcon(
  "HeartIcon",
  <path d="M178 36c-20.09 0-37.92 7.93-50 21.56C115.92 43.93 98.09 36 78 36a66.08 66.08 0 0 0-66 66c0 72.34 105.81 130.14 110.31 132.57a12 12 0 0 0 11.38 0C138.19 232.14 244 174.34 244 102a66.08 66.08 0 0 0-66-66m-5.49 142.36a328.7 328.7 0 0 1-44.51 31.8a328.7 328.7 0 0 1-44.51-31.8C61.82 159.77 36 131.42 36 102a42 42 0 0 1 42-42c17.8 0 32.7 9.4 38.89 24.54a12 12 0 0 0 22.22 0C145.3 69.4 160.2 60 178 60a42 42 0 0 1 42 42c0 29.42-25.82 57.77-47.49 76.36" />,
);

export const ChatIcon = createIcon(
  "ChatIcon",
  <path d="M128,20A108,108,0,0,0,31.85,177.23L21,209.66A20,20,0,0,0,46.34,235l32.43-10.81A108,108,0,1,0,128,20Zm0,192a84,84,0,0,1-42.06-11.27,12,12,0,0,0-6-1.62,12.1,12.1,0,0,0-3.8.62l-29.79,9.93,9.93-29.79a12,12,0,0,0-1-9.81A84,84,0,1,1,128,212Z" />,
);

export const PlusCircleIcon = createIcon(
  "PlusCircleIcon",
  <path d="M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20Zm0,192a84,84,0,1,1,84-84A84.09,84.09,0,0,1,128,212Zm52-84a12,12,0,0,1-12,12H140v28a12,12,0,0,1-24,0V140H88a12,12,0,0,1,0-24h28V88a12,12,0,0,1,24,0v28h28A12,12,0,0,1,180,128Z" />,
);

export const ChevronDownIcon = createIcon(
  "ChevronDownIcon",
  <path d="m216.49 104.49l-80 80a12 12 0 0 1-17 0l-80-80a12 12 0 0 1 17-17L128 159l71.51-71.52a12 12 0 0 1 17 17Z" />,
);

export const BagOutlineIcon = createIcon(
  "BagOutlineIcon",
  <path d="M216,64H176a48,48,0,0,0-96,0H40A16,16,0,0,0,24,80V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64ZM128,32a32,32,0,0,1,32,32H96A32,32,0,0,1,128,32Zm88,168H40V80H80V96a8,8,0,0,0,16,0V80h64V96a8,8,0,0,0,16,0V80h40Z" />,
);

export const BagFillIcon = createIcon(
  "BagFillIcon",
  <path d="M216,64H176a48,48,0,0,0-96,0H40A16,16,0,0,0,24,80V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64ZM96,104a8,8,0,0,1-16,0V88a8,8,0,0,1,16,0Zm32-72a32,32,0,0,1,32,32H96A32,32,0,0,1,128,32Zm48,72a8,8,0,0,1-16,0V88a8,8,0,0,1,16,0Z" />,
);

/** Original glyph — no prototype source (mobile bottom bar is new). */
export const HouseIcon = createIcon(
  "HouseIcon",
  <path d="M136.97 12.7a12 12 0 0 0-17.94 0l-96 108A12 12 0 0 0 32 140h16v88a12 12 0 0 0 12 12h48a12 12 0 0 0 12-12v-52h16v52a12 12 0 0 0 12 12h48a12 12 0 0 0 12-12v-88h16a12 12 0 0 0 8.97-19.3ZM172 216h-24v-52a12 12 0 0 0-12-12h-16a12 12 0 0 0-12 12v52H84v-88a12 12 0 0 0-12-12H59.87L128 39.5l68.13 76.5H184a12 12 0 0 0-12 12Z" />,
);

/** Original glyph — no prototype source (mobile bottom bar is new). */
export const UserIcon = createIcon(
  "UserIcon",
  <path d="M128 24a56 56 0 1 0 56 56 56.06 56.06 0 0 0-56-56m0 88a32 32 0 1 1 32-32 32 32 0 0 1-32 32m0 20c-40 0-96 20.12-96 60v20a12 12 0 0 0 24 0v-20c0-14.87 40.15-36 72-36s72 21.13 72 36v20a12 12 0 0 0 24 0v-20c0-39.88-56-60-96-60" />,
);

/** Ported byte-exact from design/home/checkout.html's icon sprite (#i-lock). */
export const LockIcon = createIcon(
  "LockIcon",
  <path d="M208 76h-28V56a52 52 0 0 0-104 0v20H48a20 20 0 0 0-20 20v112a20 20 0 0 0 20 20h160a20 20 0 0 0 20-20V96a20 20 0 0 0-20-20M100 56a28 28 0 0 1 56 0v20h-56Zm104 148H52V100h152Zm-60-52a16 16 0 1 1-16-16a16 16 0 0 1 16 16" />,
);

/** Ported byte-exact from design/home/checkout.html's icon sprite (#i-shield). */
export const ShieldIcon = createIcon(
  "ShieldIcon",
  <path d="M208 36H48a20 20 0 0 0-20 20v56c0 54.29 26.32 87.22 48.4 105.29c23.71 19.39 47.44 26 48.44 26.29a12.1 12.1 0 0 0 6.32 0c1-.28 24.73-6.9 48.44-26.29c22.08-18.07 48.4-51 48.4-105.29V56a20 20 0 0 0-20-20m-4 76c0 35.71-13.09 64.69-38.91 86.15A126.3 126.3 0 0 1 128 219.38a126.1 126.1 0 0 1-37.09-21.23C65.09 176.69 52 147.71 52 112V60h152ZM79.51 144.49a12 12 0 1 1 17-17L112 143l47.51-47.52a12 12 0 0 1 17 17l-56 56a12 12 0 0 1-17 0Z" />,
);

/** Ported byte-exact from design/home/checkout.html's icon sprite (#i-check). */
export const CheckIcon = createIcon(
  "CheckIcon",
  <path d="m232.49 80.49l-128 128a12 12 0 0 1-17 0l-56-56a12 12 0 1 1 17-17L96 183L215.51 63.51a12 12 0 0 1 17 17Z" />,
);
