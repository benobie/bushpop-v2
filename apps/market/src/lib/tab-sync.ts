/**
 * Cross-tab synchronisation with Safari fallback. (FM-10)
 *
 * BroadcastChannel is unreliable in some Safari contexts.
 * This wraps it with a localStorage storage-event fallback
 * and a visibilitychange listener for re-checking auth state.
 */

export function createTabSync(channelName: string) {
  const bc =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(channelName)
      : null;

  return {
    postMessage(msg: unknown) {
      if (bc) {
        bc.postMessage(msg);
      } else {
        // Fallback: storage event works cross-tab in all browsers including Safari
        localStorage.setItem(
          `__tabsync:${channelName}`,
          JSON.stringify({ msg, t: Date.now() }),
        );
      }
    },

    onMessage(handler: (msg: unknown) => void) {
      if (bc) {
        bc.onmessage = (e) => handler(e.data);
      }

      // Always listen to storage events as fallback
      window.addEventListener("storage", (e) => {
        if (e.key === `__tabsync:${channelName}` && e.newValue) {
          handler(JSON.parse(e.newValue).msg);
        }
      });

      // Re-check auth state when tab becomes visible
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          handler({ type: "visibility-check" });
        }
      });
    },
  };
}
