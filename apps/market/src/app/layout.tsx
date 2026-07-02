import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import { DEFAULT_CHANNEL, getChannelConfig } from "@bushpop/config";
import { SessionProvider } from "@/providers/session-provider";
import { ChannelProvider } from "@/providers/channel-provider";
import { PostHogProvider } from "@/providers/posthog-provider";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { MobileNav } from "@/components/layout/mobile-nav";
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
                <Header channelName={channelConfig.name} />
                <div className="pb-16 md:pb-0">{children}</div>
                <Footer
                  channelName={channelConfig.name}
                  supportEmail={channelConfig.supportEmail}
                />
                <MobileNav />
              </SessionProvider>
            </PostHogProvider>
          </ChannelProvider>
        </div>
      </body>
    </html>
  );
}
