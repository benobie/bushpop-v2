import type { Metadata } from "next";
import { TrustPage, TrustSection } from "@/components/trust/trust-page";

export const metadata: Metadata = {
  title: "Shipping and delivery",
  description: "How shipping, tracked labels and local pickup work on Bushpop.",
};

export default function ShippingPage() {
  return (
    <TrustPage
      eyebrow="Shipping"
      title="Shipping and delivery"
      intro="Every listing shows how it ships and what that costs, before you add it to your bag."
    >
      <TrustSection heading="Posted orders">
        <p>
          Shipping is a flat rate based on the item's parcel size, shown at checkout before you pay, no
          surprise costs added later. Sellers post with a prepaid, tracked label and are asked to post
          within 2 business days of a sale.
        </p>
        <p>
          Once an order ships, you'll get tracking so you can follow it. If it hasn't moved in a few
          business days, get in touch and we'll chase it up.
        </p>
      </TrustSection>

      <TrustSection heading="Local pickup">
        <p>
          Some sellers offer local pickup instead of posting. There's no shipping cost and no Buyer
          Protection fee on a pickup order. Arrange the handover directly with the seller once your
          order's confirmed, and check the item over before you go.
        </p>
      </TrustSection>

      <TrustSection heading="If something goes wrong">
        <p>
          Delivery problems, missing tracking, or an item that arrives not as described are all covered
          under Buyer Protection.{" "}
          <a href="/returns" className="font-medium text-bp-green-bright underline">
            See how returns and Buyer Protection work
          </a>
          .
        </p>
      </TrustSection>
    </TrustPage>
  );
}
