// ProductCard — presentational, server-rendered. The heart is a client island
// (FavButton). The whole card links to the "Launching soon" storefront since
// there are no real product pages until Launch 2.
import Image from "next/image";
import Link from "next/link";
import type { DemoProduct } from "@/lib/demo-products";
import { priceParts } from "@/lib/demo-products";
import { COMING_SOON } from "@/lib/links";
import { FavButton } from "./fav-button";

export function ProductCard({
  product,
  showRrp = true,
}: {
  product: DemoProduct;
  showRrp?: boolean;
}) {
  const { dollars, cents } = priceParts(product.price);
  const saved = product.rrp ? product.rrp - product.price : 0;
  const pct = product.rrp ? Math.round((saved / product.rrp) * 100) : 0;

  return (
    <Link href={COMING_SOON} className="pcard">
      <div className="pimg">
        {product.rrp && (
          <span className="sale">{pct}% OFF</span>
        )}
        {product.flag && <span className="flag">{product.flag}</span>}
        <Image
          src={product.img}
          alt={product.name}
          width={320}
          height={400}
          sizes="(max-width: 680px) 46vw, (max-width: 980px) 30vw, 280px"
        />
        <FavButton label={`Save ${product.name}`} />
      </div>
      <p className="pname">{product.name}</p>
      {showRrp && product.rrp && (
        <>
          <span className="psave">SAVE ${saved}</span>
          <div className="prrp">RRP: ${product.rrp}.00</div>
        </>
      )}
      <div className="pprice">
        {dollars}
        <sup>{cents}</sup>
      </div>
      <div className="psize">
        {product.size} • {product.condition} • {product.brand}
      </div>
      {/* Trust-claims gate (02/07/2026): no star ratings or saved-by counts on
          cards until a real review system with real data exists. */}
    </Link>
  );
}
