import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const withMDX = createMDX({
  // MDX options: can add remark/rehype plugins here later
  options: {},
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
};

export default withMDX(nextConfig);
