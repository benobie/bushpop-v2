import type { paths } from "@bushpop/api-client";

const POLL_INTERVAL_MS = 1_500;
const POLL_TIMEOUT_MS = 20_000;
const REVEAL_STAGGER_MS = 190;
const TITLE_TYPING_CHUNK_SIZE = 2;
const TITLE_TYPING_DELAY_MS = 13;

const REQUEST_HEADERS = {
  "content-type": "application/json",
  "x-requested-with": "XMLHttpRequest",
} as const;

type AiDraftRequestResponse =
  paths["/api/v1/seller/drafts/{id}/ai-draft"]["post"]["responses"][202]["content"]["application/json"];

type AiDraftStatusResponse =
  paths["/api/v1/seller/drafts/{id}/ai-draft/{jobId}"]["get"]["responses"][200]["content"]["application/json"];

export type AiRevealField = "title" | "brand" | "category" | "colour" | "gender" | "description";
export type AiRevealStatus = "idle" | "thinking" | "revealing" | "done" | "failed" | "cancelled";

export interface AiRevealError {
  reason: "request_failed" | "poll_failed" | "job_failed" | "timeout" | "missing_suggestions";
  statusCode?: number;
}

export interface AiRevealOptions {
  draftId: string;
  trigger: "auto" | "regenerate";
  shouldRevealField: (field: AiRevealField) => boolean;
  onFieldReveal: (field: AiRevealField, value: string) => void | Promise<void>;
  onStatusChange: (status: AiRevealStatus) => void;
  onTitleTyping?: (partial: string) => void;
  onError?: (error: AiRevealError) => void;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}

const FIELD_ORDER: ReadonlyArray<{
  field: AiRevealField;
  getValue: (suggestions: NonNullable<AiDraftStatusResponse["suggestions"]>) => string;
}> = [
  {
    field: "title",
    getValue: (suggestions) => suggestions.title,
  },
  {
    field: "brand",
    getValue: (suggestions) => suggestions.brand,
  },
  {
    field: "category",
    getValue: (suggestions) => suggestions.categoryLeaf,
  },
  {
    field: "colour",
    getValue: (suggestions) => suggestions.colour,
  },
  {
    field: "gender",
    getValue: (suggestions) => suggestions.gender,
  },
  {
    field: "description",
    getValue: (suggestions) => suggestions.description,
  },
] as const;

export function startAiReveal(options: AiRevealOptions): void {
  void runAiReveal(options);
}

async function runAiReveal(options: AiRevealOptions): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const startedAt = Date.now();

  try {
    throwIfAborted(options.signal);
    options.onStatusChange("thinking");

    const request = await fetchImpl(`/api/v1/seller/drafts/${options.draftId}/ai-draft`, {
      method: "POST",
      credentials: "same-origin",
      headers: REQUEST_HEADERS,
      body: JSON.stringify({ trigger: options.trigger }),
      signal: options.signal,
    });

    if (request.status !== 202) {
      options.onError?.({
        reason: "request_failed",
        statusCode: request.status,
      });
      options.onStatusChange("failed");
      return;
    }

    const requestBody = await request.json() as AiDraftRequestResponse;
    const job = await pollForAiDraft({
      draftId: options.draftId,
      jobId: requestBody.jobId,
      signal: options.signal,
      fetchImpl,
      startedAt,
      onError: options.onError,
    });

    if (!job) {
      options.onStatusChange("failed");
      return;
    }

    if (job.status === "failed") {
      options.onError?.({ reason: "job_failed" });
      options.onStatusChange("failed");
      return;
    }

    if (job.status !== "completed" || job.suggestions === null) {
      options.onError?.({ reason: "missing_suggestions" });
      options.onStatusChange("failed");
      return;
    }

    options.onStatusChange("revealing");
    await revealSuggestions(job.suggestions, options);
    options.onStatusChange("done");
  } catch (error) {
    if (isAbortError(error) || options.signal.aborted) {
      options.onStatusChange("cancelled");
      return;
    }

    options.onError?.({ reason: "poll_failed" });
    options.onStatusChange("failed");
  }
}

async function pollForAiDraft(args: {
  draftId: string;
  jobId: string;
  signal: AbortSignal;
  fetchImpl: typeof fetch;
  startedAt: number;
  onError?: (error: AiRevealError) => void;
}): Promise<AiDraftStatusResponse | null> {
  while (Date.now() - args.startedAt <= POLL_TIMEOUT_MS) {
    throwIfAborted(args.signal);

    const response = await args.fetchImpl(
      `/api/v1/seller/drafts/${args.draftId}/ai-draft/${args.jobId}`,
      {
        method: "GET",
        credentials: "same-origin",
        headers: {
          "x-requested-with": "XMLHttpRequest",
        },
        signal: args.signal,
      },
    );

    if (!response.ok) {
      args.onError?.({
        reason: "poll_failed",
        statusCode: response.status,
      });
      return null;
    }

    const body = await response.json() as AiDraftStatusResponse;
    if (body.status !== "pending") {
      return body;
    }

    if (Date.now() - args.startedAt + POLL_INTERVAL_MS > POLL_TIMEOUT_MS) {
      break;
    }

    await waitForDelay(POLL_INTERVAL_MS, args.signal);
  }

  args.onError?.({ reason: "timeout" });
  return null;
}

async function revealSuggestions(
  suggestions: NonNullable<AiDraftStatusResponse["suggestions"]>,
  options: AiRevealOptions,
): Promise<void> {
  const reducedMotion = prefersReducedMotion();
  let hasRevealedAnyField = false;

  for (const entry of FIELD_ORDER) {
    throwIfAborted(options.signal);

    if (!options.shouldRevealField(entry.field)) {
      continue;
    }

    const value = entry.getValue(suggestions);
    if (!value.trim()) {
      continue;
    }

    if (!reducedMotion && entry.field === "title") {
      await typeTitle(value, options);
    }

    await options.onFieldReveal(entry.field, value);
    hasRevealedAnyField = true;

    if (reducedMotion) {
      continue;
    }

    const nextEntry = FIELD_ORDER.slice(FIELD_ORDER.indexOf(entry) + 1).find((candidate) =>
      options.shouldRevealField(candidate.field) &&
      candidate.getValue(suggestions).trim() !== "",
    );

    if (nextEntry) {
      await waitForDelay(REVEAL_STAGGER_MS, options.signal);
    }
  }

  if (!hasRevealedAnyField) {
    throwIfAborted(options.signal);
  }
}

async function typeTitle(title: string, options: AiRevealOptions): Promise<void> {
  if (!options.onTitleTyping) {
    return;
  }

  for (let length = 0; length < title.length; length += TITLE_TYPING_CHUNK_SIZE) {
    throwIfAborted(options.signal);

    const nextLength = Math.min(title.length, length + TITLE_TYPING_CHUNK_SIZE);
    options.onTitleTyping(title.slice(0, nextLength));

    if (nextLength < title.length) {
      await waitForDelay(TITLE_TYPING_DELAY_MS, options.signal);
    }
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function waitForDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }

    const timeoutId = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);

    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", handleAbort);
      reject(createAbortError());
    };

    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw createAbortError();
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function createAbortError(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}
