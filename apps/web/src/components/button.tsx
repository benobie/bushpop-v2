// Button — the design-system CTA. Renders as a Link when `href` is set,
// otherwise a native <button>. Styling lives in globals.css (.btn.*); the
// glossy Emerald "green" variant is the approved Signature button.
// Pure RSC — no client JS (the gloss/shine is pure CSS).
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "green" | "ghost" | "dark";
type Size = "md" | "lg";

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

type BaseProps = {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  rect?: boolean;
  className?: string;
  children: ReactNode;
};

export function Button({
  variant = "green",
  size = "md",
  block,
  rect,
  className,
  children,
  href,
  ...rest
}: BaseProps &
  ({ href: string } & Omit<ComponentProps<typeof Link>, "href" | "className">)) {
  const cls = cx("btn", variant, size === "lg" && "lg", block && "block", rect && "rect", className);
  return (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  );
}

export function ActionButton({
  variant = "green",
  size = "md",
  block,
  rect,
  className,
  children,
  ...rest
}: BaseProps & Omit<ComponentProps<"button">, "className">) {
  const cls = cx("btn", variant, size === "lg" && "lg", block && "block", rect && "rect", className);
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
