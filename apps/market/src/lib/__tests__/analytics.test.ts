import { describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn() },
}));

import posthog from "posthog-js";
import { track } from "../analytics";

describe("track", () => {
  it("forwards the event name and props to posthog.capture", () => {
    track({
      event: "wizard.started",
      props: { channel: "bushpop", resumed: false },
    });

    expect(posthog.capture).toHaveBeenCalledWith("wizard.started", {
      channel: "bushpop",
      resumed: false,
    });
  });

  it("carries the sell-wizard step/AI/publish payload shapes through untouched", () => {
    track({
      event: "wizard.step_completed",
      props: { channel: "bushpop", step: 2, ms: 1200 },
    });
    expect(posthog.capture).toHaveBeenCalledWith("wizard.step_completed", {
      channel: "bushpop",
      step: 2,
      ms: 1200,
    });

    track({
      event: "wizard.published",
      props: {
        channel: "bushpop",
        listing_id: "listing_123",
        strength: 92,
        time_to_list_ms: 102_000,
        photo_count: 5,
        ai_used: true,
      },
    });
    expect(posthog.capture).toHaveBeenCalledWith("wizard.published", {
      channel: "bushpop",
      listing_id: "listing_123",
      strength: 92,
      time_to_list_ms: 102_000,
      photo_count: 5,
      ai_used: true,
    });
  });

  it("strips PII keys from props before forwarding to posthog", () => {
    track({
      event: "wizard.ai_draft_edited",
      // @ts-expect-error — deliberately passing a disallowed PII-shaped key to prove scrubbing
      props: { channel: "bushpop", field: "title", email: "seller@example.com" },
    });

    expect(posthog.capture).toHaveBeenCalledWith("wizard.ai_draft_edited", {
      channel: "bushpop",
      field: "title",
    });
  });
});
