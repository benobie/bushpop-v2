// mdx-components.tsx — required by @next/mdx for App Router MDX support.
// Wire custom components here when design system lands.
import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    // Default passthrough — add overrides as the design system grows.
    ...components,
  };
}
