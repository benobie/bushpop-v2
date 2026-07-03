"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import type { paths } from "@bushpop/api-client";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { useSellDraftStore } from "@/lib/sell/store";
import { track } from "@/lib/analytics";
import {
  buildSellDraftReplayPatches,
  readStoredSellDraftSnapshot,
  removeStoredSellDraftSnapshot,
  resolveResumeStep,
} from "@/lib/sell/resume";
import { computeListingStrength } from "@bushpop/config";
import { PhotosStep } from "./photos-step";
import { DetailsStep } from "./details-step";
import { ConditionStep } from "./condition-step";
import { PriceStep } from "./price-step";
import { ShippingStep } from "./shipping-step";
import { ReviewStep } from "./review-step";
import { WizardAside } from "./wizard-aside";
import {
  SELL_READY_PULSE_CLASS,
  shouldEnterAdvance,
  useReadyPulse,
} from "@/lib/sell/use-ready-pulse";

const STEPS = ["photos", "details", "condition", "price", "shipping", "review"] as const;
type Step = (typeof STEPS)[number];
type DraftChoice = "pending" | "resumed" | "fresh";

const STEP_LABELS: Record<Step, string> = {
  photos: "Photos",
  details: "Details",
  condition: "Condition",
  price: "Price",
  shipping: "Shipping",
  review: "Review",
};

const STRENGTH_STEP_INDEX_BY_WIZARD_STEP: Partial<Record<Step, number>> = {
  photos: 0,
  details: 1,
  condition: 2,
  price: 3,
};
const ANALYTICS_CHANNEL = "bushpop";

export type DraftSummary =
  paths["/api/v1/seller/drafts"]["get"]["responses"][200]["content"]["application/json"]["drafts"][number];

export interface SellWizardProps {
  existingDraft: DraftSummary | null;
  initialDraftId: string | null;
}

function parseStep(search: string): Step | null {
  const value = new URLSearchParams(search).get("step");
  return value && STEPS.includes(value as Step) ? (value as Step) : null;
}

function buildStepUrl(step: Step): string {
  const params = new URLSearchParams(window.location.search);
  params.set("step", step);

  const query = params.toString();
  const hash = window.location.hash;

  return `${window.location.pathname}${query ? `?${query}` : ""}${hash}`;
}

function formatRelativeAge(value: Date | string): string {
  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "recently";
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (diffSeconds < 60) {
    return "just now";
  }

  if (diffSeconds < 60 * 60) {
    const minutes = Math.floor(diffSeconds / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  if (diffSeconds < 60 * 60 * 24) {
    const hours = Math.floor(diffSeconds / (60 * 60));
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  if (diffSeconds < 60 * 60 * 24 * 7) {
    const days = Math.floor(diffSeconds / (60 * 60 * 24));
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  if (diffSeconds < 60 * 60 * 24 * 30) {
    const weeks = Math.floor(diffSeconds / (60 * 60 * 24 * 7));
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }

  if (diffSeconds < 60 * 60 * 24 * 365) {
    const months = Math.floor(diffSeconds / (60 * 60 * 24 * 30));
    return `${months} month${months === 1 ? "" : "s"} ago`;
  }

  const years = Math.floor(diffSeconds / (60 * 60 * 24 * 365));
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function isCurrentStepReady(
  draft: ReturnType<typeof useSellDraftStore.getState>["draft"],
  step: Step,
): boolean {
  if (!draft) {
    return false;
  }

  const strengthStepIndex = STRENGTH_STEP_INDEX_BY_WIZARD_STEP[step];

  if (strengthStepIndex !== undefined) {
    const strength = computeListingStrength({
      photoCount: draft.images.filter((image) => image.status === "ready").length,
      title: draft.title,
      brand: draft.brand,
      categoryLeaf: draft.category?.slug ?? null,
      size: draft.size,
      sizeExempt: draft.measurementTemplate?.sizeExempt ?? false,
      colour: draft.colour,
      description: draft.description,
      condition: draft.condition,
      hasMeasurements: Object.values(draft.measurements ?? {}).some(
        (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
      ),
      priceCents: draft.askingPriceCents,
      rrpCents: draft.rrpCents,
      offersEnabled: false,
    });

    return !strength.missing.some((item) => item.step === strengthStepIndex);
  }

  if (step === "shipping") {
    return Boolean(
      draft.shippingOption &&
        (draft.shippingOption === "pickup" || Boolean(draft.parcelSize)),
    );
  }

  return false;
}

export function SellWizard({ existingDraft, initialDraftId }: SellWizardProps) {
  const draft = useSellDraftStore((state) => state.draft);
  const draftId = draft?.id ?? null;
  const hydrate = useSellDraftStore((state) => state.hydrate);
  const [currentStep, setCurrentStep] = useState<Step>(STEPS[0]);
  const [draftChoice, setDraftChoice] = useState<DraftChoice>(
    existingDraft ? "pending" : "fresh",
  );
  const [isChoosingDraft, setIsChoosingDraft] = useState(false);
  const hasInitialisedDraftRef = useRef(false);
  const hasSyncedUrlRef = useRef(false);
  const hasTrackedWizardStartedRef = useRef(false);
  const stepEnteredAtRef = useRef<number | null>(null);

  const trackWizardStarted = (resumed: boolean) => {
    if (hasTrackedWizardStartedRef.current) {
      return;
    }

    hasTrackedWizardStartedRef.current = true;
    track({
      event: "wizard.started",
      props: {
        channel: ANALYTICS_CHANNEL,
        resumed,
      },
    });
  };

  useEffect(() => {
    const urlStep = parseStep(window.location.search);

    if (urlStep) {
      setCurrentStep(urlStep);
    } else {
      window.history.replaceState(null, "", buildStepUrl(STEPS[0]));
    }

    hasSyncedUrlRef.current = true;

    const handlePopState = () => {
      setCurrentStep(parseStep(window.location.search) ?? STEPS[0]);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (!hasSyncedUrlRef.current) {
      return;
    }

    const urlStep = parseStep(window.location.search);
    if (urlStep === currentStep) {
      return;
    }

    window.history.pushState(null, "", buildStepUrl(currentStep));
  }, [currentStep]);

  useEffect(() => {
    if (existingDraft || draftId || hasInitialisedDraftRef.current) {
      return;
    }

    hasInitialisedDraftRef.current = true;

    let cancelled = false;
    const api = createBrowserApiClient();

    void (async () => {
      if (initialDraftId) {
        const { data } = await api.GET("/api/v1/seller/drafts/{id}", {
          params: { path: { id: initialDraftId } },
        });

        if (!cancelled && data) {
          hydrate(data, {
            startedAt: Date.now(),
            resumed: false,
          });
          trackWizardStarted(false);
          return;
        }

        hasInitialisedDraftRef.current = false;
        return;
      }

      const { data } = await api.POST("/api/v1/seller/drafts");

      if (!cancelled && data) {
        hydrate(data, {
          startedAt: Date.now(),
          resumed: false,
        });
        trackWizardStarted(false);
        return;
      }

      hasInitialisedDraftRef.current = false;
    })();

    return () => {
      cancelled = true;
    };
  }, [draftId, existingDraft, hydrate, initialDraftId]);

  const currentIndex = STEPS.indexOf(currentStep);
  const isFirstStep = currentIndex === 0;
  const isLastStep = currentIndex === STEPS.length - 1;

  const goToStep = async (step: Step) => {
    await useSellDraftStore.getState().flush();
    setCurrentStep(step);
  };

  const goToPreviousStep = async () => {
    if (isFirstStep) {
      return;
    }

    await useSellDraftStore.getState().flush();
    setCurrentStep(STEPS[currentIndex - 1]);
  };

  const goToNextStep = async () => {
    if (isLastStep) {
      return;
    }

    await useSellDraftStore.getState().flush();
    const stepCompletedMs = Math.max(0, Date.now() - (stepEnteredAtRef.current ?? Date.now()));
    track({
      event: "wizard.step_completed",
      props: {
        channel: ANALYTICS_CHANNEL,
        step: currentIndex,
        ms: stepCompletedMs,
      },
    });
    setCurrentStep(STEPS[currentIndex + 1]);
  };

  const handleResumeDraft = async () => {
    if (!existingDraft) {
      return;
    }

    setIsChoosingDraft(true);

    try {
      const api = createBrowserApiClient();
      const { data } = await api.GET("/api/v1/seller/drafts/{id}", {
        params: { path: { id: existingDraft.id } },
      });

      if (!data) {
        return;
      }

      const replayPatches = buildSellDraftReplayPatches(
        data,
        readStoredSellDraftSnapshot(existingDraft.id)?.draft ?? null,
      );
      const resumeStep: Step = resolveResumeStep(data);

      hydrate(data, {
        startedAt: Date.now(),
        resumed: true,
      });
      trackWizardStarted(true);

      const store = useSellDraftStore.getState();

      for (const replayPatch of replayPatches) {
        switch (replayPatch.step) {
          case "details":
            store.patchDetails(replayPatch.patch, { immediate: true });
            break;
          case "condition":
            store.patchCondition(replayPatch.patch, { immediate: true });
            break;
          case "price":
            store.patchPrice(replayPatch.patch, { immediate: true });
            break;
          case "shipping":
            store.patchShipping(replayPatch.patch, { immediate: true });
            break;
        }
      }

      await goToStep(resumeStep);
      setDraftChoice("resumed");
    } finally {
      setIsChoosingDraft(false);
    }
  };

  const handleStartFresh = async () => {
    if (!existingDraft) {
      return;
    }

    setIsChoosingDraft(true);

    try {
      const api = createBrowserApiClient();
      const { data } = await api.POST("/api/v1/seller/drafts");

      if (!data) {
        return;
      }

      hydrate(data, {
        startedAt: Date.now(),
        resumed: false,
      });
      trackWizardStarted(false);
      removeStoredSellDraftSnapshot(existingDraft.id);
      await goToStep(STEPS[0]);
      setDraftChoice("fresh");
    } finally {
      setIsChoosingDraft(false);
    }
  };

  const showDraftBar = existingDraft !== null && draftChoice === "pending";
  const isReadyToAdvance = isCurrentStepReady(draft, currentStep);
  const isPulsingReady = useReadyPulse(isReadyToAdvance && !isLastStep);

  useEffect(() => {
    if (showDraftBar) {
      return;
    }

    stepEnteredAtRef.current = Date.now();
  }, [currentStep, showDraftBar]);

  useEffect(() => {
    if (showDraftBar) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter") {
        return;
      }

      const activeElement = document.activeElement;
      const activeTag = activeElement?.tagName.toLowerCase();

      // Buttons/links already advance on their own native Enter behaviour —
      // don't double-fire a step change on top of that.
      if (activeTag === "button" || activeTag === "a") {
        return;
      }

      if (!shouldEnterAdvance(activeElement, currentStep)) {
        return;
      }

      event.preventDefault();
      void goToNextStep();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, showDraftBar]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="sell-wizard">
        <p className="eyebrow">Sell on Bushpop</p>
        <h1 className="page">List an item</h1>

        <div className="sellwrap">
          <section>
            {showDraftBar ? (
              <div className="draftbar on">
                <span className="dt">
                  You have a draft from <b>{formatRelativeAge(existingDraft.updatedAt)}</b>
                </span>
                <button
                  type="button"
                  className="resume"
                  onClick={() => {
                    void handleResumeDraft();
                  }}
                  disabled={isChoosingDraft}
                >
                  Resume
                </button>
                <button
                  type="button"
                  className="fresh"
                  onClick={() => {
                    void handleStartFresh();
                  }}
                  disabled={isChoosingDraft}
                >
                  Start fresh
                </button>
              </div>
            ) : (
              <>
                <div className="steps">
                  {STEPS.map((step, index) => {
                    const isActive = step === currentStep;
                    const isDone = index < currentIndex;

                    return (
                      <Fragment key={step}>
                        <div
                          className={["step", isActive ? "on" : "", isDone ? "done" : ""].filter(Boolean).join(" ")}
                          role="button"
                          tabIndex={0}
                          aria-current={isActive ? "step" : undefined}
                          onClick={() => goToStep(step)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              goToStep(step);
                            }
                          }}
                        >
                          <span className="num">{index + 1}</span>
                          <span className="label">{STEP_LABELS[step]}</span>
                        </div>
                        {index < STEPS.length - 1 && <span aria-hidden="true" className="bar" />}
                      </Fragment>
                    );
                  })}
                </div>

                <div className="progressline" aria-hidden="true">
                  <i style={{ width: `${(currentIndex / (STEPS.length - 1)) * 100}%` }} />
                </div>

                {STEPS.map((step) => (
                  <div
                    key={step}
                    className={["panel", step === currentStep ? "on" : ""].filter(Boolean).join(" ")}
                  >
                    {step === "photos" && <PhotosStep />}
                    {step === "details" && <DetailsStep />}
                    {step === "condition" && <ConditionStep />}
                    {step === "price" && <PriceStep />}
                    {step === "shipping" && <ShippingStep />}
                    {step === "review" && <ReviewStep onEditStep={(target) => void goToStep(target as Step)} />}
                  </div>
                ))}

                {/* Review renders its own Publish nav (with the gated-click wobble/toast) —
                    the generic Continue/Publish button here would duplicate it and, on
                    mobile, collide with it for the same fixed bottom-bar slot. The
                    always-available stepper above still lets a seller jump back from
                    Review to any earlier step. */}
                <div className="wnav">
                  <button
                    type="button"
                    className="back"
                    onClick={goToPreviousStep}
                    disabled={isFirstStep}
                    style={{ visibility: isFirstStep ? "hidden" : "visible" }}
                  >
                    Back
                  </button>
                  <div className="spacer" />
                  {currentStep !== "review" && (
                    <button
                      type="button"
                      className={["btn green lg", isPulsingReady ? SELL_READY_PULSE_CLASS : ""]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={goToNextStep}
                    >
                      Continue
                    </button>
                  )}
                </div>
              </>
            )}
          </section>

          <aside className="aside">
            {!showDraftBar && <WizardAside onJumpToStep={(target) => void goToStep(target as Step)} />}
          </aside>
        </div>
      </div>
    </main>
  );
}
