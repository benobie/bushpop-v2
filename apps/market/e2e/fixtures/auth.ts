/**
 * E2E auth fixture — creates a real, authenticated seller session for Playwright.
 *
 * Approach: drive the REAL /api/auth/sign-up/email endpoint (via an
 * APIRequestContext, not the browser) so Better Auth issues a genuine,
 * correctly-signed session cookie — no need to replicate Better Auth's
 * internal cookie-signing scheme. The resulting request context's
 * storageState() carries that cookie with the right name/domain/attrs,
 * ready to hand to `browser.newContext({ storageState })`.
 *
 * There is no self-service "become a seller" endpoint (grep confirmed —
 * role assignment only happens via packages/db/src/seed.ts's raw insert),
 * so the seller role is granted with a direct DB insert into `user_roles`,
 * mirroring seedDevListings()'s approach.
 *
 * publishDraft() also calls assertListingActivationReady() (see
 * packages/api/src/lib/seller-readiness.ts), which 422s with "Seller
 * profile not found" unless a `sellerProfiles` row exists with
 * vacationMode=false and a valid (non-soft-deleted) defaultShippingAddressId
 * — so this fixture creates a ship-from address + seller profile too,
 * mirroring seedDevListings()'s fixture exactly (Stripe fields are
 * DB-state-only placeholders, same as the dev seed).
 */
import { request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db, endDb } from "@bushpop/db/client";
import { addresses, sellerProfiles, user, userRoles } from "@bushpop/db/schema";

type StorageState = Awaited<ReturnType<APIRequestContext["storageState"]>>;

export interface SellerFixture {
  storageState: StorageState;
  userId: string;
  email: string;
}

export async function createAuthenticatedSeller(baseURL: string): Promise<SellerFixture> {
  const uniqueSuffix = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  const email = `e2e-seller-${uniqueSuffix}@bushpop.test`;
  const password = "E2e-test-password-1!";

  const context = await playwrightRequest.newContext({ baseURL });

  try {
    const signUpResponse = await context.post("/api/auth/sign-up/email", {
      // apps/market/src/proxy.ts (FM-17) rejects any non-GET /api/* request
      // without this header as a CSRF guard — the app's own authClient sets
      // it automatically, a raw request context must set it explicitly.
      headers: { "x-requested-with": "XMLHttpRequest" },
      data: { email, password, name: "E2E Seller" },
    });

    if (!signUpResponse.ok()) {
      throw new Error(
        `Seller sign-up failed: ${signUpResponse.status()} ${await signUpResponse.text()}`,
      );
    }

    const [createdUser] = await db.select().from(user).where(eq(user.email, email));

    if (!createdUser) {
      throw new Error(`Sign-up succeeded but no user row was found for ${email}`);
    }

    await db.insert(userRoles).values({ userId: createdUser.id, role: "seller" });

    const [address] = await db
      .insert(addresses)
      .values({
        userId: createdUser.id,
        label: "Warehouse",
        line1: "12 Collins Street",
        suburb: "Melbourne",
        state: "VIC",
        postcode: "3000",
        country: "AU",
        isDefault: true,
      })
      .returning();

    await db.insert(sellerProfiles).values({
      userId: createdUser.id,
      storeName: "E2E Seller Store",
      handle: `e2e-seller-${uniqueSuffix}`,
      stripeAccountId: "acct_e2e_test",
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeOnboardingStatus: "complete",
      defaultShippingAddressId: address!.id,
      verifiedAt: new Date(),
    });

    const storageState = await context.storageState();

    return { storageState, userId: createdUser.id, email };
  } finally {
    await context.dispose();
  }
}

/** Call once per worker/file after all tests using a fixture user have finished. */
export async function closeFixtureDb(): Promise<void> {
  await endDb();
}
