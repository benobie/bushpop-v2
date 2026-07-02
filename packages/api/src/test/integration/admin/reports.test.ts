import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Job } from "bullmq";
import { db } from "@bushpop/db/client";
import {
  channelListings,
  listingReports,
  notifications,
  userRoles,
} from "@bushpop/db/schema";
import { getMeiliClient } from "../../../lib/meilisearch.js";
import {
  getListingIndexName,
  setupListingsIndex,
} from "../../../lib/search-index.js";
import { processSearchSyncJob } from "../../../workers/search-sync.js";
import { signUpTestUser, grantSellerRole } from "../../helpers/auth.js";
import { createActiveTestListing } from "../../helpers/create-listing.js";
import { authedRequest } from "../../helpers/http.js";
import { clearListingsIndex, indexTestListing } from "../../helpers/index-listing.js";

const CHANNEL_SLUG = "piklo";

const { dispatchEventMock, enqueueEmailMock } = vi.hoisted(() => ({
  dispatchEventMock: vi.fn().mockResolvedValue("evt-report-test"),
  enqueueEmailMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../lib/events.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../lib/events.js")>();
  return {
    ...original,
    dispatchEvent: dispatchEventMock,
  };
});

vi.mock("../../../workers/email.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../workers/email.js")>();
  return {
    ...original,
    enqueueEmail: enqueueEmailMock,
    startEmailWorker: vi.fn(),
  };
});

function makeJob(data: {
  eventName: string;
  entityId?: string;
  channelId?: string;
  category?: string;
  metadata?: Record<string, unknown>;
}): Job {
  return {
    id: "test-job-listing-reports",
    data: {
      eventId: "evt-listing-reports",
      eventName: data.eventName,
      category: data.category ?? "listing",
      entityId: data.entityId,
      channelId: data.channelId,
      metadata: data.metadata ?? {},
    },
  } as unknown as Job;
}

async function documentExists(listingId: string): Promise<boolean> {
  try {
    const client = getMeiliClient();
    const index = client.index(getListingIndexName(CHANNEL_SLUG));
    await index.getDocument(listingId);
    return true;
  } catch {
    return false;
  }
}

async function setupReportFixture() {
  const seller = await signUpTestUser();
  const reporter = await signUpTestUser();
  const admin = await signUpTestUser();

  await grantSellerRole(seller.user.id);
  await db.insert(userRoles).values({ userId: admin.user.id, role: "admin" });

  const listing = await createActiveTestListing(seller.user.id);

  return {
    admin,
    listing,
    reporter,
    seller,
  };
}

async function submitReport(sessionToken: string, listingId: string) {
  return authedRequest(sessionToken, "POST", `/api/v1/store/listings/${listingId}/report`, {
    reason: "misleading",
    description: "The listing description does not match the photos.",
  });
}

async function updateReportStatus(
  sessionToken: string,
  reportId: string,
  status: "reviewed" | "actioned" | "dismissed",
) {
  return authedRequest(sessionToken, "PATCH", `/api/v1/admin/reports/${reportId}`, { status });
}

describe("listing reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits a report with 201", async () => {
    const { listing, reporter } = await setupReportFixture();

    const res = await submitReport(reporter.sessionToken, listing.id);

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe("pending");

    const [report] = await db
      .select()
      .from(listingReports)
      .where(eq(listingReports.id, body.id));

    expect(report).toMatchObject({
      channelListingId: listing.id,
      reporterId: reporter.user.id,
      reason: "misleading",
      status: "pending",
    });
  });

  it("rejects a duplicate active report with 409", async () => {
    const { listing, reporter } = await setupReportFixture();

    const first = await submitReport(reporter.sessionToken, listing.id);
    const second = await submitReport(reporter.sessionToken, listing.id);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
  });

  it("allows re-reporting after dismissal", async () => {
    const { admin, listing, reporter } = await setupReportFixture();

    const created = await submitReport(reporter.sessionToken, listing.id);
    const reportId = created.json().id as string;

    expect((await updateReportStatus(admin.sessionToken, reportId, "reviewed")).statusCode).toBe(200);
    expect((await updateReportStatus(admin.sessionToken, reportId, "dismissed")).statusCode).toBe(200);

    const recreated = await submitReport(reporter.sessionToken, listing.id);
    expect(recreated.statusCode).toBe(201);
    expect(recreated.json().id).not.toBe(reportId);

    const rows = await db
      .select()
      .from(listingReports)
      .where(
        and(
          eq(listingReports.channelListingId, listing.id),
          eq(listingReports.reporterId, reporter.user.id),
        ),
      );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.status).sort()).toEqual(["dismissed", "pending"]);
  });

  it("enforces the 10 per day report cap", async () => {
    const seller = await signUpTestUser();
    const reporter = await signUpTestUser();
    const listings = await Promise.all(
      Array.from({ length: 11 }, () => createActiveTestListing(seller.user.id)),
    );

    for (const listing of listings.slice(0, 10)) {
      const res = await submitReport(reporter.sessionToken, listing.id);
      expect(res.statusCode).toBe(201);
    }

    const capped = await submitReport(reporter.sessionToken, listings[10]!.id);
    expect(capped.statusCode).toBe(429);
  });

  it("actions a report, hides the listing, and removes the search document", async () => {
    await setupListingsIndex(CHANNEL_SLUG);
    await clearListingsIndex(CHANNEL_SLUG);

    const { admin, listing, reporter } = await setupReportFixture();

    await indexTestListing(listing.id, CHANNEL_SLUG);
    expect(await documentExists(listing.id)).toBe(true);

    const created = await submitReport(reporter.sessionToken, listing.id);
    const reportId = created.json().id as string;

    expect((await updateReportStatus(admin.sessionToken, reportId, "reviewed")).statusCode).toBe(200);
    expect((await updateReportStatus(admin.sessionToken, reportId, "actioned")).statusCode).toBe(200);

    const [listingRow] = await db
      .select({ hiddenAt: channelListings.hiddenAt })
      .from(channelListings)
      .where(eq(channelListings.id, listing.id));

    expect(listingRow?.hiddenAt).not.toBeNull();
    expect(dispatchEventMock).toHaveBeenCalledTimes(1);
    expect(dispatchEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "listing.visibility_changed",
        entityId: listing.id,
        channelId: listing.channelId,
      }),
    );

    await processSearchSyncJob(makeJob(dispatchEventMock.mock.calls[0]![0]));
    expect(await documentExists(listing.id)).toBe(false);
  });

  it("sends notifications for action and reinstatement", async () => {
    const { admin, listing, reporter, seller } = await setupReportFixture();

    const created = await submitReport(reporter.sessionToken, listing.id);
    const reportId = created.json().id as string;

    await updateReportStatus(admin.sessionToken, reportId, "reviewed");
    await updateReportStatus(admin.sessionToken, reportId, "actioned");
    await updateReportStatus(admin.sessionToken, reportId, "reviewed");

    const [listingRow] = await db
      .select({ hiddenAt: channelListings.hiddenAt })
      .from(channelListings)
      .where(eq(channelListings.id, listing.id));

    expect(listingRow?.hiddenAt).toBeNull();

    const notificationRows = await db
      .select({
        type: notifications.type,
        payload: notifications.payload,
      })
      .from(notifications)
      .where(eq(notifications.userId, seller.user.id));

    expect(notificationRows.map((row) => row.type).sort()).toEqual([
      "report_actioned",
      "report_reinstated",
    ]);
    expect(enqueueEmailMock).toHaveBeenCalledTimes(2);
    expect(
      notificationRows.every(
        (row) => (row.payload as Record<string, unknown>)["reportId"] === reportId,
      ),
    ).toBe(true);
  });

  it("only dispatches visibility_changed when hidden state actually changes", async () => {
    const { admin, listing, reporter } = await setupReportFixture();
    const secondReporter = await signUpTestUser();

    const first = await submitReport(reporter.sessionToken, listing.id);
    const second = await submitReport(secondReporter.sessionToken, listing.id);

    const firstReportId = first.json().id as string;
    const secondReportId = second.json().id as string;

    await updateReportStatus(admin.sessionToken, firstReportId, "reviewed");
    await updateReportStatus(admin.sessionToken, secondReportId, "reviewed");

    await updateReportStatus(admin.sessionToken, firstReportId, "actioned");
    expect(dispatchEventMock).toHaveBeenCalledTimes(1);

    await updateReportStatus(admin.sessionToken, secondReportId, "actioned");
    expect(dispatchEventMock).toHaveBeenCalledTimes(1);

    await updateReportStatus(admin.sessionToken, firstReportId, "reviewed");
    expect(dispatchEventMock).toHaveBeenCalledTimes(1);

    const [stillHidden] = await db
      .select({ hiddenAt: channelListings.hiddenAt })
      .from(channelListings)
      .where(eq(channelListings.id, listing.id));
    expect(stillHidden?.hiddenAt).not.toBeNull();

    await updateReportStatus(admin.sessionToken, secondReportId, "reviewed");
    expect(dispatchEventMock).toHaveBeenCalledTimes(2);

    const [visibleAgain] = await db
      .select({ hiddenAt: channelListings.hiddenAt })
      .from(channelListings)
      .where(eq(channelListings.id, listing.id));
    expect(visibleAgain?.hiddenAt).toBeNull();

    expect(dispatchEventMock.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        eventName: "listing.visibility_changed",
        metadata: expect.objectContaining({ hidden: true }),
      }),
    );
    expect(dispatchEventMock.mock.calls[1]![0]).toEqual(
      expect.objectContaining({
        eventName: "listing.visibility_changed",
        metadata: expect.objectContaining({ hidden: false }),
      }),
    );
  });

  it("rejects invalid report transitions with 422", async () => {
    const { admin, listing, reporter } = await setupReportFixture();

    const created = await submitReport(reporter.sessionToken, listing.id);
    const reportId = created.json().id as string;

    const res = await updateReportStatus(admin.sessionToken, reportId, "actioned");

    expect(res.statusCode).toBe(422);
  });
});
