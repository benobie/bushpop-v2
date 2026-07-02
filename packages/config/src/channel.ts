export interface ChannelConfig {
  slug: string;
  name: string;
  domain: string;
  platformFeeBps: number;
  currency: "aud";
  supportEmail: string;
  tagline: string;
  shortTagline: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  url: {
    web: string;
    marketing?: string;
  };
  social: {
    instagram?: string;
    tiktok?: string;
  };
  theme: {
    primaryColor: string;
    accentColor: string;
  };
  isActive: boolean;
}

export const CHANNELS = {
  bushpop: {
    slug: "bushpop",
    name: "Bushpop",
    domain: "bushpop.com.au",
    // 1.75% headline rate. The +$0.30 fixed component lands with the
    // effective-dated fees config (Phase 1) — bps-only until then.
    platformFeeBps: 175,
    currency: "aud" as const,
    supportEmail: "support@bushpop.com.au",
    tagline: "Secondhand fashion, your way.",
    shortTagline: "Preloved fashion.",
    logoUrl: null,
    faviconUrl: null,
    url: {
      web: "https://bushpop.com.au",
    },
    social: {},
    theme: {
      primaryColor: "#2d2d2d",
      accentColor: "#e85d3a",
    },
    isActive: true,
  },
} as const satisfies Record<string, ChannelConfig>;

export type ChannelSlug = keyof typeof CHANNELS;

export const DEFAULT_CHANNEL: ChannelSlug = "bushpop";

export const FOUNDING_SELLER_LIMIT = 50;

export const COMPETITOR_FEES = {
  bushpop: 0.0175,
  depop: 0.1,
  ebay: 0.1377,
} as const;
