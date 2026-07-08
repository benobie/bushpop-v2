import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FavouritesGrid } from "../favourites-grid";

const { deleteMock, revalidateMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  revalidateMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@bushpop/api-client/browser", () => ({
  createBrowserApiClient: () => ({
    DELETE: deleteMock,
  }),
}));

vi.mock("../actions", () => ({
  revalidateFavourites: revalidateMock,
}));

vi.mock("@bushpop/ui", () => ({
  Pcard: ({ title, onFavoriteToggle }: { title: string; onFavoriteToggle: (next: boolean) => void }) => (
    <button type="button" onClick={() => onFavoriteToggle(false)}>
      {title}
    </button>
  ),
}));

describe("FavouritesGrid", () => {
  beforeEach(() => {
    deleteMock.mockReset();
    revalidateMock.mockClear();
  });

  it("revalidates /account/favourites after a successful unfavourite", async () => {
    deleteMock.mockResolvedValue({ response: { ok: true, status: 204 } });

    render(
      <FavouritesGrid
        items={[
          {
            id: "01JWISHLIST000000000000000",
            listingId: "01JLISTING0000000000000000",
            listingHandle: "vintage-shirt",
            title: "Vintage shirt",
            priceCents: 4500,
            currency: "AUD",
            primaryImageUrl: "https://example.com/shirt.jpg",
            sellerName: "Bushpop Seller",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Vintage shirt" }));

    await waitFor(() => {
      expect(revalidateMock).toHaveBeenCalledTimes(1);
    });
  });
});
