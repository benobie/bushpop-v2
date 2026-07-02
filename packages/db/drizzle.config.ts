import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./src/schema/auth.ts",
    "./src/schema/channels.ts",
    "./src/schema/user-domain.ts",
    "./src/schema/events.ts",
    "./src/schema/infrastructure.ts",
    "./src/schema/categories.ts",
    "./src/schema/inventory.ts",
    "./src/schema/listings.ts",
    "./src/schema/commerce.ts",
    "./src/schema/notifications.ts",
    "./src/schema/wishlists.ts",
    "./src/schema/saved-searches.ts",
    "./src/schema/listing-reports.ts",
    "./src/schema/listing-scores.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
