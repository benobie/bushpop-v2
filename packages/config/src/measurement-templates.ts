/**
 * Category-aware measurement templates (prototype `MEAS` + `templateKey()`).
 *
 * Key vocabulary follows the shared W4 column contract superset —
 * `chest, waist, hip, length, inseam, rise, shoulder, sleeve` — extended
 * with sell-flow-specific keys (`leg_opening`, `insole`, `width`, `height`,
 * `strap_drop`, `depth`). All values are numeric centimetres.
 *
 * Deviations from the prototype, deliberate:
 *  - top "pit to pit" → `chest`, dress "bust" → `chest` (contract vocabulary)
 *  - shoes drop the US/UK/EU inputs — size conversions belong to
 *    `size_scale`/`size`, not measurements; only `insole` (cm) remains.
 */

import { SIZES_BY_GARMENT, type GarmentType } from "./taxonomy";

export const MEASUREMENT_KEYS = [
  "chest",
  "waist",
  "hip",
  "length",
  "inseam",
  "rise",
  "shoulder",
  "sleeve",
  "leg_opening",
  "insole",
  "width",
  "height",
  "strap_drop",
  "depth",
] as const;

export type MeasurementKey = (typeof MEASUREMENT_KEYS)[number];

export const MEASUREMENT_KEY_LABELS: Record<MeasurementKey, string> = {
  chest: "Chest (pit to pit, flat)",
  waist: "Waist (flat)",
  hip: "Hip (flat)",
  length: "Length",
  inseam: "Inseam",
  rise: "Front rise",
  shoulder: "Shoulder to shoulder",
  sleeve: "Sleeve length",
  leg_opening: "Leg opening",
  insole: "Insole length",
  width: "Width",
  height: "Height",
  strap_drop: "Strap drop",
  depth: "Depth",
};

export interface MeasurementTemplate {
  name: string;
  caption: string;
  keys: readonly MeasurementKey[];
}

export const MEASUREMENT_TEMPLATES = {
  top: {
    name: "Top",
    caption: "Lay flat, buttoned/zipped up",
    keys: ["chest", "shoulder", "length", "sleeve"],
  },
  dress: {
    name: "Dress",
    caption: "Lay flat, straps up",
    keys: ["chest", "waist", "hip", "length"],
  },
  bottoms: {
    name: "Bottoms",
    caption: "Lay flat, buttoned",
    keys: ["waist", "hip", "rise", "inseam", "leg_opening"],
  },
  skirt: {
    name: "Skirt",
    caption: "Lay flat, zipped",
    keys: ["waist", "hip", "length"],
  },
  shoes: {
    name: "Shoes",
    caption: "Insole heel-to-toe",
    keys: ["insole"],
  },
  bag: {
    name: "Bag",
    caption: "Measured across",
    keys: ["width", "height", "strap_drop", "depth"],
  },
  default: {
    name: "Item",
    caption: "Measured flat",
    keys: ["width", "length"],
  },
} as const satisfies Record<string, MeasurementTemplate>;

export type MeasurementTemplateKey = keyof typeof MEASUREMENT_TEMPLATES;

/**
 * Map a category (leaf slug + parent garment-type slug, per the seeded
 * taxonomy) to its measurement template. Leaf wins over parent — e.g.
 * `skirts` sits under `bottoms` but measures like a skirt.
 */
export function templateKeyForCategory(
  leafSlug: string | null | undefined,
  parentSlug: string | null | undefined,
): MeasurementTemplateKey {
  const leaf = (leafSlug ?? "").toLowerCase();

  if (/sneaker|boot|shoe|sandal|heel|flat|footwear/.test(leaf)) return "shoes";
  if (/dress/.test(leaf)) return "dress";
  if (/skirt/.test(leaf)) return "skirt";
  if (/jean|pant|trouser|short|bottom|legging/.test(leaf)) return "bottoms";
  if (/bag|backpack|tote|crossbody|clutch/.test(leaf)) return "bag";
  if (
    /top|shirt|tee|blouse|jacket|coat|outerwear|hoodie|knit|jumper|sweater|cami|crop|blazer|vest|swim|activewear|tank/.test(
      leaf,
    )
  ) {
    return "top";
  }

  switch ((parentSlug ?? "").toLowerCase() as GarmentType | "") {
    case "footwear":
      return "shoes";
    case "dresses":
      return "dress";
    case "bottoms":
      return "bottoms";
    case "bags":
      return "bag";
    case "tops":
    case "outerwear":
    case "swimwear":
    case "activewear":
      return "top";
    default:
      return "default";
  }
}

/**
 * Bags/accessories have no size vocabulary — they are exempt from the size
 * requirement in the publish gate and the strength rubric (D18). Data-driven
 * off the taxonomy: exempt ⟺ the garment type has no sizes.
 */
export function isSizeExempt(parentSlug: string | null | undefined): boolean {
  const sizes = SIZES_BY_GARMENT[(parentSlug ?? "") as GarmentType];
  return Array.isArray(sizes) && sizes.length === 0;
}
