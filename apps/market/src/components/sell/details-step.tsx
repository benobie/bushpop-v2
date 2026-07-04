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
import { track } from "@/lib/analytics";
import {
  startAiReveal,
  type AiRevealError,
  type AiRevealField,
  type AiRevealStatus,
} from "@/lib/sell/ai-reveal";
import type { SellDraft } from "@/lib/sell/types";

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
const ANALYTICS_CHANNEL = "bushpop";

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

function hasAnyAiSuggestions(draft: SellDraft | null | undefined): boolean {
  return Boolean(
    draft?.aiTitle ??
      draft?.aiDescription ??
      draft?.aiSuggestedBrand ??
      draft?.aiSuggestedCategory ??
      draft?.aiSuggestedColour,
  );
}

function isAiRevealFieldEmpty(
  draft: SellDraft | null | undefined,
  field: AiRevealField,
): boolean {
  if (!draft) {
    return false;
  }

  switch (field) {
    case "title":
      return !draft.title?.trim();
    case "brand":
      return !draft.brand?.trim();
    case "category":
      return draft.categoryId === null && draft.category === null;
    case "colour":
      return draft.colour === null;
    case "description":
      return !draft.description?.trim();
  }
}

function isColourValue(value: string): value is (typeof COLOURS)[number] {
  return COLOURS.includes(value as (typeof COLOURS)[number]);
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
  const [titlePreview, setTitlePreview] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiRevealStatus>("idle");
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);
  const [showDraftReadyBanner, setShowDraftReadyBanner] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [isStepActive, setIsStepActive] = useState(false);
  const blurTimerRef = useRef<number | null>(null);
  const draftReadyTimerRef = useRef<number | null>(null);
  const detailsRootRef = useRef<HTMLDivElement | null>(null);
  const aiControllerRef = useRef<AbortController | null>(null);
  const aiRunIdRef = useRef(0);
  const autoTriggeredDraftIdsRef = useRef(new Set<string>());
  const parentCategoriesRef = useRef(parentCategories);
  const leafCategoriesByParentRef = useRef(leafCategoriesByParent);
  const brandListId = useId();
  const titleFieldId = useId();
  const brandFieldId = useId();
  const descriptionFieldId = useId();

  useEffect(() => {
    parentCategoriesRef.current = parentCategories;
  }, [parentCategories]);

  useEffect(() => {
    leafCategoriesByParentRef.current = leafCategoriesByParent;
  }, [leafCategoriesByParent]);

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
    const root = detailsRootRef.current;
    const panel = root?.closest(".panel");

    if (!panel) {
      setIsStepActive(true);
      return;
    }

    const syncPanelState = () => {
      setIsStepActive(panel.classList.contains("on"));
    };

    syncPanelState();

    const observer = new MutationObserver(syncPanelState);
    observer.observe(panel, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!showDraftReadyBanner) {
      if (draftReadyTimerRef.current !== null) {
        window.clearTimeout(draftReadyTimerRef.current);
        draftReadyTimerRef.current = null;
      }
      return;
    }

    draftReadyTimerRef.current = window.setTimeout(() => {
      setShowDraftReadyBanner(false);
      draftReadyTimerRef.current = null;
    }, 4_000);

    return () => {
      if (draftReadyTimerRef.current !== null) {
        window.clearTimeout(draftReadyTimerRef.current);
        draftReadyTimerRef.current = null;
      }
    };
  }, [showDraftReadyBanner]);

  useEffect(() => {
    aiRunIdRef.current += 1;
    aiControllerRef.current?.abort();
    aiControllerRef.current = null;
    setTitlePreview(null);
    setAiStatus("idle");
    setAiErrorMessage(null);
    setShowDraftReadyBanner(false);
    setShowRegenerate(hasAnyAiSuggestions(draft));

    if (draft?.id && hasAnyAiSuggestions(draft)) {
      autoTriggeredDraftIdsRef.current.add(draft.id);
    }
  }, [draft?.id]);

  useEffect(() => {
    return () => {
      aiRunIdRef.current += 1;
      aiControllerRef.current?.abort();

      if (blurTimerRef.current !== null) {
        window.clearTimeout(blurTimerRef.current);
      }

      if (draftReadyTimerRef.current !== null) {
        window.clearTimeout(draftReadyTimerRef.current);
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
  const titleValue = titlePreview ?? draft?.title ?? "";
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
  const isAiBusy = aiStatus === "thinking" || aiStatus === "revealing";
  const aiStatusMessage =
    aiStatus === "thinking"
      ? "AI is drafting from your photos..."
      : aiStatus === "revealing"
        ? "Applying AI suggestions..."
        : null;

  const cancelActiveAiReveal = () => {
    if (!aiControllerRef.current) {
      return;
    }

    aiControllerRef.current.abort();
    aiControllerRef.current = null;
    setTitlePreview(null);
    setShowDraftReadyBanner(false);
  };

  const cancelAiForUserEdit = () => {
    if (!isAiBusy) {
      return;
    }

    cancelActiveAiReveal();
  };

  const ensureParentCategoriesLoaded = async (): Promise<readonly CategoryItem[]> => {
    if (parentCategoriesRef.current.length > 0) {
      return parentCategoriesRef.current;
    }

    const items = await fetchCategories();
    setParentCategories(items);
    setCategoryError(null);
    return items;
  };

  const ensureLeafCategoriesLoaded = async (
    parentId: string,
  ): Promise<readonly CategoryItem[]> => {
    const cached = leafCategoriesByParentRef.current[parentId];
    if (cached) {
      return cached;
    }

    const items = await fetchCategories(parentId);
    setLeafCategoriesByParent((current) => {
      if (current[parentId]) {
        return current;
      }

      return {
        ...current,
        [parentId]: items,
      };
    });
    setCategoryError(null);
    return items;
  };

  const resolveCategoryLeafBySlug = async (
    slug: string,
  ): Promise<{ parent: CategoryItem; leaf: CategoryItem } | null> => {
    try {
      const parents = await ensureParentCategoriesLoaded();

      for (const parent of parents) {
        const cachedLeaves = leafCategoriesByParentRef.current[parent.id];
        const cachedMatch = cachedLeaves?.find((item) => item.slug === slug) ?? null;
        if (cachedMatch) {
          return { parent, leaf: cachedMatch };
        }
      }

      for (const parent of parents) {
        if (leafCategoriesByParentRef.current[parent.id]) {
          continue;
        }

        const leaves = await ensureLeafCategoriesLoaded(parent.id);
        const match = leaves.find((item) => item.slug === slug) ?? null;
        if (match) {
          return { parent, leaf: match };
        }
      }
    } catch {
      setCategoryError("Could not load categories.");
    }

    return null;
  };

  const getAiErrorMessage = (
    error: AiRevealError,
    trigger: "auto" | "regenerate",
  ): string => {
    if (error.statusCode === 429 && trigger === "regenerate") {
      return "You've hit the regenerate limit for this item.";
    }

    if (error.reason === "timeout") {
      return "AI took too long to finish. Try regenerate again.";
    }

    return "AI couldn't finish this draft right now.";
  };

  const applyAiFieldReveal = async (
    field: AiRevealField,
    value: string,
    runId: number,
  ): Promise<void> => {
    if (aiRunIdRef.current !== runId || !value.trim()) {
      return;
    }

    if (!isAiRevealFieldEmpty(useSellDraftStore.getState().draft, field)) {
      return;
    }

    switch (field) {
      case "title":
        setTitlePreview(value);
        patchDetails({ title: value }, { immediate: true });
        return;
      case "brand":
        setBrandQuery(value);
        setIsBrandListOpen(false);
        setBrandHighlightIndex(0);
        patchDetails({ brand: value }, { immediate: true });
        return;
      case "category": {
        const resolved = await resolveCategoryLeafBySlug(value);
        if (aiRunIdRef.current !== runId || resolved === null) {
          return;
        }

        if (!isAiRevealFieldEmpty(useSellDraftStore.getState().draft, field)) {
          return;
        }

        setSelectedParentId(resolved.parent.id);
        patchDetails({ categoryId: resolved.leaf.id }, { immediate: true });
        return;
      }
      case "colour":
        if (!isColourValue(value)) {
          return;
        }

        patchDetails({ colour: value }, { immediate: true });
        return;
      case "description":
        patchDetails({ description: value }, { immediate: true });
        return;
    }
  };

  const startReveal = (trigger: "auto" | "regenerate") => {
    const currentDraft = useSellDraftStore.getState().draft;
    if (!currentDraft) {
      return;
    }

    const nextRunId = aiRunIdRef.current + 1;
    aiRunIdRef.current = nextRunId;
    aiControllerRef.current?.abort();

    const controller = new AbortController();
    aiControllerRef.current = controller;

    setTitlePreview(null);
    setAiErrorMessage(null);
    setShowDraftReadyBanner(false);

    startAiReveal({
      draftId: currentDraft.id,
      trigger,
      signal: controller.signal,
      shouldRevealField(field) {
        if (aiRunIdRef.current !== nextRunId) {
          return false;
        }

        return isAiRevealFieldEmpty(useSellDraftStore.getState().draft, field);
      },
      onTitleTyping(partial) {
        if (aiRunIdRef.current !== nextRunId) {
          return;
        }

        setTitlePreview(partial);
      },
      onFieldReveal: async (field, value) => {
        if (aiRunIdRef.current !== nextRunId) {
          return;
        }

        await applyAiFieldReveal(field, value, nextRunId);
      },
      onStatusChange(status) {
        if (aiRunIdRef.current !== nextRunId) {
          return;
        }

        setAiStatus(status);

        if (status === "thinking" || status === "revealing") {
          setAiErrorMessage(null);
        }

        if (status === "done") {
          aiControllerRef.current = null;
          setTitlePreview(null);
          setShowRegenerate(true);
          setShowDraftReadyBanner(true);
          track({
            event: "wizard.ai_draft_generated",
            props: {
              channel: ANALYTICS_CHANNEL,
            },
          });
          return;
        }

        if (status === "failed" || status === "cancelled") {
          aiControllerRef.current = null;
          setTitlePreview(null);
          setShowRegenerate(true);
        }
      },
      onError(error) {
        if (aiRunIdRef.current !== nextRunId) {
          return;
        }

        setAiErrorMessage(getAiErrorMessage(error, trigger));
      },
    });
  };

  useEffect(() => {
    if (!draft?.id || !isStepActive || draft.images.length === 0) {
      return;
    }

    if (hasAnyAiSuggestions(draft)) {
      autoTriggeredDraftIdsRef.current.add(draft.id);
      setShowRegenerate(true);
      return;
    }

    if (autoTriggeredDraftIdsRef.current.has(draft.id)) {
      return;
    }

    autoTriggeredDraftIdsRef.current.add(draft.id);
    startReveal("auto");
  }, [
    draft,
    isStepActive,
    draft?.id,
    draft?.images.length,
  ]);

  const updateTitle = (value: string) => {
    cancelAiForUserEdit();
    patchDetails({ title: value === "" ? null : value });
  };

  const updateBrand = (value: string) => {
    cancelAiForUserEdit();
    patchDetails({ brand: value.trim() === "" ? null : value }, { immediate: true });
  };

  const updateColour = (value: (typeof COLOURS)[number]) => {
    if (draft?.colour === value) {
      return;
    }

    cancelAiForUserEdit();
    patchDetails({ colour: value }, { immediate: true });
  };

  const updateDescription = (value: string) => {
    cancelAiForUserEdit();
    patchDetails({ description: value === "" ? null : value });
  };

  const selectParent = (parent: CategoryItem) => {
    if (selectedParentId === parent.id) {
      return;
    }

    cancelAiForUserEdit();
    setSelectedParentId(parent.id);
  };

  const selectLeaf = (leaf: CategoryItem) => {
    if (draft?.categoryId === leaf.id) {
      return;
    }

    cancelAiForUserEdit();
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

    cancelAiForUserEdit();
    patchDetails(nextPatch, { immediate: true });
  };

  const toggleScale = () => {
    if (!garmentType || !showScaleToggle) {
      return;
    }

    const nextScale = currentScale === "alpha" ? "au" : "alpha";
    cancelAiForUserEdit();
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

    cancelAiForUserEdit();
    setBrandQuery(brand);
    setIsBrandListOpen(false);
    setBrandHighlightIndex(0);
    updateBrand(brand);
  };

  return (
    <div ref={detailsRootRef}>
      <h2>Item details</h2>
      <p className="hint">
        The clearer the title and brand, the more buyers find you in search.
      </p>

      {aiStatusMessage ? (
        <p
          className="muted"
          aria-live="polite"
          style={{ fontSize: 12.5, marginTop: 10 }}
        >
          {aiStatusMessage}
        </p>
      ) : null}

      {showDraftReadyBanner ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            alignItems: "center",
            background: "color-mix(in srgb, var(--sell-good) 11%, var(--sell-paper))",
            border: "1px solid color-mix(in srgb, var(--sell-good) 28%, transparent)",
            borderRadius: 14,
            display: "flex",
            gap: 12,
            justifyContent: "space-between",
            marginTop: 14,
            padding: "10px 12px",
          }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>✨ Draft ready</span>
          <button
            type="button"
            onClick={() => {
              setShowDraftReadyBanner(false);
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--sell-ink-2)",
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 600,
              padding: 0,
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {showRegenerate ? (
        <div style={{ marginTop: 14 }}>
          <button
            type="button"
            className="qa"
            onClick={() => {
              startReveal("regenerate");
            }}
          >
            ↻ Regenerate
          </button>
          {aiErrorMessage ? (
            <p
              className="muted"
              aria-live="polite"
              style={{ fontSize: 12.5, marginTop: 8 }}
            >
              {aiErrorMessage}
            </p>
          ) : null}
        </div>
      ) : null}

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
                  cancelAiForUserEdit();
                  updateDescription(appendSentence(draft?.description, sentence));
                }}
              >
                + {sentence}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
