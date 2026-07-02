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
  piklo: {
    slug: "piklo",
    name: "Piklo",
    domain: "piklo.com.au",
    platformFeeBps: 800,
    currency: "aud" as const,
    supportEmail: "hello@piklo.com.au",
    tagline: "Your collection, your way.",
    shortTagline: "Preloved, personally.",
    logoUrl: null,
    faviconUrl: null,
    url: {
      web: "https://piklo.com.au",
      marketing: "https://piklo.co",
    },
    social: {
      instagram: "https://instagram.com/pikloapp",
      tiktok: "https://tiktok.com/@pikloapp",
    },
    theme: {
      primaryColor: "#e85d3a",
      accentColor: "#007780",
    },
    isActive: true,
  },
  bushpop: {
    slug: "bushpop",
    name: "Bushpop",
    domain: "bushpop.com.au",
    platformFeeBps: 1000,
    currency: "aud" as const,
    supportEmail: "hello@bushpop.com.au",
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
    isActive: false,
  },
} as const satisfies Record<string, ChannelConfig>;

export type ChannelSlug = keyof typeof CHANNELS;

export const DEFAULT_CHANNEL: ChannelSlug = "piklo";

export const FOUNDING_SELLER_LIMIT = 50;

export const COMPETITOR_FEES = {
  piklo: 0.08,
  depop: 0.1,
  ebay: 0.1377,
} as const;
