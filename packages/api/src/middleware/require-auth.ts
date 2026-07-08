import type { FastifyRequest, FastifyReply } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import { UnauthorisedError } from "../lib/errors.js";

// Extend Fastify Request type with user and sessionId properties.
// These are set by requireAuth and consumed by route handlers.
declare module "fastify" {
  interface FastifyRequest {
    user: {
      id: string;
      email: string;
      name: string;
      image: string | null;
      emailVerified: boolean;
      // BF-08 guest commerce — true for a session created via the
      // `anonymous` plugin (no account, placeholder email). Route handlers
      // that touch email (e.g. checkout) must gate any email-changing
      // behaviour on this flag — never write to a real account's email.
      isAnonymous: boolean;
    } | null;
    sessionId: string | null;
  }
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.raw.headers),
  });

  if (!session || !session.user) {
    throw new UnauthorisedError("Authentication required");
  }

  request.user = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image ?? null,
    emailVerified: session.user.emailVerified,
    isAnonymous: Boolean((session.user as { isAnonymous?: boolean }).isAnonymous),
  };
  request.sessionId = session.session.id;
}
