import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { listingReports, channelListings, inventoryItems } from "@bushpop/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@bushpop/db/schema";
import { transition, InvalidTransitionError } from "../../../../lib/state-machine.js";
import { REPORT_STATUS_MACHINE, type ReportStatus } from "../../../../lib/report-machines.js";
import { dispatchEvent } from "../../../../lib/events.js";
import { ConflictError, NotFoundError, ValidationError } from "../../../../lib/errors.js";
import { sendNotification } from "../../../../lib/notification-service.js";

type Transaction = Parameters<Parameters<PostgresJsDatabase<typeof schema>["transaction"]>[0]>[0];
type ReportRecord = typeof listingReports.$inferSelect;

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

/**
 * Update hidden_at on the listing based on whether any actioned reports remain.
 * - If any actioned report exists → set hidden_at = COALESCE(hidden_at, now())
 * - If no actioned reports remain → clear hidden_at = NULL
 *
 * MUST run within the same DB transaction as the report status update.
 */
export async function updateHiddenAtFromReports(
  tx: Transaction,
  channelListingId: string,
): Promise<void> {
  await tx.execute(sql`
    SELECT 1
    FROM channel_listings
    WHERE id = ${channelListingId}
    FOR UPDATE
  `);

  await tx.execute(sql`
    UPDATE channel_listings
    SET hidden_at = CASE
      WHEN EXISTS (
        SELECT 1 FROM listing_reports
        WHERE channel_listing_id = ${channelListingId} AND status = 'actioned'
      ) THEN COALESCE(hidden_at, now())
      ELSE NULL
    END
    WHERE id = ${channelListingId}
  `);
}

export interface ListReportsOptions {
  channelId?: string;
  status?: ReportStatus;
  page: number;
  limit: number;
}

export async function listReports(options: ListReportsOptions) {
  const { channelId, status, page, limit } = options;
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [];
  if (channelId) {
    conditions.push(eq(channelListings.channelId, channelId));
  }
  if (status) {
    conditions.push(eq(listingReports.status, status));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, countResult] = await Promise.all([
    db
      .select({
        report: listingReports,
        channelId: channelListings.channelId,
      })
      .from(listingReports)
      .innerJoin(channelListings, eq(listingReports.channelListingId, channelListings.id))
      .where(whereClause)
      .orderBy(desc(listingReports.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(listingReports)
      .innerJoin(channelListings, eq(listingReports.channelListingId, channelListings.id))
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    items: items.map(({ report, channelId: reportChannelId }) => formatReport(report, reportChannelId)),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function patchReport(
  reportId: string,
  targetStatus: ReportStatus,
  actorId: string,
) {
  const [report] = await db
    .select({
      report: listingReports,
      channelId: channelListings.channelId,
      hiddenAt: channelListings.hiddenAt,
    })
    .from(listingReports)
    .innerJoin(channelListings, eq(listingReports.channelListingId, channelListings.id))
    .where(eq(listingReports.id, reportId));

  if (!report) {
    throw new NotFoundError("Report not found");
  }

  const currentStatus = report.report.status as ReportStatus;

  try {
    transition(REPORT_STATUS_MACHINE, "report", currentStatus, targetStatus);
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      throw new ValidationError(err.message);
    }
    throw err;
  }

  const becomesActioned = targetStatus === "actioned";
  const becomesReviewedFromActioned = currentStatus === "actioned" && targetStatus === "reviewed";
  const shouldRecomputeVisibility = becomesActioned || becomesReviewedFromActioned;
  const wasHidden = report.hiddenAt !== null;

  let updatedReport: ReportRecord | undefined;
  let hiddenStateChanged = false;
  let isHiddenAfterTransition = wasHidden;

  try {
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(listingReports)
        .set({
          status: targetStatus,
          version: sql`${listingReports.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(listingReports.id, reportId),
            eq(listingReports.version, report.report.version),
          ),
        )
        .returning();

      if (!updated) {
        throw new ConflictError("Report was modified concurrently. Please retry.");
      }

      updatedReport = updated;

      if (shouldRecomputeVisibility) {
        await updateHiddenAtFromReports(tx, report.report.channelListingId);

        const [listing] = await tx
          .select({ hiddenAt: channelListings.hiddenAt })
          .from(channelListings)
          .where(eq(channelListings.id, report.report.channelListingId))
          .limit(1);

        if (!listing) {
          throw new NotFoundError("Listing not found");
        }

        isHiddenAfterTransition = listing.hiddenAt !== null;
        hiddenStateChanged = wasHidden !== isHiddenAfterTransition;
      }

      if (becomesActioned || becomesReviewedFromActioned) {
        await sendReportNotification({
          tx,
          type: becomesActioned ? "report_actioned" : "report_reinstated",
          channelListingId: report.report.channelListingId,
          channelId: report.channelId,
          reportId,
        });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("An active report already exists for this reporter and listing.");
    }
    throw error;
  }

  if (hiddenStateChanged) {
    dispatchEvent({
      eventName: "listing.visibility_changed",
      category: "listing",
      actorId,
      entityType: "channel_listing",
      entityId: report.report.channelListingId,
      channelId: report.channelId,
      metadata: {
        reportId,
        previousStatus: currentStatus,
        newStatus: targetStatus,
        hidden: isHiddenAfterTransition,
      },
    }).catch((err: unknown) => {
      console.error("[admin/reports] Failed to dispatch listing.visibility_changed:", err);
    });
  }

  if (!updatedReport) {
    throw new Error("[patchReport] transaction did not assign updatedReport");
  }

  return formatReport(updatedReport, report.channelId);
}

/**
 * Resolve seller userId from channelListing and create a notification row
 * within the same transaction as the report state change.
 */
async function sendReportNotification(opts: {
  tx: Transaction;
  type: "report_actioned" | "report_reinstated";
  channelListingId: string;
  channelId: string;
  reportId: string;
}): Promise<void> {
  const [listing] = await opts.tx
    .select({ inventoryItemId: channelListings.inventoryItemId })
    .from(channelListings)
    .where(eq(channelListings.id, opts.channelListingId));

  if (!listing) return;

  const [inventoryItem] = await opts.tx
    .select({ ownerId: inventoryItems.ownerId })
    .from(inventoryItems)
    .where(eq(inventoryItems.id, listing.inventoryItemId));

  if (!inventoryItem) return;

  await sendNotification(
    inventoryItem.ownerId,
    opts.channelId,
    opts.type,
    "transactional",
    { reportId: opts.reportId },
    opts.channelListingId,
  );
}

function formatReport(report: ReportRecord, channelId: string) {
  return {
    id: report.id,
    channelListingId: report.channelListingId,
    channelId,
    reporterId: report.reporterId,
    reason: report.reason,
    description: report.description,
    status: report.status,
    version: report.version,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}
