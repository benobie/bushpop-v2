import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { CHANNEL_SLUGS, getChannelConfig } from "@bushpop/config";
import { SessionProvider } from "@/providers/session-provider";
import { ChannelProvider } from "@/providers/channel-provider";
import { PostHogProvider } from "@/providers/posthog-provider";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { MobileNav } from "@/components/layout/mobile-nav";

/**
 * Pre-declare the dynamic segment values so Cache Components can resolve
 * `params.channel` at build time. Without this, `await params` inside a
 * `'use cache'` scope is treated as uncached dynamic data and blocks
 * prerender. Piklo ships with two known channels (`piklo`, `bushpop`);
 * this list is the single source of truth at `@bushpop/config` → `channel.ts`.
 */
export function generateStaticParams() {
  return CHANNEL_SLUGS.map((channel) => ({ channel }));
}

interface ChannelLayoutProps {
  children: React.ReactNode;
  params: Promise<{ channel: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ channel: string }>;
}): Promise<Metadata> {
  "use cache";
  cacheLife("max");
  const { channel } = await params;
  const config = getChannelConfig(channel);

  return {
    title: {
      default: `${config.name} — ${config.shortTagline}`,
      template: `%s | ${config.name}`,
    },
    description: config.tagline,
    openGraph: {
      siteName: config.name,
      locale: "en_AU",
    },
  };
}

/**
 * Channel shell layout. Cached with `'use cache'` + `cacheLife('max')` per
 * Cache Components (Sprint 0.5c). `params.channel` is a dynamic input that
 * would otherwise block static prerendering of nested pages — caching the
 * layout makes the shell prerender per-channel with the channel slug as
 * the cache key. Interactive state (session, PostHog, mobile nav) lives in
 * Client Components inside the cached shell and is not affected by this.
 */
export default async function ChannelLayout({
  children,
  params,
}: ChannelLayoutProps) {
  "use cache";
  cacheLife("max");
  const { channel } = await params;
  const config = getChannelConfig(channel);

  return (
    <div data-channel={config.slug} className="min-h-screen bg-white">
      <ChannelProvider channel={config.slug}>
        <PostHogProvider>
          <SessionProvider>
            <Header channelName={config.name} />
            <div className="pb-16 md:pb-0">{children}</div>
            <Footer
              channelName={config.name}
              supportEmail={config.supportEmail}
            />
            <MobileNav />
          </SessionProvider>
        </PostHogProvider>
      </ChannelProvider>
    </div>
  );
}
