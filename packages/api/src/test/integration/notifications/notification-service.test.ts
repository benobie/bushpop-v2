import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { db } from "@bushpop/db/client";
import { notificationPreferences, notifications } from "@bushpop/db/schema";
import {
  _resetEmailSender,
  clearMockEmails,
  getSentEmails,
  setMockEmailError,
} from "../../../lib/email/index.js";
import { sendNotification } from "../../../lib/notification-service.js";
import { processEmailJobForTest } from "../../../workers/email.js";
import { runNotificationSweeperForTest } from "../../../workers/notification-sweeper.js";
import { createTestUser } from "../../helpers/create-user.js";

const { enqueueEmailMock } = vi.hoisted(() => ({
  enqueueEmailMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../workers/email.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../workers/email.js")>();
  return {
    ...original,
    enqueueEmail: enqueueEmailMock,
    startEmailWorker: vi.fn(),
  };
});

async function getNotification(id: string) {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, id))
    .limit(1);

  return rows[0] ?? null;
}

describe("sendNotification", () => {
  beforeEach(() => {
    enqueueEmailMock.mockClear();
  });

  it("blocks same-day duplicates for the same entity and nudge key", async () => {
    const testUser = await createTestUser();
    const channelId = ulid();
    const entityId = ulid();

    const first = await sendNotification(
      testUser.id,
      channelId,
      "score_nudge",
      "promotional",
      { nudgeKey: "missing-photos" },
      entityId,
    );

    const second = await sendNotification(
      testUser.id,
      channelId,
      "score_nudge",
      "promotional",
      { nudgeKey: "missing-photos" },
      entityId,
    );

    expect(first.sent).toBe(true);
    expect(second.sent).toBe(false);
    expect(enqueueEmailMock).toHaveBeenCalledTimes(1);
  });

  it("allows a different nudge key on the same day", async () => {
    const testUser = await createTestUser();
    const channelId = ulid();
    const entityId = ulid();

    const first = await sendNotification(
      testUser.id,
      channelId,
      "score_nudge",
      "promotional",
      { nudgeKey: "missing-photos" },
      entityId,
    );

    const second = await sendNotification(
      testUser.id,
      channelId,
      "score_nudge",
      "promotional",
      { nudgeKey: "missing-description" },
      entityId,
    );

    expect(first.sent).toBe(true);
    expect(second.sent).toBe(true);
    expect(enqueueEmailMock).toHaveBeenCalledTimes(2);
  });

  it("treats an absent preference row as enabled", async () => {
    const testUser = await createTestUser();

    const result = await sendNotification(
      testUser.id,
      ulid(),
      "score_nudge",
      "promotional",
      {},
      ulid(),
    );

    expect(result.sent).toBe(true);
    expect(result.notificationId).toBeDefined();
    expect(enqueueEmailMock).toHaveBeenCalledTimes(1);
  });

  it("blocks when the preference row is disabled", async () => {
    const testUser = await createTestUser();

    await db.insert(notificationPreferences).values({
      id: ulid(),
      userId: testUser.id,
      type: "score_nudge",
      channel: "email",
      enabled: false,
    });

    const result = await sendNotification(
      testUser.id,
      ulid(),
      "score_nudge",
      "promotional",
      {},
      ulid(),
    );

    expect(result.sent).toBe(false);
    expect(enqueueEmailMock).not.toHaveBeenCalled();
  });

  it("enqueues the notification after commit with notificationId in the payload", async () => {
    const testUser = await createTestUser();
    let result: Awaited<ReturnType<typeof sendNotification>> | undefined;

    await db.transaction(async () => {
      result = await sendNotification(
        testUser.id,
        ulid(),
        "score_nudge",
        "promotional",
        { nudgeKey: "missing-photos" },
        ulid(),
      );

      expect(enqueueEmailMock).not.toHaveBeenCalled();
    });

    expect(result?.sent).toBe(true);
    expect(enqueueEmailMock).toHaveBeenCalledTimes(1);
    expect(enqueueEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: result?.notificationId,
      }),
    );
  });

  it("does not enqueue anything when the outer transaction rolls back", async () => {
    const testUser = await createTestUser();

    await expect(
      db.transaction(async () => {
        await sendNotification(
          testUser.id,
          ulid(),
          "score_nudge",
          "promotional",
          { nudgeKey: "missing-photos" },
          ulid(),
        );

        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    const rows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.userId, testUser.id));

    expect(rows).toHaveLength(0);
    expect(enqueueEmailMock).not.toHaveBeenCalled();
  });
});

describe("email worker notification state", () => {
  beforeEach(() => {
    clearMockEmails();
    delete process.env.RESEND_API_KEY;
    _resetEmailSender();
  });

  afterEach(() => {
    clearMockEmails();
    _resetEmailSender();
  });

  it("marks a notification as sent after successful processing", async () => {
    const testUser = await createTestUser();
    const notificationId = ulid();

    await db.insert(notifications).values({
      id: notificationId,
      userId: testUser.id,
      channel: "email",
      type: "score_nudge",
      priority: "promotional",
      payload: { entityId: "listing-1", nudgeKey: "missing-photos" },
      dedupKey: `sent-${notificationId}`,
      status: "pending",
    });

    await processEmailJobForTest({
      type: "score_nudge",
      orderId: "listing-1",
      notificationId,
    });

    const row = await getNotification(notificationId);
    expect(row?.status).toBe("sent");
    expect(row?.sentAt).not.toBeNull();
    expect(row?.providerMessageId).toBeTruthy();
  });

  it("marks a notification as failed when the email send throws", async () => {
    const testUser = await createTestUser();
    const notificationId = ulid();

    await db.insert(notifications).values({
      id: notificationId,
      userId: testUser.id,
      channel: "email",
      type: "score_nudge",
      priority: "promotional",
      payload: { entityId: "listing-2", nudgeKey: "missing-photos" },
      dedupKey: `failed-${notificationId}`,
      status: "pending",
    });

    setMockEmailError("Simulated send failure");

    await expect(
      processEmailJobForTest({
        type: "score_nudge",
        orderId: "listing-2",
        notificationId,
      }),
    ).rejects.toThrow("Simulated send failure");

    const row = await getNotification(notificationId);
    expect(row?.status).toBe("failed");
    expect(row?.failedAt).not.toBeNull();
    expect(row?.attemptCount).toBe(1);
    expect(row?.lastError).toContain("Simulated send failure");
  });

  it("claims a notification atomically so a second processing attempt is skipped", async () => {
    const testUser = await createTestUser();
    const notificationId = ulid();

    await db.insert(notifications).values({
      id: notificationId,
      userId: testUser.id,
      channel: "email",
      type: "score_nudge",
      priority: "promotional",
      payload: { entityId: "listing-3", nudgeKey: "missing-photos" },
      dedupKey: `claim-${notificationId}`,
      status: "pending",
    });

    await processEmailJobForTest({
      type: "score_nudge",
      orderId: "listing-3",
      notificationId,
    });

    await processEmailJobForTest({
      type: "score_nudge",
      orderId: "listing-3",
      notificationId,
    });

    expect(getSentEmails()).toHaveLength(1);

    const row = await getNotification(notificationId);
    expect(row?.status).toBe("sent");
  });
});

describe("notification sweeper", () => {
  beforeEach(() => {
    enqueueEmailMock.mockClear();
  });

  it("re-enqueues stale pending notifications with the held lease marker", async () => {
    const testUser = await createTestUser();
    const notificationId = ulid();

    await db.insert(notifications).values({
      id: notificationId,
      userId: testUser.id,
      channel: "email",
      type: "score_nudge",
      priority: "promotional",
      payload: { entityId: "listing-4", nudgeKey: "missing-photos" },
      dedupKey: `sweep-pending-${notificationId}`,
      status: "pending",
      createdAt: new Date(Date.now() - 31 * 60 * 1000),
    });

    await runNotificationSweeperForTest();

    expect(enqueueEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId,
        notificationLeaseHeld: true,
        orderId: "listing-4",
      }),
    );
  });

  it("does not re-enqueue notifications that have already hit the max attempt threshold", async () => {
    const testUser = await createTestUser();
    const notificationId = ulid();

    await db.insert(notifications).values({
      id: notificationId,
      userId: testUser.id,
      channel: "email",
      type: "score_nudge",
      priority: "promotional",
      payload: { entityId: "listing-5", nudgeKey: "missing-photos" },
      dedupKey: `sweep-max-${notificationId}`,
      status: "pending",
      attemptCount: 3,
      createdAt: new Date(Date.now() - 31 * 60 * 1000),
    });

    await runNotificationSweeperForTest();

    expect(enqueueEmailMock).not.toHaveBeenCalled();

    const row = await getNotification(notificationId);
    expect(row?.status).toBe("failed");
    expect(row?.lastError).toBe("sweeper: max attempts exceeded");
  });
});
