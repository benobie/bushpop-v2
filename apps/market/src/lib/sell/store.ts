"use client";

import { create } from "zustand";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import type {
  AiMeta,
  ConditionPatch,
  DetailsPatch,
  PricePatch,
  SellDraft,
  ShippingPatch,
  WizardMeta,
} from "./types";

const DEBOUNCE_MS = 800;
const LOCAL_STORAGE_KEY_PREFIX = "bushpop_sell_draft:";
const STEP_ORDER = ["details", "condition", "price", "shipping"] as const;

type SyncStep = (typeof STEP_ORDER)[number];

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

type StepPatchBodyMap = {
  details: DetailsPatch;
  condition: ConditionPatch;
  price: PricePatch;
  shipping: ShippingPatch;
};

type StepPendingMap = {
  [K in SyncStep]: Partial<StepPatchInputMap[K]>;
};

type EditableDraftField = {
  [K in SyncStep]: keyof StepPatchInputMap[K];
}[SyncStep];

type RequestOptions = {
  immediate?: boolean;
};

type InFlightRequest = {
  step: SyncStep;
  patch: Partial<StepPatchInputMap[SyncStep]>;
  version: number;
};

type ApiResult = {
  data?: SellDraft;
  error?: unknown;
  response?: Response;
};

const STEP_FIELDS = {
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
} as const satisfies {
  [K in SyncStep]: readonly (keyof StepPatchInputMap[K])[];
};

const INITIAL_AI_META: AiMeta = { status: "idle" };
const INITIAL_WIZARD_META: WizardMeta = { startedAt: 0, resumed: false };

let pendingWrites: StepPendingMap = createEmptyPendingWrites();
const readySteps = new Set<SyncStep>();
const debounceTimers = new Map<SyncStep, ReturnType<typeof setTimeout>>();
const flushWaiters = new Set<() => void>();

let inFlightPromise: Promise<void> | null = null;
let inFlightRequest: InFlightRequest | null = null;
let lastSyncedDraft: SellDraft | null = null;

let pagehideRegistered = false;
let pagehideHandler: ((event: PageTransitionEvent) => void) | null = null;

export interface SellDraftStore {
  draft: SellDraft | null;
  aiMeta: AiMeta;
  wizardMeta: WizardMeta;
  status: "idle" | "saving" | "conflict" | "error";
  lastError: string | null;

  hydrate(draft: SellDraft, wizardMeta: WizardMeta): void;
  patchDetails(patch: DetailsPatchInput, opts?: RequestOptions): void;
  patchCondition(patch: ConditionPatchInput, opts?: RequestOptions): void;
  patchPrice(patch: PricePatchInput, opts?: RequestOptions): void;
  patchShipping(patch: ShippingPatchInput, opts?: RequestOptions): void;
  flush(): Promise<void>;
}

export const useSellDraftStore = create<SellDraftStore>((_set, _get) => ({
  draft: null,
  aiMeta: INITIAL_AI_META,
  wizardMeta: INITIAL_WIZARD_META,
  status: "idle",
  lastError: null,

  hydrate(draft, wizardMeta) {
    resetSyncEngine();
    lastSyncedDraft = cloneDraft(draft);
    useSellDraftStore.setState({
      draft,
      wizardMeta,
      aiMeta: INITIAL_AI_META,
      status: "idle",
      lastError: null,
    });
    persistSnapshot(draft, wizardMeta);
    ensurePagehideListener();
  },

  patchDetails(patch, opts) {
    queuePatch("details", patch, opts);
  },

  patchCondition(patch, opts) {
    queuePatch("condition", patch, opts);
  },

  patchPrice(patch, opts) {
    queuePatch("price", patch, opts);
  },

  patchShipping(patch, opts) {
    queuePatch("shipping", patch, opts);
  },

  flush() {
    flushAllPendingWrites();

    return new Promise((resolve) => {
      flushWaiters.add(resolve);
      resolveFlushWaitersIfSettled();
    });
  },
}));

function createEmptyPendingWrites(): StepPendingMap {
  return {
    details: {},
    condition: {},
    price: {},
    shipping: {},
  };
}

function cloneDraft(draft: SellDraft): SellDraft {
  return structuredClone(draft);
}

function clonePatch<T extends object>(patch: T): T {
  return structuredClone(patch);
}

function getEditableFields(step: SyncStep): readonly EditableDraftField[] {
  return STEP_FIELDS[step] as readonly EditableDraftField[];
}

function hasPatchValues(patch: object): boolean {
  return Object.keys(patch).length > 0;
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

function pickDefinedFields<T extends object>(patch: T): Partial<T> {
  const defined: Partial<T> = {};

  for (const key of Object.keys(patch) as Array<keyof T>) {
    const value = patch[key];
    if (value !== undefined) {
      defined[key] = value;
    }
  }

  return defined;
}

function writePendingPatch<K extends SyncStep>(
  step: K,
  patch: Partial<StepPatchInputMap[K]>,
): void {
  pendingWrites[step] = {
    ...pendingWrites[step],
    ...clonePatch(patch),
  } as Partial<StepPatchInputMap[K]>;
}

function takePendingPatch<K extends SyncStep>(step: K): Partial<StepPatchInputMap[K]> {
  const patch = clonePatch(pendingWrites[step]);
  pendingWrites[step] = {} as Partial<StepPatchInputMap[K]>;
  return patch;
}

function requeuePendingPatch<K extends SyncStep>(
  step: K,
  patch: Partial<StepPatchInputMap[K]>,
): void {
  pendingWrites[step] = {
    ...clonePatch(patch),
    ...pendingWrites[step],
  } as Partial<StepPatchInputMap[K]>;
}

function clearDebounceTimer(step: SyncStep): void {
  const timer = debounceTimers.get(step);
  if (!timer) {
    return;
  }

  clearTimeout(timer);
  debounceTimers.delete(step);
}

function scheduleDebouncedFlush(step: SyncStep): void {
  clearDebounceTimer(step);
  readySteps.delete(step);

  const timer = setTimeout(() => {
    debounceTimers.delete(step);
    if (!hasPatchValues(pendingWrites[step])) {
      resolveFlushWaitersIfSettled();
      return;
    }

    readySteps.add(step);
    void dispatchReadySteps();
  }, DEBOUNCE_MS);

  debounceTimers.set(step, timer);
}

function scheduleImmediateFlush(step: SyncStep): void {
  clearDebounceTimer(step);
  readySteps.add(step);
  void dispatchReadySteps();
}

function flushAllPendingWrites(): void {
  for (const step of STEP_ORDER) {
    clearDebounceTimer(step);

    if (hasPatchValues(pendingWrites[step])) {
      readySteps.add(step);
    }
  }

  if (!inFlightPromise) {
    const state = useSellDraftStore.getState();
    if (state.status === "error" || state.status === "conflict") {
      useSellDraftStore.setState({ status: "idle", lastError: null });
    }
  }

  void dispatchReadySteps();
}

function isEngineSettled(): boolean {
  return inFlightPromise === null && readySteps.size === 0 && debounceTimers.size === 0;
}

function resolveFlushWaitersIfSettled(): void {
  if (!isEngineSettled()) {
    return;
  }

  for (const resolve of flushWaiters) {
    resolve();
  }
  flushWaiters.clear();
}

function nextReadyStep(): SyncStep | null {
  for (const step of STEP_ORDER) {
    if (readySteps.has(step) && hasPatchValues(pendingWrites[step])) {
      return step;
    }
  }

  return null;
}

function queuePatch<K extends SyncStep>(
  step: K,
  patch: StepPatchInputMap[K],
  opts?: RequestOptions,
): void {
  const draft = useSellDraftStore.getState().draft;
  if (!draft) {
    return;
  }

  const definedPatch = pickDefinedFields(patch);
  if (!hasPatchValues(definedPatch)) {
    return;
  }

  const nextDraft = cloneDraft(draft);
  Object.assign(nextDraft, definedPatch);

  useSellDraftStore.setState({
    draft: nextDraft,
    status: inFlightPromise ? "saving" : "idle",
    lastError: null,
  });

  writePendingPatch(step, definedPatch);

  if (opts?.immediate) {
    scheduleImmediateFlush(step);
    return;
  }

  scheduleDebouncedFlush(step);
}

async function dispatchReadySteps(): Promise<void> {
  if (inFlightPromise) {
    return inFlightPromise;
  }

  const draft = useSellDraftStore.getState().draft;
  const step = nextReadyStep();

  if (!draft || !step) {
    if (useSellDraftStore.getState().status === "saving") {
      useSellDraftStore.setState({ status: "idle" });
    }
    resolveFlushWaitersIfSettled();
    return;
  }

  readySteps.delete(step);

  const patch = takePendingPatch(step);
  if (!hasPatchValues(patch)) {
    resolveFlushWaitersIfSettled();
    return dispatchReadySteps();
  }

  useSellDraftStore.setState({ status: "saving", lastError: null });

  inFlightRequest = {
    step,
    patch: clonePatch(patch),
    version: draft.version,
  };

  inFlightPromise = performPatch({
    step,
    patch,
    version: draft.version,
  }).finally(() => {
    inFlightPromise = null;
    inFlightRequest = null;

    if (nextReadyStep()) {
      void dispatchReadySteps();
      return;
    }

    if (useSellDraftStore.getState().status === "saving") {
      useSellDraftStore.setState({ status: "idle" });
    }

    resolveFlushWaitersIfSettled();
  });

  return inFlightPromise;
}

async function performPatch(
  request: InFlightRequest,
  conflictAttempt: number = 0,
): Promise<void> {
  const draft = useSellDraftStore.getState().draft;
  if (!draft) {
    return;
  }

  try {
    const result = await sendPatchRequest(draft.id, request.step, request.patch, request.version);

    if (result.data) {
      handlePatchSuccess(result.data);
      return;
    }

    const status = result.response?.status;
    if (status === 409 || isConflictErrorBody(result.error)) {
      await handleConflict(request, conflictAttempt);
      return;
    }

    handlePatchFailure(request.step, request.patch, result.error, status);
  } catch (error) {
    handlePatchFailure(request.step, request.patch, error, undefined);
  }
}

function handlePatchSuccess(serverDraft: SellDraft): void {
  lastSyncedDraft = cloneDraft(serverDraft);

  const mergedDraft = mergeServerDraftWithPendingWrites(serverDraft);
  useSellDraftStore.setState({
    draft: mergedDraft,
    status: nextReadyStep() ? "saving" : "idle",
    lastError: null,
  });

  persistSnapshot(serverDraft, useSellDraftStore.getState().wizardMeta);
}

function handlePatchFailure(
  step: SyncStep,
  patch: Partial<StepPatchInputMap[SyncStep]>,
  error: unknown,
  status?: number,
): void {
  requeuePendingPatch(step, patch);
  readySteps.delete(step);
  useSellDraftStore.setState({
    status: "error",
    lastError: extractErrorMessage(error, status),
  });
}

async function handleConflict(
  request: InFlightRequest,
  conflictAttempt: number,
): Promise<void> {
  const state = useSellDraftStore.getState();
  const ours = state.draft;
  const base = lastSyncedDraft;

  if (!ours || !base) {
    handlePatchFailure(request.step, request.patch, { message: "Draft conflict could not be resolved." });
    return;
  }

  const refetch = await refetchDraft(request.step, ours.id, request.patch);
  if (!refetch.data) {
    return;
  }

  const theirs = refetch.data;
  lastSyncedDraft = cloneDraft(theirs);

  const mergedDraft = mergeDraftsDirtyWins(theirs, base, ours);
  useSellDraftStore.setState({
    draft: mergedDraft,
    status: "saving",
    lastError: null,
  });

  const survivingPatch = buildDirtyPatchForStep(request.step, base, ours);
  requeuePendingPatch(request.step, survivingPatch);

  if (!hasPatchValues(pendingWrites[request.step])) {
    useSellDraftStore.setState({
      status: nextReadyStep() ? "saving" : "idle",
      lastError: null,
    });
    return;
  }

  if (conflictAttempt >= 1) {
    readySteps.delete(request.step);
    persistSnapshot(mergedDraft, useSellDraftStore.getState().wizardMeta);
    useSellDraftStore.setState({
      status: "conflict",
      lastError: extractErrorMessage(
        { message: "Draft was modified elsewhere while retrying your changes." },
        409,
      ),
    });
    return;
  }

  clearDebounceTimer(request.step);
  readySteps.delete(request.step);

  const retryPatch = takePendingPatch(request.step);
  if (!hasPatchValues(retryPatch)) {
    useSellDraftStore.setState({
      status: nextReadyStep() ? "saving" : "idle",
      lastError: null,
    });
    return;
  }

  inFlightRequest = {
    step: request.step,
    patch: clonePatch(retryPatch),
    version: theirs.version,
  };

  await performPatch({
    step: request.step,
    patch: retryPatch,
    version: theirs.version,
  }, conflictAttempt + 1);
}

async function refetchDraft(
  step: SyncStep,
  draftId: string,
  patch: Partial<StepPatchInputMap[SyncStep]>,
): Promise<{ data?: SellDraft }> {
  try {
    const api = createBrowserApiClient();
    const result = await api.GET("/api/v1/seller/drafts/{id}", {
      params: { path: { id: draftId } },
    });

    if (result.data) {
      return { data: result.data };
    }

    handlePatchFailure(step, patch, result.error, result.response?.status);
    return {};
  } catch (error) {
    handlePatchFailure(step, patch, error, undefined);
    return {};
  }
}

function mergeServerDraftWithPendingWrites(serverDraft: SellDraft): SellDraft {
  const mergedDraft = cloneDraft(serverDraft);

  for (const step of STEP_ORDER) {
    Object.assign(mergedDraft, pendingWrites[step]);
  }

  return mergedDraft;
}

function mergeDraftsDirtyWins(
  theirs: SellDraft,
  base: SellDraft,
  ours: SellDraft,
): SellDraft {
  const mergedDraft = cloneDraft(theirs);

  for (const step of STEP_ORDER) {
    for (const field of getEditableFields(step)) {
      const oursValue = ours[field as keyof SellDraft];
      const baseValue = base[field as keyof SellDraft];

      if (!areValuesEqual(oursValue, baseValue)) {
        (mergedDraft as Record<string, unknown>)[field as string] = oursValue;
      }
    }
  }

  return mergedDraft;
}

function buildDirtyPatchForStep<K extends SyncStep>(
  step: K,
  base: SellDraft,
  ours: SellDraft,
): Partial<StepPatchInputMap[K]> {
  const dirtyPatch: Partial<StepPatchInputMap[K]> = {};

  for (const field of STEP_FIELDS[step]) {
    const oursValue = ours[field as keyof SellDraft];
    const baseValue = base[field as keyof SellDraft];

    if (!areValuesEqual(oursValue, baseValue)) {
      (dirtyPatch as Record<string, unknown>)[field as string] = oursValue;
    }
  }

  return dirtyPatch;
}

async function sendPatchRequest<K extends SyncStep>(
  draftId: string,
  step: K,
  patch: Partial<StepPatchInputMap[K]>,
  version: number,
): Promise<ApiResult> {
  const api = createBrowserApiClient();

  switch (step) {
    case "details":
      return api.PATCH("/api/v1/seller/drafts/{id}/details", {
        params: { path: { id: draftId } },
        body: {
          ...(patch as DetailsPatchInput),
          version,
        } satisfies DetailsPatch,
      });
    case "condition":
      return api.PATCH("/api/v1/seller/drafts/{id}/condition", {
        params: { path: { id: draftId } },
        body: {
          ...(patch as ConditionPatchInput),
          version,
        } satisfies ConditionPatch,
      });
    case "price":
      return api.PATCH("/api/v1/seller/drafts/{id}/price", {
        params: { path: { id: draftId } },
        body: {
          ...(patch as PricePatchInput),
          version,
        } satisfies PricePatch,
      });
    case "shipping":
      return api.PATCH("/api/v1/seller/drafts/{id}/shipping", {
        params: { path: { id: draftId } },
        body: {
          ...(patch as ShippingPatchInput),
          version,
        } satisfies ShippingPatch,
      });
  }
}

function isConflictErrorBody(error: unknown): boolean {
  return isPlainObject(error) && error.error === "CONFLICT";
}

function extractErrorMessage(error: unknown, status?: number): string {
  if (isPlainObject(error) && typeof error.message === "string") {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (status === 409) {
    return "Draft conflict detected.";
  }

  if (typeof status === "number") {
    return `Draft sync failed (${status}).`;
  }

  return "Draft sync failed.";
}

function persistSnapshot(draft: SellDraft, wizardMeta: WizardMeta): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY_PREFIX}${draft.id}`,
      JSON.stringify({ draft, wizardMeta }),
    );
  } catch {
    // localStorage is a best-effort resume layer only.
  }
}

function buildPagehideQueue() {
  const draft = useSellDraftStore.getState().draft;
  if (!draft) {
    return [];
  }

  const queue: Array<{
    step: SyncStep;
    version: number;
    patch: Partial<StepPatchInputMap[SyncStep]>;
  }> = [];

  let nextVersion = draft.version;

  if (inFlightRequest) {
    queue.push({
      step: inFlightRequest.step,
      version: inFlightRequest.version,
      patch: clonePatch(inFlightRequest.patch),
    });
    nextVersion = inFlightRequest.version + 1;
  }

  for (const step of STEP_ORDER) {
    const patch = pendingWrites[step];
    if (!hasPatchValues(patch)) {
      continue;
    }

    queue.push({
      step,
      version: nextVersion,
      patch: clonePatch(patch),
    });
    nextVersion += 1;
  }

  return queue.map((entry) => ({
    ...entry,
    draftId: draft.id,
  }));
}

function firePagehideFlush(): void {
  if (typeof window === "undefined") {
    return;
  }

  for (const request of buildPagehideQueue()) {
    const url = getStepUrl(request.draftId, request.step);
    const body = JSON.stringify({
      ...request.patch,
      version: request.version,
    });

    void fetch(url, {
      method: "PATCH",
      credentials: "include",
      keepalive: true,
      headers: {
        "content-type": "application/json",
        "x-requested-with": "XMLHttpRequest",
      },
      body,
    });
  }
}

function getStepUrl(draftId: string, step: SyncStep): string {
  switch (step) {
    case "details":
      return `/api/v1/seller/drafts/${draftId}/details`;
    case "condition":
      return `/api/v1/seller/drafts/${draftId}/condition`;
    case "price":
      return `/api/v1/seller/drafts/${draftId}/price`;
    case "shipping":
      return `/api/v1/seller/drafts/${draftId}/shipping`;
  }
}

function ensurePagehideListener(): void {
  if (pagehideRegistered || typeof window === "undefined") {
    return;
  }

  pagehideHandler = () => {
    firePagehideFlush();
  };

  window.addEventListener("pagehide", pagehideHandler);
  pagehideRegistered = true;
}

function teardownPagehideListener(): void {
  if (!pagehideRegistered || !pagehideHandler || typeof window === "undefined") {
    return;
  }

  window.removeEventListener("pagehide", pagehideHandler);
  pagehideHandler = null;
  pagehideRegistered = false;
}

function resetSyncEngine(): void {
  for (const step of STEP_ORDER) {
    clearDebounceTimer(step);
  }

  readySteps.clear();
  pendingWrites = createEmptyPendingWrites();
  inFlightPromise = null;
  inFlightRequest = null;
  flushWaiters.clear();
}

export function resetSellDraftStoreForTests(): void {
  resetSyncEngine();
  teardownPagehideListener();
  lastSyncedDraft = null;
  useSellDraftStore.setState({
    draft: null,
    aiMeta: INITIAL_AI_META,
    wizardMeta: INITIAL_WIZARD_META,
    status: "idle",
    lastError: null,
  });
}
