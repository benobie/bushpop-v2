"use client";

import { useEffect } from "react";

// Support-chat widget (Chatwoot). Dormant unless both env vars are baked in
// at build time — see docs/support-widget.md for the activation steps
// (Coolify build args + redeploy; NEXT_PUBLIC_* can't be set at runtime).
const CHATWOOT_BASE_URL = process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL;
const CHATWOOT_WEBSITE_TOKEN = process.env.NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN;

declare global {
  interface Window {
    chatwootSDK?: {
      run: (config: { websiteToken: string; baseUrl: string }) => void;
    };
  }
}

let chatwootScriptRequested = false;

function loadChatwoot(baseUrl: string, websiteToken: string) {
  if (chatwootScriptRequested || typeof window === "undefined") return;
  chatwootScriptRequested = true;

  const script = document.createElement("script");
  script.src = `${baseUrl}/packs/js/sdk.js`;
  script.async = true;
  script.defer = true;
  script.onload = () => {
    window.chatwootSDK?.run({ websiteToken, baseUrl });
  };
  // A failed load (network blip, ad blocker) shouldn't permanently wedge the
  // widget off — clear the guard so the next mount can retry.
  script.onerror = () => {
    chatwootScriptRequested = false;
    script.remove();
  };
  document.body.appendChild(script);
}

/**
 * Mounts the Chatwoot launcher bubble. Renders nothing and no-ops unless
 * NEXT_PUBLIC_CHATWOOT_BASE_URL + NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN are set.
 */
export function ChatwootWidget() {
  useEffect(() => {
    if (!CHATWOOT_BASE_URL || !CHATWOOT_WEBSITE_TOKEN) return;
    loadChatwoot(CHATWOOT_BASE_URL, CHATWOOT_WEBSITE_TOKEN);
  }, []);

  return null;
}
