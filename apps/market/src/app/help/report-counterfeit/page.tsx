import type { Metadata } from "next";
import { TrustPage, TrustSection } from "@/components/trust/trust-page";
import { DEFAULT_CHANNEL, getChannelConfig } from "@bushpop/config";

export const metadata: Metadata = {
  title: "Report a counterfeit item",
  description: "How to report a listing you think isn't authentic, and what happens after you report it.",
};

export default function ReportCounterfeitPage() {
  const { supportEmail } = getChannelConfig(DEFAULT_CHANNEL);

  return (
    <TrustPage
      eyebrow="Authenticity"
      title="Report a counterfeit item"
      intro="We take authenticity seriously. If you think an item you've bought, or a listing you've seen, isn't the real thing, tell us and we'll act on it straight away."
    >
      <TrustSection heading="What to send us">
        <p>Email us with as much of this as you can:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>The listing link, order number, or item name.</li>
          <li>The brand you believe it's meant to be.</li>
          <li>What's making you think it isn't right, stitching, logo placement, a missing tag, whatever you've spotted.</li>
          <li>Photos, if you have the item in hand.</li>
        </ul>
        <p>
          Send it to{" "}
          <a href={`mailto:${supportEmail}`} className="font-medium text-bp-green-bright underline">
            {supportEmail}
          </a>
          .
        </p>
      </TrustSection>

      <TrustSection heading="What happens next">
        <p>
          We review every report within 24 hours. While we're looking into it, the listing comes down;
          if you've already bought the item, you're refunded under Buyer Protection straight away. You
          don't need to wait on the outcome to get your money back.
        </p>
        <p>
          If we confirm the item isn't authentic, it stays off the marketplace for good. If we can't
          confirm it either way, we'll follow up with you directly rather than leave you guessing.
        </p>
      </TrustSection>

      <TrustSection heading="A note on refund timing">
        <p>
          We action the refund on our end within 2 business days of the report. It can then take a few
          more business days to reach your account, that part's on your bank's timeline, not ours.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
