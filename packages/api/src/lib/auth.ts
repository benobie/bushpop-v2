import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@bushpop/db/client";
import * as schema from "@bushpop/db/schema";
import { ulid } from "ulid";
import { DEFAULT_CHANNEL, getChannelConfig } from "@bushpop/config";
import { getEmailSender } from "./email/index.js";
import { accountVerificationEmailTemplate, passwordResetEmailTemplate } from "./email/templates.js";

function getAuthChannelName(): string {
  return getChannelConfig(process.env.CHANNEL_SLUG ?? DEFAULT_CHANNEL).name;
}

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
    sendResetPassword: async ({ user, url }) => {
      const { subject, text } = passwordResetEmailTemplate({ url, channelName: getAuthChannelName() });
      await getEmailSender()({ to: user.email, subject, text });
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      const { subject, text } = accountVerificationEmailTemplate({ url, channelName: getAuthChannelName() });
      await getEmailSender()({ to: user.email, subject, text });
    },
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
