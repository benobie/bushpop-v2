import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { COMMISSION_SCHEDULE, BUYER_PROTECTION_SCHEDULE } from "@bushpop/config/fees";
import { requireAuth } from "../../../middleware/require-auth.js";
import { requireRole } from "../../../middleware/require-role.js";

const adminPreHandlers = [requireAuth, requireRole("admin")];

// GET /api/v1/admin/fees — read-only view of the fee constants.
//
// Deliberately read-only: fee changes go through the fees.ts review path
// (git history is the audit trail for commission rates), never a config
// edit surfaced through this panel.
export async function adminFeeRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/admin/fees",
    {
      preHandler: adminPreHandlers,
      schema: {
        tags: ["Admin - Fees"],
        summary: "View the current fee schedule (read-only, admin only)",
        response: {
          200: z.object({
            commissionSchedule: z.array(
              z.object({ effectiveFrom: z.string(), bps: z.number(), fixedCents: z.number() }),
            ),
            buyerProtectionSchedule: z.array(
              z.object({ effectiveFrom: z.string(), bps: z.number(), fixedCents: z.number() }),
            ),
          }),
        },
      },
    },
    async () => ({
      commissionSchedule: [...COMMISSION_SCHEDULE],
      buyerProtectionSchedule: [...BUYER_PROTECTION_SCHEDULE],
    }),
  );
}
