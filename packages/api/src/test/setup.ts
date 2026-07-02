import { beforeAll, beforeEach, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { db, endDb } from "@bushpop/db/client";

// Provide defaults for required env vars so tests don't fail on missing secrets.
// Individual test files can override these in beforeEach.
process.env.STRIPE_SECRET_KEY ??= "sk_test_placeholder";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test_placeholder";
process.env.STARSHIPIT_API_KEY ??= "test_api_key";
process.env.STARSHIPIT_WEBHOOK_SECRET ??= "test_webhook_secret";
process.env.CHANNEL_SLUG ??= "bushpop";
process.env.R2_PUBLIC_URL ??= "https://media.bushpop.com.au";

// Safety guard: only run against bushpop_test
beforeAll(() => {
  const url = process.env.DATABASE_URL;
  if (!url?.includes("bushpop_test")) {
    throw new Error(
      "Integration tests MUST run against bushpop_test database. " +
      `Got: ${url}`,
    );
  }
});

// Truncate all user-created data between tests.
// Categories are NOT truncated — they're seeded once and reused.
beforeEach(async () => {
  await db.execute(sql`
    TRUNCATE TABLE
      listing_scores,
      listing_reports,
      saved_searches,
      wishlists,
      notifications,
      notification_preferences,
      allocation_refunds,
      order_group_allocation_items,
      order_group_seller_allocations,
      order_groups,
      payment_operations,
      refunds,
      webhook_dead_letters,
      processed_webhook_events,
      payout_holds,
      order_items,
      orders,
      checkout_sessions,
      cart_items,
      carts,
      channel_listings,
      inventory_item_images,
      inventory_items,
      marketplace_events,
      idempotency_keys,
      user_roles,
      seller_profiles,
      addresses,
      session,
      account,
      verification,
      "user"
    RESTART IDENTITY CASCADE
  `);
});

afterAll(async () => {
  // Close the postgres.js connection pool so lingering connections don't
  // deadlock the TRUNCATE in the next test file's beforeEach.
  await endDb();
});
