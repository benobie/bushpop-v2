import { describe, expect, it } from "vitest";
import { mapToProgressionEvent } from "../../lib/progression-events.js";

describe("mapToProgressionEvent — channel_listing.status_changed", () => {
  it("maps a mark-sold transition to listing.sold", () => {
    expect(
      mapToProgressionEvent({
        eventName: "channel_listing.status_changed",
        actorId: "seller1",
        metadata: { from: "active", to: "sold" },
      }),
    ).toEqual({ eventName: "listing.sold", userId: "seller1" });
  });

  it("maps a seller delist (active → paused) to listing.removed", () => {
    expect(
      mapToProgressionEvent({
        eventName: "channel_listing.status_changed",
        actorId: "seller1",
        metadata: { from: "active", to: "paused" },
      }),
    ).toEqual({ eventName: "listing.removed", userId: "seller1" });
  });

  it("maps a relist (paused → active) to listing.relisted", () => {
    expect(
      mapToProgressionEvent({
        eventName: "channel_listing.status_changed",
        actorId: "seller1",
        metadata: { from: "paused", to: "active" },
      }),
    ).toEqual({ eventName: "listing.relisted", userId: "seller1" });
  });

  it("does not map a first-time publish (draft → active) — that's channel_listing.published's job", () => {
    expect(
      mapToProgressionEvent({
        eventName: "channel_listing.status_changed",
        actorId: "seller1",
        metadata: { from: "draft", to: "active" },
      }),
    ).toBeNull();
  });

  it("does not treat system auto-pauses as seller delists", () => {
    expect(
      mapToProgressionEvent({
        eventName: "channel_listing.status_changed",
        metadata: { from: "active", to: "paused", trigger: "lifecycle_cascade" },
      }),
    ).toBeNull();
  });
});
