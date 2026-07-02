import type {
  ShippingProvider,
  ShippingAddress,
  ValidatedAddress,
  CreateShipmentInput,
  CreateShipmentResult,
  TrackingStatus,
} from "./types.js";

const STARSHIPIT_BASE_URL = "https://api.starshipit.com/api";

/**
 * StarshipitProvider — integrates with the Starshipit REST API.
 *
 * Starshipit docs: https://app.starshipit.com/apidoc
 * Auth: X-StarShipIT-Api-Key header + Ocp-Apim-Subscription-Key header
 *
 * Note: We use fetch (built-in Node 18+) — no SDK installed.
 */
export class StarshipitProvider implements ShippingProvider {
  private readonly apiKey: string;
  private readonly subscriptionKey: string;

  constructor(apiKey: string, subscriptionKey?: string) {
    this.apiKey = apiKey;
    // Starshipit also requires an Ocp-Apim-Subscription-Key; fall back to a
    // known default for environments that manage it via headers only.
    this.subscriptionKey = subscriptionKey ?? process.env.STARSHIPIT_SUBSCRIPTION_KEY ?? "";
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "X-StarShipIT-Api-Key": this.apiKey,
      ...(this.subscriptionKey ? { "Ocp-Apim-Subscription-Key": this.subscriptionKey } : {}),
    };
  }

  async validateAddress(addr: ShippingAddress): Promise<ValidatedAddress> {
    const response = await fetch(`${STARSHIPIT_BASE_URL}/address/validate`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        address: {
          street: addr.line1,
          suburb: addr.suburb,
          state_name: addr.state,
          post_code: addr.postcode,
          country_code: addr.country,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Starshipit address validation failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as { success?: boolean; errors?: unknown[] };

    if (!data.success) {
      throw new Error(`Starshipit address validation returned errors: ${JSON.stringify(data.errors)}`);
    }

    return { ...addr, normalised: true };
  }

  async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
    const body = {
      order: {
        reference: input.orderId,
        carrier_name: "AusPost",
        destination: {
          name: input.toAddress.name,
          street: input.toAddress.line1,
          suburb: input.toAddress.suburb,
          state_name: input.toAddress.state,
          post_code: input.toAddress.postcode,
          country_code: input.toAddress.country,
          ...(input.toAddress.phone ? { phone: input.toAddress.phone } : {}),
        },
        sender_details: {
          name: input.fromAddress.name,
          street: input.fromAddress.line1,
          suburb: input.fromAddress.suburb,
          state_name: input.fromAddress.state,
          post_code: input.fromAddress.postcode,
          country_code: input.fromAddress.country,
        },
        packages: [
          {
            weight: input.weightGrams ? input.weightGrams / 1000 : 0.5, // kg
            ...(input.declaredValueCents
              ? { declared_value: input.declaredValueCents / 100 }
              : {}),
          },
        ],
      },
    };

    const response = await fetch(`${STARSHIPIT_BASE_URL}/orders/shipments`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Starshipit createShipment failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as {
      success?: boolean;
      errors?: unknown[];
      shipment?: {
        tracking_number?: string;
        carrier_name?: string;
        label_url?: string;
      };
    };

    if (!data.success || !data.shipment) {
      throw new Error(`Starshipit createShipment returned errors: ${JSON.stringify(data.errors)}`);
    }

    const { tracking_number, carrier_name, label_url } = data.shipment;

    if (!tracking_number || !label_url) {
      throw new Error("Starshipit createShipment response missing tracking_number or label_url");
    }

    return {
      labelUrl: label_url,
      trackingNumber: tracking_number,
      carrier: carrier_name ?? "auspost",
    };
  }

  async getTrackingStatus(trackingNumber: string): Promise<TrackingStatus> {
    const response = await fetch(
      `${STARSHIPIT_BASE_URL}/tracking?tracking_number=${encodeURIComponent(trackingNumber)}`,
      { headers: this.headers },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Starshipit getTrackingStatus failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as {
      success?: boolean;
      errors?: unknown[];
      packages?: Array<{
        status?: string;
        last_updated?: string;
        events?: Array<{
          status?: string;
          date?: string;
          description?: string;
        }>;
      }>;
    };

    if (!data.success) {
      throw new Error(`Starshipit getTrackingStatus returned errors: ${JSON.stringify(data.errors)}`);
    }

    const pkg = data.packages?.[0];

    return {
      status: pkg?.status ?? "Unknown",
      lastUpdated: pkg?.last_updated ?? null,
      events: (pkg?.events ?? []).map((e) => ({
        status: e.status ?? "",
        date: e.date ?? "",
        description: e.description ?? "",
      })),
    };
  }
}
