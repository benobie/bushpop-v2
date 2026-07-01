// Central routing for pre-launch CTAs. Every marketplace action (shop, sell,
// cart, add-to-bag, product tile) points at the "Launching soon" storefront
// so nothing on the live site is a dead button or implies a working shop.
// When the Launch-2 engine lands, these repoint to the real routes.
export const COMING_SOON = "/shop/";
export const SELL_SOON = "/shop/";
export const BAG_SOON = "/shop/";
