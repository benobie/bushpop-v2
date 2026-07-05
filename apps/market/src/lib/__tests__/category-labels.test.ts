import { describe, expect, it } from "vitest";
import { categoryLabel } from "../category-labels";

describe("categoryLabel", () => {
  it("uses the canonical @bushpop/config label for top-level garment types", () => {
    expect(categoryLabel("footwear")).toBe("Footwear");
    expect(categoryLabel("outerwear")).toBe("Outerwear");
  });

  it("title-cases leaf slugs not present in GARMENT_TYPE_LABELS", () => {
    expect(categoryLabel("midi-dresses")).toBe("Midi Dresses");
    expect(categoryLabel("t-shirts")).toBe("T Shirts");
    expect(categoryLabel("jewellery")).toBe("Jewellery");
  });
});
