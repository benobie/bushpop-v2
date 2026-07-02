import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  getDbExecutor,
  hasActiveTransaction,
  registerAfterCommit,
} from "@bushpop/db/client";
import { notificationPreferences, notifications } from "@bushpop/db/schema";
import { enqueueEmail, type EmailJobType } from "../workers/email.js";

type NotificationPriority = "transactional" | "promotional";

function buildDedupKey(
  channelId: string,
  userId: string,
  type: string,
  entityId: string,
  payload: Record<string, unknown>,
): string {
  const nudgeKey = typeof payload["nudgeKey"] === "string" ? payload["nudgeKey"] : "";
  const dayString = new Date().toISOString().slice(0, 10);

  return createHash("sha256")
    .update(`${channelId}${userId}${type}${entityId}${nudgeKey}${dayString}`)
    .digest("hex");
}

export async function sendNotification(
  userId: string,
  channelId: string,
  type: string,
  priority: NotificationPriority,
  payload: Record<string, unknown>,
  entityId: string,
): Promise<{ sent: boolean; notificationId?: string }> {
  const executor = getDbExecutor();

  const preferenceRows = await executor
    .select({ enabled: notificationPreferences.enabled })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.type, type),
        eq(notificationPreferences.channel, "email"),
      ),
    )
    .limit(1);

  if (preferenceRows[0]?.enabled === false) {
    return { sent: false };
  }

  const notificationPayload = {
    ...payload,
    entityId,
  };

  const insertedRows = await executor
    .insert(notifications)
    .values({
      userId,
      channel: "email",
      type,
      priority,
      payload: notificationPayload,
      dedupKey: buildDedupKey(channelId, userId, type, entityId, payload),
      status: "pending",
    })
    .onConflictDoNothing({
      target: notifications.dedupKey,
    })
    .returning({ id: notifications.id });

  const notificationId = insertedRows[0]?.id;
  if (!notificationId) {
    return { sent: false };
  }

  const enqueue = async () => {
    await enqueueEmail({
      type: type as EmailJobType,
      orderId: entityId,
      notificationId,
    });
  };

  if (hasActiveTransaction()) {
    registerAfterCommit(() => {
      enqueue().catch((error) => {
        console.error(`[notifications] Failed to enqueue notification ${notificationId}:`, error);
      });
    });
  } else {
    await enqueue();
  }

  return {
    sent: true,
    notificationId,
  };
}
