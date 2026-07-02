import type { ShippingProvider } from "./types.js";
import { StarshipitProvider } from "./starshipit.js";
import { MockShippingProvider } from "./mock.js";

export type { ShippingProvider, ShippingAddress, ValidatedAddress, CreateShipmentInput, CreateShipmentResult, TrackingStatus, TrackingEvent } from "./types.js";

let _provider: ShippingProvider | null = null;

/**
 * Returns the active ShippingProvider singleton.
 *
 * Uses Starshipit if STARSHIPIT_API_KEY is set, otherwise the mock.
 * In production, the calling code should enforce that STARSHIPIT_API_KEY is
 * present before calling this (see boot-time guard in index.ts).
 */
export function getShippingProvider(): ShippingProvider {
  if (_provider) return _provider;

  const apiKey = process.env.STARSHIPIT_API_KEY;
  if (apiKey) {
    _provider = new StarshipitProvider(apiKey);
    console.info("[shipping] Using Starshipit provider");
  } else {
    _provider = new MockShippingProvider();
    console.info("[shipping] STARSHIPIT_API_KEY not set — using mock shipping provider");
  }

  return _provider;
}

/**
 * Reset the provider singleton (for testing).
 * @internal
 */
export function _resetShippingProvider(): void {
  _provider = null;
}
