import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FavButton } from "../fav-button";

const {
  postMock,
  deleteMock,
  pushMock,
  revalidateMock,
  trackMock,
} = vi.hoisted(() => ({
  postMock: vi.fn(),
  deleteMock: vi.fn(),
  pushMock: vi.fn(),
  revalidateMock: vi.fn().mockResolvedValue(undefined),
  trackMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/shop",
}));

vi.mock("@bushpop/api-client/browser", () => ({
  createBrowserApiClient: () => ({
    POST: postMock,
    DELETE: deleteMock,
  }),
}));

vi.mock("@/app/account/favourites/actions", () => ({
  revalidateFavourites: revalidateMock,
}));

vi.mock("@/lib/analytics", () => ({
  track: trackMock,
}));

vi.mock("@bushpop/ui", () => ({
  HeartIcon: () => <svg aria-hidden="true" />,
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" "),
}));

describe("FavButton", () => {
  beforeEach(() => {
    postMock.mockReset();
    deleteMock.mockReset();
    pushMock.mockReset();
    revalidateMock.mockClear();
    trackMock.mockReset();
  });

  it("resyncs with refreshed server favourited state", async () => {
    const { rerender } = render(
      <FavButton
        listingId="01JLISTING0000000000000000"
        initialFavorited={false}
        variant="inline"
      />,
    );

    expect(screen.getByRole("button", { name: "Add to favourites" })).toHaveAttribute("aria-pressed", "false");

    rerender(
      <FavButton
        listingId="01JLISTING0000000000000000"
        initialFavorited
        variant="inline"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Remove from favourites" })).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("revalidates the favourites route after a successful toggle", async () => {
    postMock.mockResolvedValue({ response: { ok: true, status: 200 } });

    render(<FavButton listingId="01JLISTING0000000000000000" />);

    fireEvent.click(screen.getByRole("button", { name: "Add to favourites" }));

    await waitFor(() => {
      expect(revalidateMock).toHaveBeenCalledTimes(1);
    });
  });
});
