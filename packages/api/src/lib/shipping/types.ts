// ---------------------------------------------------------------------------
// ShippingProvider interface
// ---------------------------------------------------------------------------

export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
  phone?: string;
}

export interface ValidatedAddress extends ShippingAddress {
  /**
   * Normalised address returned by the provider (may differ from input
   * if the provider corrected casing, postcode, etc.).
   */
  normalised: boolean;
}

export interface CreateShipmentInput {
  orderId: string;
  fromAddress: ShippingAddress;
  toAddress: ShippingAddress;
  /** Weight in grams */
  weightGrams?: number;
  /** Declared value in cents (AUD) */
  declaredValueCents?: number;
}

export interface CreateShipmentResult {
  /** Public URL to download/print the shipping label PDF */
  labelUrl: string;
  /** Carrier tracking number */
  trackingNumber: string;
  /** Carrier code e.g. "auspost", "aramex" */
  carrier: string;
}

export interface TrackingEvent {
  status: string;
  date: string;
  description: string;
}

export interface TrackingStatus {
  status: string;
  lastUpdated: string | null;
  events: TrackingEvent[];
}

/**
 * Abstraction over real shipping providers (Starshipit) and the mock.
 *
 * All methods throw on error — callers are responsible for retry / dead-letter.
 */
export interface ShippingProvider {
  /**
   * Validate and normalise a shipping address.
   * Returns a ValidatedAddress on success, throws on validation failure.
   */
  validateAddress(addr: ShippingAddress): Promise<ValidatedAddress>;

  /**
   * Create a shipment and generate a shipping label.
   * Returns label URL + tracking details on success.
   */
  createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>;

  /**
   * Fetch the current tracking status for a shipment.
   * Returns tracking status, last update time, and event history.
   */
  getTrackingStatus(trackingNumber: string): Promise<TrackingStatus>;
}
