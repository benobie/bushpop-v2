import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const dbExecuteMock = vi.fn();
const redisPingMock = vi.fn();
const stripeBalanceRetrieveMock = vi.fn();
const r2SendMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("@bushpop/db/client", () => ({
  db: {
    execute: dbExecuteMock,
  },
}));

vi.mock("../lib/redis.js", () => ({
  getRedis: vi.fn(() => ({
    ping: redisPingMock,
  })),
}));

vi.mock("../lib/stripe.js", () => ({
  getStripe: vi.fn(() => ({
    balance: {
      retrieve: stripeBalanceRetrieveMock,
    },
  })),
}));

vi.mock("../lib/r2.js", () => ({
  getR2Client: vi.fn(() => ({
    send: r2SendMock,
  })),
}));

let healthRoutes: typeof import("./health.js").healthRoutes;

beforeAll(async () => {
  ({ healthRoutes } = await import("./health.js"));
});

beforeEach(() => {
  dbExecuteMock.mockReset();
  redisPingMock.mockReset();
  stripeBalanceRetrieveMock.mockReset();
  r2SendMock.mockReset();
  fetchMock.mockReset();

  dbExecuteMock.mockResolvedValue([{ result: 1 }]);
  redisPingMock.mockResolvedValue("PONG");
  stripeBalanceRetrieveMock.mockResolvedValue({ object: "balance" });
  r2SendMock.mockResolvedValue({});
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function createApp() {
  const app = Fastify().withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(healthRoutes);
  await app.ready();

  return app;
}

describe("health routes", () => {
  it("returns 200 for /health/live without touching external dependencies", async () => {
    const app = await createApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/health/live",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
      expect(dbExecuteMock).not.toHaveBeenCalled();
      expect(redisPingMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(stripeBalanceRetrieveMock).not.toHaveBeenCalled();
      expect(r2SendMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("returns 200 for /health/ready when all checked dependencies are up", async () => {
    const app = await createApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/health/ready",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: "ok",
        checks: {
          db: "up",
          redis: "up",
          meilisearch: "up",
          stripe: "up",
          r2: "up",
          resend: "not_checked",
          starshipit: "not_checked",
        },
      });
    } finally {
      await app.close();
    }
  });

  it("returns 503 for /health/ready when the database is down", async () => {
    dbExecuteMock.mockRejectedValueOnce(new Error("db down"));
    const app = await createApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/health/ready",
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        status: "down",
        checks: {
          db: "down",
          redis: "up",
          meilisearch: "up",
          stripe: "up",
          r2: "up",
          resend: "not_checked",
          starshipit: "not_checked",
        },
      });
    } finally {
      await app.close();
    }
  });

  it("keeps readiness lenient for non-critical dependency failures", async () => {
    r2SendMock.mockRejectedValueOnce(new Error("r2 down"));
    const app = await createApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/health/ready",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: "degraded",
        checks: {
          db: "up",
          redis: "up",
          meilisearch: "up",
          stripe: "up",
          r2: "down",
          resend: "not_checked",
          starshipit: "not_checked",
        },
      });
    } finally {
      await app.close();
    }
  });

  it("keeps /health as a backward-compatible alias of readiness", async () => {
    fetchMock.mockRejectedValueOnce(new Error("meilisearch down"));
    const app = await createApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/health",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: "degraded",
        checks: {
          db: "up",
          redis: "up",
          meilisearch: "down",
          stripe: "up",
          r2: "up",
          resend: "not_checked",
          starshipit: "not_checked",
        },
      });
    } finally {
      await app.close();
    }
  });
});
