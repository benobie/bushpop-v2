/// <reference types="vitest/globals" />

import { render, screen } from "@testing-library/react";

function SmokeComponent() {
  return <p>Test tooling is wired up.</p>;
}

describe("test tooling smoke test", () => {
  it("renders in jsdom with RTL matchers", () => {
    render(<SmokeComponent />);

    expect(screen.getByText("Test tooling is wired up.")).toBeInTheDocument();
  });
});
