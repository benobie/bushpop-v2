import { describe, expect, it } from "vitest";
import { ulid } from "ulid";
import { signUpTestUser } from "../../helpers/auth.js";
import { getTestApp } from "../../helpers/http.js";

describe("Auth API rate limiting", () => {
  it("returns 429 on the 11th sign-in attempt from the same IP within one minute", async () => {
    const email = `auth-rate-limit-${ulid().toLowerCase()}@example.com`;
    const password = "TestPassword123!";

    await signUpTestUser({
      email,
      password,
      name: "Rate Limit Test User",
    });

    const app = await getTestApp();
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    try {
      const responses = [];

      for (let i = 0; i < 11; i += 1) {
        responses.push(await app.inject({
          method: "POST",
          url: "/api/auth/sign-in/email",
          headers: {
            "content-type": "application/json",
            "x-channel": "piklo",
          },
          payload: {
            email,
            password,
          },
        }));
      }

      expect(responses.slice(0, 10).map((response) => response.statusCode)).toEqual(
        new Array(10).fill(200),
      );
      expect(responses[10]?.statusCode).toBe(429);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
