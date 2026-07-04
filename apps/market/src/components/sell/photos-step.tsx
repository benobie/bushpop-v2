"use client";

import imageCompression from "browser-image-compression";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type JSX,
  type KeyboardEvent,
} from "react";
import { createBrowserApiClient } from "@bushpop/api-client/browser";
import { useSellDraftStore } from "@/lib/sell/store";
import type { SellDraft } from "@/lib/sell/types";

const MAX_IMAGES = 10;
const MIN_SHORT_EDGE = 800;
const MAX_LONG_EDGE = 2048;
const MAX_UPLOAD_SIZE_MB = 0.4;
const INITIAL_COMPRESSION_QUALITY = 0.8;

export const DARK_BRIGHTNESS_THRESHOLD = 60;
export const BLUR_VARIANCE_THRESHOLD = 50;

type UploadContentType = "image/jpeg" | "image/png" | "image/webp";
type DraftImage = SellDraft["images"][number];

type PhotoAssessment = {
  shortEdge: number;
  tooSmall: boolean;
  brightness: number;
  isDark: boolean;
  blurVariance: number;
  isBlurry: boolean;
};

type PixelFrame = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

type LocalUpload = {
  localId: string;
  imageId: string | null;
  previewUrl: string;
  fileName: string;
  status: "uploading" | "error";
  errorMessage: string | null;
  position: number;
  isPrimary: boolean;
  assessment: PhotoAssessment;
};

type CompressDeps = {
  compress?: (
    image: File,
    options: Parameters<typeof imageCompression>[1],
  ) => Promise<File>;
  supportsWebpEncoding?: () => boolean;
};

type CanvasLike = {
  toDataURL(type?: string): string;
};

type DisplayItem =
  | {
      kind: "server";
      image: DraftImage;
      assessment: PhotoAssessment | null;
    }
  | {
      kind: "local";
      upload: LocalUpload;
    };

function createLocalUploadId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function revokeObjectUrl(url: string | null | undefined): void {
  if (!url) {
    return;
  }

  URL.revokeObjectURL(url);
}

function isSupportedUploadContentType(value: string): value is UploadContentType {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const maybeMessage = Reflect.get(error, "message");
    if (typeof maybeMessage === "string" && maybeMessage.trim().length > 0) {
      return maybeMessage;
    }

    const maybeError = Reflect.get(error, "error");
    if (typeof maybeError === "string" && maybeError.trim().length > 0) {
      return maybeError;
    }

    const maybeIssues = Reflect.get(error, "issues");
    if (Array.isArray(maybeIssues)) {
      const firstIssue = maybeIssues[0];
      if (typeof firstIssue === "object" && firstIssue !== null) {
        const issueMessage = Reflect.get(firstIssue, "message");
        if (typeof issueMessage === "string" && issueMessage.trim().length > 0) {
          return issueMessage;
        }
      }
    }
  }

  return fallback;
}

function sortImagesByPosition(images: DraftImage[]): DraftImage[] {
  return [...images].sort((left, right) => left.position - right.position);
}

function normalizeImagePositions(images: DraftImage[]): DraftImage[] {
  return images.map((image, index) => ({
    ...image,
    position: index,
  }));
}

export function moveImage<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return [...items];
  }

  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);

  if (item === undefined) {
    return [...items];
  }

  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

export function reorderImages(images: DraftImage[], fromIndex: number, toIndex: number): DraftImage[] {
  return normalizeImagePositions(moveImage(images, fromIndex, toIndex));
}

export function promoteImageToCover(images: DraftImage[], imageId: string): DraftImage[] {
  const currentIndex = images.findIndex((image) => image.id === imageId);
  if (currentIndex === -1) {
    return normalizeImagePositions(images);
  }

  const moved = moveImage(images, currentIndex, 0);

  return normalizeImagePositions(
    moved.map((image) => ({
      ...image,
      isPrimary: image.id === imageId,
    })),
  );
}

export function buildImageOrderPayload(images: DraftImage[]): Array<{
  imageId: string;
  position: number;
  isPrimary: boolean;
}> {
  return normalizeImagePositions(images).map((image) => ({
    imageId: image.id,
    position: image.position,
    isPrimary: image.isPrimary,
  }));
}

export function determineUploadConcurrency(hardwareConcurrency?: number): number {
  if (typeof hardwareConcurrency === "number" && hardwareConcurrency <= 2) {
    return 1;
  }

  return 2;
}

export function createPromiseQueue(limit: number) {
  const safeLimit = Math.max(1, limit);
  let active = 0;
  const waiters: Array<() => void> = [];

  async function acquire(): Promise<void> {
    if (active < safeLimit) {
      active += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      waiters.push(resolve);
    });
    active += 1;
  }

  function release(): void {
    active -= 1;
    waiters.shift()?.();
  }

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    await acquire();

    try {
      return await task();
    } finally {
      release();
    }
  };
}

export function detectWebpEncodingSupport(
  canvasFactory: () => CanvasLike | null = () => {
    if (typeof document === "undefined") {
      return null;
    }

    return document.createElement("canvas");
  },
): boolean {
  const canvas = canvasFactory();
  if (!canvas) {
    return false;
  }

  try {
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

export async function compressImageForUpload(
  file: File,
  deps: CompressDeps = {},
): Promise<File> {
  const compress = deps.compress ?? imageCompression;
  const supportsWebpEncoding = deps.supportsWebpEncoding ?? detectWebpEncodingSupport;
  const preferredType: UploadContentType = supportsWebpEncoding() ? "image/webp" : "image/jpeg";

  const options = {
    maxSizeMB: MAX_UPLOAD_SIZE_MB,
    maxWidthOrHeight: MAX_LONG_EDGE,
    useWebWorker: false,
    fileType: preferredType,
    initialQuality: INITIAL_COMPRESSION_QUALITY,
  } as const;

  const compressed = await compress(file, options);

  if (preferredType === "image/webp" && compressed.type !== "image/webp") {
    return compress(file, {
      ...options,
      fileType: "image/jpeg",
    });
  }

  return compressed;
}

export function assessPhotoQuality(
  frame: PixelFrame,
  dimensions: { width: number; height: number },
): PhotoAssessment {
  const greys: number[] = [];
  let lumaTotal = 0;

  for (let index = 0; index < frame.data.length; index += 4) {
    const red = frame.data[index] ?? 0;
    const green = frame.data[index + 1] ?? 0;
    const blue = frame.data[index + 2] ?? 0;
    const luma = 0.299 * red + 0.587 * green + 0.114 * blue;
    greys.push(luma);
    lumaTotal += luma;
  }

  const brightness = greys.length === 0 ? 255 : lumaTotal / greys.length;

  let laplacianSum = 0;
  let laplacianSquareSum = 0;
  let laplacianCount = 0;

  for (let y = 1; y < frame.height - 1; y += 1) {
    for (let x = 1; x < frame.width - 1; x += 1) {
      const index = y * frame.width + x;
      const center = greys[index] ?? 0;
      const top = greys[index - frame.width] ?? 0;
      const bottom = greys[index + frame.width] ?? 0;
      const left = greys[index - 1] ?? 0;
      const right = greys[index + 1] ?? 0;
      const laplacian = (4 * center) - top - bottom - left - right;

      laplacianSum += laplacian;
      laplacianSquareSum += laplacian * laplacian;
      laplacianCount += 1;
    }
  }

  const laplacianMean = laplacianCount === 0 ? 0 : laplacianSum / laplacianCount;
  const blurVariance = laplacianCount === 0
    ? 0
    : (laplacianSquareSum / laplacianCount) - (laplacianMean * laplacianMean);
  const shortEdge = Math.min(dimensions.width, dimensions.height);

  return {
    shortEdge,
    tooSmall: shortEdge < MIN_SHORT_EDGE,
    brightness,
    isDark: brightness < DARK_BRIGHTNESS_THRESHOLD,
    blurVariance,
    isBlurry: blurVariance < BLUR_VARIANCE_THRESHOLD,
  };
}

function buildIssueLabels(assessment: PhotoAssessment | null): string[] {
  if (!assessment) {
    return [];
  }

  const issues: string[] = [];

  if (assessment.tooSmall) {
    issues.push("Small photo");
  }

  if (assessment.isDark) {
    issues.push("Looks dark");
  }

  if (assessment.isBlurry) {
    issues.push("Might be blurry");
  }

  return issues;
}

function hasAnyPhotoIssue(assessment: PhotoAssessment | null): boolean {
  if (!assessment) {
    return false;
  }

  return assessment.tooSmall || assessment.isDark || assessment.isBlurry;
}

function countUsablePhotos(images: DraftImage[], uploads: LocalUpload[]): number {
  const serverCount = images.filter((image) => image.status !== "failed").length;
  const localCount = uploads.filter((upload) => upload.status !== "error").length;
  return serverCount + localCount;
}

function getNextUploadPosition(images: DraftImage[], uploads: LocalUpload[]): number {
  const occupiedPositions = [
    ...images.map((image) => image.position),
    ...uploads
      .filter((upload) => upload.status !== "error")
      .map((upload) => upload.position),
  ];

  if (occupiedPositions.length === 0) {
    return 0;
  }

  return Math.max(...occupiedPositions) + 1;
}

function shouldMakeNextUploadPrimary(images: DraftImage[], uploads: LocalUpload[]): boolean {
  const hasPrimaryImage = images.some((image) => image.isPrimary && image.status !== "failed");
  const hasPrimaryUpload = uploads.some((upload) => upload.isPrimary && upload.status !== "error");
  return !hasPrimaryImage && !hasPrimaryUpload;
}

function getPhotoSrc(image: DraftImage): string {
  return image.thumbUrl || image.url;
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("We could not read that image."));
    image.src = src;
  });
}

async function analyseLocalPreview(previewUrl: string): Promise<PhotoAssessment> {
  const image = await loadImageElement(previewUrl);
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser could not analyse the photo preview.");
  }

  context.drawImage(image, 0, 0, 64, 64);
  const frame = context.getImageData(0, 0, 64, 64);

  return assessPhotoQuality(
    {
      width: frame.width,
      height: frame.height,
      data: frame.data,
    },
    {
      width: image.naturalWidth,
      height: image.naturalHeight,
    },
  );
}

function replaceDraftImages(images: DraftImage[]): void {
  const currentDraft = useSellDraftStore.getState().draft;
  if (!currentDraft) {
    return;
  }

  useSellDraftStore.setState({
    draft: {
      ...currentDraft,
      images,
    },
  });
}

function mergeDraftImageState(update: Pick<SellDraft, "images" | "strength" | "updatedAt">): void {
  const currentDraft = useSellDraftStore.getState().draft;
  if (!currentDraft) {
    return;
  }

  useSellDraftStore.setState({
    draft: {
      ...currentDraft,
      images: update.images,
      strength: update.strength,
      updatedAt: update.updatedAt,
    },
  });
}

export function PhotosStep(): JSX.Element {
  const draft = useSellDraftStore((state) => state.draft);
  const [localUploads, setLocalUploads] = useState<LocalUpload[]>([]);
  const [assessmentsByImageId, setAssessmentsByImageId] = useState<Record<string, PhotoAssessment>>({});
  const [error, setError] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [draggingImageId, setDraggingImageId] = useState<string | null>(null);
  const [dragOverImageId, setDragOverImageId] = useState<string | null>(null);
  const [isOrdering, setIsOrdering] = useState(false);

  const browseInputRef = useRef<HTMLInputElement | null>(null);
  const localUploadsRef = useRef<LocalUpload[]>([]);
  const apiRef = useRef(createBrowserApiClient());
  const queueRef = useRef(
    createPromiseQueue(
      determineUploadConcurrency(globalThis.navigator?.hardwareConcurrency),
    ),
  );
  const cameraInputId = useId();

  useEffect(() => {
    localUploadsRef.current = localUploads;
  }, [localUploads]);

  useEffect(() => () => {
    for (const upload of localUploadsRef.current) {
      revokeObjectUrl(upload.previewUrl);
    }
  }, []);

  async function syncDraftImagesFromServer(draftId: string): Promise<void> {
    const { data, error: fetchError } = await apiRef.current.GET("/api/v1/seller/drafts/{id}", {
      params: {
        path: { id: draftId },
      },
    });

    if (!data) {
      throw new Error(extractErrorMessage(fetchError, "The draft changed, but we could not refresh the photo list."));
    }

    mergeDraftImageState({
      images: data.images,
      strength: data.strength,
      updatedAt: data.updatedAt,
    });

    setAssessmentsByImageId((current) => {
      const next: Record<string, PhotoAssessment> = {};

      for (const image of data.images) {
        const assessment = current[image.id];
        if (assessment) {
          next[image.id] = assessment;
        }
      }

      return next;
    });
  }

  async function cleanupRemoteImage(draftId: string, imageId: string): Promise<void> {
    try {
      const { error: deleteError } = await apiRef.current.DELETE("/api/v1/seller/inventory/{id}/images/{imageId}", {
        params: {
          path: { id: draftId, imageId },
        },
      });

      if (deleteError) {
        throw deleteError;
      }
    } catch {
      // Best-effort cleanup only.
    }
  }

  function removeLocalUpload(localId: string, revokePreview: boolean): void {
    const upload = localUploadsRef.current.find((entry) => entry.localId === localId);
    if (upload && revokePreview) {
      revokeObjectUrl(upload.previewUrl);
    }

    setLocalUploads((current) => current.filter((entry) => entry.localId !== localId));
  }

  async function processUpload(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) {
      setError("Only image files are accepted here.");
      return;
    }

    const currentDraft = useSellDraftStore.getState().draft;
    if (!currentDraft) {
      setError("Start or resume a draft before adding photos.");
      return;
    }

    let localId: string | null = null;
    let remoteImageId: string | null = null;
    let previewUrl: string | null = null;

    try {
      const compressedFile = await compressImageForUpload(file);
      if (!isSupportedUploadContentType(compressedFile.type)) {
        throw new Error("This browser produced an unsupported upload format.");
      }

      previewUrl = URL.createObjectURL(compressedFile);
      const assessment = await analyseLocalPreview(previewUrl);
      const existingUploads = localUploadsRef.current;
      const draftSnapshot = useSellDraftStore.getState().draft;

      if (!draftSnapshot) {
        throw new Error("The draft was not ready for uploads.");
      }

      const position = getNextUploadPosition(draftSnapshot.images, existingUploads);
      const isPrimary = shouldMakeNextUploadPrimary(draftSnapshot.images, existingUploads);
      const nextLocalId = createLocalUploadId();
      localId = nextLocalId;
      const nextPreviewUrl = previewUrl;

      setLocalUploads((current) => [
        ...current,
        {
          localId: nextLocalId,
          imageId: null,
          previewUrl: nextPreviewUrl,
          fileName: file.name,
          status: "uploading",
          errorMessage: null,
          position,
          isPrimary,
          assessment,
        },
      ]);

      const { data: uploadUrlData, error: uploadUrlError } = await apiRef.current.POST(
        "/api/v1/seller/drafts/{id}/images/upload-url",
        {
          params: {
            path: { id: draftSnapshot.id },
          },
          body: {
            contentType: compressedFile.type,
          },
        },
      );

      if (!uploadUrlData) {
        throw new Error(extractErrorMessage(uploadUrlError, "We could not get an upload URL for that photo."));
      }

      remoteImageId = uploadUrlData.imageId;

      setLocalUploads((current) =>
        current.map((entry) => (
          entry.localId === localId
            ? { ...entry, imageId: remoteImageId }
            : entry
        )),
      );

      const putResponse = await fetch(uploadUrlData.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": compressedFile.type,
        },
        body: compressedFile,
      });

      if (!putResponse.ok) {
        throw new Error("The compressed photo could not be uploaded to storage.");
      }

      const { data: confirmedImage, error: confirmError } = await apiRef.current.POST(
        "/api/v1/seller/drafts/{id}/images/{imageId}/confirm",
        {
          params: {
            path: {
              id: draftSnapshot.id,
              imageId: remoteImageId,
            },
          },
          body: {
            position,
            isPrimary,
          },
        },
      );

      if (!confirmedImage) {
        throw new Error(extractErrorMessage(confirmError, "The upload finished, but the photo could not be confirmed."));
      }

      const optimisticImage: DraftImage = {
        ...confirmedImage,
        thumbUrl: "",
      };

      const latestDraft = useSellDraftStore.getState().draft;
      if (latestDraft) {
        replaceDraftImages(
          sortImagesByPosition([...latestDraft.images, optimisticImage]),
        );
      }

      setAssessmentsByImageId((current) => ({
        ...current,
        [confirmedImage.id]: assessment,
      }));

      removeLocalUpload(localId, true);

      try {
        await syncDraftImagesFromServer(draftSnapshot.id);
        setError(null);
      } catch (syncError) {
        setError(extractErrorMessage(syncError, "The photo uploaded, but the draft did not fully refresh."));
      }
    } catch (uploadError) {
      const message = extractErrorMessage(uploadError, "That photo could not be uploaded.");

      if (remoteImageId) {
        await cleanupRemoteImage(currentDraft.id, remoteImageId);
      }

      if (localId) {
        setLocalUploads((current) =>
          current.map((entry) => (
            entry.localId === localId
              ? { ...entry, status: "error", errorMessage: message }
              : entry
          )),
        );
      } else if (previewUrl) {
        revokeObjectUrl(previewUrl);
      }

      setError(message);
    }
  }

  function enqueueFiles(inputFiles: FileList | File[] | null): void {
    if (!inputFiles) {
      return;
    }

    const files = Array.from(inputFiles);
    const currentDraft = useSellDraftStore.getState().draft;
    const currentUploads = localUploadsRef.current;
    const existingPhotoCount = currentDraft
      ? countUsablePhotos(currentDraft.images, currentUploads)
      : currentUploads.filter((upload) => upload.status !== "error").length;
    const remainingSlots = Math.max(0, MAX_IMAGES - existingPhotoCount);

    if (remainingSlots <= 0) {
      setError(`You can add up to ${MAX_IMAGES} photos to a listing.`);
      return;
    }

    const filesToQueue = files.slice(0, remainingSlots);

    if (files.length > remainingSlots) {
      setError(`Only the first ${remainingSlots} more photo${remainingSlots === 1 ? "" : "s"} will upload.`);
    } else {
      setError(null);
    }

    for (const file of filesToQueue) {
      void queueRef.current(() => processUpload(file));
    }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>): void {
    enqueueFiles(event.target.files);
    event.target.value = "";
  }

  function openFileBrowser(): void {
    browseInputRef.current?.click();
  }

  function handleDropzoneKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openFileBrowser();
  }

  async function deleteServerImage(imageId: string): Promise<void> {
    const currentDraft = useSellDraftStore.getState().draft;
    if (!currentDraft) {
      return;
    }

    const nextImages = currentDraft.images.filter((image) => image.id !== imageId);
    const previousAssessments = { ...assessmentsByImageId };
    replaceDraftImages(nextImages);
    setAssessmentsByImageId((current) => {
      const next = { ...current };
      delete next[imageId];
      return next;
    });

    try {
      const { error: deleteError } = await apiRef.current.DELETE("/api/v1/seller/inventory/{id}/images/{imageId}", {
        params: {
          path: { id: currentDraft.id, imageId },
        },
      });

      if (deleteError) {
        throw deleteError;
      }

      await syncDraftImagesFromServer(currentDraft.id);
      setError(null);
    } catch (deleteError) {
      replaceDraftImages(currentDraft.images);
      setAssessmentsByImageId(previousAssessments);
      setError(extractErrorMessage(deleteError, "We could not delete that photo."));
    }
  }

  async function saveImageOrder(nextImages: DraftImage[]): Promise<void> {
    const currentDraft = useSellDraftStore.getState().draft;
    if (!currentDraft) {
      return;
    }

    const previousImages = currentDraft.images;
    replaceDraftImages(nextImages);
    setIsOrdering(true);

    try {
      const { error: orderError } = await apiRef.current.PATCH(
        "/api/v1/seller/inventory/{id}/images/order",
        {
          params: {
            path: { id: currentDraft.id },
          },
          body: buildImageOrderPayload(nextImages),
        },
      );

      if (orderError) {
        throw orderError;
      }

      setError(null);
    } catch (orderError) {
      replaceDraftImages(previousImages);
      setError(extractErrorMessage(orderError, "We could not save the new photo order."));
    } finally {
      setIsOrdering(false);
    }
  }

  async function dismissLocalUpload(upload: LocalUpload): Promise<void> {
    const currentDraft = useSellDraftStore.getState().draft;

    if (currentDraft && upload.imageId) {
      await cleanupRemoteImage(currentDraft.id, upload.imageId);
    }

    removeLocalUpload(upload.localId, true);
  }

  function handleDropzoneDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDraggingFiles(false);
    enqueueFiles(event.dataTransfer.files);
  }

  async function handleMoveClick(imageId: string, direction: -1 | 1): Promise<void> {
    const currentDraft = useSellDraftStore.getState().draft;
    if (!currentDraft || isOrdering) {
      return;
    }

    const orderedImages = sortImagesByPosition(currentDraft.images);
    const currentIndex = orderedImages.findIndex((image) => image.id === imageId);
    const nextIndex = currentIndex + direction;

    if (currentIndex === -1 || nextIndex < 0 || nextIndex >= orderedImages.length) {
      return;
    }

    await saveImageOrder(reorderImages(orderedImages, currentIndex, nextIndex));
  }

  async function handleSetCover(imageId: string): Promise<void> {
    const currentDraft = useSellDraftStore.getState().draft;
    if (!currentDraft || isOrdering) {
      return;
    }

    await saveImageOrder(promoteImageToCover(sortImagesByPosition(currentDraft.images), imageId));
  }

  async function handleThumbDrop(event: DragEvent<HTMLDivElement>, targetImageId: string): Promise<void> {
    event.preventDefault();
    setDragOverImageId(null);

    const sourceImageId = draggingImageId;
    const currentDraft = useSellDraftStore.getState().draft;

    if (!sourceImageId || !currentDraft || sourceImageId === targetImageId || isOrdering) {
      setDraggingImageId(null);
      return;
    }

    const orderedImages = sortImagesByPosition(currentDraft.images);
    const sourceIndex = orderedImages.findIndex((image) => image.id === sourceImageId);
    const targetIndex = orderedImages.findIndex((image) => image.id === targetImageId);

    setDraggingImageId(null);

    if (sourceIndex === -1 || targetIndex === -1) {
      return;
    }

    await saveImageOrder(reorderImages(orderedImages, sourceIndex, targetIndex));
  }

  const orderedImages = sortImagesByPosition(draft?.images ?? []);
  const usablePhotoCount = countUsablePhotos(orderedImages, localUploads);
  const completedGuideCount = Math.min(usablePhotoCount, 4);
  const tooSmallCount = [
    ...orderedImages
      .map((image) => assessmentsByImageId[image.id] ?? null)
      .filter((assessment) => assessment?.tooSmall),
    ...localUploads
      .map((upload) => upload.assessment)
      .filter((assessment) => assessment.tooSmall),
  ].length;

  const displayItems: DisplayItem[] = [
    ...orderedImages.map((image) => ({
      kind: "server" as const,
      image,
      assessment: assessmentsByImageId[image.id] ?? null,
    })),
    ...localUploads.map((upload) => ({
      kind: "local" as const,
      upload,
    })),
  ].sort((left, right) => {
    const leftPosition = left.kind === "server" ? left.image.position : left.upload.position;
    const rightPosition = right.kind === "server" ? right.image.position : right.upload.position;
    return leftPosition - rightPosition;
  });

  return (
    <>
      <h2>Photos</h2>
      <p className="hint">
        Add bright, honest shots. Front, back, label and any flaws build more trust than extra copy.
      </p>

      <div className="guides" aria-label="Photo checklist">
        {["Front", "Back", "Label", "Flaws"].map((label, index) => {
          const complete = index < completedGuideCount;

          return (
            <div
              key={label}
              className={["guide", complete ? "have" : ""].filter(Boolean).join(" ")}
            >
              <span className="tick" aria-hidden="true">{complete ? "v" : "+"}</span>
              <span>{label}</span>
            </div>
          );
        })}
      </div>

      <div
        className="dropzone"
        role="button"
        tabIndex={0}
        onClick={openFileBrowser}
        onKeyDown={handleDropzoneKeyDown}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDraggingFiles(true);
        }}
        onDragLeave={() => setIsDraggingFiles(false)}
        onDrop={handleDropzoneDrop}
        style={isDraggingFiles
          ? {
              borderColor: "var(--sell-green)",
              background: "color-mix(in srgb, var(--sell-green) 4%, transparent)",
            }
          : undefined}
      >
        <div className="big" aria-hidden="true">+</div>
        <b>Drop photos here or tap to browse</b>
        <p>We shrink uploads before they leave the phone. Up to {MAX_IMAGES} photos per listing.</p>
        <label
          htmlFor={cameraInputId}
          className="cam"
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          Use camera
        </label>
        <input
          ref={browseInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={handleFileInputChange}
        />
        <input
          id={cameraInputId}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={handleFileInputChange}
        />
      </div>

      {error ? (
        <p className="hint" role="alert" style={{ color: "var(--sell-red)" }}>
          {error}
        </p>
      ) : null}

      {tooSmallCount > 0 ? (
        <p className="hint">
          {tooSmallCount} photo{tooSmallCount === 1 ? "" : "s"} look small. Buyers read blurry photos as a red flag, so replace or delete them if you can.
        </p>
      ) : null}

      {displayItems.length > 0 ? (
        <div className="thumbs">
          {displayItems.map((item, index) => {
            if (item.kind === "local") {
              const issueLabels = buildIssueLabels(item.upload.assessment);

              return (
                <div
                  key={item.upload.localId}
                  className={["thumb", item.upload.status === "uploading" ? "up" : ""].join(" ")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.upload.previewUrl} alt={`Uploading ${item.upload.fileName}`} />
                  {item.upload.isPrimary ? <div className="cover">Cover</div> : null}

                  {item.upload.status === "error" ? (
                    <button
                      type="button"
                      className="del"
                      aria-label={`Remove failed upload ${item.upload.fileName}`}
                      onClick={() => {
                        void dismissLocalUpload(item.upload);
                      }}
                    >
                      x
                    </button>
                  ) : null}

                  {issueLabels.map((label, issueIndex) => (
                    <div
                      key={`${item.upload.localId}-${label}`}
                      className="warn"
                      style={{ top: `${34 + (issueIndex * 18)}px` }}
                    >
                      {label}
                    </div>
                  ))}

                  <div className="spin">
                    {item.upload.status === "uploading"
                      ? <div className="spinner" aria-label="Uploading photo" />
                      : (
                        <span style={{
                          background: "color-mix(in srgb, var(--sell-red) 86%, transparent)",
                          color: "var(--sell-paper)",
                          borderRadius: "6px",
                          padding: "6px 8px",
                          fontSize: "11px",
                          fontWeight: 700,
                          textAlign: "center",
                        }}
                        >
                          {item.upload.errorMessage ?? "Upload failed"}
                        </span>
                      )}
                  </div>
                </div>
              );
            }

            const issueLabels = buildIssueLabels(item.assessment);
            const imageSrc = getPhotoSrc(item.image);
            const isReady = item.image.status === "ready";
            const serverIndex = orderedImages.findIndex((image) => image.id === item.image.id);

            return (
              <div
                key={item.image.id}
                className={[
                  "thumb",
                  draggingImageId === item.image.id ? "drag" : "",
                  dragOverImageId === item.image.id ? "over" : "",
                ].filter(Boolean).join(" ")}
                draggable={isReady && !isOrdering}
                onDragStart={(event) => {
                  if (!isReady || isOrdering) {
                    event.preventDefault();
                    return;
                  }

                  setDraggingImageId(item.image.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", item.image.id);
                }}
                onDragEnd={() => {
                  setDraggingImageId(null);
                  setDragOverImageId(null);
                }}
                onDragOver={(event) => {
                  if (!isReady || isOrdering) {
                    return;
                  }

                  event.preventDefault();
                  setDragOverImageId(item.image.id);
                }}
                onDragLeave={() => {
                  if (dragOverImageId === item.image.id) {
                    setDragOverImageId(null);
                  }
                }}
                onDrop={(event) => {
                  void handleThumbDrop(event, item.image.id);
                }}
              >
                {imageSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageSrc} alt={`Listing photo ${index + 1}`} />
                ) : (
                  <div
                    style={{
                      alignItems: "center",
                      color: "var(--sell-ink-3)",
                      display: "flex",
                      height: "100%",
                      justifyContent: "center",
                      padding: "12px",
                      textAlign: "center",
                    }}
                  >
                    {item.image.status === "failed" ? "Upload failed" : "Processing"}
                  </div>
                )}

                {item.image.isPrimary ? <div className="cover">Cover</div> : null}

                <button
                      type="button"
                      className="del"
                      aria-label={`Delete photo ${serverIndex + 1}`}
                      onClick={() => {
                        void deleteServerImage(item.image.id);
                      }}
                >
                  x
                </button>

                {issueLabels.map((label, issueIndex) => (
                  <div
                    key={`${item.image.id}-${label}`}
                    className="warn"
                    style={{ top: `${34 + (issueIndex * 18)}px` }}
                  >
                    {label}
                  </div>
                ))}

                {isReady && orderedImages.length > 1 ? (
                  <div className="mv">
                    <button
                      type="button"
                      onClick={() => {
                        void handleMoveClick(item.image.id, -1);
                      }}
                      disabled={isOrdering || serverIndex <= 0}
                      aria-label={`Move photo ${serverIndex + 1} left`}
                    >
                      {"<"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void handleMoveClick(item.image.id, 1);
                      }}
                      disabled={isOrdering || serverIndex === orderedImages.length - 1}
                      aria-label={`Move photo ${serverIndex + 1} right`}
                    >
                      {">"}
                    </button>
                  </div>
                ) : null}

                {isReady && !item.image.isPrimary ? (
                  <button
                    type="button"
                    className="setcover"
                    disabled={isOrdering}
                    onClick={() => {
                      void handleSetCover(item.image.id);
                    }}
                  >
                    Make cover
                  </button>
                ) : null}
              </div>
            );
          })}

          {usablePhotoCount < MAX_IMAGES ? (
            <button type="button" className="addmore" onClick={openFileBrowser} aria-label="Add more photos">
              +
            </button>
          ) : null}
        </div>
      ) : null}

      {displayItems.some((item) => (
        item.kind === "local"
          ? hasAnyPhotoIssue(item.upload.assessment)
          : hasAnyPhotoIssue(item.assessment)
      )) ? (
        <p className="hint">
          Dark and blurry flags are advisory only. Use them as nudges, not as a wall.
        </p>
      ) : null}
    </>
  );
}
