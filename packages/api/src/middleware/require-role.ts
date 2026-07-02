import type { FastifyRequest, FastifyReply } from "fastify";
import { db } from "@bushpop/db/client";
import { userRoles } from "@bushpop/db/schema";
import { eq, and } from "drizzle-orm";
import { ForbiddenError, UnauthorisedError } from "../lib/errors.js";
import type { Role } from "@bushpop/types/roles";

export function requireRole(role: Role) {
  return async function (request: FastifyRequest, _reply: FastifyReply) {
    if (!request.user) {
      throw new UnauthorisedError("Authentication required");
    }

    const rows = await db
      .select()
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, request.user.id),
          eq(userRoles.role, role),
        ),
      );

    if (rows.length === 0) {
      throw new ForbiddenError(`Role '${role}' required`);
    }
  };
}
