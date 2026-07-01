import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Analytics } from "@/components/analytics";

// Display face — self-hosted at build time (works under output: 'export').
// Exposed as --font-fraunces, consumed by --font-display in globals.css.
// Swap this one import to change the display font at brand-lock.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

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
    <html lang="en-AU" className={fraunces.variable}>
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
