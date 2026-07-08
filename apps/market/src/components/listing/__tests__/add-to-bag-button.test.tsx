import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddToBagButton } from "../add-to-bag-button";

const { postMock, anonymousMock, trackMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  anonymousMock: vi.fn(),
  trackMock: vi.fn(),
}));

vi.mock("@bushpop/api-client/browser", () => ({
  createBrowserApiClient: () => ({
    POST: postMock,
  }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      anonymous: anonymousMock,
    },
  },
}));

vi.mock("@/lib/analytics", () => ({
  track: trackMock,
}));

describe("AddToBagButton", () => {
  beforeEach(() => {
    postMock.mockReset();
    anonymousMock.mockReset();
    trackMock.mockReset();
  });

  it("single-flights anonymous bootstrap across concurrent first-time guest adds", async () => {
    let resolveAnonymous!: (value: { error: null }) => void;
    anonymousMock.mockReturnValue(
      new Promise((resolve: (value: { error: null }) => void) => {
        resolveAnonymous = resolve;
      }),
    );

    const responses = [
      { response: { status: 401 }, error: null },
      { response: { status: 401 }, error: null },
      { response: { status: 200 }, error: null },
      { response: { status: 200 }, error: null },
    ];
    postMock.mockImplementation(async () => responses.shift());

    render(
      <>
        <AddToBagButton listingId="listing-1" priceCents={1000} />
        <AddToBagButton listingId="listing-2" priceCents={2000} />
      </>,
    );

    const [firstButton, secondButton] = screen.getAllByRole("button", { name: "Add to bag" });
    fireEvent.click(firstButton);
    fireEvent.click(secondButton);

    await waitFor(() => {
      expect(anonymousMock).toHaveBeenCalledTimes(1);
    });

    resolveAnonymous({ error: null });

    await waitFor(() => {
      expect(screen.getAllByText("Added to bag!")).toHaveLength(2);
    });

    expect(postMock).toHaveBeenCalledTimes(4);
  });
});
