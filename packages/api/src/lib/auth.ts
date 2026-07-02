import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@bushpop/db/client";
import * as schema from "@bushpop/db/schema";
import { ulid } from "ulid";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  // In v1.5.6, generateId lives under advanced.database.generateId
  advanced: {
    database: {
      generateId: () => ulid(),
    },
  },
  trustedOrigins: [
    process.env.WEB_URL || "http://localhost:3000",
    process.env.ADMIN_URL || "http://localhost:3001",
  ],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
});
