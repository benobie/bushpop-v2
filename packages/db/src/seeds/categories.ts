import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { categories } from "../schema/categories";
import { GARMENT_TYPES, GARMENT_TYPE_LABELS } from "@bushpop/config/taxonomy";

const SUBCATEGORIES: Partial<Record<string, string[]>> = {
  tops: ["t-shirts", "shirts", "blouses", "knitwear", "tank-tops"],
  bottoms: ["jeans", "trousers", "skirts", "shorts"],
  dresses: ["mini-dresses", "midi-dresses", "maxi-dresses"],
  outerwear: ["jackets", "coats", "blazers", "vests"],
  footwear: ["sneakers", "boots", "heels", "sandals", "flats"],
  bags: ["tote-bags", "crossbody", "clutches", "backpacks"],
  accessories: ["jewellery", "belts", "scarves", "hats", "sunglasses"],
};

function slugToName(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function seedCategories() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const client = postgres(connectionString);
  const db = drizzle(client);

  console.log("Seeding categories...");

  for (const garmentType of GARMENT_TYPES) {
    const label = GARMENT_TYPE_LABELS[garmentType];

    // Insert parent category (global — no channelId)
    const [parent] = await db
      .insert(categories)
      .values({
        channelId: null,
        name: label,
        slug: garmentType,
        parentId: null,
      })
      .onConflictDoNothing()
      .returning();

    if (!parent) {
      console.log(`  Skipping ${label} (already exists)`);
      continue;
    }

    console.log(`  Created: ${label}`);

    // Insert subcategories
    const subs = SUBCATEGORIES[garmentType] ?? [];
    for (const sub of subs) {
      await db
        .insert(categories)
        .values({
          channelId: null,
          name: slugToName(sub),
          slug: sub,
          parentId: parent.id,
        })
        .onConflictDoNothing();
    }

    if (subs.length > 0) {
      console.log(`    + ${subs.length} subcategories`);
    }
  }

  console.log("Category seeding complete.");
  await client.end();
}

seedCategories().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
