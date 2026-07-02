import type { ShippingProvider, ShippingAddress, ValidatedAddress, CreateShipmentInput, CreateShipmentResult, TrackingStatus } from "./types.js";

/**
 * MockShippingProvider — used when STARSHIPIT_API_KEY is not set (dev / test).
 *
 * - Address validation always passes (returns input as normalised).
 * - createShipment returns a deterministic fake label URL and tracking number.
 * - getTrackingStatus returns a mock "InTransit" status.
 */
export class MockShippingProvider implements ShippingProvider {
  async validateAddress(addr: ShippingAddress): Promise<ValidatedAddress> {
    // Mock: always valid, return as-is
    return { ...addr, normalised: true };
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    const trackingNumber = `MOCK-${input.orderId.slice(-8).toUpperCase()}`;
    return {
      labelUrl: `https://mock-shipping.bushpop.internal/labels/${input.orderId}.pdf`,
      trackingNumber,
      carrier: "mock",
    };
  }

  async getTrackingStatus(trackingNumber: string): Promise<TrackingStatus> {
    return {
      status: "InTransit",
      lastUpdated: new Date().toISOString(),
      events: [
        {
          status: "InTransit",
          date: new Date().toISOString(),
          description: `Mock tracking for ${trackingNumber}`,
        },
      ],
    };
  }
}
