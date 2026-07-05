import type { Metadata } from "next";
import { TrustPage, TrustSection } from "@/components/trust/trust-page";
import { DEFAULT_CHANNEL, getChannelConfig } from "@bushpop/config";

export const metadata: Metadata = {
  title: "Returns and Buyer Protection",
  description: "How Buyer Protection works, what's covered, and how to raise an issue with an order.",
};

export default function ReturnsPage() {
  const { supportEmail } = getChannelConfig(DEFAULT_CHANNEL);

  return (
    <TrustPage
      eyebrow="Buyer Protection"
      title="Returns and Buyer Protection"
      intro="Every order on Bushpop is covered by Buyer Protection. If something's wrong, tell us and we'll make it right, a refund to your original payment method, or a return, whichever fits."
    >
      <TrustSection heading="What's covered">
        <ul className="list-disc space-y-2 pl-5">
          <li>The item doesn't match the listing, photos or measurements.</li>
          <li>The item didn't arrive, and tracking doesn't show it delivered.</li>
          <li>Tracking says delivered but you genuinely don't have it.</li>
          <li>You have concerns about whether an item is authentic.</li>
        </ul>
        <p>
          Wrong size or changed your mind? There's no automatic right to return for that, but get in
          touch and we'll look at it, we'd rather sort it than leave you stuck with something you can't
          wear.
        </p>
      </TrustSection>

      <TrustSection heading="How refunds work">
        <p>
          Refunds go back to your original payment method, never a store credit you didn't ask for, and
          never held by Bushpop. We start a refund within 2 business days of hearing from you; it can
          then take a few more business days to land, depending on your bank.
        </p>
      </TrustSection>

      <TrustSection heading="How to raise an issue">
        <p>
          Email{" "}
          <a href={`mailto:${supportEmail}`} className="font-medium text-bp-green-bright underline">
            {supportEmail}
          </a>{" "}
          with your order number and what's happened. For item-not-as-described claims, a photo or two
          helps us sort it faster. We aim to respond the same day, always within 24 hours.
        </p>
      </TrustSection>

      <TrustSection heading="Authenticity concerns">
        <p>
          If you think an item isn't authentic, we take it seriously and refund you while we look into
          it.{" "}
          <a href="/help/report-counterfeit" className="font-medium text-bp-green-bright underline">
            See how to report a counterfeit item
          </a>
          .
        </p>
      </TrustSection>

      <TrustSection heading="Local pickup">
        <p>
          Local pickup has no shipping cost and no Buyer Protection fee. Check the item over at handover
          before you go, and if anything's not right, don't complete the pickup, get in touch and we'll
          help sort it.
        </p>
      </TrustSection>

      <TrustSection heading="Your consumer rights">
        <p>
          Buyer Protection sits alongside your rights under Australian Consumer Law, it doesn't replace
          or limit them. Secondhand items are judged against their age, price and disclosed condition,
          but you're always entitled to a remedy if an item isn't as described or isn't of acceptable
          quality for what it is.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
