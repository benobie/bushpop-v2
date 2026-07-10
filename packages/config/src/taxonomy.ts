// Fashion taxonomy constants — garment types, sizes, colours, materials
// Used across web, mobile, and backend for structured filter taxonomy

// W3 (BF-15): gender as first-class IA — home tiles, PLP filter, wizard.
// Optional on a listing; not enforced against garment type or category.
export const GENDERS = ["women", "men", "unisex", "kids"] as const;

export type Gender = (typeof GENDERS)[number];

export const GENDER_LABELS: Record<Gender, string> = {
  women: "Women",
  men: "Men",
  unisex: "Unisex",
  kids: "Kids",
};

export const GARMENT_TYPES = [
  "tops",
  "bottoms",
  "dresses",
  "outerwear",
  "footwear",
  "bags",
  "accessories",
  "swimwear",
  "activewear",
  "other",
] as const;

export type GarmentType = (typeof GARMENT_TYPES)[number];

export const GARMENT_TYPE_LABELS: Record<GarmentType, string> = {
  tops: "Tops",
  bottoms: "Bottoms",
  dresses: "Dresses",
  outerwear: "Outerwear",
  footwear: "Footwear",
  bags: "Bags",
  accessories: "Accessories",
  swimwear: "Swimwear",
  activewear: "Activewear",
  other: "Other",
};

/**
 * Leaf categories per garment type — the single source for the category
 * seed (packages/db/src/seeds/categories.ts), the AI draft prompt's
 * category tree, and resolve-time validation. Garment types absent here
 * (swimwear, activewear, other) have no leaves and act as leaves themselves.
 */
export const CATEGORY_LEAVES: Partial<Record<GarmentType, readonly string[]>> = {
  tops: ["t-shirts", "shirts", "blouses", "knitwear", "tank-tops"],
  bottoms: ["jeans", "trousers", "skirts", "shorts"],
  dresses: ["mini-dresses", "midi-dresses", "maxi-dresses"],
  outerwear: ["jackets", "coats", "blazers", "vests"],
  footwear: ["sneakers", "boots", "heels", "sandals", "flats"],
  bags: ["tote-bags", "crossbody", "clutches", "backpacks"],
  accessories: ["jewellery", "belts", "scarves", "hats", "sunglasses"],
};

/** Every valid leaf slug (incl. leafless garment types, which self-qualify). */
export function allCategoryLeafSlugs(): string[] {
  const slugs: string[] = [];
  for (const garmentType of GARMENT_TYPES) {
    const leaves = CATEGORY_LEAVES[garmentType];
    if (leaves && leaves.length > 0) slugs.push(...leaves);
    else slugs.push(garmentType);
  }
  return slugs;
}

export const SIZES_CLOTHING = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
] as const;

export const SIZES_AU_WOMENS = [
  "6",
  "8",
  "10",
  "12",
  "14",
  "16",
  "18",
  "20",
  "22",
] as const;

export const SIZES_JEANS = [
  "W24",
  "W25",
  "W26",
  "W27",
  "W28",
  "W29",
  "W30",
  "W31",
  "W32",
  "W34",
  "W36",
] as const;

export const SIZES_SHOES_AU = [
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
] as const;

export const SIZES_BY_GARMENT: Record<GarmentType, readonly string[]> = {
  tops: SIZES_CLOTHING,
  bottoms: [...SIZES_AU_WOMENS, ...SIZES_JEANS],
  dresses: [...SIZES_CLOTHING, ...SIZES_AU_WOMENS],
  outerwear: SIZES_CLOTHING,
  footwear: SIZES_SHOES_AU,
  bags: [],
  accessories: [],
  swimwear: SIZES_AU_WOMENS,
  activewear: SIZES_CLOTHING,
  other: SIZES_CLOTHING,
};

export const COLOURS = [
  "black",
  "white",
  "grey",
  "navy",
  "blue",
  "green",
  "red",
  "pink",
  "yellow",
  "orange",
  "purple",
  "brown",
  "beige",
  "multi",
  "print",
  "other",
] as const;

export type Colour = (typeof COLOURS)[number];

export const COLOUR_LABELS: Record<Colour, string> = {
  black: "Black",
  white: "White",
  grey: "Grey",
  navy: "Navy",
  blue: "Blue",
  green: "Green",
  red: "Red",
  pink: "Pink",
  yellow: "Yellow",
  orange: "Orange",
  purple: "Purple",
  brown: "Brown",
  beige: "Beige",
  multi: "Multi",
  print: "Print",
  other: "Other",
};

export const COLOUR_HEX: Record<Colour, string> = {
  black: "#111111",
  white: "#FFFFFF",
  grey: "#9CA3AF",
  navy: "#1E3A5F",
  blue: "#3B82F6",
  green: "#22C55E",
  red: "#EF4444",
  pink: "#EC4899",
  yellow: "#EAB308",
  orange: "#F97316",
  purple: "#A855F7",
  brown: "#92400E",
  beige: "#D4B896",
  multi: "linear-gradient(135deg, #EF4444, #3B82F6, #22C55E)",
  print: "#E5E7EB",
  other: "#D1D5DB",
};

export const MATERIALS = [
  "cotton",
  "linen",
  "silk",
  "wool",
  "denim",
  "leather",
  "synthetic",
  "knit",
  "velvet",
  "satin",
  "other",
] as const;

export type Material = (typeof MATERIALS)[number];

export const MATERIAL_LABELS: Record<Material, string> = {
  cotton: "Cotton",
  linen: "Linen",
  silk: "Silk",
  wool: "Wool",
  denim: "Denim",
  leather: "Leather",
  synthetic: "Synthetic",
  knit: "Knit",
  velvet: "Velvet",
  satin: "Satin",
  other: "Other",
};
