import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@bushpop/db/client";
import {
  categories,
  inventoryItems,
  inventoryItemImages,
  progressionEvents,
} from "@bushpop/db/schema";
import { signUpTestUser, grantSellerRole } from "../../helpers/auth.js";
import { authedRequest } from "../../helpers/http.js";

vi.mock("../../../lib/r2.js", async () => {
  const { mockR2 } = await import("../../helpers/r2-mock.js");
  return mockR2();
});

async function categoryIdBySlug(slug: string): Promise<string> {
  const [row] = await db.select().from(categories).where(eq(categories.slug, slug));
  if (!row) throw new Error(`Seeded category missing: ${slug}`);
  return row.id;
}

describe("Seller Bulk Listing API", () => {
  let sessionToken: string;
  let userId: string;

  beforeEach(async () => {
    const { user, sessionToken: token } = await signUpTestUser();
    userId = user.id;
    sessionToken = token;
    // withDefaultAddress — publish's Tier-1 activation readiness check needs it.
    await grantSellerRole(userId, { withDefaultAddress: true });
  });

  function createBatch(label?: string) {
    return authedRequest(sessionToken, "POST", "/api/v1/seller/bulk/batches", { label });
  }

  /** Give a batch-created draft a ready photo directly (photo flow tested elsewhere). */
  async function attachReadyPhoto(itemId: string) {
    const imageId = ulid();
    await db.insert(inventoryItemImages).values({
      id: imageId,
      inventoryItemId: itemId,
      storageKey: `items/${itemId}/${imageId}.jpg`,
      status: "ready",
      isPrimary: true,
    });
  }

  /** Fill every publish-gate field on an already-created batch item via the existing PATCH steps. */
  async function completeItem(itemId: string, version: number) {
    await attachReadyPhoto(itemId);
    const categoryId = await categoryIdBySlug("jeans");
    let v = version;
    let res = await authedRequest(sessionToken, "PATCH", `/api/v1/seller/drafts/${itemId}/details`, {
      version: v,
      title: "Levi's 501 straight leg jeans — dark indigo",
      brand: "Levi's",
      categoryId,
      size: "W32",
      colour: "navy",
      description: "Classic 501s in dark indigo. Sturdy denim, no wear at the hems.",
    });
    v = res.json().version;
    res = await authedRequest(sessionToken, "PATCH", `/api/v1/seller/drafts/${itemId}/condition`, {
      version: v,
      condition: "good",
      measurements: { waist: 41, inseam: 76 },
    });
    v = res.json().version;
    res = await authedRequest(sessionToken, "PATCH", `/api/v1/seller/drafts/${itemId}/price`, {
      version: v,
      askingPriceCents: 20_000,
    });
    v = res.json().version;
    res = await authedRequest(sessionToken, "PATCH", `/api/v1/seller/drafts/${itemId}/shipping`, {
      version: v,
      shippingOption: "prepaid",
      parcelSize: "medium",
    });
    return res.json().version as number;
  }

  describe("POST /api/v1/seller/bulk/batches", () => {
    it("creates an empty batch", async () => {
      const res = await createBatch("Rack 1 — 05/07");
      expect(res.statusCode).toBe(201);
      const batch = res.json();
      expect(batch.label).toBe("Rack 1 — 05/07");
      expect(batch.itemCount).toBe(0);
      expect(batch.publishedCount).toBe(0);
    });

    it("requires the seller role", async () => {
      const { sessionToken: customerToken } = await signUpTestUser();
      const res = await authedRequest(customerToken, "POST", "/api/v1/seller/bulk/batches", {});
      expect(res.statusCode).toBe(403);
    });
  });

  describe("POST /api/v1/seller/bulk/batches/:id/drafts", () => {
    it("creates N drafts tagged to the batch", async () => {
      const batch = (await createBatch()).json();
      const res = await authedRequest(
        sessionToken,
        "POST",
        `/api/v1/seller/bulk/batches/${batch.id}/drafts`,
        { count: 3 },
      );
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.items).toHaveLength(3);
      expect(body.batch.itemCount).toBe(3);

      const rows = await db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.batchId, batch.id));
      expect(rows).toHaveLength(3);
      expect(rows.every((r) => r.ownerId === userId)).toBe(true);
    });

    it("404s for a batch owned by another seller", async () => {
      const batch = (await createBatch()).json();
      const { user: other, sessionToken: otherToken } = await signUpTestUser();
      await grantSellerRole(other.id);
      const res = await authedRequest(
        otherToken,
        "POST",
        `/api/v1/seller/bulk/batches/${batch.id}/drafts`,
        { count: 1 },
      );
      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /api/v1/seller/bulk/batches/:id", () => {
    it("returns the batch with all its items", async () => {
      const batch = (await createBatch()).json();
      await authedRequest(sessionToken, "POST", `/api/v1/seller/bulk/batches/${batch.id}/drafts`, {
        count: 2,
      });
      const res = await authedRequest(sessionToken, "GET", `/api/v1/seller/bulk/batches/${batch.id}`);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.items).toHaveLength(2);
      expect(body.items[0].strength.score).toBe(0);
    });
  });

  describe("POST /api/v1/seller/bulk/batches/:id/publish", () => {
    it("publishes ready items and reports the rest as failed — no all-or-nothing", async () => {
      const batch = (await createBatch()).json();
      const draftsRes = await authedRequest(
        sessionToken,
        "POST",
        `/api/v1/seller/bulk/batches/${batch.id}/drafts`,
        { count: 2 },
      );
      const [itemA, itemB] = draftsRes.json().items as [
        { id: string; version: number },
        { id: string; version: number },
      ];

      // itemA: fully complete. itemB: missing price (left as-is).
      const versionA = await completeItem(itemA.id, itemA.version);

      const res = await authedRequest(
        sessionToken,
        "POST",
        `/api/v1/seller/bulk/batches/${batch.id}/publish`,
        { legalAgree: true },
      );
      expect(res.statusCode).toBe(200);
      const body = res.json();

      expect(body.published).toHaveLength(1);
      expect(body.published[0].itemId).toBe(itemA.id);
      expect(body.published[0].handle).toBeTruthy();

      expect(body.failed).toHaveLength(1);
      expect(body.failed[0].itemId).toBe(itemB.id);
      expect(body.failed[0].missing).toEqual(
        expect.arrayContaining(["photos", "title", "category", "size", "condition", "price", "shipping"]),
      );

      // Phase A retention-engine event capture (docs/BRIEF-retention-engine.md §4):
      // exactly one listing.published progression event, for the published item only.
      const events = await db
        .select()
        .from(progressionEvents)
        .where(eq(progressionEvents.eventName, "listing.published"));
      expect(events).toHaveLength(1);
      expect(events[0]!.userId).toBe(userId);
      expect(events[0]!.entityId).not.toBe(itemB.id);
      void versionA;
    });

    it("retries a stranded for_sale item with no active listing yet (cross-model review finding)", async () => {
      // publishDraft() treats for_sale-with-no-active-listing as resumable
      // (a prior publish flipped the lifecycle then failed downstream —
      // its own rollback is best-effort). A batch retry query that only
      // looked at "owned" items would silently strand these forever.
      const batch = (await createBatch()).json();
      const draftsRes = await authedRequest(
        sessionToken,
        "POST",
        `/api/v1/seller/bulk/batches/${batch.id}/drafts`,
        { count: 1 },
      );
      const [item] = draftsRes.json().items as [{ id: string; version: number }];
      await completeItem(item.id, item.version);

      // Simulate the stranded state directly — no channel_listings row exists.
      await db.update(inventoryItems).set({ lifecycleState: "for_sale" }).where(eq(inventoryItems.id, item.id));

      const res = await authedRequest(
        sessionToken,
        "POST",
        `/api/v1/seller/bulk/batches/${batch.id}/publish`,
        { legalAgree: true },
      );
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.published).toHaveLength(1);
      expect(body.published[0].itemId).toBe(item.id);
    });
  });

  describe("GET /api/v1/seller/bulk/batches/:id/export.csv", () => {
    it("exports a CSV with the listing handle for published items", async () => {
      const batch = (await createBatch()).json();
      const draftsRes = await authedRequest(
        sessionToken,
        "POST",
        `/api/v1/seller/bulk/batches/${batch.id}/drafts`,
        { count: 1 },
      );
      const [item] = draftsRes.json().items as [{ id: string; version: number }];
      await completeItem(item.id, item.version);
      await authedRequest(sessionToken, "POST", `/api/v1/seller/bulk/batches/${batch.id}/publish`, {
        legalAgree: true,
      });

      const res = await authedRequest(
        sessionToken,
        "GET",
        `/api/v1/seller/bulk/batches/${batch.id}/export.csv`,
      );
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
      const lines = res.body.trim().split("\n");
      expect(lines[0]).toBe(
        "itemId,listingId,handle,status,title,brand,category,size,colour,condition,priceCents,description,primaryImageUrl",
      );
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain(item.id);
      expect(lines[1]).toContain("active");
    });
  });
});
