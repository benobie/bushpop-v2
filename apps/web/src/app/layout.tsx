import type { Metadata } from "next";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";

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
        <SiteNav />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
