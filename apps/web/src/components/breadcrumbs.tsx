// Server-rendered breadcrumbs — props-based, zero client JS.
// Renders BOTH the visible trail and BreadcrumbList JSON-LD into the static
// HTML (so Google crawls the trail without executing JS). Applied per content
// page rather than in the layout, because a layout under output:'export' has
// no access to the current pathname.
import Link from "next/link";

export const SITE = "https://bushpop.com.au";

export type Crumb = { name: string; href: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${SITE}${c.href}`,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav aria-label="Breadcrumb" className="crumb mb-4">
        <ol className="flex flex-wrap items-center">
          {items.map((c, i) => {
            const last = i === items.length - 1;
            return (
              <li key={c.href} className="flex items-center">
                {last ? (
                  <span aria-current="page" className="cur">
                    {c.name}
                  </span>
                ) : (
                  <>
                    <Link href={c.href}>{c.name}</Link>
                    <span aria-hidden="true" className="sep">
                      /
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
