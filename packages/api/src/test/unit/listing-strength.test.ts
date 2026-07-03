import { describe, expect, it } from "vitest";
import {
  computeListingStrength,
  strengthBand,
  type ListingStrengthInput,
} from "@bushpop/config";

/**
 * Parity fixture: the design prototype's jsdom suite-2 seeded resume draft
 * (design/home/qa/sell-test-2-resume-draft.js), which the prototype scores
 * at exactly 77. Component maths: 1 photo (5) + title (10) + brand (5) +
 * category (10) + size (10) + colour (5) + description <40 chars (0) +
 * condition (10) + measurements (10) + price (10) + no RRP (0) + offers (+2)
 * = 77. Day 1 excludes offers (D19) so the same draft scores 75 here — the
 * +2 weight stays in the module, callers pass offersEnabled: false.
 */
const SUITE2_SEEDED_DRAFT: ListingStrengthInput = {
  photoCount: 1, // ['gazelle']
  title: "adidas Gazelle sneakers — navy suede",
  brand: "adidas",
  categoryLeaf: "sneakers",
  size: "US 9",
  colour: "blue",
  description: "Retro Gazelles, lightly worn.", // 29 chars < 40 → 0 pts
  condition: "very-good",
  hasMeasurements: true, // meas: { us: '9' }
  priceCents: 12_000,
  rrpCents: null,
  offersEnabled: false,
};

const COMPLETE_DRAFT: ListingStrengthInput = {
  photoCount: 4,
  title: "adidas Gazelle sneakers — navy suede",
  brand: "adidas",
  categoryLeaf: "sneakers",
  size: "US 9",
  colour: "blue",
  description:
    "Retro adidas Gazelles in navy suede on the gum sole. Lightly worn, clean uppers, fresh laces.",
  condition: "good",
  hasMeasurements: true,
  priceCents: 12_900,
  rrpCents: 18_000,
  offersEnabled: false,
};

describe("computeListingStrength (v3 rubric parity)", () => {
  it("suite-2 seeded draft scores exactly 75 without offers, 77 with (D19)", () => {
    const withoutOffers = computeListingStrength(SUITE2_SEEDED_DRAFT);
    expect(withoutOffers.score).toBe(75);

    const withOffers = computeListingStrength({
      ...SUITE2_SEEDED_DRAFT,
      offersEnabled: true,
    });
    expect(withOffers.score).toBe(77); // prototype-exact
  });

  it("complete draft (no RRP bonus needed) hits 100", () => {
    const { score, missing } = computeListingStrength(COMPLETE_DRAFT);
    expect(score).toBe(100);
    // rrp present ⇒ only offers missing (excluded day 1)
    expect(missing.map((m) => m.key)).toEqual(["offers"]);
  });

  it("caps at 100 even with every bonus", () => {
    const { score } = computeListingStrength({
      ...COMPLETE_DRAFT,
      offersEnabled: true,
    });
    expect(score).toBe(100);
  });

  it("empty draft scores 0 and reports all components missing", () => {
    const { score, missing, breakdown } = computeListingStrength({
      photoCount: 0,
      title: null,
      brand: null,
      categoryLeaf: null,
      size: null,
      colour: null,
      description: null,
      condition: null,
      hasMeasurements: false,
      priceCents: null,
      rrpCents: null,
    });
    expect(score).toBe(0);
    expect(Object.values(breakdown).every((points) => points === 0)).toBe(true);
    expect(missing[0]!.points).toBe(20); // photos worth the most
  });

  it("photos earn partial credit at 5 points each up to 4", () => {
    const base = { ...COMPLETE_DRAFT };
    expect(computeListingStrength({ ...base, photoCount: 1 }).breakdown.photos).toBe(5);
    expect(computeListingStrength({ ...base, photoCount: 3 }).breakdown.photos).toBe(15);
    expect(computeListingStrength({ ...base, photoCount: 9 }).breakdown.photos).toBe(20);
  });

  it("title needs 8+ chars; description needs 40+ chars", () => {
    const short = computeListingStrength({
      ...COMPLETE_DRAFT,
      title: "Shoes",
      description: "Nice shoes",
    });
    expect(short.breakdown.title).toBe(0);
    expect(short.breakdown.description).toBe(0);
  });

  it("size exemption awards size points for bags/accessories (D18)", () => {
    const bag = computeListingStrength({
      ...COMPLETE_DRAFT,
      categoryLeaf: "tote-bags",
      size: null,
      sizeExempt: true,
    });
    expect(bag.breakdown.size).toBe(10);
    expect(bag.missing.find((m) => m.key === "size")).toBeUndefined();
  });

  it("missing list is sorted by points descending", () => {
    const { missing } = computeListingStrength({
      ...COMPLETE_DRAFT,
      photoCount: 0,
      brand: null,
      priceCents: null,
    });
    const points = missing.map((m) => m.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });
});

describe("strengthBand", () => {
  it("matches the prototype thresholds", () => {
    expect(strengthBand(0)).toBe("just-started");
    expect(strengthBand(39)).toBe("just-started");
    expect(strengthBand(40)).toBe("good-start");
    expect(strengthBand(70)).toBe("strong");
    expect(strengthBand(90)).toBe("excellent");
    expect(strengthBand(100)).toBe("excellent");
  });
});
