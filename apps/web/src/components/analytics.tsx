"use client";

// Production-gated analytics. GA4 + GTM only fire on the live domain
// (bushpop.com.au) — NOT on the Cloudflare Pages staging host
// (bushpop-v2.pages.dev) — so pre-cutover staging traffic never pollutes the
// live GA4 property. Gating is runtime (hostname) rather than build-time
// because the same static build serves staging now and production after the
// cutover.
//
// NOTE (flagged for Ben / GA admin): this loads BOTH GA4 (gtag direct) and the
// GTM container. If the GTM container GTM-52VFXTGQ already fires a GA4 tag for
// G-M4629HWMCP, pageviews will double-count — in that case drop the direct
// gtag block below and let GTM manage GA4. Verify in GTM before cutover.
import Script from "next/script";
import { useEffect, useState } from "react";

const GA_ID = "G-M4629HWMCP";
const GTM_ID = "GTM-52VFXTGQ";
const PROD_HOSTS = new Set(["bushpop.com.au", "www.bushpop.com.au"]);

export function Analytics() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (PROD_HOSTS.has(window.location.hostname)) setEnabled(true);
  }, []);

  if (!enabled) return null;

  return (
    <>
      {/* Google Tag Manager */}
      <Script id="gtm" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');`}
      </Script>

      {/* Google Analytics 4 (gtag) */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
      </Script>
    </>
  );
}
