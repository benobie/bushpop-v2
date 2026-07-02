"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { PhotoUploader } from "@/components/wizard/photo-uploader";

export default function PhotosPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const router = useRouter();
  const [uploadedCount, setUploadedCount] = useState(0);

  function handleUploadComplete() {
    setUploadedCount((n) => n + 1);
  }

  function handleNext() {
    router.push(`/sell/${itemId}/details`);
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <StepIndicator currentStep="Photos" />

      <div className="mt-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-brand-900">Add photos</h1>
          <p className="mt-1 text-sm text-brand-500">
            Clear photos from multiple angles help sell faster. Add up to 10.
          </p>
        </div>

        <PhotoUploader
          itemId={itemId}
          onUploadComplete={handleUploadComplete}
        />

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={uploadedCount === 0}
            onClick={handleNext}
            className="rounded-lg bg-brand-800 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Next: Details
          </button>
        </div>
      </div>
    </main>
  );
}
