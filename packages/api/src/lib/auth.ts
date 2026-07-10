import { betterAuth } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { anonymous } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@bushpop/db/client";
import * as schema from "@bushpop/db/schema";
import { ulid } from "ulid";
import { DEFAULT_CHANNEL, getChannelConfig } from "@bushpop/config";
import { getEmailSender } from "./email/index.js";
import { accountVerificationEmailTemplate, passwordResetEmailTemplate } from "./email/templates.js";
import { GUEST_EMAIL_DOMAIN, mergeAnonymousIdentity, releaseAnonymousEmail } from "./guest-identity.js";

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
  hooks: {
    // A guest who checked out has their real email stamped on their anonymous
    // user row (setGuestCheckoutEmail). Signing up with that same email —
    // which the sign-up page prefills — collides with their own guest row on
    // `user.email`, and sign-up rejects with USER_ALREADY_EXISTS long before
    // the anonymous plugin's onLinkAccount hook (and its cleanup of that row)
    // gets to run. Hand the email back to the placeholder domain first.
    //
    // Scoped to the requester's own anonymous session, so it can never touch
    // a real account's email nor another guest's. The row is about to be
    // merged and deleted anyway.
    //
    // Runs before Better Auth validates the sign-up, so a rejected attempt
    // (weak password, say) leaves the guest row back on a placeholder email.
    // That only costs the guest later order emails if they then abandon
    // sign-up entirely; retrying converts them normally. The alternative —
    // releasing after validation — is unreachable: sign-up rejects the
    // duplicate email before any user-creation hook fires.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const email = (ctx.body as { email?: unknown } | undefined)?.email;
      if (typeof email !== "string") return;

      const session = await getSessionFromCtx(ctx, { disableRefresh: true });
      const guest = session?.user;
      if (guest?.isAnonymous && guest.email === email) {
        await releaseAnonymousEmail(guest.id);
      }
    }),
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
  // Guest commerce (BF-08) — lets a guest add to bag / check out without an
  // account. An anonymous sign-in creates a real `user` row (isAnonymous:
  // true, placeholder email), so cart/checkout/orders need zero schema or
  // auth-gate changes: they already key off a real session user id.
  plugins: [
    anonymous({
      emailDomainName: GUEST_EMAIL_DOMAIN,
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        try {
          await mergeAnonymousIdentity(anonymousUser.user.id, newUser.user.id);
        } catch (err) {
          console.error("[auth] Failed to merge anonymous identity into linked account:", err);
        }
      },
    }),
  ],
});
