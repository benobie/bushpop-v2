"use client";

import { useEffect, useId, useRef, useState, type JSX } from "react";
import {
  BRANDS,
  COLOURS,
  COLOUR_HEX,
  COLOUR_LABELS,
  GARMENT_TYPES,
  type GarmentType,
  SIZE_CHART_BRAND_SLUGS,
  SIZES_BY_GARMENT,
} from "@bushpop/config";
import { useSellDraftStore } from "@/lib/sell/store";

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  channelId: string | null;
};

type CategoriesResponse = {
  items: CategoryItem[];
};

const TITLE_COACH_WORDS = [
  "jacket",
  "puffer",
  "coat",
  "tee",
  "t-shirt",
  "shirt",
  "blouse",
  "dress",
  "skirt",
  "jeans",
  "pants",
  "shorts",
  "hoodie",
  "jumper",
  "knit",
  "cardigan",
  "blazer",
  "vest",
  "sneakers",
  "trainers",
  "boots",
  "sandals",
  "heels",
  "flats",
  "bag",
  "backpack",
  "tote",
  "cap",
  "hat",
  "top",
  "cami",
  "crop",
  "scarf",
  "gloves",
  "leggings",
  "trackies",
  "swimmers",
  "bikini",
] as const;

const QUICK_ADD_SENTENCES = [
  "Smoke-free home",
  "Pet-free home",
  "True to size",
  "Runs small",
  "Runs large",
  "Freshly laundered",
  "From my own wardrobe",
] as const;

const BRAND_INPUT_MAX = 100;
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 1200;

function isGarmentType(value: string): value is GarmentType {
  return GARMENT_TYPES.includes(value as GarmentType);
}

function isAlphaSize(value: string): boolean {
  return (
    value === "One size" ||
    /^(?:XS|S|M|L|XL|XXL|XXXL)$/i.test(value)
  );
}

function isAuSize(value: string): boolean {
  return /^\d+$/.test(value) || /^W\d+$/i.test(value);
}

function getDefaultScale(garmentType: GarmentType): "alpha" | "au" | "shoe" | null {
  if (garmentType === "footwear") {
    return "shoe";
  }

  const sizeOptions = SIZES_BY_GARMENT[garmentType];
  const hasAlphaSizes = sizeOptions.some(isAlphaSize);
  const hasAuSizes = sizeOptions.some(isAuSize);

  if (hasAlphaSizes && !hasAuSizes) {
    return "alpha";
  }

  if (!hasAlphaSizes && hasAuSizes) {
    return "au";
  }

  if (hasAlphaSizes && hasAuSizes) {
    return "alpha";
  }

  return null;
}

function supportsScaleToggle(garmentType: GarmentType): boolean {
  const sizeOptions = SIZES_BY_GARMENT[garmentType];
  return sizeOptions.some(isAlphaSize) && sizeOptions.some(isAuSize);
}

function getSizeOptionsForScale(
  garmentType: GarmentType | null,
  scale: "alpha" | "au" | "shoe" | null,
): readonly string[] {
  if (!garmentType) {
    return [];
  }

  const sizeOptions = SIZES_BY_GARMENT[garmentType];

  if (scale === "shoe") {
    return sizeOptions;
  }

  if (scale === "alpha") {
    return sizeOptions.filter(isAlphaSize);
  }

  if (scale === "au") {
    return sizeOptions.filter(isAuSize);
  }

  return sizeOptions;
}

function appendSentence(currentValue: string | null | undefined, sentence: string): string {
  const trimmed = (currentValue ?? "").trim();

  if (!trimmed) {
    return `${sentence}.`;
  }

  const needsSeparator = /[.!?]$/.test(trimmed) ? " " : ". ";
  return `${trimmed}${needsSeparator}${sentence}.`;
}

function fetchCategoriesUrl(parentId?: string): string {
  if (!parentId) {
    return "/api/v1/store/categories";
  }

  const params = new URLSearchParams({ parentId });
  return `/api/v1/store/categories?${params.toString()}`;
}

async function fetchCategories(
  parentId?: string,
  signal?: AbortSignal,
): Promise<readonly CategoryItem[]> {
  const response = await fetch(fetchCategoriesUrl(parentId), {
    credentials: "same-origin",
    headers: {
      "x-requested-with": "XMLHttpRequest",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error("Failed to load categories.");
  }

  const data = await response.json() as CategoriesResponse;
  return data.items;
}

function brandMatchesTitle(title: string, brand: string | null | undefined): boolean {
  if (!brand?.trim()) {
    return false;
  }

  return title.toLowerCase().includes(brand.trim().toLowerCase());
}

function colourMatchesTitle(title: string): boolean {
  const lowerTitle = title.toLowerCase();
  return COLOURS.some((colour) =>
    lowerTitle.includes(COLOUR_LABELS[colour].toLowerCase()),
  );
}

function garmentWordMatchesTitle(title: string): boolean {
  const lowerTitle = title.toLowerCase();
  return TITLE_COACH_WORDS.some((word) => lowerTitle.includes(word));
}

export function DetailsStep(): JSX.Element {
  const draft = useSellDraftStore((state) => state.draft);
  const patchDetails = useSellDraftStore((state) => state.patchDetails);
  const [parentCategories, setParentCategories] = useState<readonly CategoryItem[]>([]);
  const [leafCategoriesByParent, setLeafCategoriesByParent] = useState<
    Record<string, readonly CategoryItem[]>
  >({});
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [loadingLeavesParentId, setLoadingLeavesParentId] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [brandQuery, setBrandQuery] = useState(draft?.brand ?? "");
  const [isBrandListOpen, setIsBrandListOpen] = useState(false);
  const [brandHighlightIndex, setBrandHighlightIndex] = useState(0);
  const [usedQuickAdds, setUsedQuickAdds] = useState<Record<string, true>>({});
  const blurTimerRef = useRef<number | null>(null);
  const brandListId = useId();
  const titleFieldId = useId();
  const brandFieldId = useId();
  const descriptionFieldId = useId();

  useEffect(() => {
    setBrandQuery(draft?.brand ?? "");
  }, [draft?.brand]);

  useEffect(() => {
    const controller = new AbortController();

    void fetchCategories(undefined, controller.signal)
      .then((items) => {
        setParentCategories(items);
        setCategoryError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCategoryError("Could not load categories.");
      });

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (selectedParentId) {
      return;
    }

    const draftParentId = draft?.category?.parentId;
    if (draftParentId) {
      setSelectedParentId(draftParentId);
      return;
    }

    const draftParentSlug = draft?.category?.parentSlug;
    if (!draftParentSlug) {
      return;
    }

    const matchedParent = parentCategories.find((item) => item.slug === draftParentSlug);
    if (matchedParent) {
      setSelectedParentId(matchedParent.id);
    }
  }, [draft?.category?.parentId, draft?.category?.parentSlug, parentCategories, selectedParentId]);

  useEffect(() => {
    if (!selectedParentId || leafCategoriesByParent[selectedParentId]) {
      return;
    }

    const controller = new AbortController();
    setLoadingLeavesParentId(selectedParentId);

    void fetchCategories(selectedParentId, controller.signal)
      .then((items) => {
        setLeafCategoriesByParent((current) => ({
          ...current,
          [selectedParentId]: items,
        }));
        setCategoryError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCategoryError("Could not load categories.");
      })
      .finally(() => {
        setLoadingLeavesParentId((current) => (current === selectedParentId ? null : current));
      });

    return () => {
      controller.abort();
    };
  }, [leafCategoriesByParent, selectedParentId]);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
      }
    };
  }, []);

  const selectedParent =
    parentCategories.find((item) => item.id === selectedParentId) ?? null;
  const leafCategories = selectedParentId ? (leafCategoriesByParent[selectedParentId] ?? []) : [];
  const selectedLeaf = draft?.categoryId
    ? leafCategories.find((item) => item.id === draft.categoryId) ?? null
    : null;
  const isDraftLeafInActiveParent =
    draft?.categoryId == null ||
    selectedParentId == null ||
    draft?.category?.parentId === selectedParentId ||
    selectedLeaf !== null;
  const currentCategorySlug =
    draft?.categoryId == null
      ? (draft?.category?.slug ?? null)
      : (selectedLeaf?.slug ?? (isDraftLeafInActiveParent ? (draft?.category?.slug ?? null) : null));
  const displayedSize = isDraftLeafInActiveParent ? (draft?.size ?? null) : null;
  const garmentType =
    selectedParent && isGarmentType(selectedParent.slug) ? selectedParent.slug : null;
  const currentScale = (() => {
    if (!garmentType) {
      return null;
    }

    const defaultScale = getDefaultScale(garmentType);
    const draftScale = draft?.sizeScale;

    if (garmentType === "footwear") {
      return "shoe";
    }

    if (isDraftLeafInActiveParent && (draftScale === "alpha" || draftScale === "au")) {
      const available = getSizeOptionsForScale(garmentType, draftScale);
      if (available.length > 0) {
        return draftScale;
      }
    }

    return defaultScale;
  })();
  const sizeOptions = getSizeOptionsForScale(garmentType, currentScale);
  const brandSuggestions = BRANDS.filter((brand) => {
    const query = brandQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return brand.toLowerCase().includes(query);
  });
  const highlightedBrand = brandSuggestions[brandHighlightIndex] ?? brandSuggestions[0] ?? null;
  const titleValue = draft?.title ?? "";
  const descriptionValue = draft?.description ?? "";
  const selectedBrand = draft?.brand ?? null;
  const sizeChartSlug =
    selectedBrand
      ? SIZE_CHART_BRAND_SLUGS[selectedBrand as keyof typeof SIZE_CHART_BRAND_SLUGS] ?? null
      : null;
  const isTitleAi = draft?.aiTitle !== null && draft?.aiTitle === draft?.title;
  const isBrandAi =
    draft?.aiSuggestedBrand !== null && draft?.aiSuggestedBrand === draft?.brand;
  const isCategoryAi =
    draft?.aiSuggestedCategory !== null &&
    currentCategorySlug !== null &&
    draft?.aiSuggestedCategory === currentCategorySlug;
  const isColourAi =
    draft?.aiSuggestedColour !== null && draft?.aiSuggestedColour === draft?.colour;
  const isDescriptionAi =
    draft?.aiDescription !== null && draft?.aiDescription === draft?.description;
  const showScaleToggle = garmentType ? supportsScaleToggle(garmentType) : false;
  const isTitleBrandMatch = brandMatchesTitle(titleValue, selectedBrand);
  const isTitleTypeMatch = garmentWordMatchesTitle(titleValue);
  const isTitleColourMatch = colourMatchesTitle(titleValue);

  const updateTitle = (value: string) => {
    patchDetails({ title: value === "" ? null : value });
  };

  const updateBrand = (value: string) => {
    patchDetails({ brand: value.trim() === "" ? null : value }, { immediate: true });
  };

  const updateColour = (value: (typeof COLOURS)[number]) => {
    if (draft?.colour === value) {
      return;
    }

    patchDetails({ colour: value }, { immediate: true });
  };

  const updateDescription = (value: string) => {
    patchDetails({ description: value === "" ? null : value });
  };

  const selectParent = (parent: CategoryItem) => {
    if (selectedParentId === parent.id) {
      return;
    }

    setSelectedParentId(parent.id);
  };

  const selectLeaf = (leaf: CategoryItem) => {
    if (draft?.categoryId === leaf.id) {
      return;
    }

    patchDetails({ categoryId: leaf.id }, { immediate: true });
  };

  const selectSize = (value: string) => {
    if (!currentScale) {
      return;
    }

    const nextPatch: {
      size?: string | null;
      sizeScale?: "alpha" | "au" | "shoe" | null;
    } = {};

    if (draft?.size !== value) {
      nextPatch.size = value;
    }

    if (draft?.sizeScale !== currentScale) {
      nextPatch.sizeScale = currentScale;
    }

    patchDetails(nextPatch, { immediate: true });
  };

  const toggleScale = () => {
    if (!garmentType || !showScaleToggle) {
      return;
    }

    const nextScale = currentScale === "alpha" ? "au" : "alpha";
    patchDetails(
      {
        size: null,
        sizeScale: nextScale,
      },
      { immediate: true },
    );
  };

  const selectBrandSuggestion = (brand: string) => {
    if (blurTimerRef.current !== null) {
      window.clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }

    setBrandQuery(brand);
    setIsBrandListOpen(false);
    setBrandHighlightIndex(0);
    updateBrand(brand);
  };

  return (
    <>
      <h2>Item details</h2>
      <p className="hint">
        The clearer the title and brand, the more buyers find you in search.
      </p>

      <div className={["field", isTitleAi ? "aifill" : ""].filter(Boolean).join(" ")}>
        <label htmlFor={titleFieldId}>
          Title
          <span className="aichip">✨ AI</span>
        </label>
        <input
          id={titleFieldId}
          className="inp"
          maxLength={TITLE_MAX}
          placeholder="e.g. Vintage Carhartt Detroit jacket - brown duck canvas"
          value={titleValue}
          onChange={(event) => {
            updateTitle(event.currentTarget.value);
          }}
        />
        <div className="charc">
          <span>{titleValue.length}</span>/{TITLE_MAX}
        </div>
        <div className="coach">
          <span className={["co", isTitleBrandMatch ? "ok" : ""].filter(Boolean).join(" ")}>
            {isTitleBrandMatch ? "✓" : "·"} Brand
          </span>
          <span className={["co", isTitleTypeMatch ? "ok" : ""].filter(Boolean).join(" ")}>
            {isTitleTypeMatch ? "✓" : "·"} Item type
          </span>
          <span className={["co", isTitleColourMatch ? "ok" : ""].filter(Boolean).join(" ")}>
            {isTitleColourMatch ? "✓" : "·"} Colour
          </span>
        </div>
      </div>

      <div className="row2">
        <div className={["field", isBrandAi ? "aifill" : ""].filter(Boolean).join(" ")}>
          <label htmlFor={brandFieldId}>
            Brand
            <span className="aichip">✨ AI</span>
          </label>
          <div style={{ position: "relative" }}>
            <input
              id={brandFieldId}
              className="inp"
              role="combobox"
              aria-autocomplete="list"
              aria-controls={brandListId}
              aria-expanded={isBrandListOpen && brandSuggestions.length > 0}
              aria-activedescendant={
                isBrandListOpen && highlightedBrand
                  ? `${brandListId}-${highlightedBrand}`
                  : undefined
              }
              autoComplete="off"
              maxLength={BRAND_INPUT_MAX}
              placeholder="Start typing..."
              value={brandQuery}
              onFocus={() => {
                if (brandSuggestions.length > 0) {
                  setIsBrandListOpen(true);
                  setBrandHighlightIndex(0);
                }
              }}
              onBlur={() => {
                blurTimerRef.current = window.setTimeout(() => {
                  setIsBrandListOpen(false);
                }, 100);
              }}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setBrandQuery(nextValue);
                setIsBrandListOpen(true);
                setBrandHighlightIndex(0);
                updateBrand(nextValue);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setIsBrandListOpen(false);
                  return;
                }

                if (event.key === "ArrowDown" && brandSuggestions.length > 0) {
                  event.preventDefault();
                  setIsBrandListOpen(true);
                  setBrandHighlightIndex((current) =>
                    current >= brandSuggestions.length - 1 ? 0 : current + 1,
                  );
                  return;
                }

                if (event.key === "ArrowUp" && brandSuggestions.length > 0) {
                  event.preventDefault();
                  setIsBrandListOpen(true);
                  setBrandHighlightIndex((current) =>
                    current <= 0 ? brandSuggestions.length - 1 : current - 1,
                  );
                  return;
                }

                if (event.key === "Enter" && isBrandListOpen && highlightedBrand) {
                  event.preventDefault();
                  event.stopPropagation();
                  selectBrandSuggestion(highlightedBrand);
                }
              }}
            />

            {isBrandListOpen && brandSuggestions.length > 0 ? (
              <div
                id={brandListId}
                role="listbox"
                style={{
                  position: "absolute",
                  zIndex: 20,
                  top: "calc(100% + 6px)",
                  left: 0,
                  right: 0,
                  maxHeight: 240,
                  overflowY: "auto",
                  border: "1px solid var(--sell-line-2)",
                  borderRadius: 12,
                  background: "var(--sell-paper)",
                  boxShadow: "0 16px 32px color-mix(in srgb, var(--sell-ink) 12%, transparent)",
                  padding: 6,
                }}
              >
                {brandSuggestions.map((brand, index) => {
                  const isActive = brand === highlightedBrand && isBrandListOpen;

                  return (
                    <button
                      key={brand}
                      id={`${brandListId}-${brand}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectBrandSuggestion(brand);
                      }}
                      onMouseEnter={() => {
                        setBrandHighlightIndex(index);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        border: "none",
                        borderRadius: 9,
                        background: isActive ? "var(--sell-ink)" : "transparent",
                        color: isActive ? "var(--sell-paper)" : "var(--sell-ink)",
                        cursor: "pointer",
                        fontFamily: "var(--font-display)",
                        fontSize: 13.5,
                        fontWeight: 600,
                        padding: "10px 12px",
                      }}
                    >
                      {brand}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <div className={["field", isColourAi ? "aifill" : ""].filter(Boolean).join(" ")}>
          <label>
            Colour
            <span className="aichip">✨ AI</span>
          </label>
          <div className="pick">
            {COLOURS.map((colour) => {
              const isSelected = draft?.colour === colour;

              return (
                <button
                  key={colour}
                  type="button"
                  className={["pk", isSelected ? "on" : ""].filter(Boolean).join(" ")}
                  aria-pressed={isSelected}
                  onClick={() => {
                    updateColour(colour);
                  }}
                >
                  <span className="sw" style={{ background: COLOUR_HEX[colour] }} />
                  {COLOUR_LABELS[colour]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={["field", isCategoryAi ? "aifill" : ""].filter(Boolean).join(" ")}>
        <label>
          Category
          <span className="aichip">✨ AI</span>
        </label>
        <div className="catpick">
          <div className="catcols">
            <div className="catparents">
              {parentCategories.map((parent) => {
                const isSelected = parent.id === selectedParentId;

                return (
                  <button
                    key={parent.id}
                    type="button"
                    className={["catp", isSelected ? "on" : ""].filter(Boolean).join(" ")}
                    onClick={() => {
                      selectParent(parent);
                    }}
                  >
                    {parent.name}
                  </button>
                );
              })}
            </div>
            <div className="catleaves">
              {loadingLeavesParentId === selectedParentId ? (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  Loading categories...
                </p>
              ) : null}

              {selectedParentId && loadingLeavesParentId !== selectedParentId
                ? leafCategories.map((leaf) => {
                    const isSelected = draft?.categoryId === leaf.id;

                    return (
                      <button
                        key={leaf.id}
                        type="button"
                        className={["pk", isSelected ? "on" : ""].filter(Boolean).join(" ")}
                        aria-pressed={isSelected}
                        onClick={() => {
                          selectLeaf(leaf);
                        }}
                      >
                        {leaf.name}
                      </button>
                    );
                  })
                : null}

              {!selectedParentId ? (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  Pick a category group first.
                </p>
              ) : null}

              {selectedParentId &&
              loadingLeavesParentId !== selectedParentId &&
              leafCategories.length === 0 ? (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  No subcategories available.
                </p>
              ) : null}
            </div>
          </div>
        </div>
        {categoryError ? (
          <p className="muted" style={{ fontSize: 12.5, marginTop: 9 }}>
            {categoryError}
          </p>
        ) : null}
      </div>

      <div className="field">
        <label>
          Size
          <span>
            {currentScale === "shoe"
              ? " - shoe sizing"
              : garmentType === null
                ? " - choose a category first"
                : ""}
          </span>
        </label>
        <div className="pick">
          {sizeOptions.map((size) => {
            const isSelected = displayedSize === size;

            return (
              <button
                key={size}
                type="button"
                className={["pk", isSelected ? "on" : ""].filter(Boolean).join(" ")}
                aria-pressed={isSelected}
                onClick={() => {
                  selectSize(size);
                }}
              >
                {size}
              </button>
            );
          })}

          {showScaleToggle ? (
            <button
              type="button"
              className="scaletoggle"
              onClick={toggleScale}
              style={{ background: "none", border: "none", padding: 0 }}
            >
              {currentScale === "alpha"
                ? "Use AU numbers (6, 8, 10...)"
                : "Use letters (S, M, L...)"}
            </button>
          ) : null}
        </div>

        {sizeChartSlug ? (
          <div style={{ marginTop: 9, fontSize: 12.5, color: "var(--sell-ink-2)" }}>
            Not sure of the size?{" "}
            <a className="green-t" href={`/guides/size-charts/${sizeChartSlug}/`}>
              Check the {selectedBrand} size chart
            </a>
          </div>
        ) : null}

        {garmentType !== null && sizeOptions.length === 0 ? (
          <p className="muted" style={{ fontSize: 12.5, marginTop: 9 }}>
            No size needed for this category.
          </p>
        ) : null}
      </div>

      <div className={["field", isDescriptionAi ? "aifill" : ""].filter(Boolean).join(" ")}>
        <label htmlFor={descriptionFieldId}>
          Description
          <span className="aichip">✨ AI</span>
        </label>
        <textarea
          id={descriptionFieldId}
          className="ta"
          maxLength={DESCRIPTION_MAX}
          placeholder="Describe the fit, fabric, era and any flaws. Buyers trust honest sellers."
          value={descriptionValue}
          onChange={(event) => {
            updateDescription(event.currentTarget.value);
          }}
        />
        <div className="charc">
          <span>{descriptionValue.length}</span>/{DESCRIPTION_MAX}
        </div>
        <div className="qadd">
          {QUICK_ADD_SENTENCES.map((sentence) => {
            const isUsed = usedQuickAdds[sentence] === true;

            return (
              <button
                key={sentence}
                type="button"
                className={["qa", isUsed ? "used" : ""].filter(Boolean).join(" ")}
                onClick={() => {
                  setUsedQuickAdds((current) => ({
                    ...current,
                    [sentence]: true,
                  }));
                  updateDescription(appendSentence(draft?.description, sentence));
                }}
              >
                + {sentence}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
