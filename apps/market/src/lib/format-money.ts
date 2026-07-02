/**
 * Format cents as a currency string using Intl.NumberFormat.
 * Default currency is AUD; all prices in the Piklo API are in cents.
 *
 * @example formatMoney(1999) // "$19.99"
 * @example formatMoney(1999, "USD") // "US$19.99"
 */
export function formatMoney(cents: number, currency = "AUD"): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
