"use client";

import { createContext, useContext, useCallback, useMemo } from "react";
import { DEFAULT_CHANNEL, getChannelConfig } from "@bushpop/config";

/**
 * Channel context + namespaced localStorage hook.
 *
 * The market app is now single-tenant, but storage keys stay prefixed with
 * the channel slug for compatibility with existing client state.
 */

interface ChannelContextValue {
  channel: string;
}

const ChannelContext = createContext<ChannelContextValue | null>(null);
const channelConfig = getChannelConfig(DEFAULT_CHANNEL);

export function ChannelProvider({
  children,
}: {
  channel?: string;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ channel: channelConfig.slug }), []);
  return (
    <ChannelContext.Provider value={value}>{children}</ChannelContext.Provider>
  );
}

export function useChannel(): string {
  const ctx = useContext(ChannelContext);
  if (!ctx) {
    throw new Error("useChannel must be used within a ChannelProvider");
  }
  return ctx.channel;
}

/**
 * Wraps localStorage with channel-prefixed keys.
 * Usage: const storage = useChannelStorage(); storage.setItem("bag", JSON.stringify(items))
 * → stores as "bushpop:bag"
 */
export function useChannelStorage() {
  const channel = useChannel();

  function prefix(key: string): string {
    return channel + ":" + key;
  }

  const getItem = useCallback(
    (key: string): string | null => {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(prefix(key));
    },
    [prefix],
  );

  const setItem = useCallback(
    (key: string, value: string): void => {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(prefix(key), value);
    },
    [prefix],
  );

  const removeItem = useCallback(
    (key: string): void => {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(prefix(key));
    },
    [prefix],
  );

  return { getItem, setItem, removeItem };
}
