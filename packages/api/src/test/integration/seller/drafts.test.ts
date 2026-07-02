import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { categories, channels, channelListings, inventoryItemImages } from "@bushpop/db/schema";
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

describe("Seller Drafts API", () => {
  let sessionToken: string;
  let userId: string;

  beforeEach(async () => {
    const { user, sessionToken: token } = await signUpTestUser();
    userId = user.id;
    sessionToken = token;
    await grantSellerRole(userId);
  });

  async function createDraft() {
    const res = await authedRequest(sessionToken, "POST", "/api/v1/seller/drafts", {});
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  describe("POST /api/v1/seller/drafts", () => {
    it("creates an empty draft scoring 0 with the default template", async () => {
      const draft = await createDraft();
      expect(draft.version).toBe(1);
      expect(draft.lifecycleState).toBe("owned");
      expect(draft.strength.score).toBe(0);
      expect(draft.strength.band).toBe("just-started");
      expect(draft.strength.version).toBe("v3");
      expect(draft.measurementTemplate.key).toBe("default");
      expect(draft.images).toEqual([]);
      // photos are the biggest missing item on an empty draft
      expect(draft.strength.missing[0].key).toBe("photos");
      expect(draft.strength.missing[0].points).toBe(20);
    });

    it("requires the seller role", async () => {
      const { sessionToken: customerToken } = await signUpTestUser();
      const res = await authedRequest(customerToken, "POST", "/api/v1/seller/drafts", {});
      expect(res.statusCode).toBe(403);
    });
  });

  describe("PATCH /details", () => {
    it("updates fields, resolves the category and recomputes strength", async () => {
      const draft = await createDraft();
      const jeansId = await categoryIdBySlug("jeans");

      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/drafts/${draft.id}/details`,
        {
          version: 1,
          title: "Levi's 501 straight leg jeans — dark indigo",
          brand: "Levi's",
          categoryId: jeansId,
          size: "W32",
          colour: "navy",
          description:
            "Classic 501s in dark indigo. Sturdy denim, no wear at the hems, all buttons intact.",
        },
      );
      expect(res.statusCode).toBe(200);
      const updated = res.json();
      expect(updated.version).toBe(2);
      expect(updated.category.slug).toBe("jeans");
      expect(updated.category.parentSlug).toBe("bottoms");
      expect(updated.measurementTemplate.key).toBe("bottoms");
      expect(updated.measurementTemplate.keys).toContain("inseam");
      // title 10 + brand 5 + category 10 + size 10 + colour 5 + description 10 = 50
      expect(updated.strength.score).toBe(50);
    });

    it("rejects a parent category (must be a leaf)", async () => {
      const draft = await createDraft();
      const topsId = await categoryIdBySlug("tops");
      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/drafts/${draft.id}/details`,
        { version: 1, categoryId: topsId },
      );
      expect(res.statusCode).toBe(422);
      expect(res.json().message).toMatch(/leaf category/i);
    });

    it("rejects colours outside the taxonomy enum", async () => {
      const draft = await createDraft();
      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/drafts/${draft.id}/details`,
        { version: 1, colour: "chartreuse" },
      );
      expect(res.statusCode).toBe(400);
    });

    it("409s on a stale version", async () => {
      const draft = await createDraft();
      await authedRequest(sessionToken, "PATCH", `/api/v1/seller/drafts/${draft.id}/details`, {
        version: 1,
        title: "First write",
      });
      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/drafts/${draft.id}/details`,
        { version: 1, title: "Stale write" },
      );
      expect(res.statusCode).toBe(409);
    });

    it("is invisible to other sellers", async () => {
      const draft = await createDraft();
      const { user: other, sessionToken: otherToken } = await signUpTestUser();
      await grantSellerRole(other.id);
      const res = await authedRequest(
        otherToken,
        "PATCH",
        `/api/v1/seller/drafts/${draft.id}/details`,
        { version: 1, title: "Not mine" },
      );
      expect(res.statusCode).toBe(404);
    });
  });

  describe("PATCH /condition", () => {
    it("accepts measurements matching the leaf template", async () => {
      const draft = await createDraft();
      const jeansId = await categoryIdBySlug("jeans");
      await authedRequest(sessionToken, "PATCH", `/api/v1/seller/drafts/${draft.id}/details`, {
        version: 1,
        categoryId: jeansId,
      });

      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/drafts/${draft.id}/condition`,
        {
          version: 2,
          condition: "good",
          measurements: { waist: 41, hip: 52, rise: 27, inseam: 76 },
        },
      );
      expect(res.statusCode).toBe(200);
      const updated = res.json();
      expect(updated.measurements).toEqual({ waist: 41, hip: 52, rise: 27, inseam: 76 });
      expect(updated.strength.breakdown.measurements).toBe(10);
      expect(updated.strength.breakdown.condition).toBe(10);
    });

    it("rejects measurement keys outside the leaf template", async () => {
      const draft = await createDraft();
      const jeansId = await categoryIdBySlug("jeans");
      await authedRequest(sessionToken, "PATCH", `/api/v1/seller/drafts/${draft.id}/details`, {
        version: 1,
        categoryId: jeansId,
      });

      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/drafts/${draft.id}/condition`,
        { version: 2, measurements: { chest: 55 } }, // chest is a top key, not bottoms
      );
      expect(res.statusCode).toBe(422);
      expect(res.json().message).toMatch(/bottoms/);
    });

    it("rejects keys outside the vocabulary entirely", async () => {
      const draft = await createDraft();
      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/drafts/${draft.id}/condition`,
        { version: 1, measurements: { girth: 55 } },
      );
      expect(res.statusCode).toBe(400); // zod vocabulary gate
    });
  });

  describe("PATCH /price and /shipping", () => {
    it("stores prices and derives the shipping class from the parcel", async () => {
      const draft = await createDraft();

      const priceRes = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/drafts/${draft.id}/price`,
        { version: 1, askingPriceCents: 20_000, rrpCents: 35_000 },
      );
      expect(priceRes.statusCode).toBe(200);
      expect(priceRes.json().strength.breakdown.price).toBe(10);
      expect(priceRes.json().strength.breakdown.rrp).toBe(3);

      const shipRes = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/drafts/${draft.id}/shipping`,
        { version: 2, shippingOption: "prepaid", parcelSize: "medium" },
      );
      expect(shipRes.statusCode).toBe(200);
      const updated = shipRes.json();
      expect(updated.shippingOption).toBe("prepaid");
      expect(updated.parcelSize).toBe("medium");
      expect(updated.shippingClass).toBe("m");
    });

    it("rejects a zero price (CHECK-aligned)", async () => {
      const draft = await createDraft();
      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/drafts/${draft.id}/price`,
        { version: 1, askingPriceCents: 0 },
      );
      expect(res.statusCode).toBe(400);
    });
  });

  describe("size exemption (D18)", () => {
    it("bag drafts get size points without a size", async () => {
      const draft = await createDraft();
      const toteId = await categoryIdBySlug("tote-bags");
      const res = await authedRequest(
        sessionToken,
        "PATCH",
        `/api/v1/seller/drafts/${draft.id}/details`,
        { version: 1, categoryId: toteId },
      );
      expect(res.statusCode).toBe(200);
      const updated = res.json();
      expect(updated.measurementTemplate.key).toBe("bag");
      expect(updated.measurementTemplate.sizeExempt).toBe(true);
      expect(updated.strength.breakdown.size).toBe(10);
    });
  });

  describe("GET /api/v1/seller/drafts", () => {
    it("lists open drafts newest-first and excludes published items", async () => {
      const draftA = await createDraft();
      const draftB = await createDraft();

      // Simulate a published item: give draftA a channel listing
      const [channel] = await db.select({ id: channels.id }).from(channels).limit(1);
      await db.insert(channelListings).values({
        channelId: channel!.id,
        inventoryItemId: draftA.id,
        title: "Published item",
        priceCents: 1000,
        handle: `published-${draftA.id.toLowerCase()}`,
        status: "active",
      });

      const res = await authedRequest(sessionToken, "GET", "/api/v1/seller/drafts");
      expect(res.statusCode).toBe(200);
      const { drafts } = res.json();
      const ids = drafts.map((d: { id: string }) => d.id);
      expect(ids).toContain(draftB.id);
      expect(ids).not.toContain(draftA.id);
    });
  });

  describe("image aliases", () => {
    it("presigns and confirms through the drafts routes", async () => {
      const draft = await createDraft();

      const presignRes = await authedRequest(
        sessionToken,
        "POST",
        `/api/v1/seller/drafts/${draft.id}/images/upload-url`,
        { contentType: "image/jpeg" },
      );
      expect(presignRes.statusCode).toBe(200);
      const { uploadUrl, imageId } = presignRes.json();
      expect(uploadUrl).toContain("presigned-put-url");

      const confirmRes = await authedRequest(
        sessionToken,
        "POST",
        `/api/v1/seller/drafts/${draft.id}/images/${imageId}/confirm`,
        { position: 0, isPrimary: true },
      );
      expect(confirmRes.statusCode).toBe(200);
      expect(confirmRes.json().status).toBe("ready");

      // Ready photo now counts toward strength
      const getRes = await authedRequest(
        sessionToken,
        "GET",
        `/api/v1/seller/drafts/${draft.id}`,
      );
      expect(getRes.json().strength.breakdown.photos).toBe(5);
      expect(getRes.json().images[0].thumbUrl).toContain("thumb-320");

      // DB row is ready
      const [img] = await db
        .select()
        .from(inventoryItemImages)
        .where(eq(inventoryItemImages.id, imageId));
      expect(img!.status).toBe("ready");
    });
  });
});
