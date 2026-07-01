"use client";

// Waitlist / drop-alert capture. Client island: validates the email and shows a
// success state. POSTs to NEXT_PUBLIC_WAITLIST_ENDPOINT when configured; until a
// real capture endpoint is wired (Cloudflare Pages Function or form service) it
// resolves optimistically so the UX is complete. See plan "Follow-ups".
import { useState } from "react";
import { ActionButton } from "./button";

const ENDPOINT = process.env.NEXT_PUBLIC_WAITLIST_ENDPOINT;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function WaitlistForm({ cta = "Get alerts" }: { cta?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setState("error");
      return;
    }
    setState("sending");
    try {
      if (ENDPOINT) {
        const res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, source: "homepage-waitlist" }),
        });
        if (!res.ok) throw new Error("bad status");
      }
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="text-green-ink font-medium" role="status">
        You&apos;re on the list — we&apos;ll email you when the first drops land.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
      <label className="sr-only" htmlFor="waitlist-email">
        Email address
      </label>
      <input
        id="waitlist-email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (state === "error") setState("idle");
        }}
        aria-invalid={state === "error"}
        className="flex-1 rounded-full border border-line-2 bg-white px-4 py-3 text-sm text-ink outline-none focus:border-green"
      />
      <ActionButton type="submit" variant="green" disabled={state === "sending"}>
        {state === "sending" ? "Adding…" : cta}
      </ActionButton>
      {state === "error" && (
        <span className="text-red text-sm sm:sr-only" role="alert">
          Enter a valid email.
        </span>
      )}
    </form>
  );
}
