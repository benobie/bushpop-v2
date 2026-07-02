import { z } from "zod";

export const ROLES = ["buyer", "seller", "admin"] as const;

export const roleSchema = z.enum(ROLES);

export type Role = z.infer<typeof roleSchema>;
