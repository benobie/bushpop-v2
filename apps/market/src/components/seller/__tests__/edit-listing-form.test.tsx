import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditListingForm } from "../edit-listing-form";

const { patchMock, refreshMock, trackMock } = vi.hoisted(() => ({
  patchMock: vi.fn(),
  refreshMock: vi.fn(),
  trackMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/lib/analytics", () => ({
  track: trackMock,
}));

vi.mock("@bushpop/api-client/browser", () => ({
  createBrowserApiClient: () => ({
    PATCH: patchMock,
  }),
}));

describe("EditListingForm", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    patchMock.mockReset();
    refreshMock.mockReset();
    trackMock.mockReset();
  });

  it("retries after an inventory-only failure with the refreshed listing version", async () => {
    patchMock
      .mockResolvedValueOnce({ data: { version: 2 } })
      .mockResolvedValueOnce({
        error: {
          message: "Listing details saved, but item attributes (condition/size/colour/brand) failed to save — try again.",
        },
      })
      .mockResolvedValueOnce({ data: { version: 3 } })
      .mockResolvedValueOnce({ data: { version: 8 } });

    render(
      <EditListingForm
        listingId="01JLISTING0000000000000000"
        inventoryItemId="01JINVENTORY0000000000000"
        title="Vintage shirt"
        description="Soft cotton"
        priceCents={4500}
        version={1}
        condition="good"
        size="M"
        colour="Blue"
        brand="Bushpop"
        inventoryVersion={7}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(
        screen.getByText("Listing details saved, but item attributes (condition/size/colour/brand) failed to save — try again."),
      ).toBeInTheDocument();
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(2);
    });

    const listingVersions = patchMock.mock.calls
      .filter(([pathname]) => pathname === "/api/v1/seller/listings/{id}")
      .map(([, options]) => (options as { body: { version: number } }).body.version);

    expect(listingVersions).toEqual([1, 2]);
    expect(trackMock).toHaveBeenCalledWith({
      event: "listing.edited",
      props: { channel: "bushpop", listing_id: "01JLISTING0000000000000000" },
    });
  });
});
