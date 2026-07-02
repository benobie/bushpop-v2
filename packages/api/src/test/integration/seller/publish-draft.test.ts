import { describe, it, expect, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@bushpop/db/client";
import {
  aiGenerations,
  categories,
  channelListings,
  inventoryItems,
  inventoryItemImages,
  notifications,
} from "@bushpop/db/schema";
import { signUpTestUser, grantSellerRole } from "../../helpers/auth.js";
import { authedRequest } from "../../helpers/http.js";

vi.mock("../../../lib/r2.js", async () => {
  const { mockR2 } = await import("../../helpers/r2-mock.js");
  return mockR2();
});

const { hoistedEnqueueEmail, hoistedDispatchEvent } = vi.hoisted(() => ({
  hoistedEnqueueEmail: vi.fn().mockResolvedValue(undefined),
  hoistedDispatchEvent: vi.fn().mockResolvedValue("evt-mock-id"),
}));

vi.mock("../../../workers/email.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../workers/email.js")>();
  return { ...original, enqueueEmail: hoistedEnqueueEmail, startEmailWorker: vi.fn() };
});

vi.mock("../../../lib/events.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../lib/events.js")>();
  return { ...original, dispatchEvent: hoistedDispatchEvent };
});

async function categoryIdBySlug(slug: string): Promise<string> {
  const [row] = await db.select().from(categories).where(eq(categories.slug, slug));
  if (!row) throw new Error(`Seeded category missing: ${slug}`);
  return row.id;
}

describe("Publish + duplicate", () => {
  let sessionToken: string;
  let userId: string;

  beforeEach(async () => {
    hoistedEnqueueEmail.mockClear();
    hoistedDispatchEvent.mockClear();
    const { user, sessionToken: token } = await signUpTestUser();
    userId = user.id;
    sessionToken = token;
    // withDefaultAddress — Tier-1 activation readiness needs a ship-from address
    await grantSellerRole(userId, { withDefaultAddress: true });
  });

  /** Build a fully publishable draft via the API, returning {id, version}. */
  async function buildCompleteDraft(overrides?: { categorySlug?: string; skipSize?: boolean }) {
    const createRes = await authedRequest(sessionToken, "POST", "/api/v1/seller/drafts", {});
    const draft = createRes.json();
    const categoryId = await categoryIdBySlug(overrides?.categorySlug ?? "jeans");

    // Ready photo (direct insert — image flow tested elsewhere)
    const imageId = ulid();
    await db.insert(inventoryItemImages).values({
      id: imageId,
      inventoryItemId: draft.id,
      storageKey: `items/${draft.id}/${imageId}.jpg`,
      status: "ready",
      isPrimary: true,
    });

    let res = await authedRequest(sessionToken, "PATCH", `/api/v1/seller/drafts/${draft.id}/details`, {
      version: 1,
      title: "Levi's 501 straight leg jeans — dark indigo",
      brand: "Levi's",
      categoryId,
      ...(overrides?.skipSize ? {} : { size: "W32" }),
      colour: "navy",
      description: "Classic 501s in dark indigo. Sturdy denim, no wear at the hems.",
    });
    res = await authedRequest(sessionToken, "PATCH", `/api/v1/seller/drafts/${draft.id}/condition`, {
      version: res.json().version,
      condition: "good",
      measurements: overrides?.categorySlug === "tote-bags" ? { width: 40 } : { waist: 41, inseam: 76 },
    });
    res = await authedRequest(sessionToken, "PATCH", `/api/v1/seller/drafts/${draft.id}/price`, {
      version: res.json().version,
      askingPriceCents: 20_000,
      rrpCents: 35_000,
    });
    res = await authedRequest(sessionToken, "PATCH", `/api/v1/seller/drafts/${draft.id}/shipping`, {
      version: res.json().version,
      shippingOption: "prepaid",
      parcelSize: "medium",
    });
    return { id: draft.id as string, version: res.json().version as number };
  }

  function publish(id: string, version: number, legalAgree = true) {
    return authedRequest(sessionToken, "POST", `/api/v1/seller/drafts/${id}/publish`, {
      version,
      legalAgree,
    });
  }

  describe("the 422 missing[] gate matrix", () => {
    it("empty draft reports the full missing set", async () => {
      const createRes = await authedRequest(sessionToken, "POST", "/api/v1/seller/drafts", {});
      const draft = createRes.json();
      const res = await publish(draft.id, 1, false);
      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.error).toBe("PUBLISH_NOT_READY");
      expect(body.missing).toEqual(
        expect.arrayContaining([
          "photos", "title", "category", "size", "condition", "price", "shipping", "legal_agree",
        ]),
      );
    });

    it("reports exactly the one missing requirement", async () => {
      const { id, version } = await buildCompleteDraft({ skipSize: true });
      const res = await publish(id, version);
      expect(res.statusCode).toBe(422);
      expect(res.json().missing).toEqual(["size"]);
    });

    it("legalAgree=false alone blocks publish", async () => {
      const { id, version } = await buildCompleteDraft();
      const res = await publish(id, version, false);
      expect(res.statusCode).toBe(422);
      expect(res.json().missing).toEqual(["legal_agree"]);
    });

    it("bags are size-exempt (D18)", async () => {
      const { id, version } = await buildCompleteDraft({ categorySlug: "tote-bags", skipSize: true });
      const res = await publish(id, version);
      expect(res.statusCode).toBe(200);
    });

    it("prepaid price that cannot cover fee + label is blocked (price_too_low)", async () => {
      const { id, version } = await buildCompleteDraft();
      // $10 asking price: fee 48 + medium label 1095 > 1000
      const priceRes = await authedRequest(sessionToken, "PATCH", `/api/v1/seller/drafts/${id}/price`, {
        version,
        askingPriceCents: 1000,
      });
      const res = await publish(id, priceRes.json().version);
      expect(res.statusCode).toBe(422);
      expect(res.json().missing).toEqual(["price_too_low"]);
    });

    it("prepaid without a parcel is blocked; pickup without a parcel is fine", async () => {
      const { id, version } = await buildCompleteDraft();
      const shipRes = await authedRequest(sessionToken, "PATCH", `/api/v1/seller/drafts/${id}/shipping`, {
        version,
        parcelSize: null,
      });
      const blocked = await publish(id, shipRes.json().version);
      expect(blocked.statusCode).toBe(422);
      expect(blocked.json().missing).toEqual(["parcel"]);

      const pickupRes = await authedRequest(sessionToken, "PATCH", `/api/v1/seller/drafts/${id}/shipping`, {
        version: shipRes.json().version,
        shippingOption: "pickup",
      });
      const ok = await publish(id, pickupRes.json().version);
      expect(ok.statusCode).toBe(200);
    });
  });

  describe("successful publish", () => {
    it("creates an ACTIVE listing via the standard machinery and returns strength", async () => {
      const { id, version } = await buildCompleteDraft();
      const res = await publish(id, version);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.itemId).toBe(id);
      expect(body.handle).toMatch(/levi-s-501/);
      // photos 5 + title 10 + brand 5 + category 10 + size 10 + colour 5 +
      // description 10 + condition 10 + measurements 10 + price 10 + rrp 3 = 88
      expect(body.strength.score).toBe(88);
      expect(body.strength.version).toBe("v3");

      const [listing] = await db
        .select()
        .from(channelListings)
        .where(eq(channelListings.id, body.listingId));
      expect(listing!.status).toBe("active");
      expect(listing!.priceCents).toBe(20_000);
      expect(listing!.publishedAt).not.toBeNull();

      const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
      expect(item!.lifecycleState).toBe("for_sale");

      // Published event carries the legal-agree audit
      expect(hoistedDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "channel_listing.published",
          metadata: expect.objectContaining({ legalAgree: true, source: "sell_flow" }),
        }),
      );

      // Seller notification row created (email enqueue mocked)
      const rows = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.type, "listing_published_seller")));
      expect(rows).toHaveLength(1);
    });

    it("draft endpoints reject further edits after publish", async () => {
      const { id, version } = await buildCompleteDraft();
      await publish(id, version);
      const res = await authedRequest(sessionToken, "PATCH", `/api/v1/seller/drafts/${id}/details`, {
        version: version + 1,
        title: "Too late",
      });
      expect(res.statusCode).toBe(409);
    });

    it("409s on stale version and on double publish", async () => {
      const { id, version } = await buildCompleteDraft();
      const stale = await publish(id, version - 1);
      expect(stale.statusCode).toBe(409);

      await publish(id, version);
      const again = await publish(id, version + 1);
      expect(again.statusCode).toBe(409);
    });

    it("computes the authoritative AI kept/edited outcome at publish (D16)", async () => {
      const { id, version } = await buildCompleteDraft();
      // Completed generation whose suggestions were partially edited:
      // title differs (edited), brand differs (edited — canonical Levi's vs adidas),
      // colour kept (navy), category kept (jeans), description differs (edited)
      const generationId = ulid();
      await db.insert(aiGenerations).values({
        id: generationId,
        sellerId: userId,
        inventoryItemId: id,
        trigger: "auto",
        provider: "gemini",
        model: "gemini-2.5-flash-lite",
        promptVersion: "v1",
        status: "completed",
        resolvedOutput: {
          title: "Blue jeans",
          brand: "adidas",
          categoryLeaf: "jeans",
          colour: "navy",
          description: "Some other description entirely.",
          confidence: 0.9,
        },
      });

      await publish(id, version);

      const [generation] = await db
        .select()
        .from(aiGenerations)
        .where(eq(aiGenerations.id, generationId));
      expect(generation!.outcome).toEqual({
        kept: ["category", "colour"],
        edited: ["title", "description", "brand"],
      });
    });
  });

  describe("duplicate (D17)", () => {
    it("keeps brand/category/colour/shipping/parcel; clears the rest", async () => {
      const { id } = await buildCompleteDraft();
      const res = await authedRequest(sessionToken, "POST", `/api/v1/seller/drafts/${id}/duplicate`);
      expect(res.statusCode).toBe(201);
      const copy = res.json();

      expect(copy.id).not.toBe(id);
      expect(copy.brand).toBe("Levi's");
      expect(copy.category.slug).toBe("jeans");
      expect(copy.colour).toBe("navy");
      expect(copy.shippingOption).toBe("prepaid");
      expect(copy.parcelSize).toBe("medium");
      expect(copy.shippingClass).toBe("m");

      expect(copy.images).toEqual([]);
      expect(copy.title).toBeNull();
      expect(copy.description).toBeNull();
      expect(copy.askingPriceCents).toBeNull();
      expect(copy.rrpCents).toBeNull();
      expect(copy.measurements).toBeNull();
      expect(copy.condition).toBeNull();
      expect(copy.size).toBeNull();
      expect(copy.version).toBe(1);
      expect(copy.lifecycleState).toBe("owned");
    });

    it("works on a published item too (op-shop relist flow)", async () => {
      const { id, version } = await buildCompleteDraft();
      await publish(id, version);
      const res = await authedRequest(sessionToken, "POST", `/api/v1/seller/drafts/${id}/duplicate`);
      expect(res.statusCode).toBe(201);
      expect(res.json().lifecycleState).toBe("owned");
    });
  });
});
