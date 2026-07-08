import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import { DEFAULT_CHANNEL, getChannelConfig } from "@bushpop/config";
import { SessionProvider } from "@/providers/session-provider";
import { ChannelProvider } from "@/providers/channel-provider";
import { PostHogProvider } from "@/providers/posthog-provider";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteHeaderSkeleton } from "@/components/layout/site-header-skeleton";
import { MarketFooter } from "@/components/layout/market-footer";
import { MarketBottomBar } from "@/components/layout/market-bottom-bar";
import { ChatwootWidget } from "@/components/chatwoot-widget";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const channelConfig = getChannelConfig(DEFAULT_CHANNEL);

export function generateMetadata(): Metadata {
  return {
    title: {
      default: `${channelConfig.name} — ${channelConfig.shortTagline}`,
      template: `%s | ${channelConfig.name}`,
    },
    description: channelConfig.tagline,
    openGraph: {
      siteName: channelConfig.name,
      locale: "en_AU",
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${jakarta.variable} ${inter.variable}`}>
      <body className="font-body antialiased">
        <div data-channel={channelConfig.slug} className="min-h-screen bg-white">
          <ChannelProvider>
            <PostHogProvider>
              <SessionProvider>
                <Suspense fallback={<SiteHeaderSkeleton />}>
                  <SiteHeader />
                </Suspense>
                <div className="pb-16 md:pb-0">{children}</div>
                <MarketFooter
                  channelName={channelConfig.name}
                  tagline={channelConfig.tagline}
                  supportEmail={channelConfig.supportEmail}
                />
                <Suspense fallback={null}>
                  <MarketBottomBar />
                </Suspense>
                <ChatwootWidget />
              </SessionProvider>
            </PostHogProvider>
          </ChannelProvider>
        </div>
      </body>
    </html>
  );
}
