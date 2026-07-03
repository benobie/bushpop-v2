import type { paths } from "@bushpop/api-client";

export type SellDraft =
  paths["/api/v1/seller/drafts/{id}"]["get"]["responses"][200]["content"]["application/json"];

export interface AiMeta {
  status: "idle";
}

export interface WizardMeta {
  startedAt: number;
  resumed: boolean;
}

export type DetailsPatch =
  paths["/api/v1/seller/drafts/{id}/details"]["patch"]["requestBody"]["content"]["application/json"];

export type ConditionPatch =
  paths["/api/v1/seller/drafts/{id}/condition"]["patch"]["requestBody"]["content"]["application/json"];

export type PricePatch =
  paths["/api/v1/seller/drafts/{id}/price"]["patch"]["requestBody"]["content"]["application/json"];

export type ShippingPatch =
  paths["/api/v1/seller/drafts/{id}/shipping"]["patch"]["requestBody"]["content"]["application/json"];
