"use client";

import { useEffect, useRef, useState, type JSX } from "react";
import {
  isSizeExempt,
  MEASUREMENT_KEY_LABELS,
  MEASUREMENT_TEMPLATES,
  templateKeyForCategory,
  type MeasurementKey,
  type MeasurementTemplateKey,
} from "@bushpop/config";
import { useSellDraftStore } from "@/lib/sell/store";
import type { ConditionPatch, SellDraft } from "@/lib/sell/types";
import { MeasurementDiagram } from "./svg";

type ConditionValue = "new_with_tags" | "like_new" | "good" | "fair" | "poor";

type MeasurementInputs = Partial<Record<MeasurementKey, string>>;
type MeasurementsPatch = NonNullable<ConditionPatch["measurements"]>;

const CONDITION_OPTIONS: ReadonlyArray<{
  value: ConditionValue;
  label: string;
  description: string;
}> = [
  {
    value: "new_with_tags",
    label: "New with tags",
    description: "Unworn with the original tags still attached.",
  },
  {
    value: "like_new",
    label: "Like new",
    description: "Worn once or twice with barely any visible wear.",
  },
  {
    value: "good",
    label: "Good",
    description: "Light signs of wear, but still in strong everyday shape.",
  },
  {
    value: "fair",
    label: "Fair",
    description: "Noticeable wear or marks that buyers should expect.",
  },
  {
    value: "poor",
    label: "Poor",
    description: "Well worn with obvious flaws, but still usable.",
  },
] as const;

function resolveTemplateKey(draft: SellDraft | null): MeasurementTemplateKey {
  return templateKeyForCategory(draft?.category?.slug, draft?.category?.parentSlug);
}

function buildMeasurementInputs(
  keys: readonly MeasurementKey[],
  measurements: SellDraft["measurements"],
): MeasurementInputs {
  const nextInputs: MeasurementInputs = {};

  for (const key of keys) {
    const value = measurements?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      nextInputs[key] = value.toString();
    }
  }

  return nextInputs;
}

function buildMeasurementsPatch(
  keys: readonly MeasurementKey[],
  inputs: MeasurementInputs,
): MeasurementsPatch | null {
  const nextMeasurements: Record<string, number> = {};

  for (const key of keys) {
    const rawValue = inputs[key]?.trim() ?? "";
    if (!rawValue) {
      continue;
    }

    const numericValue = Number.parseFloat(rawValue);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      continue;
    }

    nextMeasurements[key] = numericValue;
  }

  // The OpenAPI type currently marks the superset keys as required even though
  // the drafts service accepts category-template subsets and validates them.
  return Object.keys(nextMeasurements).length > 0
    ? (nextMeasurements as MeasurementsPatch)
    : null;
}

export function ConditionStep(): JSX.Element {
  const draft = useSellDraftStore((state) => state.draft);
  const patchCondition = useSellDraftStore((state) => state.patchCondition);

  const templateKey = resolveTemplateKey(draft);
  const template = MEASUREMENT_TEMPLATES[templateKey];
  const sizeExempt = isSizeExempt(draft?.category?.parentSlug);
  const [measurementInputs, setMeasurementInputs] = useState<MeasurementInputs>(() =>
    buildMeasurementInputs(template.keys, draft?.measurements ?? null),
  );
  const diagramRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMeasurementInputs(buildMeasurementInputs(template.keys, draft?.measurements ?? null));
  }, [draft?.id, templateKey]);

  useEffect(() => {
    const figcaption = diagramRef.current?.querySelector("figcaption");
    if (figcaption instanceof HTMLElement) {
      figcaption.hidden = true;
    }
  }, [templateKey]);

  const filledMeasurements = buildMeasurementsPatch(template.keys, measurementInputs);
  const hasMeasurementReward = filledMeasurements !== null;

  const handleConditionNotesChange = (value: string) => {
    patchCondition({
      conditionNotes: value.trim() ? value : null,
    });
  };

  const handleMeasurementChange = (key: MeasurementKey, value: string) => {
    const nextInputs = {
      ...measurementInputs,
      [key]: value,
    };

    setMeasurementInputs(nextInputs);
    patchCondition(
      {
        measurements: buildMeasurementsPatch(template.keys, nextInputs),
      },
      { immediate: true },
    );
  };

  return (
    <>
      <h2>Condition &amp; measurements</h2>
      <p className="hint">
        Be honest about wear and add flat-lay measurements so buyers know what to expect.
      </p>

      <div className="field">
        <label>Condition</label>
        <div className="conds" role="radiogroup" aria-label="Condition">
          {CONDITION_OPTIONS.map((option) => {
            const selected = draft?.condition === option.value;

            return (
              <label
                key={option.value}
                className={selected ? "cond on" : "cond"}
                aria-label={option.label}
              >
                <input
                  type="radio"
                  name="condition"
                  className="sr-only"
                  checked={selected}
                  onChange={() => {
                    patchCondition({ condition: option.value }, { immediate: true });
                  }}
                />
                <span className="dot" aria-hidden="true" />
                <span>
                  <h4>{option.label}</h4>
                  <p>{option.description}</p>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="field">
        <label htmlFor="condition-notes">
          Condition notes <span>Optional</span>
        </label>
        <textarea
          id="condition-notes"
          className="ta"
          maxLength={500}
          placeholder="Call out any flaws, tailoring, repairs or standout details."
          value={draft?.conditionNotes ?? ""}
          onChange={(event) => {
            handleConditionNotesChange(event.currentTarget.value);
          }}
        />
        <div className="charc">{(draft?.conditionNotes ?? "").length}/500</div>
      </div>

      <div className="field">
        <label>
          Measurements{" "}
          <span>{sizeExempt ? "Optional for bags and accessories" : "Enter flat-lay cm"}</span>
        </label>

        <div className="measgrid">
          <div>
            <div className="measure">
              {template.keys.map((key, index) => {
                const inputId = `measurement-${key}`;

                return (
                  <div className="mrow" key={key}>
                    <div className="mn" aria-hidden="true">
                      {index + 1}
                    </div>
                    <label htmlFor={inputId}>{MEASUREMENT_KEY_LABELS[key]}</label>
                    <div className="msuffix">
                      <input
                        id={inputId}
                        className="inp"
                        type="number"
                        min="0.1"
                        step="0.1"
                        inputMode="decimal"
                        placeholder="0"
                        value={measurementInputs[key] ?? ""}
                        onChange={(event) => {
                          handleMeasurementChange(key, event.currentTarget.value);
                        }}
                      />
                      <span>cm</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMeasurementReward ? (
              <div className="mreward">
                <span aria-hidden="true">✓</span>
                <span>Nice, measurements cut returns and build buyer trust.</span>
              </div>
            ) : null}
          </div>

          <div className="mdiagram">
            <div ref={diagramRef}>
              <MeasurementDiagram templateKey={templateKey} />
            </div>
            <p className="mcap">{template.caption}</p>
          </div>
        </div>
      </div>
    </>
  );
}
