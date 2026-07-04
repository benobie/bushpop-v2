import {
  computeListingStrength,
  type ListingStrengthInput,
} from "@bushpop/config";
import { describe, expect, it } from "vitest";

const resumeDraftFixture: ListingStrengthInput = {
  photoCount: 1,
  title: "adidas Gazelle sneakers — navy suede",
  brand: "adidas",
  categoryLeaf: "Sneakers",
  size: "US 9",
  sizeExempt: false,
  colour: "Blue",
  description: "Retro Gazelles, lightly worn.",
  condition: "Very good",
  hasMeasurements: true,
  priceCents: 12_000,
  rrpCents: null,
  offersEnabled: false,
};

const completeDraftFixture: ListingStrengthInput = {
  photoCount: 4,
  title: "The North Face Nuptse puffer jacket — black",
  brand: "The North Face",
  categoryLeaf: "Outerwear",
  size: "M",
  sizeExempt: false,
  colour: "Black",
  description:
    "Iconic North Face Nuptse puffer in black. 700-fill down, boxy relaxed fit, full zip with the embroidered logo at the chest and back hem. Warm, light and endlessly wearable. Pre-loved in excellent nick — no rips, stains or flat baffles. Laid-flat measurements below. Smoke-free home.",
  condition: "Excellent",
  hasMeasurements: true,
  priceCents: 20_000,
  rrpCents: 35_000,
  offersEnabled: false,
};

describe("computeListingStrength prototype parity", () => {
  describe("suite-2 resume draft fixture", () => {
    it("scores 75 with the shared day-1 rubric", () => {
      const result = computeListingStrength(resumeDraftFixture);

      // D19 disables the prototype's +2 offers bonus on day 1, so the saved
      // draft that scored 77 in jsdom parity checks must score 75 here.
      expect(result.score).toBe(75);
      expect(result.breakdown).toMatchObject({
        photos: 5,
        title: 10,
        brand: 5,
        category: 10,
        size: 10,
        colour: 5,
        description: 0,
        condition: 10,
        measurements: 10,
        price: 10,
        rrp: 0,
        offers: 0,
      });
      expect(result.missing.map(({ key }) => key)).toEqual([
        "photos",
        "description",
        "rrp",
        "offers",
      ]);
    });
  });

  describe("suite-1 complete fixture", () => {
    it("caps at 100 without the offers bonus", () => {
      const result = computeListingStrength(completeDraftFixture);

      expect(result.score).toBe(100);
      expect(result.breakdown.photos).toBe(20);
      expect(result.breakdown.offers).toBe(0);
      expect(result.breakdown.rrp).toBe(3);
      expect(result.missing).toEqual([
        {
          key: "offers",
          label: "Switch on offers",
          step: 3,
          points: 2,
        },
      ]);
    });
  });
});
