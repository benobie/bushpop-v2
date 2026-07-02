"use client";

const STEPS = ["Photos", "Details", "Pricing", "Review"] as const;
type Step = (typeof STEPS)[number];

interface StepIndicatorProps {
  currentStep: Step;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const currentIndex = STEPS.indexOf(currentStep);

  return (
    <nav aria-label="Listing wizard progress" className="w-full">
      <ol className="flex items-center justify-center gap-2">
        {STEPS.map((step, idx) => {
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;

          return (
            <li key={step} className="flex items-center gap-2">
              <div
                className={[
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                  isCompleted
                    ? "bg-brand-700 text-white"
                    : isCurrent
                      ? "bg-brand-800 text-white ring-2 ring-brand-300"
                      : "bg-brand-100 text-brand-400",
                ].join(" ")}
                aria-current={isCurrent ? "step" : undefined}
              >
                {isCompleted ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  idx + 1
                )}
              </div>
              <span
                className={[
                  "hidden text-sm font-medium sm:inline",
                  isCurrent ? "text-brand-800" : isCompleted ? "text-brand-600" : "text-brand-400",
                ].join(" ")}
              >
                {step}
              </span>
              {idx < STEPS.length - 1 && (
                <div
                  className={[
                    "h-px w-8 sm:w-12",
                    idx < currentIndex ? "bg-brand-700" : "bg-brand-200",
                  ].join(" ")}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
