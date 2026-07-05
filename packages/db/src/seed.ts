import { eq, inArray } from "drizzle-orm";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { db } from "./client";
import { channels } from "./schema/channels";
import { user } from "./schema/auth";
import { userRoles, sellerProfiles, addresses } from "./schema/user-domain";
import { inventoryItems, inventoryItemImages } from "./schema/inventory";
import { channelListings } from "./schema/listings";
import { categories } from "./schema/categories";
import { ulid } from "ulid";

// Fixture listing images are synthesized here (solid-colour JPEGs via sharp)
// and uploaded to R2, rather than referencing apps/web/public/demo/ — the
// engine's .dockerignore excludes apps/web/* from the api image's build
// context (Launch-1 content site deploys separately to CF Pages), so a seed
// running inside the deployed engine container can't reach those files.
// Prior versions of this seed inserted an inventory_item_images row pointing
// at `items/{id}/primary.jpg` WITHOUT ever uploading anything to R2, so the
// storefront's getPublicImageUrl() served a 404 for every seeded listing
// (staging incident, batch 39). Uploading here fails loudly (throws, exits
// the seed non-zero) instead of leaving a row that points at nothing.
function getR2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

async function uploadFixtureImage(storageKey: string, colour: { r: number; g: number; b: number }): Promise<void> {
  const body = await sharp({
    create: { width: 800, height: 800, channels: 3, background: colour },
  })
    .jpeg({ quality: 85 })
    .toBuffer();
  if (body.length === 0) {
    throw new Error(`Generated fixture image for ${storageKey} is empty`);
  }

  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) {
    throw new Error("R2_BUCKET_NAME is required to seed fixture listing images");
  }

  const r2 = getR2Client();
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: body,
      ContentType: "image/jpeg",
    }),
  );
}

async function seed() {
  console.log("Seeding database...");

  // Seed the single bushpop channel — the engine runs env-single-tenant (D3).
  // 175 bps = 1.75% headline rate; the +$0.30 fixed component arrives with the
  // effective-dated fees config in Phase 1.
  await db.insert(channels).values([
    {
      slug: "bushpop",
      name: "Bushpop",
      domain: "bushpop.com.au",
      platformFeeBps: 175,
      currency: "aud",
      shippingProvider: "starshipit",
      supportEmail: "support@bushpop.com.au",
      theme: { primaryColor: "#2d2d2d", accentColor: "#e85d3a" },
      isActive: true,
    },
  ]).onConflictDoNothing();

  // Seed admin user
  const adminId = ulid();
  await db.insert(user).values({
    id: adminId,
    name: "Admin",
    email: "admin@bushpop.com.au",
    emailVerified: true,
  }).onConflictDoNothing();

  await db.insert(userRoles).values({
    userId: adminId,
    role: "admin",
  }).onConflictDoNothing();

  await seedDevListings();

  console.log("Seeding complete.");
  process.exit(0);
}

/**
 * Dev-only storefront fixtures so a fresh local stack has something to
 * browse → add to bag → checkout. Creates one Stripe-ready test seller
 * (charges + payouts enabled, default ship-from address) and a handful of
 * active channel listings on the `bushpop` channel, each with a ready primary
 * image so listing/browse cards render.
 *
 * Stripe-readiness here is DB-state only — `stripeAccountId` is a placeholder
 * (`acct_dev_seed`). Browse and reaching the payment step work, but an actual
 * Stripe charge still needs a real test connected account (paste real test
 * keys + onboard the seller). Idempotent: skipped if the seller already exists.
 */
async function seedDevListings() {
  const SELLER_EMAIL = "seller@bushpop.com.au";

  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, SELLER_EMAIL))
    .limit(1);
  if (existing.length > 0) {
    console.log("Dev listings already seeded — skipping.");
    return;
  }

  const [bushpop] = await db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.slug, "bushpop"))
    .limit(1);
  if (!bushpop) {
    console.warn("bushpop channel missing — skipping dev listings.");
    return;
  }

  // Seller user + role
  const sellerId = ulid();
  await db.insert(user).values({
    id: sellerId,
    name: "Demo Seller",
    email: SELLER_EMAIL,
    emailVerified: true,
  });
  await db.insert(userRoles).values({ userId: sellerId, role: "seller" });

  // Default ship-from address (required for listing activation + checkout)
  const [address] = await db
    .insert(addresses)
    .values({
      userId: sellerId,
      label: "Warehouse",
      line1: "12 Collins Street",
      suburb: "Melbourne",
      state: "VIC",
      postcode: "3000",
      country: "AU",
      isDefault: true,
    })
    .returning();

  // Stripe-ready seller profile (DB-state only — placeholder account id)
  await db.insert(sellerProfiles).values({
    userId: sellerId,
    storeName: "Demo Threads",
    handle: "demo-threads",
    bio: "Curated preloved fashion — dev seed store.",
    stripeAccountId: "acct_dev_seed",
    stripeChargesEnabled: true,
    stripePayoutsEnabled: true,
    stripeOnboardingStatus: "complete",
    defaultShippingAddressId: address!.id,
    verifiedAt: new Date(),
  });

  const fixtures = [
    { title: "Vintage Levi's 501 Jeans", brand: "Levi's", size: "32", colour: "blue", condition: "good", shippingClass: "m", priceCents: 6500, categorySlug: "jeans", imageColour: { r: 60, g: 90, b: 150 } },
    { title: "Wool Overcoat", brand: "Country Road", size: "M", colour: "camel", condition: "excellent", shippingClass: "l", priceCents: 12000, categorySlug: "coats", imageColour: { r: 170, g: 130, b: 90 } },
    { title: "Silk Slip Dress", brand: "Zimmermann", size: "8", colour: "black", condition: "excellent", shippingClass: "s", priceCents: 9500, categorySlug: "midi-dresses", imageColour: { r: 30, g: 30, b: 30 } },
    { title: "Leather Ankle Boots", brand: "R.M. Williams", size: "9", colour: "tan", condition: "good", shippingClass: "xl", priceCents: 14000, categorySlug: "boots", imageColour: { r: 150, g: 110, b: 70 } },
    { title: "Linen Shirt", brand: "Bassike", size: "L", colour: "white", condition: "good", shippingClass: "s", priceCents: 4500, categorySlug: "shirts", imageColour: { r: 230, g: 228, b: 220 } },
    { title: "Gold Hoop Earrings", brand: "Sarah & Sebastian", size: "OS", colour: "gold", condition: "excellent", shippingClass: "xs", priceCents: 3000, categorySlug: "jewellery", imageColour: { r: 200, g: 170, b: 80 } },
  ];

  // Category IDs are looked up by slug (@bushpop/config CATEGORY_LEAVES) rather
  // than hardcoded — resolves to null if `db:seed:categories` hasn't run yet,
  // which is non-fatal (categoryId is nullable) but leaves PLP category
  // filtering with nothing to filter on.
  const categorySlugs = [...new Set(fixtures.map((f) => f.categorySlug))];
  const categoryRows = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .where(inArray(categories.slug, categorySlugs));
  const categoryIdBySlug = new Map(categoryRows.map((c) => [c.slug, c.id]));
  if (categoryIdBySlug.size === 0) {
    console.warn(
      "No categories found — run `pnpm --filter @bushpop/db db:seed:categories` first for PLP category filtering to have data.",
    );
  }

  for (const f of fixtures) {
    const [item] = await db
      .insert(inventoryItems)
      .values({
        ownerId: sellerId,
        title: f.title,
        description: `${f.condition} condition ${f.brand} — dev seed listing.`,
        availabilityStatus: "available",
        lifecycleState: "for_sale",
        brand: f.brand,
        categoryId: categoryIdBySlug.get(f.categorySlug) ?? null,
        size: f.size,
        colour: f.colour,
        condition: f.condition,
        shippingClass: f.shippingClass,
      })
      .returning();

    const storageKey = `items/${item!.id}/primary.jpg`;
    await uploadFixtureImage(storageKey, f.imageColour);

    await db.insert(inventoryItemImages).values({
      inventoryItemId: item!.id,
      storageKey,
      contentType: "image/jpeg",
      status: "ready",
      position: 0,
      isPrimary: true,
      confirmedAt: new Date(),
    });

    await db.insert(channelListings).values({
      inventoryItemId: item!.id,
      channelId: bushpop.id,
      title: f.title,
      description: `${f.condition} condition ${f.brand} — dev seed listing.`,
      priceCents: f.priceCents,
      currency: "AUD",
      handle: `${f.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${item!.id.slice(-6).toLowerCase()}`,
      status: "active",
      publishedAt: new Date(),
    });
  }

  console.log(`Seeded Stripe-ready seller + ${fixtures.length} active listings.`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
