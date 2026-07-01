// Illustrative demo products for the pre-launch homepage.
// These are NOT real listings — the marketplace lands at Launch 2. They exist
// only to show what the storefront will look like. Imagery lives in
// public/demo/ (copied from the design prototype); real product photos will
// come from the R2 `bushpop-media` bucket once the engine ships.

export type DemoProduct = {
  id: string;
  name: string;
  brand: string;
  img: string;
  price: number; // whole AUD dollars
  rrp?: number;
  size?: string;
  condition?: string;
  savedBy?: number;
  rating?: number;
  flag?: string; // scarcity cue e.g. "Only 1", "Just listed"
  category: "Outerwear" | "Shoes" | "Vintage" | "Accessories";
};

export const FRESH_DROPS: DemoProduct[] = [
  { id: "d1", name: "Vintage Carhartt Detroit jacket", brand: "Carhartt", img: "/demo/tnf-puffer.jpg", price: 204, rrp: 612, size: "L", condition: "Used – good", savedBy: 34, rating: 5.0, flag: "Only 1", category: "Outerwear" },
  { id: "d2", name: "TNF Nuptse 700 puffer", brand: "The North Face", img: "/demo/puffer-model.jpg", price: 189, rrp: 380, size: "M", condition: "Excellent", savedBy: 52, rating: 4.9, flag: "Just listed", category: "Outerwear" },
  { id: "d3", name: "Salomon XT-6 trainers", brand: "Salomon", img: "/demo/salomon.jpg", price: 145, rrp: 260, size: "US 9", condition: "Used – good", savedBy: 28, rating: 4.8, category: "Shoes" },
  { id: "d4", name: "Adidas Gazelle indoor", brand: "Adidas", img: "/demo/gazelle.jpg", price: 72, rrp: 160, size: "US 8", condition: "Excellent", savedBy: 19, rating: 4.9, category: "Shoes" },
  { id: "d5", name: "Nike Air Max TN", brand: "Nike", img: "/demo/nike-tn.jpg", price: 118, rrp: 240, size: "US 10", condition: "Used – good", savedBy: 41, rating: 4.7, flag: "Only 1", category: "Shoes" },
  { id: "d6", name: "Birkenstock Boston clogs", brand: "Birkenstock", img: "/demo/birkenstock.jpg", price: 68, rrp: 150, size: "EU 40", condition: "Used – good", savedBy: 15, rating: 4.8, category: "Shoes" },
  { id: "d7", name: "Vintage wool blanket coat", brand: "Vintage", img: "/demo/vint1.jpg", price: 96, rrp: 210, size: "12", condition: "Used – fair", savedBy: 22, rating: 4.6, category: "Vintage" },
  { id: "d8", name: "90s striped knit", brand: "Vintage", img: "/demo/vint2.jpg", price: 42, rrp: 95, size: "S", condition: "Excellent", savedBy: 11, rating: 4.9, flag: "Just listed", category: "Vintage" },
  { id: "d9", name: "Retro shell jacket", brand: "Vintage", img: "/demo/vint3.jpg", price: 58, rrp: 130, size: "M", condition: "Used – good", savedBy: 17, rating: 4.7, category: "Vintage" },
  { id: "d10", name: "Salomon Speedcross", brand: "Salomon", img: "/demo/salomon2.jpg", price: 130, rrp: 220, size: "US 9.5", condition: "Excellent", savedBy: 30, rating: 4.8, category: "Shoes" },
  { id: "d11", name: "Leather work gloves", brand: "Vintage", img: "/demo/gloves.jpg", price: 24, rrp: 55, size: "One size", condition: "Used – good", savedBy: 8, rating: 4.6, category: "Accessories" },
  { id: "d12", name: "TNF 1996 retro puffer", brand: "The North Face", img: "/demo/tnf-puffer2.jpg", price: 175, rrp: 340, size: "L", condition: "Excellent", savedBy: 46, rating: 4.9, flag: "Only 1", category: "Outerwear" },
];

export const FRESH_DROP_FILTERS = ["All", "Outerwear", "Shoes", "Vintage", "Accessories", "Under $50"] as const;
export type FreshDropFilter = (typeof FRESH_DROP_FILTERS)[number];

export function matchesFilter(p: DemoProduct, filter: FreshDropFilter): boolean {
  if (filter === "All") return true;
  if (filter === "Under $50") return p.price < 50;
  return p.category === filter;
}

export const RECENTLY_VIEWED: DemoProduct[] = [
  FRESH_DROPS[1], FRESH_DROPS[3], FRESH_DROPS[6], FRESH_DROPS[9], FRESH_DROPS[7], FRESH_DROPS[4],
];

export const BRANDS = [
  "Nike", "Adidas", "The North Face", "Carhartt", "Salomon", "New Balance",
  "Dr. Martens", "Patagonia", "Levi's", "Ralph Lauren", "Birkenstock",
];

export const STYLES = [
  { label: "Vintage", img: "/demo/vint1.jpg" },
  { label: "Streetwear", img: "/demo/salomon2.jpg" },
  { label: "Outdoors", img: "/demo/tnf-puffer2.jpg" },
  { label: "Under $50", img: "" },
];

/** Split a whole-dollar price into { dollars, cents } for the $X.00 format. */
export function priceParts(dollars: number): { dollars: string; cents: string } {
  return { dollars: `$${dollars}`, cents: "00" };
}
