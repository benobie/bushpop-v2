import type { Metadata } from "next";
import { TrustPage, TrustSection, TrustLinkCard } from "@/components/trust/trust-page";
import { DEFAULT_CHANNEL, getChannelConfig } from "@bushpop/config";

export const metadata: Metadata = {
  title: "Help and support",
  description: "Get in touch with Bushpop support, or find answers on returns, shipping and reporting a counterfeit item.",
};

export default function HelpPage() {
  const { supportEmail } = getChannelConfig(DEFAULT_CHANNEL);

  return (
    <TrustPage
      eyebrow="Help"
      title="Help and support"
      intro="We're a small Australian team, and we read every message ourselves. If something's wrong with an order, or you just have a question, get in touch and we'll sort it."
    >
      <TrustSection heading="Get in touch">
        <p>
          Email us at{" "}
          <a href={`mailto:${supportEmail}`} className="font-medium text-bp-green-bright underline">
            {supportEmail}
          </a>{" "}
          with your order number and what's going on. A real person reads every message, and we get
          back to you as fast as we can, usually within a day.
        </p>
      </TrustSection>

      <TrustSection heading="Quick answers">
        <div className="grid gap-3 sm:grid-cols-2">
          <TrustLinkCard
            href="/orders"
            label="Where's my order?"
            description="Check the status and tracking on your orders page."
          />
          <TrustLinkCard
            href="/returns"
            label="Something wrong with an order?"
            description="How returns and Buyer Protection work."
          />
          <TrustLinkCard
            href="/shipping"
            label="How does shipping and pickup work?"
            description="Delivery, tracked labels and local pickup."
          />
          <TrustLinkCard
            href="/help/report-counterfeit"
            label="Think an item isn't authentic?"
            description="How to report it and what happens next."
          />
        </div>
      </TrustSection>

      <TrustSection heading="Before you buy">
        <p>
          Listings include measurements alongside the size, so you can check fit before you buy. If a
          listing is missing something you need, message us and we'll follow up with the seller.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
