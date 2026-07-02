import { eq } from "drizzle-orm";
import { db } from "./client";
import { channels } from "./schema/channels";
import { user } from "./schema/auth";
import { userRoles, sellerProfiles, addresses } from "./schema/user-domain";
import { inventoryItems, inventoryItemImages } from "./schema/inventory";
import { channelListings } from "./schema/listings";
import { ulid } from "ulid";

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
    { title: "Vintage Levi's 501 Jeans", brand: "Levi's", size: "32", colour: "blue", condition: "good", shippingClass: "m", priceCents: 6500 },
    { title: "Wool Overcoat", brand: "Country Road", size: "M", colour: "camel", condition: "excellent", shippingClass: "l", priceCents: 12000 },
    { title: "Silk Slip Dress", brand: "Zimmermann", size: "8", colour: "black", condition: "excellent", shippingClass: "s", priceCents: 9500 },
    { title: "Leather Ankle Boots", brand: "R.M. Williams", size: "9", colour: "tan", condition: "good", shippingClass: "xl", priceCents: 14000 },
    { title: "Linen Shirt", brand: "Bassike", size: "L", colour: "white", condition: "good", shippingClass: "s", priceCents: 4500 },
    { title: "Gold Hoop Earrings", brand: "Sarah & Sebastian", size: "OS", colour: "gold", condition: "excellent", shippingClass: "xs", priceCents: 3000 },
  ];

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
        size: f.size,
        colour: f.colour,
        condition: f.condition,
        shippingClass: f.shippingClass,
      })
      .returning();

    await db.insert(inventoryItemImages).values({
      inventoryItemId: item!.id,
      storageKey: `items/${item!.id}/primary.jpg`,
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
