import { beforeEach, describe, expect, it, vi } from "vitest";

const { queueAddMock } = vi.hoisted(() => ({
  queueAddMock: vi.fn().mockResolvedValue({ id: "mock-job-id" }),
}));

vi.mock("bullmq", async () => {
  const actual = await vi.importActual("bullmq") as Record<string, unknown>;

  // Use class syntax so the mock is constructable with `new`
  class MockQueue {
    add = queueAddMock;
  }
  class MockWorker {
    on = vi.fn();
  }

  return {
    ...actual,
    Queue: MockQueue,
    Worker: MockWorker,
  };
});

vi.mock("../../../lib/redis.js", () => ({
  getRedis: vi.fn(() => ({ disconnect: vi.fn() })),
}));

describe("enqueueEmail", () => {
  beforeEach(() => {
    queueAddMock.mockClear();
  });

  it("uses notificationId as the BullMQ jobId when present", async () => {
    const { enqueueEmail } = await import("../../../workers/email.js");

    await enqueueEmail({
      type: "score_nudge",
      orderId: "listing-1",
      notificationId: "01JTESTNOTIFICATION0000000001",
    });

    expect(queueAddMock).toHaveBeenCalledWith(
      "send-email",
      expect.objectContaining({
        notificationId: "01JTESTNOTIFICATION0000000001",
      }),
      expect.objectContaining({
        jobId: "01JTESTNOTIFICATION0000000001",
      }),
    );
  });
});
