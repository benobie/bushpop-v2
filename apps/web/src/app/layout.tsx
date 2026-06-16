import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
