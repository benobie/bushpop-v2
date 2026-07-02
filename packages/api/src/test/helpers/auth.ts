import { eq } from "drizzle-orm";
import { getTestApp } from "./http.js";
import { db } from "@bushpop/db/client";
import { userRoles, sellerProfiles, addresses } from "@bushpop/db/schema";
import { ulid } from "ulid";

/**
 * Create a test user via Better Auth's signup endpoint.
 * Returns the user data and session token cookie.
 */
export async function signUpTestUser(overrides?: {
  email?: string;
  password?: string;
  name?: string;
}) {
  const app = await getTestApp();
  const email = overrides?.email ?? `test-${ulid().toLowerCase()}@example.com`;
  const password = overrides?.password ?? "TestPassword123!";
  const name = overrides?.name ?? "Test User";

  const res = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: { "content-type": "application/json", "x-channel": "piklo" },
    payload: { email, password, name },
  });

  if (res.statusCode !== 200) {
    throw new Error(`Signup failed (${res.statusCode}): ${res.body}`);
  }

  // Extract session cookie from Set-Cookie header
  const cookies = res.cookies;
  const sessionCookie = cookies.find(
    (c: { name: string }) => c.name === "better-auth.session_token",
  );

  if (!sessionCookie) {
    throw new Error("No session cookie returned from signup");
  }

  const body = res.json();

  return {
    user: body.user as { id: string; email: string; name: string },
    token: body.token as string,
    sessionToken: sessionCookie.value as string,
  };
}

/**
 * Grant seller role and create a seller profile for a test user.
 *
 * Pass `withDefaultAddress: true` to also create an address and set it as
 * the seller's default ship-from address. Required for listing activation tests
 * that need to pass the Tier-1 seller readiness check.
 */
export async function grantSellerRole(
  userId: string,
  overrides?: { storeName?: string; handle?: string; withDefaultAddress?: boolean },
) {
  await db.insert(userRoles).values({ userId, role: "seller" });

  const [profile] = await db
    .insert(sellerProfiles)
    .values({
      userId,
      storeName: overrides?.storeName ?? "Test Store",
      handle: overrides?.handle ?? `test-${ulid().slice(-6).toLowerCase()}`,
    })
    .returning();

  if (overrides?.withDefaultAddress) {
    const [addr] = await db
      .insert(addresses)
      .values({
        userId,
        line1: "1 Test Street",
        suburb: "Sydney",
        state: "NSW",
        postcode: "2000",
        country: "AU",
      })
      .returning();

    await db
      .update(sellerProfiles)
      .set({ defaultShippingAddressId: addr!.id })
      .where(eq(sellerProfiles.userId, userId));
  }

  return profile!;
}
