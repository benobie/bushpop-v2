"use client";

import { Button } from "@bushpop/ui";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="font-display text-2xl font-bold text-bp-ink">
        Something went wrong
      </h1>
      <p className="text-bp-ink-2">
        {error.message || "An unexpected error occurred."}
      </p>
      <Button onClick={reset} variant="primary">
        Try again
      </Button>
    </main>
  );
}
