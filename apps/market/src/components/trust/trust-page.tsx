import Link from "next/link";

/**
 * Shared shell for the U4 trust/help surfaces (help, returns & buyer
 * protection, report-counterfeit, shipping). Near-zero cheek per the voice
 * guide (§4) — plain, precise typography, no glass/gradient flourish.
 */
export function TrustPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
      <p className="font-bp-body text-sm font-medium uppercase tracking-wide text-bp-green-bright">
        {eyebrow}
      </p>
      <h1 className="mt-2 font-bp-head text-3xl font-bold text-bp-ink sm:text-4xl">{title}</h1>
      {intro ? (
        <p className="mt-4 font-bp-body text-lg leading-relaxed text-bp-ink-2">{intro}</p>
      ) : null}
      <div className="trust-prose mt-10 font-bp-body text-base leading-relaxed text-bp-ink">
        {children}
      </div>
    </main>
  );
}

export function TrustSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 border-t border-bp-line pt-8 first:mt-0 first:border-0 first:pt-0">
      <h2 className="font-bp-head text-xl font-semibold text-bp-ink">{heading}</h2>
      <div className="mt-3 space-y-4 text-bp-ink-2">{children}</div>
    </section>
  );
}

export function TrustLinkCard({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <Link
      href={href}
      className="block rounded-bp-rect border border-bp-line bg-bp-surface-3 px-5 py-4 transition hover:border-bp-line-2 hover:bg-bp-surface-2"
    >
      <span className="font-bp-head text-base font-semibold text-bp-ink">{label}</span>
      <span className="mt-1 block font-bp-body text-sm text-bp-ink-2">{description}</span>
    </Link>
  );
}
