// mdx-components.tsx — required by @next/mdx for App Router MDX support.
// The `wrapper` wraps every .mdx page's content in the Bushpop prose shell so
// headings, body, links, lists and remark-gfm tables inherit the design system
// (styles live in globals.css under .prose-bushpop). Heading ids from rehype-slug
// and any embedded components (Breadcrumbs, diagrams, brand index) are preserved.
import type { MDXComponents } from "mdx/types";
import type { ReactNode } from "react";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    wrapper: ({ children }: { children?: ReactNode }) => (
      <article className="prose-bushpop">{children}</article>
    ),
  };
}
