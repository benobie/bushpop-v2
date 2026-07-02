/**
 * Channel config resolver for the web frontend.
 * Used by middleware (channel detection), generateMetadata(), sitemap, OG routes.
 * Single source of truth — no hardcoded brand defaults anywhere else. (FM-5)
 */

import { CHANNELS, DEFAULT_CHANNEL, type ChannelSlug } from "./channel";

export interface ResolvedChannel {
  slug: ChannelSlug;
  name: string;
  domain: string;
  tagline: string;
  shortTagline: string;
  supportEmail: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  url: { web: string; marketing?: string };
  social: { instagram?: string; tiktok?: string };
  theme: { primaryColor: string; accentColor: string };
}

/** Map of hostname → channel slug for middleware resolution */
const HOST_MAP: Record<string, ChannelSlug> = {
  "piklo.com.au": "piklo",
  "www.piklo.com.au": "piklo",
  "bushpop.com.au": "bushpop",
  "www.bushpop.com.au": "bushpop",
  "piklo.local": "piklo",
  "bushpop.local": "bushpop",
};

/**
 * Resolve channel slug from a hostname string.
 * Falls back to DEFAULT_CHANNEL for unknown hosts (localhost, preview deploys, etc.).
 */
export function resolveChannelFromHost(host: string): ChannelSlug {
  // Strip port for localhost dev
  const hostname = host.split(":")[0] ?? host;
  return HOST_MAP[hostname] ?? DEFAULT_CHANNEL;
}

/**
 * Get the full channel config for a given slug.
 * Falls back to DEFAULT_CHANNEL for unknown slugs.
 */
export function getChannelConfig(slug: string): ResolvedChannel {
  const channel = CHANNELS[slug as ChannelSlug] ?? CHANNELS[DEFAULT_CHANNEL];
  return {
    slug: channel.slug as ChannelSlug,
    name: channel.name,
    domain: channel.domain,
    tagline: channel.tagline,
    shortTagline: channel.shortTagline,
    supportEmail: channel.supportEmail,
    logoUrl: channel.logoUrl,
    faviconUrl: channel.faviconUrl,
    url: channel.url,
    social: channel.social,
    theme: channel.theme,
  };
}

/** All valid channel slugs */
export const CHANNEL_SLUGS = Object.keys(CHANNELS) as ChannelSlug[];

export { DEFAULT_CHANNEL } from "./channel";
export type { ChannelSlug } from "./channel";
