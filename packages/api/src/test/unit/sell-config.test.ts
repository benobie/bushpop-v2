import { describe, expect, it } from "vitest";
import {
  BRANDS,
  containsProhibitedTerms,
  findProhibitedTerms,
  FLAT_RATE_SHIPPING_CENTS,
  isSizeExempt,
  MEASUREMENT_TEMPLATES,
  PARCELS,
  parcelToShippingClass,
  SIZE_CHART_BRAND_SLUGS,
  templateKeyForCategory,
} from "@bushpop/config";

describe("parcels / shipping alignment", () => {
  it("parcel costs are the locked design values (855/1095/1660)", () => {
    expect(PARCELS.small.costCents).toBe(855);
    expect(PARCELS.medium.costCents).toBe(1095);
    expect(PARCELS.large.costCents).toBe(1660);
  });

  it("buyer-side flat rates agree with seller-side label costs for s/m/l", () => {
    expect(FLAT_RATE_SHIPPING_CENTS.s).toBe(PARCELS.small.costCents);
    expect(FLAT_RATE_SHIPPING_CENTS.m).toBe(PARCELS.medium.costCents);
    expect(FLAT_RATE_SHIPPING_CENTS.l).toBe(PARCELS.large.costCents);
  });

  it("derives shipping class from parcel size", () => {
    expect(parcelToShippingClass("small")).toBe("s");
    expect(parcelToShippingClass("medium")).toBe("m");
    expect(parcelToShippingClass("large")).toBe("l");
  });
});

describe("measurement templates", () => {
  it("maps seeded leaf slugs to the right template (leaf wins over parent)", () => {
    expect(templateKeyForCategory("sneakers", "footwear")).toBe("shoes");
    expect(templateKeyForCategory("midi-dresses", "dresses")).toBe("dress");
    expect(templateKeyForCategory("skirts", "bottoms")).toBe("skirt"); // leaf beats parent
    expect(templateKeyForCategory("jeans", "bottoms")).toBe("bottoms");
    expect(templateKeyForCategory("tote-bags", "bags")).toBe("bag");
    expect(templateKeyForCategory("t-shirts", "tops")).toBe("top");
    expect(templateKeyForCategory("jackets", "outerwear")).toBe("top");
    expect(templateKeyForCategory("jewellery", "accessories")).toBe("default");
  });

  it("falls back to the parent garment type for unknown leaves", () => {
    expect(templateKeyForCategory(null, "swimwear")).toBe("top");
    expect(templateKeyForCategory(null, "footwear")).toBe("shoes");
    expect(templateKeyForCategory(null, "other")).toBe("default");
    expect(templateKeyForCategory(null, null)).toBe("default");
  });

  it("template keys stay within the contract vocabulary + documented extensions", () => {
    const contract = new Set([
      "chest", "waist", "hip", "length", "inseam", "rise", "shoulder", "sleeve",
      // documented extensions:
      "leg_opening", "insole", "width", "height", "strap_drop", "depth",
    ]);
    for (const template of Object.values(MEASUREMENT_TEMPLATES)) {
      for (const key of template.keys) {
        expect(contract.has(key)).toBe(true);
      }
    }
  });

  it("bags and accessories are size-exempt; sized garments are not (D18)", () => {
    expect(isSizeExempt("bags")).toBe(true);
    expect(isSizeExempt("accessories")).toBe(true);
    expect(isSizeExempt("tops")).toBe(false);
    expect(isSizeExempt("footwear")).toBe(false);
    expect(isSizeExempt(null)).toBe(false);
  });
});

describe("prohibited terms", () => {
  it("flags counterfeit signals", () => {
    expect(containsProhibitedTerms("Genuine 1:1 mirror quality Gucci bag")).toBe(true);
    expect(containsProhibitedTerms("This is a replica of the original")).toBe(true);
  });

  it("flags off-platform payment and contact steering", () => {
    expect(containsProhibitedTerms("Message me on WhatsApp to buy")).toBe(true);
    expect(containsProhibitedTerms("Bank transfer only please")).toBe(true);
    expect(containsProhibitedTerms("call me at 0412 345 678")).toBe(true);
    expect(containsProhibitedTerms("email seller@example.com for pics")).toBe(true);
  });

  it("does NOT flag fashion-adjacent lookalikes", () => {
    expect(findProhibitedTerms("Wool skirt with a knife pleat, gun-metal grey buttons")).toEqual([]);
    expect(findProhibitedTerms("RRP $1,299 — priced at $200")).toEqual([]);
    expect(findProhibitedTerms("Genuine leather Country Road tote")).toEqual([]);
  });
});

describe("brands", () => {
  it("pins Other / Unbranded last", () => {
    expect(BRANDS[BRANDS.length - 1]).toBe("Other / Unbranded");
  });

  it("every size-chart brand is a BRANDS entry with a kebab slug", () => {
    for (const [brand, slug] of Object.entries(SIZE_CHART_BRAND_SLUGS)) {
      expect(BRANDS).toContain(brand);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
    expect(Object.keys(SIZE_CHART_BRAND_SLUGS)).toHaveLength(19);
  });
});
