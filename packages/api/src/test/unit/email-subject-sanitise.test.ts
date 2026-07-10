import { describe, it, expect } from "vitest";
import { sanitiseSubject, listingPublishedSellerTemplate } from "../../lib/email/templates.js";

describe("sanitiseSubject", () => {
  it("strips CR, LF and NUL", () => {
    expect(sanitiseSubject("Subject\r\nBcc: victim@example.com")).toBe(
      "Subject Bcc: victim@example.com",
    );
    expect(sanitiseSubject("a\0b")).toBe("a b");
  });

  it("leaves an ordinary subject untouched", () => {
    expect(sanitiseSubject("Your listing is live on Bushpop — Blue Denim Jacket")).toBe(
      "Your listing is live on Bushpop — Blue Denim Jacket",
    );
  });

  it("collapses the whitespace a strip leaves behind", () => {
    expect(sanitiseSubject("a\n\n\nb")).toBe("a b");
  });
});

describe("listingPublishedSellerTemplate", () => {
  it("cannot be made to emit a multiline subject via the listing title", () => {
    const { subject } = listingPublishedSellerTemplate({
      listingTitle: "Nice Jacket\r\nBcc: victim@example.com",
      handle: "nice-jacket-abc123",
      listingUrl: null,
      strengthScore: null,
      channelName: "Bushpop",
    });

    expect(subject).not.toMatch(/[\r\n\0]/);
    expect(subject).toContain("Bcc: victim@example.com"); // inert, on one line
  });

  it("leaves the plain-text body's newlines alone", () => {
    const { text } = listingPublishedSellerTemplate({
      listingTitle: "Nice Jacket",
      handle: "nice-jacket-abc123",
      listingUrl: null,
      strengthScore: null,
      channelName: "Bushpop",
    });

    expect(text).toContain("\n");
  });
});
