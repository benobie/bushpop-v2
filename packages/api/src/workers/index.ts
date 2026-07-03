import { startImageCleanupWorker } from "./image-cleanup.js";
import { startImageVariantsWorker } from "./image-variants.js";
import { startEnrichmentWorker } from "./enrichment.js";
import { startAiDraftWorker } from "./ai-draft.js";
import { startBackfillAspectRatiosWorker, scheduleBackfillAspectRatios } from "./backfill-aspect-ratios.js";
import { startCheckoutExpiryWorker } from "./checkout-expiry.js";
import { startShippingLabelWorker } from "./shipping-label.js";
import { startEmailWorker } from "./email.js";
import { startEventConsumer } from "./event-consumer.js";
import { startSearchSyncWorker } from "./search-sync.js";
import { startNotificationSweeperWorker } from "./notification-sweeper.js";
import { startListingScoreWorker } from "./listing-score.js";
import { startRefundWorker } from "./refund.js";
import { startStarshipitPollWorker, scheduleStarshipitPoll } from "./starshipit-poll.js";
import {
  startReconcileIndeterminateOpsWorker,
  scheduleReconcileIndeterminateOps,
} from "./reconcile-indeterminate-ops.js";
import {
  startOrderJobsSweeperWorker,
  scheduleOrderJobsSweeper,
} from "./order-jobs-sweeper.js";
import {
  startPayoutReleaseWorker,
  schedulePayoutRelease,
} from "./payout-release.js";

export async function startWorkers() {
  if (process.env.NODE_ENV === "test") return;

  await startImageCleanupWorker();

  // Always on — variants must generate regardless of AI configuration.
  startImageVariantsWorker();
  console.log("[workers] Image variants worker started");

  if (process.env.ANTHROPIC_API_KEY) {
    startEnrichmentWorker();
    console.log("[workers] AI enrichment worker started");
  } else {
    console.log("[workers] ANTHROPIC_API_KEY not set — enrichment worker disabled");
  }

  // Sell-flow AI drafts — Gemini primary, Anthropic escalation (D12).
  if (process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY) {
    startAiDraftWorker();
    console.log("[workers] AI draft worker started");
  } else {
    console.log("[workers] No AI key set — ai-draft worker disabled");
  }

  startCheckoutExpiryWorker();
  console.log("[workers] Checkout expiry worker started");

  startShippingLabelWorker();
  console.log("[workers] Shipping label worker started");

  startEmailWorker();
  console.log("[workers] Email worker started");

  startEventConsumer();
  console.log("[workers] Marketplace event consumer started");

  startSearchSyncWorker();
  console.log("[workers] Search sync worker started");

  startNotificationSweeperWorker();
  console.log("[workers] Notification sweeper worker started");

  startListingScoreWorker();
  console.log("[workers] Listing score worker started");

  startRefundWorker();
  console.log("[workers] Refund worker started");

  startStarshipitPollWorker();
  await scheduleStarshipitPoll();
  console.log("[workers] Starshipit poll worker started");

  startReconcileIndeterminateOpsWorker();
  await scheduleReconcileIndeterminateOps();
  console.log("[workers] Reconcile indeterminate ops worker started");

  // Order-jobs sweeper (AUDIT-010 belt-and-braces) — always on; deduped + safe.
  startOrderJobsSweeperWorker();
  await scheduleOrderJobsSweeper();
  console.log("[workers] Order-jobs sweeper started");

  // Payout-release worker (WS5) — GATED OFF by default. Only starts when
  // PAYOUT_RELEASE_ENABLED=true, with a live-key guard so the code can ship
  // without being able to move real money.
  if (process.env.PAYOUT_RELEASE_ENABLED === "true") {
    const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
    if (stripeKey.startsWith("sk_live_") && process.env.PAYOUT_RELEASE_ALLOW_LIVE !== "true") {
      console.error(
        "[workers] PAYOUT_RELEASE_ENABLED=true with a LIVE Stripe key but " +
          "PAYOUT_RELEASE_ALLOW_LIVE!=true — REFUSING to start the payout-release " +
          "worker (live-key guard). Set PAYOUT_RELEASE_ALLOW_LIVE=true to override.",
      );
    } else {
      startPayoutReleaseWorker();
      await schedulePayoutRelease();
      console.log("[workers] Payout-release worker started");
    }
  } else {
    console.log("[workers] PAYOUT_RELEASE_ENABLED not set — payout-release worker disabled");
  }

  startBackfillAspectRatiosWorker();
  await scheduleBackfillAspectRatios();
  console.log("[workers] Aspect ratio backfill worker started (one-off)");

  console.log("[workers] All workers started");
}
