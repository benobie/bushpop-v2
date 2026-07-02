import { z } from "zod";

export const reportReasonSchema = z.enum([
  "counterfeit",
  "inappropriate",
  "misleading",
  "prohibited",
  "other",
]);
