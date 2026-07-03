"use client";

// Waitlist / drop-alert capture. Client island: validates the email, POSTs to the
// same-origin Pages Function (/api/waitlist → n8n → bushpop.waitlist; see
// docs/waitlist.md) and only shows success on a 2xx — no optimistic fake success.
// `segment` pre-segments the list per the F10 contract (buyer | seller | opshop).
// The `company` input is a honeypot: visually hidden, dropped server-side if filled.
// Note: plain `next dev` has no Pages Functions, so submits fail locally — use
// `wrangler pages dev out` to exercise the full flow.
import { useState } from "react";
import { ActionButton } from "./button";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type WaitlistSegment = "buyer" | "seller" | "opshop";

export function WaitlistForm({
  cta = "Get alerts",
  segment = "buyer",
}: {
  cta?: string;
  segment?: WaitlistSegment;
}) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setState("error");
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          segment,
          source: window.location.pathname,
          company,
        }),
      });
      if (!res.ok) throw new Error("bad status");
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
      <input
        type="text"
        name="company"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <ActionButton type="submit" variant="green" disabled={state === "sending"}>
        {state === "sending" ? "Adding…" : cta}
      </ActionButton>
      {state === "error" && (
        <span className="text-red text-sm sm:sr-only" role="alert">
          Something went wrong — check the email and try again.
        </span>
      )}
    </form>
  );
}
