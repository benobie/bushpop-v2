import { and, desc, eq } from "drizzle-orm";
import {
  calcFeeCents,
  computeListingStrength,
  FLAT_RATE_SHIPPING_CENTS,
  isSizeExempt,
  LISTING_STRENGTH_VERSION,
  PARCELS,
  strengthBand,
  type ParcelSize,
} from "@bushpop/config";
import { db } from "@bushpop/db/client";
import { aiGenerations, channelListings, inventoryItems } from "@bushpop/db/schema";
import {
  ConflictError,
  NotFoundError,
  PublishNotReadyError,
} from "../../../../lib/errors.js";
import { dispatchEvent } from "../../../../lib/events.js";
import { sendNotification } from "../../../../lib/notification-service.js";
import {
  buildStrengthInput,
  resolveCategoryInfo,
  type CategoryInfo,
} from "../../../../lib/strength-input.js";
import { assertListingActivationReady } from "../../../../lib/seller-readiness.js";
import {
  createListing,
  transitionListingStatus,
} from "../listings/service.js";
import { getDraft } from "./service.js";
import type { ResolvedDraft } from "../../../../lib/ai/resolve.js";

/**
 * Publish + duplicate (Phase 1 task 8, D7/D16/D17).
 *
 * Publish is a THIN graduation of the draft row: gate → strength →
 * lifecycle 'for_sale' → existing createListing() + transitionListingStatus
 * ("active") — so handle generation, activation guards, search-sync and
 * score fan-out (via events) all fire exactly as they do for any listing.
 * The gate is server-side; the wizard checklist mirrors it but can never
 * bypass it.
 */

type InventoryItemRow = typeof inventoryItems.$inferSelect;

async function findOwnedDraftItem(id: string, ownerId: string): Promise<InventoryItemRow> {
  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.id, id));
  if (!item || item.ownerId !== ownerId || item.lifecycleState === "archived") {
    throw new NotFoundError("Draft not found");
  }
  return item;
}

/**
 * The publish gate. Returns the machine-readable missing[] keys the wizard
 * maps to checklist rows / step jumps. Bags & accessories are size-exempt
 * (D18).
 */
export function publishGateMissing(
  item: InventoryItemRow,
  readyImageCount: number,
  category: CategoryInfo | null,
  legalAgree: boolean,
): string[] {
  const missing: string[] = [];

  if (readyImageCount < 1) missing.push("photos");
  if (!item.title?.trim()) missing.push("title");
  if (!category) missing.push("category");
  const sizeExempt = category ? isSizeExempt(category.garmentSlug) : false;
  if (!sizeExempt && !item.size?.trim()) missing.push("size");
  if (!item.condition?.trim()) missing.push("condition");
  if (!item.askingPriceCents || item.askingPriceCents <= 0) missing.push("price");
  if (!item.shippingOption) missing.push("shipping");
  if (item.shippingOption && item.shippingOption !== "pickup" && !item.parcelSize) {
    missing.push("parcel");
  }
  // Prepaid economics: the price must cover commission + label with a
  // positive payout, or the order can never settle (cross-model review
  // finding, task 9). Wizard jumps to the price step on "price_too_low".
  if (
    item.shippingOption === "prepaid" &&
    item.askingPriceCents &&
    item.askingPriceCents > 0
  ) {
    const labelCents =
      item.parcelSize && item.parcelSize in PARCELS
        ? PARCELS[item.parcelSize as ParcelSize].costCents
        : FLAT_RATE_SHIPPING_CENTS[item.shippingClass ?? "m"]!;
    const payout = item.askingPriceCents - calcFeeCents(item.askingPriceCents) - labelCents;
    if (payout <= 0) missing.push("price_too_low");
  }
  if (!legalAgree) missing.push("legal_agree");

  return missing;
}

/**
 * Diff canonical fields against the latest completed generation's resolved
 * output → authoritative kept/edited outcome (D16). Client chips are
 * advisory; this is the tuning dataset.
 */
async function recordAiOutcome(
  item: InventoryItemRow,
  category: CategoryInfo | null,
): Promise<void> {
  const [generation] = await db
    .select()
    .from(aiGenerations)
    .where(
      and(
        eq(aiGenerations.inventoryItemId, item.id),
        eq(aiGenerations.status, "completed"),
      ),
    )
    .orderBy(desc(aiGenerations.createdAt))
    .limit(1);
  if (!generation?.resolvedOutput) return;

  const resolved = generation.resolvedOutput as ResolvedDraft;
  const kept: string[] = [];
  const edited: string[] = [];

  const compare = (field: string, suggestion: string, canonical: string | null) => {
    if (!suggestion) return; // nothing suggested — neither kept nor edited
    if ((canonical ?? "").trim() === suggestion.trim()) kept.push(field);
    else edited.push(field);
  };

  compare("title", resolved.title, item.title);
  compare("description", resolved.description, item.description);
  compare("brand", resolved.brand, item.brand);
  compare("category", resolved.categoryLeaf, category?.slug ?? null);
  compare("colour", resolved.colour, item.colour);

  await db
    .update(aiGenerations)
    .set({ outcome: { kept, edited } })
    .where(eq(aiGenerations.id, generation.id));
}

export async function publishDraft(
  itemId: string,
  ownerId: string,
  channelId: string,
  input: { version: number; legalAgree: boolean },
) {
  const item = await findOwnedDraftItem(itemId, ownerId);

  // A prior publish attempt may have flipped the lifecycle and then failed
  // (crash, guard error). `for_sale` with no ACTIVE listing is therefore a
  // RESUMABLE state, not a terminal one (review finding: treating it as
  // terminal permanently bricked the draft).
  const resuming = item.lifecycleState === "for_sale";
  if (!resuming && item.lifecycleState !== "owned") {
    throw new ConflictError("This item cannot be published from its current state");
  }
  if (item.version !== input.version) {
    throw new ConflictError(
      "Draft was modified by another request. Please retry with the latest version.",
    );
  }
  if (resuming) {
    const [existingActive] = await db
      .select({ id: channelListings.id, status: channelListings.status })
      .from(channelListings)
      .where(
        and(
          eq(channelListings.inventoryItemId, itemId),
          eq(channelListings.channelId, channelId),
          eq(channelListings.status, "active"),
        ),
      );
    if (existingActive) {
      throw new ConflictError("This item has already been published");
    }
  }

  const draft = await getDraft(itemId, ownerId); // images + template context
  const readyImageCount = draft.images.filter((img) => img.status === "ready").length;
  const category = await resolveCategoryInfo(item.categoryId);

  const missing = publishGateMissing(item, readyImageCount, category, input.legalAgree);
  if (missing.length > 0) {
    throw new PublishNotReadyError(missing);
  }

  // Pre-flight the tier-1 activation guard BEFORE any mutation — vacation
  // mode / missing ship-from address are ordinary seller states, and failing
  // on them AFTER the lifecycle flip is what bricked drafts (review finding).
  await assertListingActivationReady(ownerId);

  const strength = computeListingStrength(
    buildStrengthInput(item, readyImageCount, category),
  );

  // 1. Item graduates to for_sale (optimistic — publish is feature-grade).
  //    Skipped when resuming a previously-flipped item.
  let flippedFromVersion: number | null = null;
  if (!resuming) {
    const lifecycleResult = await db
      .update(inventoryItems)
      .set({ lifecycleState: "for_sale", version: input.version + 1, updatedAt: new Date() })
      .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.version, input.version)))
      .returning({ version: inventoryItems.version });
    if (lifecycleResult.length === 0) {
      throw new ConflictError(
        "Draft was modified by another request. Please retry with the latest version.",
      );
    }
    flippedFromVersion = input.version + 1;
  }

  /** Best-effort compensation: put a freshly-flipped item back into the
   *  draft flow if anything below fails, so retry starts clean. */
  const revertLifecycle = async () => {
    if (flippedFromVersion === null) return;
    try {
      await db
        .update(inventoryItems)
        .set({ lifecycleState: "owned", version: flippedFromVersion + 1, updatedAt: new Date() })
        .where(
          and(
            eq(inventoryItems.id, itemId),
            eq(inventoryItems.version, flippedFromVersion),
            eq(inventoryItems.lifecycleState, "for_sale"),
          ),
        );
    } catch (revertErr) {
      // Best-effort — the resumable for_sale path is the backstop.
      console.error(`[publish] Failed to revert lifecycle for ${itemId}:`, revertErr);
    }
  };

  let listing;
  try {
    // 2. Channel listing via the existing machinery (handle gen, guards,
    //    channel_listing.created event). Recover an existing draft listing
    //    if a prior publish attempt got this far and then failed.
    try {
      listing = await createListing(ownerId, {
        inventoryItemId: itemId,
        channelId,
        title: item.title!,
        description: item.description ?? undefined,
        priceCents: item.askingPriceCents!,
        currency: "AUD",
      });
    } catch (err) {
      if (err instanceof ConflictError) {
        const [existing] = await db
          .select()
          .from(channelListings)
          .where(
            and(
              eq(channelListings.inventoryItemId, itemId),
              eq(channelListings.channelId, channelId),
            ),
          );
        if (!existing) throw err;
        if (existing.status === "active") {
          throw new ConflictError("This item has already been published");
        }
        listing = existing;
      } else {
        throw err;
      }
    }

    // 3. Activate — fires status events → search-sync + score fan-out.
    await transitionListingStatus(listing.id, ownerId, "active", listing.version);
  } catch (err) {
    await revertLifecycle();
    throw err;
  }

  // 4. Published event carries the legal-agree audit (task 8).
  await dispatchEvent({
    eventName: "channel_listing.published",
    category: "listings",
    actorId: ownerId,
    entityType: "channel_listing",
    entityId: listing.id,
    channelId,
    metadata: {
      legalAgree: true,
      legalAgreeAt: new Date().toISOString(),
      strengthScore: strength.score,
      strengthVersion: LISTING_STRENGTH_VERSION,
      source: "sell_flow",
    },
  }).catch((err: unknown) => {
    console.error(`[publish] Failed to dispatch published event for ${listing.id}:`, err);
  });

  // 5. AI outcome diff (D16) — best-effort, never blocks publish.
  await recordAiOutcome(item, category).catch((err: unknown) => {
    console.error(`[publish] Failed to record AI outcome for ${itemId}:`, err);
  });

  // 6. Seller confirmation email.
  await sendNotification(
    ownerId,
    channelId,
    "listing_published_seller",
    "transactional",
    {
      listingTitle: item.title!,
      handle: listing.handle,
      strengthScore: strength.score,
    },
    listing.id,
  ).catch((err: unknown) => {
    console.error(`[publish] Failed to send published notification for ${listing.id}:`, err);
  });

  return {
    listingId: listing.id,
    handle: listing.handle,
    itemId,
    strength: {
      score: strength.score,
      band: strengthBand(strength.score),
      breakdown: strength.breakdown,
      version: LISTING_STRENGTH_VERSION,
    },
  };
}

/**
 * "List another like this" (D17): keeps brand / category (parent+leaf) /
 * colour / shipping option / parcel (+ derived class, + size scale);
 * clears photos, title, description, price, RRP, measurements, condition,
 * size and the legal agree (which is never persisted anyway).
 */
export async function duplicateDraft(itemId: string, ownerId: string) {
  const source = await findOwnedDraftItem(itemId, ownerId);

  const [created] = await db
    .insert(inventoryItems)
    .values({
      ownerId,
      brand: source.brand,
      categoryId: source.categoryId,
      colour: source.colour,
      sizeScale: source.sizeScale,
      shippingOption: source.shippingOption,
      parcelSize: source.parcelSize,
      shippingClass: source.shippingClass,
    })
    .returning();

  await dispatchEvent({
    eventName: "inventory_item.created",
    category: "inventory",
    actorId: ownerId,
    entityType: "inventory_item",
    entityId: created!.id,
    metadata: { source: "duplicate", duplicatedFrom: itemId },
  });

  return getDraft(created!.id, ownerId);
}
