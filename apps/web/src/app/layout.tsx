import type { Metadata } from "next";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Analytics } from "@/components/analytics";

const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Bushpop",
  url: "https://bushpop.com.au",
  description:
    "Australia's secondhand fashion marketplace — preloved clothing kept in circulation.",
  areaServed: "AU",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://bushpop.com.au"),
  title: {
    default: "Bushpop — Secondhand Fashion Australia",
    template: "%s | Bushpop",
  },
  description:
    "Bushpop is Australia's secondhand fashion marketplace. Find size guides, brand charts, and sustainable style.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-AU">
      <body className="antialiased flex min-h-screen flex-col">
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }}
        />
        <SiteNav />
        <div className="flex-1">{children}</div>
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
