import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { db } from "@bushpop/db/client";
import { sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { getR2Client } from "../lib/r2.js";
import { getRedis } from "../lib/redis.js";
import { getStripe } from "../lib/stripe.js";

const healthDepStatusSchema = z.enum(["up", "down", "not_checked"]);
const readinessStatusSchema = z.enum(["ok", "degraded", "down"]);

const readinessChecksSchema = z.object({
  db: healthDepStatusSchema,
  redis: healthDepStatusSchema,
  meilisearch: healthDepStatusSchema,
  stripe: healthDepStatusSchema,
  r2: healthDepStatusSchema,
  resend: healthDepStatusSchema,
  starshipit: healthDepStatusSchema,
});

const livenessResponseSchema = z.object({
  status: z.literal("ok"),
});

const readinessResponseSchema = z.object({
  status: readinessStatusSchema,
  checks: readinessChecksSchema,
});

type DepStatus = z.infer<typeof healthDepStatusSchema>;
type ReadinessChecks = z.infer<typeof readinessChecksSchema>;
type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

const HEALTH_CHECK_TIMEOUT_MS = 2000;
const CRITICAL_DEPENDENCIES = ["db", "redis", "stripe"] as const;
const LENIENT_DEPENDENCIES = ["meilisearch", "r2", "resend", "starshipit"] as const;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function runCheck(check: () => Promise<unknown>): Promise<DepStatus> {
  try {
    await withTimeout(check(), HEALTH_CHECK_TIMEOUT_MS);
    return "up";
  } catch {
    return "down";
  }
}

function hasCriticalDependencyDown(checks: ReadinessChecks): boolean {
  return CRITICAL_DEPENDENCIES.some((dep) => checks[dep] === "down");
}

function hasLenientDependencyDown(checks: ReadinessChecks): boolean {
  return LENIENT_DEPENDENCIES.some((dep) => checks[dep] === "down");
}

async function runReadinessChecks(): Promise<ReadinessResponse> {
  const [dbStatus, redisStatus, meilisearchStatus, stripeStatus, r2Status] =
    await Promise.all([
      runCheck(() => db.execute(sql`SELECT 1`)),
      runCheck(async () => {
        const redis = getRedis();
        await redis.ping();
      }),
      runCheck(async () => {
        const meiliHost = process.env.MEILISEARCH_HOST || "http://localhost:7701";
        const response = await fetch(`${meiliHost}/health`);
        if (!response.ok) {
          throw new Error(`MeiliSearch health returned ${response.status}`);
        }
      }),
      runCheck(async () => {
        const stripe = getStripe();
        await stripe.balance.retrieve();
      }),
      runCheck(async () => {
        const r2 = getR2Client();
        await r2.send(
          new HeadBucketCommand({
            Bucket: process.env.R2_BUCKET_NAME,
          }),
        );
      }),
    ]);

  const checks: ReadinessChecks = {
    db: dbStatus,
    redis: redisStatus,
    meilisearch: meilisearchStatus,
    stripe: stripeStatus,
    r2: r2Status,
    resend: "not_checked",
    starshipit: "not_checked",
  };

  if (hasCriticalDependencyDown(checks)) {
    return {
      status: "down",
      checks,
    };
  }

  if (hasLenientDependencyDown(checks)) {
    return {
      status: "degraded",
      checks,
    };
  }

  return {
    status: "ok",
    checks,
  };
}

async function sendReadinessResponse(reply: FastifyReply) {
  const response = await runReadinessChecks();
  const statusCode = hasCriticalDependencyDown(response.checks) ? 503 : 200;

  return reply.status(statusCode).send(response);
}

export async function healthRoutes(app: FastifyInstance) {
  app.get(
    "/health/live",
    {
      schema: {
        tags: ["Health"],
        summary: "Liveness probe",
        response: {
          200: livenessResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send({ status: "ok" });
    },
  );

  app.get(
    "/health/ready",
    {
      schema: {
        tags: ["Health"],
        summary: "Readiness probe",
        response: {
          200: readinessResponseSchema,
          503: readinessResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      return sendReadinessResponse(reply);
    },
  );

  app.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Legacy readiness probe alias",
        deprecated: true,
        response: {
          200: readinessResponseSchema,
          503: readinessResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      return sendReadinessResponse(reply);
    },
  );
}
