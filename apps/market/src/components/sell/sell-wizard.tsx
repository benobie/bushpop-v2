"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { paths } from "@bushpop/api-client";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { useSellDraftStore } from "@/lib/sell/store";

const STEPS = ["photos", "details", "condition", "price", "shipping", "review"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
  photos: "Photos",
  details: "Details",
  condition: "Condition",
  price: "Price",
  shipping: "Shipping",
  review: "Review",
};

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

export function SellWizard({ existingDraft, initialDraftId }: SellWizardProps) {
  const draftId = useSellDraftStore((state) => state.draft?.id ?? null);
  const hydrate = useSellDraftStore((state) => state.hydrate);
  const [currentStep, setCurrentStep] = useState<Step>(STEPS[0]);
  const hasInitialisedDraftRef = useRef(false);
  const hasSyncedUrlRef = useRef(false);

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
    if (draftId || hasInitialisedDraftRef.current) {
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
        return;
      }

      hasInitialisedDraftRef.current = false;
    })();

    return () => {
      cancelled = true;
    };
  }, [draftId, hydrate, initialDraftId]);

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
    setCurrentStep(STEPS[currentIndex + 1]);
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="sell-wizard">
        <p className="eyebrow">Sell on Bushpop</p>
        <h1 className="page">List an item</h1>

        <div className="sellwrap">
          <section>
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
                <h2>{STEP_LABELS[step]}</h2>
                <p className="hint">Step content coming in a later task.</p>
              </div>
            ))}

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
              <button type="button" className="btn green lg" onClick={goToNextStep}>
                {isLastStep ? "Publish" : "Continue"}
              </button>
            </div>
          </section>

          <aside className="aside" />
        </div>
      </div>
    </main>
  );
}
