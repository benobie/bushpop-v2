import { eq, or } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { sellerProfiles } from "@bushpop/db/schema";
import { NotFoundError } from "../../../../lib/errors.js";

export async function getStoreSellerProfile(idOrHandle: string) {
  // Support lookup by ULID (26 chars) or handle
  const isUlid = idOrHandle.length === 26 && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(idOrHandle);

  const [profile] = await db
    .select()
    .from(sellerProfiles)
    .where(
      isUlid
        ? eq(sellerProfiles.id, idOrHandle)
        : eq(sellerProfiles.handle, idOrHandle),
    );

  if (!profile) {
    throw new NotFoundError("Seller not found");
  }

  // Return only public fields — never expose Stripe or internal data
  return {
    id: profile.id,
    handle: profile.handle,
    storeName: profile.storeName,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    verifiedAt: profile.verifiedAt,
    createdAt: profile.createdAt,
  };
}
