import type { Metadata } from "next";

const SITE = "https://bushpop.com.au";

// Per-page metadata builder: canonical + OpenGraph + Twitter, on top of the
// site-wide defaults in the root layout. `path` is the trailing-slash canonical
// path (matching trailingSlash:true).
export function pageMeta({
  title,
  description,
  path,
  type = "article",
}: {
  title: string;
  description: string;
  path: string;
  type?: "article" | "website";
}): Metadata {
  const url = `${SITE}${path}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type, url, siteName: "Bushpop" },
    twitter: { card: "summary_large_image", title, description },
  };
}
