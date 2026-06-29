import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const withMDX = createMDX({
  options: {
    // remark-gfm enables GitHub-flavoured markdown (pipe tables, strikethrough,
    // task lists, autolinks). Without it, MDX pipe tables render as literal text.
    // rehype-slug adds id attributes to headings so in-page anchor links
    // (e.g. /guides/size-charts/#condition-guide) resolve to the section.
    // Turbopack requires plugins as serializable string names, not imported
    // functions, so reference each module by name.
    remarkPlugins: [["remark-gfm"]],
    rehypePlugins: [["rehype-slug"]],
  },
});

const nextConfig: NextConfig = {
  // Static export — no Node runtime at Launch 1.
  // Cloudflare Pages serves the out/ directory directly.
  // NOTE: redirects() and rewrites() are ignored under output: 'export'.
  //       Redirects live in apps/web/public/_redirects (Cloudflare Pages picks
  //       this up from the published directory automatically).
  output: "export",

  // Trailing-slash parity with WordPress URLs.
  // /guides/size-charts/ → out/guides/size-charts/index.html
  // This is load-bearing for SEO — the existing inbound links use trailing slashes.
  trailingSlash: true,

  // Enable .mdx file routing
  pageExtensions: ["ts", "tsx", "mdx"],

  // Silence the workspace-root detection warning — Next 16 Turbopack picks up
  // the wrong root when a parent directory has a lockfile. Point it at the
  // monorepo root (two levels up from apps/web).
  turbopack: {
    root: "../../",
  },
};

export default withMDX(nextConfig);
