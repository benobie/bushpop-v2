import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SaveSearchButton } from "../save-search-button";

const { postMock, trackMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  trackMock: vi.fn(),
}));

let currentParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => currentParams.get(key),
  }),
}));

vi.mock("@bushpop/api-client/browser", () => ({
  createBrowserApiClient: () => ({
    POST: postMock,
  }),
}));

vi.mock("@/lib/analytics", () => ({
  track: trackMock,
}));

vi.mock("@bushpop/ui", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

describe("SaveSearchButton", () => {
  beforeEach(() => {
    currentParams = new URLSearchParams("brand=Nike");
    postMock.mockReset();
    trackMock.mockReset();
  });

  it("returns to idle when the saveable criteria change", async () => {
    postMock.mockResolvedValue({ response: { ok: true, status: 201 } });

    const { rerender } = render(<SaveSearchButton />);

    fireEvent.click(screen.getByRole("button", { name: "Save this search" }));

    await screen.findByText(/Search saved/i);

    currentParams = new URLSearchParams("brand=Adidas");
    rerender(<SaveSearchButton />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save this search" })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Search saved/i)).not.toBeInTheDocument();
  });
});
