import type {
  ConditionPatch,
  DetailsPatch,
  PricePatch,
  SellDraft,
  ShippingPatch,
  WizardMeta,
} from "./types";

export const SELL_DRAFT_LOCAL_STORAGE_KEY_PREFIX = "bushpop_sell_draft:";

export const SELL_DRAFT_STEP_FIELDS = {
  details: [
    "title",
    "brand",
    "categoryId",
    "size",
    "sizeScale",
    "colour",
    "description",
  ],
  condition: ["condition", "conditionNotes", "measurements"],
  price: ["askingPriceCents", "rrpCents"],
  shipping: ["shippingOption", "parcelSize"],
} as const;

export type SellDraftEditableStep = keyof typeof SELL_DRAFT_STEP_FIELDS;
export type SellWizardStep = "photos" | "details" | "condition" | "price" | "shipping" | "review";

type DetailsPatchInput = Omit<DetailsPatch, "version">;
type ConditionPatchInput = Omit<ConditionPatch, "version">;
type PricePatchInput = Omit<PricePatch, "version">;
type ShippingPatchInput = Omit<ShippingPatch, "version">;

type StepPatchInputMap = {
  details: DetailsPatchInput;
  condition: ConditionPatchInput;
  price: PricePatchInput;
  shipping: ShippingPatchInput;
};

export type SellDraftReplayPatch = {
  [K in SellDraftEditableStep]: {
    step: K;
    patch: Partial<StepPatchInputMap[K]>;
  };
}[SellDraftEditableStep];

interface StoredSellDraftSnapshot {
  draft: SellDraft;
  wizardMeta: WizardMeta;
}

const RESUME_STEP_BY_INDEX: Record<0 | 1 | 2 | 3, SellWizardStep> = {
  0: "photos",
  1: "details",
  2: "condition",
  3: "price",
};

export function getSellDraftStorageKey(draftId: string): string {
  return `${SELL_DRAFT_LOCAL_STORAGE_KEY_PREFIX}${draftId}`;
}

export function readStoredSellDraftSnapshot(draftId: string): StoredSellDraftSnapshot | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(getSellDraftStorageKey(draftId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredSellDraftSnapshot(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function removeStoredSellDraftSnapshot(draftId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(getSellDraftStorageKey(draftId));
  } catch {
    // localStorage is best-effort only.
  }
}

export function buildSellDraftReplayPatches(
  serverDraft: SellDraft,
  localDraft: SellDraft | null,
): SellDraftReplayPatch[] {
  if (!localDraft) {
    return [];
  }

  const replayPatches: SellDraftReplayPatch[] = [];

  for (const step of Object.keys(SELL_DRAFT_STEP_FIELDS) as SellDraftEditableStep[]) {
    for (const field of SELL_DRAFT_STEP_FIELDS[step]) {
      const localValue = localDraft[field];

      if (localValue === undefined || areValuesEqual(localValue, serverDraft[field])) {
        continue;
      }

      pushReplayPatch(replayPatches, step, {
        [field]: localValue,
      } as Partial<StepPatchInputMap[typeof step]>);
    }
  }

  return replayPatches;
}

export function resolveResumeStep(draft: SellDraft): SellWizardStep {
  const nextStrengthStep = draft.strength.missing.reduce<number | null>((lowestStep, missing) => {
    if (missing.step < 0 || missing.step > 3) {
      return lowestStep;
    }

    if (lowestStep === null || missing.step < lowestStep) {
      return missing.step;
    }

    return lowestStep;
  }, null);

  if (nextStrengthStep !== null) {
    return RESUME_STEP_BY_INDEX[nextStrengthStep as 0 | 1 | 2 | 3];
  }

  return draft.shippingOption === null ? "shipping" : "review";
}

function isStoredSellDraftSnapshot(value: unknown): value is StoredSellDraftSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    "draft" in value &&
    typeof value.draft === "object" &&
    value.draft !== null &&
    "wizardMeta" in value &&
    typeof value.wizardMeta === "object" &&
    value.wizardMeta !== null
  );
}

function pushReplayPatch<K extends SellDraftEditableStep>(
  replayPatches: SellDraftReplayPatch[],
  step: K,
  patch: Partial<StepPatchInputMap[K]>,
): void {
  replayPatches.push({
    step,
    patch,
  } as SellDraftReplayPatch);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function areValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }

  if (!isPlainObject(left) || !isPlainObject(right)) {
    return false;
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key, index) => {
    const rightKey = rightKeys[index];

    if (key !== rightKey) {
      return false;
    }

    return areValuesEqual(left[key], right[rightKey]);
  });
}
