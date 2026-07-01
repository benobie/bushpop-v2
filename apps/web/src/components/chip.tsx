// Chip — pill used for categories, quick-paths and tags. Renders a Link when
// `href` is set, else a plain span. Interactive filter chips (Fresh drops)
// use the raw .chip class inside the client component instead. Pure RSC.
import Link from "next/link";
import type { ReactNode } from "react";

const cx = (...p: (string | false | undefined)[]) => p.filter(Boolean).join(" ");

export function Chip({
  href,
  active,
  deal,
  className,
  children,
}: {
  href?: string;
  active?: boolean;
  deal?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const cls = cx("chip", active && "on", deal && "deal", className);
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return <span className={cls}>{children}</span>;
}
