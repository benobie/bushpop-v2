import { describe, it, expect } from "vitest";
import { redactUrl } from "../posthog-provider";

// The guest order-access token lives in the URL of the page a guest opens from
// their email. Without this, every guest pageview (and every autocaptured click
// on that page) ships a live 30-day capability token to a third-party analytics
// vendor.

describe("redactUrl", () => {
  it("redacts the guest order-access token", () => {
    expect(redactUrl("/orders/01ABC/guest?token=eyJhbGciOi.secret.sig")).toBe(
      "/orders/01ABC/guest?token=redacted",
    );
  });

  it("preserves non-sensitive query parameters alongside a redacted one", () => {
    const out = redactUrl("/shop?size=M&token=abc123&colour=black");
    expect(out).toContain("size=M");
    expect(out).toContain("colour=black");
    expect(out).toContain("token=redacted");
    expect(out).not.toContain("abc123");
  });

  it("leaves URLs without sensitive parameters byte-identical", () => {
    expect(redactUrl("/shop?size=M&colour=black")).toBe("/shop?size=M&colour=black");
    expect(redactUrl("/shop")).toBe("/shop");
  });

  it("redacts every sensitive key, not just the first", () => {
    const out = redactUrl("/x?token=a&code=b&signature=c");
    expect(out).not.toMatch(/=a|=b|=c/);
    expect(out).toBe("/x?token=redacted&code=redacted&signature=redacted");
  });

  it("handles absolute URLs and preserves the hash", () => {
    expect(redactUrl("https://market.bushpop.xyz/orders/1/guest?token=abc#top")).toBe(
      "https://market.bushpop.xyz/orders/1/guest?token=redacted#top",
    );
  });

  it("does not treat a path segment named 'token' as a query parameter", () => {
    expect(redactUrl("/docs/token")).toBe("/docs/token");
  });
});
