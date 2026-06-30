// Data-driven index of every brand size-chart, rendered straight from the
// BRANDS source of truth (src/lib/brands.ts). Adding a brand there now adds it
// to the hub automatically — the list can never silently drift behind the data
// (the failure that left 4 of 19 brands unlinked before 2026-06-30).
//
// Server component (zero client JS). Emits the same h3/ul/li/a markup that the
// surrounding MDX produces from `###` / `-` / `[]()`, so it inherits the page's
// styling with no special-casing.
import Link from "next/link";
import { BRANDS } from "@/lib/brands";

// Group brands by the leading segment of their `category` (the part before the
// " · " separator, e.g. "Australian fashion · women's" → "Australian fashion").
// First-seen order is preserved so the grouping is deterministic and needs no
// hardcoded category list to maintain.
function groupBrands() {
  const groups: { heading: string; brands: typeof BRANDS }[] = [];
  for (const brand of BRANDS) {
    const heading = brand.category.split(" · ")[0];
    let group = groups.find((g) => g.heading === heading);
    if (!group) {
      group = { heading, brands: [] };
      groups.push(group);
    }
    group.brands.push(brand);
  }
  return groups;
}

export function BrandSizeChartIndex() {
  const groups = groupBrands();
  return (
    <>
      {groups.map((group) => (
        <div key={group.heading}>
          <h3>{group.heading}</h3>
          <ul>
            {group.brands.map((brand) => (
              <li key={brand.slug}>
                <Link href={`/guides/size-charts/${brand.slug}/`}>
                  {brand.name} size chart
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
