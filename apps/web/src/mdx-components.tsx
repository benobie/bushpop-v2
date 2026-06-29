// Global MDX styling. The `wrapper` centres all MDX content in a readable
// column (so breadcrumbs + content share one container), and the element
// overrides give markdown sane vertical rhythm — Tailwind's preflight strips
// default margins, so without these the content pages render cramped and
// edge-to-edge. Colours are neutral greys/blues, swappable at the Launch-2
// brand re-skin via globals.css tokens.
import type { MDXComponents } from "mdx/types";
import Link from "next/link";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    wrapper: ({ children }) => (
      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
    ),
    h1: (props) => <h1 className="mb-4 text-4xl font-bold" {...props} />,
    h2: (props) => <h2 className="mb-4 mt-10 text-2xl font-semibold" {...props} />,
    h3: (props) => <h3 className="mb-2 mt-6 text-xl font-semibold" {...props} />,
    p: (props) => <p className="mb-4 leading-relaxed text-gray-800" {...props} />,
    ul: (props) => <ul className="mb-4 list-disc space-y-1 pl-6" {...props} />,
    ol: (props) => <ol className="mb-4 list-decimal space-y-1 pl-6" {...props} />,
    li: (props) => <li className="leading-relaxed" {...props} />,
    a: ({ href, ...props }) => (
      <Link href={href ?? "#"} className="text-blue-600 underline" {...props} />
    ),
    table: (props) => (
      <div className="my-6 overflow-x-auto">
        <table className="w-full border-collapse text-left" {...props} />
      </div>
    ),
    th: (props) => (
      <th className="border-b-2 border-gray-300 py-2 pr-4 font-semibold" {...props} />
    ),
    td: (props) => <td className="border-b border-gray-200 py-2 pr-4" {...props} />,
    hr: (props) => <hr className="my-8 border-gray-200" {...props} />,
    blockquote: (props) => (
      <blockquote
        className="my-4 border-l-4 border-gray-200 pl-4 italic text-gray-600"
        {...props}
      />
    ),
    ...components,
  };
}
