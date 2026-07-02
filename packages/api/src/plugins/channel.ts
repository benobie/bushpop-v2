import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { db } from "@bushpop/db/client";
import { channels } from "@bushpop/db/schema";
import { DEFAULT_CHANNEL } from "@bushpop/config/channel";

interface ChannelData {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
  platformFeeBps: number;
  currency: string;
  supportEmail: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  theme: unknown;
  isActive: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    channel: ChannelData;
  }
}

async function channelPluginFn(app: FastifyInstance) {
  // Cache channels in memory
  let channelCache: Map<string, ChannelData> = new Map();
  let channelsByDomain: Map<string, ChannelData> = new Map();

  async function refreshChannels() {
    try {
      const rows = await db.select().from(channels);
      const slugMap = new Map<string, ChannelData>();
      const domainMap = new Map<string, ChannelData>();

      for (const row of rows) {
        slugMap.set(row.slug, row);
        if (row.domain) {
          domainMap.set(row.domain, row);
        }
      }

      channelCache = slugMap;
      channelsByDomain = domainMap;
      app.log.debug(`Loaded ${rows.length} channels`);
    } catch (err) {
      app.log.error(err, "Failed to refresh channel cache");
    }
  }

  // Load channels on startup
  await refreshChannels();

  // Refresh every 5 minutes
  const interval = setInterval(refreshChannels, 5 * 60 * 1000);
  app.addHook("onClose", () => clearInterval(interval));

  // Resolve channel on every request
  app.addHook("onRequest", async (request: FastifyRequest) => {
    // 1. Check Host header
    const host = request.hostname;
    const byDomain = channelsByDomain.get(host);
    if (byDomain && byDomain.isActive) {
      request.channel = byDomain;
      return;
    }

    // 2. Check X-Channel header
    const xChannel = request.headers["x-channel"] as string | undefined;
    if (xChannel) {
      const byHeader = channelCache.get(xChannel);
      if (byHeader && byHeader.isActive) {
        request.channel = byHeader;
        return;
      }
    }

    // 3. Fallback to default channel
    const fallback = channelCache.get(DEFAULT_CHANNEL);
    if (fallback) {
      request.channel = fallback;
      return;
    }

    // This shouldn't happen if seed ran, but defensive
    request.channel = {
      id: "unknown",
      slug: DEFAULT_CHANNEL,
      name: "Piklo",
      domain: null,
      platformFeeBps: 800,
      currency: "aud",
      supportEmail: null,
      logoUrl: null,
      faviconUrl: null,
      theme: null,
      isActive: true,
    };
  });
}

export const channelPlugin = fp(channelPluginFn, {
  name: "channel",
});
