import { and, eq, isNull } from "drizzle-orm";
import { db } from "@bushpop/db/client";
import { sellerProfiles, addresses } from "@bushpop/db/schema";
import {
  createPresignedPutUrl,
  headObject,
  isAllowedContentType,
  getExtensionForContentType,
  type AllowedContentType,
} from "../../../../lib/r2.js";
import { getPublicImageUrl } from "../../../../lib/image-url.js";
import { dispatchEvent } from "../../../../lib/events.js";
import { NotFoundError, ConflictError, ValidationError } from "../../../../lib/errors.js";
import type { PatchSellerProfile } from "./schemas.js";

// ---------------------------------------------------------------------------
// Get own profile
// ---------------------------------------------------------------------------

export async function getOwnSellerProfile(userId: string) {
  const [profile] = await db
    .select()
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, userId));

  if (!profile) {
    throw new NotFoundError("Seller profile not found");
  }

  return profile;
}

// ---------------------------------------------------------------------------
// Update profile
// ---------------------------------------------------------------------------

/** Fields that are included in the MeiliSearch document. */
const SEARCH_RELEVANT_FIELDS = new Set<keyof typeof sellerProfiles.$inferSelect>([
  "storeName",
  "handle",
  "avatarUrl",
]);

export async function patchSellerProfile(userId: string, data: PatchSellerProfile) {
  // Fetch current profile to compare search-relevant fields
  const [existing] = await db
    .select()
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, userId));

  if (!existing) {
    throw new NotFoundError("Seller profile not found");
  }

  // Build update payload — only include provided fields
  const updates: Partial<typeof sellerProfiles.$inferInsert> = {};
  if (data.storeName !== undefined) updates.storeName = data.storeName;
  if (data.bio !== undefined) updates.bio = data.bio;
  if (data.handle !== undefined) updates.handle = data.handle;
  if (data.vacationMode !== undefined) updates.vacationMode = data.vacationMode;

  if (data.defaultShippingAddressId !== undefined) {
    if (data.defaultShippingAddressId !== null) {
      // Validate: address must belong to this user and not be soft-deleted
      const [addr] = await db
        .select({ id: addresses.id })
        .from(addresses)
        .where(
          and(
            eq(addresses.id, data.defaultShippingAddressId),
            eq(addresses.userId, userId),
            isNull(addresses.deletedAt),
          ),
        );
      if (!addr) {
        throw new ValidationError("Address not found or does not belong to you");
      }
    }
    updates.defaultShippingAddressId = data.defaultShippingAddressId;
  }

  if (Object.keys(updates).length === 0) {
    return existing;
  }

  let updated: typeof sellerProfiles.$inferSelect;

  try {
    const [row] = await db
      .update(sellerProfiles)
      .set(updates)
      .where(eq(sellerProfiles.userId, userId))
      .returning();

    if (!row) {
      throw new NotFoundError("Seller profile not found");
    }

    updated = row;
  } catch (err: unknown) {
    // Postgres unique constraint violation on handle
    // DrizzleQueryError wraps the cause; check both outer message and cause
    const msg = err instanceof Error ? err.message : String(err);
    const causeMsg =
      err instanceof Error && err.cause instanceof Error
        ? err.cause.message
        : typeof (err as Record<string, unknown>)?.cause === "string"
          ? (err as Record<string, unknown>).cause as string
          : "";
    const combined = `${msg} ${causeMsg}`;
    if (
      combined.includes("unique") ||
      combined.includes("duplicate") ||
      combined.includes("23505")
    ) {
      throw new ConflictError("This handle is already taken");
    }
    throw err;
  }

  // Dispatch seller_profile.updated if any search-relevant field changed
  const searchRelevantChanged = Object.keys(updates).some((key) =>
    SEARCH_RELEVANT_FIELDS.has(key as keyof typeof sellerProfiles.$inferSelect),
  );

  if (searchRelevantChanged) {
    await dispatchEvent({
      eventName: "seller_profile.updated",
      category: "profiles",
      actorId: userId,
      entityType: "seller_profile",
      entityId: userId, // entityId = userId so search-sync can fetch active listings
    });
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Avatar upload
// ---------------------------------------------------------------------------

const AVATAR_EXPIRES_IN = 300; // 5 minutes

export async function requestAvatarUploadUrl(
  userId: string,
  contentType: string,
) {
  if (!isAllowedContentType(contentType)) {
    throw new ValidationError("Unsupported content type");
  }

  const [profile] = await db
    .select({ id: sellerProfiles.id })
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, userId));

  if (!profile) {
    throw new NotFoundError("Seller profile not found");
  }

  const ext = getExtensionForContentType(contentType as AllowedContentType);
  const storageKey = `avatars/${profile.id}.${ext}`;

  const uploadUrl = await createPresignedPutUrl({
    key: storageKey,
    contentType: contentType as AllowedContentType,
    expiresIn: AVATAR_EXPIRES_IN,
  });

  return { uploadUrl, storageKey, expiresIn: AVATAR_EXPIRES_IN };
}

export async function confirmAvatarUpload(userId: string, storageKey: string) {
  const [profile] = await db
    .select({ id: sellerProfiles.id })
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, userId));

  if (!profile) {
    throw new NotFoundError("Seller profile not found");
  }

  // Validate the storage key belongs to this seller's profile
  const expectedPrefix = `avatars/${profile.id}`;
  if (!storageKey.startsWith(expectedPrefix) || storageKey.includes("..") || storageKey.includes("//")) {
    throw new ValidationError("Invalid storage key");
  }

  // Verify the object exists in R2
  const metadata = await headObject(storageKey);
  if (!metadata) {
    throw new NotFoundError("Avatar not found — upload to the presigned URL first");
  }

  const avatarUrl = getPublicImageUrl(storageKey);

  const [updated] = await db
    .update(sellerProfiles)
    .set({ avatarUrl })
    .where(eq(sellerProfiles.userId, userId))
    .returning({ avatarUrl: sellerProfiles.avatarUrl });

  if (!updated?.avatarUrl) {
    throw new ConflictError("Failed to update avatar URL");
  }

  // Avatar URL is search-relevant — dispatch event for re-index
  await dispatchEvent({
    eventName: "seller_profile.updated",
    category: "profiles",
    actorId: userId,
    entityType: "seller_profile",
    entityId: userId,
  });

  return { avatarUrl: updated.avatarUrl };
}
