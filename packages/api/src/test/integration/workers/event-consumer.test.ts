/**
 * Event Consumer Worker Integration Tests
 *
 * Tests for the central fan-out mechanism in the event-driven architecture.
 *
 * Covers:
 *   - Fan-out to search-sync queue for SEARCH_SYNC_EVENTS
 *   - Delivery status marking in the marketplace_events audit log
 *   - order.delivered side-effect handler (log only, no crash)
 *   - order.tracking_exception side-effect handler (admin email enqueued)
 *   - channel_listing.content_changed side-effect handler (listing-score enqueued)
 *   - Unknown events (not in SEARCH_SYNC_EVENTS) — delivered but no search-sync fan-out
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { marketplaceEvents } from "@bushpop/db/schema";
import { ulid } from "ulid";
import { processMarketplaceEvent } from "../../../workers/event-consumer.js";
import { createTestUser } from "../../helpers/create-user.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";

// ── Mock downstream queues to prevent Redis connections ──────────────────────
// Must use vi.hoisted so the mocks are available before module imports.

const { hoistedEnqueueSearchSync, hoistedEnqueueEmail, hoistedEnqueueListingScore } =
  vi.hoisted(() => ({
    hoistedEnqueueSearchSync: vi.fn().mockResolvedValue(undefined),
    hoistedEnqueueEmail: vi.fn().mockResolvedValue(undefined),
    hoistedEnqueueListingScore: vi.fn().mockResolvedValue(undefined),
  }));

vi.mock("../../../workers/search-sync.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../workers/search-sync.js")>();
  return {
    ...original,
    enqueueSearchSync: hoistedEnqueueSearchSync,
    startSearchSyncWorker: vi.fn(),
  };
});

vi.mock("../../../workers/email.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../workers/email.js")>();
  return {
    ...original,
    enqueueEmail: hoistedEnqueueEmail,
    startEmailWorker: vi.fn(),
  };
});

vi.mock("../../../workers/listing-score.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../../workers/listing-score.js")>();
  return {
    ...original,
    enqueueListingScore: hoistedEnqueueListingScore,
    startListingScoreWorker: vi.fn(),
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

interface MarketplaceEventJobData {
  eventId: string;
  eventName: string;
  category: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  channelId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Build a fake BullMQ Job object that satisfies the processor's interface.
 */
function makeJob(data: MarketplaceEventJobData): Job<MarketplaceEventJobData> {
  return {
    id: `test-job-${data.eventId}`,
    data,
  } as unknown as Job<MarketplaceEventJobData>;
}

/**
 * Insert a marketplace_events row with deliveryStatus=dispatched so the
 * processor can update it to "delivered".
 */
async function insertPendingEvent(overrides: Partial<typeof marketplaceEvents.$inferInsert> = {}) {
  const [row] = await db
    .insert(marketplaceEvents)
    .values({
      eventName: overrides.eventName ?? "channel_listing.created",
      category: overrides.category ?? "listings",
      deliveryStatus: "dispatched",
      ...overrides,
    })
    .returning();
  return row!;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("processMarketplaceEvent", () => {
  let userId: string;

  beforeEach(async () => {
    hoistedEnqueueSearchSync.mockClear();
    hoistedEnqueueEmail.mockClear();
    hoistedEnqueueListingScore.mockClear();

    const user = await createTestUser();
    userId = user.id;
  });

  // ── Fan-out tests ──────────────────────────────────────────────────────────

  it("fans out channel_listing.created to search-sync queue and enqueues listing-score", async () => {
    const listing = await createActiveTestListing(userId);
    const event = await insertPendingEvent({
      eventName: "channel_listing.created",
      entityId: listing.id,
      channelId: listing.channelId,
    });

    await processMarketplaceEvent(
      makeJob({
        eventId: event.id,
        eventName: "channel_listing.created",
        category: "listings",
        entityId: listing.id,
        channelId: listing.channelId,
      }),
    );

    expect(hoistedEnqueueSearchSync).toHaveBeenCalledTimes(1);
    expect(hoistedEnqueueSearchSync).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "channel_listing.created", entityId: listing.id }),
    );
    expect(hoistedEnqueueListingScore).toHaveBeenCalledTimes(1);
    expect(hoistedEnqueueListingScore).toHaveBeenCalledWith(listing.id);
  });

  it("fans out channel_listing.status_changed to search-sync queue", async () => {
    const listing = await createActiveTestListing(userId);
    const event = await insertPendingEvent({
      eventName: "channel_listing.status_changed",
      entityId: listing.id,
      channelId: listing.channelId,
    });

    await processMarketplaceEvent(
      makeJob({
        eventId: event.id,
        eventName: "channel_listing.status_changed",
        category: "listings",
        entityId: listing.id,
        channelId: listing.channelId,
      }),
    );

    expect(hoistedEnqueueSearchSync).toHaveBeenCalledTimes(1);
    expect(hoistedEnqueueSearchSync).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "channel_listing.status_changed" }),
    );
  });

  // ── Delivery marking test ──────────────────────────────────────────────────

  it("marks marketplace_events.deliveryStatus as 'delivered' after processing", async () => {
    const listing = await createActiveTestListing(userId);
    const event = await insertPendingEvent({
      eventName: "channel_listing.created",
      entityId: listing.id,
      channelId: listing.channelId,
    });

    // Confirm it starts as dispatched
    const [before] = await db
      .select({ deliveryStatus: marketplaceEvents.deliveryStatus })
      .from(marketplaceEvents)
      .where(eq(marketplaceEvents.id, event.id));
    expect(before!.deliveryStatus).toBe("dispatched");

    await processMarketplaceEvent(
      makeJob({
        eventId: event.id,
        eventName: "channel_listing.created",
        category: "listings",
        entityId: listing.id,
        channelId: listing.channelId,
      }),
    );

    const [after] = await db
      .select({ deliveryStatus: marketplaceEvents.deliveryStatus })
      .from(marketplaceEvents)
      .where(eq(marketplaceEvents.id, event.id));
    expect(after!.deliveryStatus).toBe("delivered");
  });

  // ── order.delivered handler ────────────────────────────────────────────────

  it("processes order.delivered without crashing and without enqueuing email", async () => {
    const orderId = ulid();
    const event = await insertPendingEvent({
      eventName: "order.delivered",
      category: "orders",
      entityId: orderId,
      metadata: { orderId },
    });

    await expect(
      processMarketplaceEvent(
        makeJob({
          eventId: event.id,
          eventName: "order.delivered",
          category: "orders",
          entityId: orderId,
          metadata: { orderId },
        }),
      ),
    ).resolves.toBeUndefined();

    // order.delivered logs only — no email, no search-sync
    expect(hoistedEnqueueEmail).not.toHaveBeenCalled();
    expect(hoistedEnqueueSearchSync).not.toHaveBeenCalled();
  });

  // ── order.tracking_exception handler ──────────────────────────────────────

  it("enqueues tracking_exception_admin email for order.tracking_exception", async () => {
    const orderId = ulid();
    const event = await insertPendingEvent({
      eventName: "order.tracking_exception",
      category: "orders",
      entityId: orderId,
      metadata: { orderId },
    });

    await processMarketplaceEvent(
      makeJob({
        eventId: event.id,
        eventName: "order.tracking_exception",
        category: "orders",
        entityId: orderId,
        metadata: { orderId },
      }),
    );

    expect(hoistedEnqueueEmail).toHaveBeenCalledTimes(1);
    expect(hoistedEnqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ type: "tracking_exception_admin", orderId }),
    );
    // Not a SEARCH_SYNC_EVENT — no fan-out
    expect(hoistedEnqueueSearchSync).not.toHaveBeenCalled();
  });

  // ── channel_listing.content_changed side-effect ───────────────────────────

  it("enqueues listing-score recalculation for channel_listing.content_changed", async () => {
    const listing = await createActiveTestListing(userId);
    const event = await insertPendingEvent({
      eventName: "channel_listing.content_changed",
      entityId: listing.id,
      channelId: listing.channelId,
    });

    await processMarketplaceEvent(
      makeJob({
        eventId: event.id,
        eventName: "channel_listing.content_changed",
        category: "listings",
        entityId: listing.id,
        channelId: listing.channelId,
      }),
    );

    // listing-score recalculation enqueued
    expect(hoistedEnqueueListingScore).toHaveBeenCalledTimes(1);
    expect(hoistedEnqueueListingScore).toHaveBeenCalledWith(listing.id);

    // Also fanned out to search-sync (content_changed is in SEARCH_SYNC_EVENTS)
    expect(hoistedEnqueueSearchSync).toHaveBeenCalledTimes(1);
  });

  // ── Unknown event (not in SEARCH_SYNC_EVENTS) ─────────────────────────────

  it("marks an unknown event as delivered but does NOT enqueue search-sync", async () => {
    const event = await insertPendingEvent({
      eventName: "payment.completed",
      category: "payments",
    });

    await processMarketplaceEvent(
      makeJob({
        eventId: event.id,
        eventName: "payment.completed",
        category: "payments",
      }),
    );

    // Not in SEARCH_SYNC_EVENTS — no fan-out
    expect(hoistedEnqueueSearchSync).not.toHaveBeenCalled();

    // Still marked delivered
    const [after] = await db
      .select({ deliveryStatus: marketplaceEvents.deliveryStatus })
      .from(marketplaceEvents)
      .where(eq(marketplaceEvents.id, event.id));
    expect(after!.deliveryStatus).toBe("delivered");
  });
});
