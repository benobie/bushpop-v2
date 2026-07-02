"use client";

import { createContext, useContext, useCallback, useMemo } from "react";

/**
 * Channel context + namespaced localStorage hook. (LB-1)
 *
 * All client-side storage keys must be prefixed with the channel slug to
 * prevent cross-channel bleed (e.g. piklo:bag vs bushpop:bag).
 */

interface ChannelContextValue {
  channel: string;
}

const ChannelContext = createContext<ChannelContextValue | null>(null);

export function ChannelProvider({
  channel,
  children,
}: {
  channel: string;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ channel }), [channel]);
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
 * → stores as "piklo:bag" or "bushpop:bag"
 */
export function useChannelStorage() {
  const channel = useChannel();

  const prefix = useCallback((key: string) => `${channel}:${key}`, [channel]);

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
