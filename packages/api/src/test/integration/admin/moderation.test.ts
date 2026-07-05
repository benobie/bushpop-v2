import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { channelListings, listingReports, userRoles } from "@bushpop/db/schema";
import { signUpTestUser, grantSellerRole } from "../../helpers/auth.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";
import { authedRequest } from "../../helpers/http.js";

// MODERATION_QUEUE_ENABLED must be "true" BEFORE the first getTestApp() call
// in this file (helpers/http.ts caches one Fastify instance per test-file
// module registry) so the internal flag-intake route is registered for every
// request this file makes. moderation-gate.test.ts locks the off-by-default
// registration behaviour itself.
const FLAG = "MODERATION_QUEUE_ENABLED";
const originalFlag = process.env[FLAG];

beforeAll(() => {
  process.env[FLAG] = "true";
});

afterAll(() => {
  if (originalFlag === undefined) {
    delete process.env[FLAG];
  } else {
    process.env[FLAG] = originalFlag;
  }
});

const { dispatchEventMock } = vi.hoisted(() => ({
  dispatchEventMock: vi.fn().mockResolvedValue("evt-moderation-test"),
}));

vi.mock("../../../lib/events.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../lib/events.js")>();
  return {
    ...original,
    dispatchEvent: dispatchEventMock,
  };
});

async function setupModerationFixture() {
  const seller = await signUpTestUser();
  const admin = await signUpTestUser();

  await grantSellerRole(seller.user.id);
  await db.insert(userRoles).values({ userId: admin.user.id, role: "admin" });

  const listing = await createActiveTestListing(seller.user.id);

  return { admin, listing, seller };
}

async function flagListing(
  sessionToken: string,
  channelListingId: string,
  body?: { reason?: string; description?: string },
) {
  return authedRequest(sessionToken, "POST", "/api/v1/admin/moderation/flags", {
    channelListingId,
    reason: body?.reason ?? "counterfeit",
    description: body?.description ?? "Flagged during a routine admin sweep.",
  });
}

async function updateReportStatus(
  sessionToken: string,
  reportId: string,
  status: "reviewed" | "actioned" | "dismissed",
) {
  return authedRequest(sessionToken, "PATCH", `/api/v1/admin/reports/${reportId}`, { status });
}

describe("admin manual listing flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a pending report with 201 and dispatches listing.flagged", async () => {
    const { admin, listing } = await setupModerationFixture();

    const res = await flagListing(admin.sessionToken, listing.id);

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe("pending");

    const [report] = await db.select().from(listingReports).where(eq(listingReports.id, body.id));
    expect(report).toMatchObject({
      channelListingId: listing.id,
      reporterId: admin.user.id,
      reason: "counterfeit",
      status: "pending",
    });

    expect(dispatchEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "listing.flagged",
        entityId: listing.id,
        channelId: listing.channelId,
        metadata: expect.objectContaining({ reportId: body.id, source: "admin_manual" }),
      }),
    );
  });

  it("requires admin role — non-admin gets 403", async () => {
    const seller = await signUpTestUser();
    await grantSellerRole(seller.user.id);
    const listing = await createActiveTestListing(seller.user.id);

    const res = await flagListing(seller.sessionToken, listing.id);
    expect(res.statusCode).toBe(403);
  });

  it("404s for a non-existent listing", async () => {
    const { admin } = await setupModerationFixture();
    // Low-entropy placeholder (not a real ULID) — avoids tripping gitleaks'
    // generic-api-key heuristic on a realistic-looking 26-char token.
    const res = await flagListing(admin.sessionToken, "0".repeat(26));
    expect(res.statusCode).toBe(404);
  });

  it("rejects a duplicate active flag from the same admin with 409", async () => {
    const { admin, listing } = await setupModerationFixture();

    const first = await flagListing(admin.sessionToken, listing.id);
    const second = await flagListing(admin.sessionToken, listing.id);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
  });

  it("flows through the existing admin review queue: flag -> review -> takedown hides the listing", async () => {
    const { admin, listing } = await setupModerationFixture();

    const created = await flagListing(admin.sessionToken, listing.id);
    const reportId = created.json().id as string;

    expect((await updateReportStatus(admin.sessionToken, reportId, "reviewed")).statusCode).toBe(200);
    const actioned = await updateReportStatus(admin.sessionToken, reportId, "actioned");
    expect(actioned.statusCode).toBe(200);
    expect(actioned.json()).toMatchObject({
      listingTitle: expect.any(String),
      reporterEmail: admin.user.email,
      status: "actioned",
    });

    const [listingRow] = await db
      .select({ hiddenAt: channelListings.hiddenAt })
      .from(channelListings)
      .where(eq(channelListings.id, listing.id));

    expect(listingRow?.hiddenAt).not.toBeNull();
  });
});
