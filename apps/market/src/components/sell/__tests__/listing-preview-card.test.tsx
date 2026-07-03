// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListingPreviewCard } from "../listing-preview-card";

describe("ListingPreviewCard", () => {
  it("renders placeholders for an empty draft and savings details for a populated draft", () => {
    const { container, rerender } = render(<ListingPreviewCard />);

    expect(screen.getByText("Your item title")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Size")).toBeInTheDocument();
    expect(screen.getByText("Condition")).toBeInTheDocument();
    expect(screen.getByText("Brand")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText(/SAVE /)).not.toBeInTheDocument();

    rerender(
      <ListingPreviewCard
        title="Arc'teryx Beta AR Shell"
        priceCents={18525}
        rrpCents={24000}
        coverImageUrl="https://example.com/beta-ar.jpg"
        brand="Arc'teryx"
        size="M"
        condition="Excellent"
      />,
    );

    expect(screen.getByText("Arc'teryx Beta AR Shell")).toBeInTheDocument();
    expect(screen.getByText("SAVE $54.75")).toBeInTheDocument();
    expect(screen.getByText("RRP: $240.00")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Arc'teryx Beta AR Shell" })).toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("Excellent")).toBeInTheDocument();
    expect(screen.getByText("Arc'teryx")).toBeInTheDocument();

    const price = container.querySelector(".listing-preview-card__price");
    expect(price).not.toBeNull();
    expect(
      price?.querySelector(".listing-preview-card__price-main"),
    ).toHaveTextContent("$185");
    expect(price?.querySelector(".listing-preview-card__price-cents")).toHaveTextContent("25");
  });
});
