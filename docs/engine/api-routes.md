> **Provenance:** engine doc copied from `benobie/piklo-v2` @ `2419a38` at fork time (02/07/2026), with `@piklo/*` renamed `@bushpop/*`. May drift from upstream — see `docs/engine/FORK.md`.

# API Route Inventory

Scope: every route mounted from `packages/api/src/routes/v1/`. A related auth surface also exists outside this tree at `ALL /api/auth/*` via `packages/api/src/plugins/auth.ts`; that passthrough is noted in the Auth section because it is not defined in `routes/v1` and has no local Zod schema.

Auth legend:
- `public`: no Fastify auth middleware.
- `buyer-auth`: `requireAuth` only; the code does not check the `buyer` role explicitly.
- `seller-auth`: `requireAuth` + `requireRole("seller")`.
- `admin-auth`: `requireAuth` + `requireRole("admin")`.
- `webhook`: no app auth; the handler relies on provider signature/HMAC verification.

## Store

Auth: Public (no session required) for routes marked `public`; `buyer-auth` for routes marked `buyer-auth`.

### Public store routes

| Method | Path | Auth | Request Schema | Response Schema | Description |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/v1/store/channels/current` | `public` | none | `200` current channel object: `{ id, slug, name, domain?, platformFeeBps, currency, supportEmail?, logoUrl?, faviconUrl?, theme?, isActive }` | Returns `request.channel` after host / `X-Channel` resolution. |
| `GET` | `/api/v1/store/categories` | `public` | `querystring`: `{ parentId?: ULID }` | `200`: `{ items: Array<{ id, name, slug, parentId|null, channelId|null }> }` | Lists channel categories plus global categories; when `parentId` is omitted it returns root categories only. |
| `GET` | `/api/v1/store/listings` | `public` | `browseQuerySchema`: `{ limit?: int(1-100)=20, offset?: int>=0=0, categorySlug?, size?, colour?, brand?, condition?, minPrice?: int>=0, maxPrice?: int>=0, sort?: "newest","price_asc","price_desc"="newest" }` | `200` `listingPageResponseSchema`: `{ items: StoreListingCard[], total, offset, limit, hasMore }`, `StoreListingCard = { id, title, handle, priceCents, currency, publishedAt|null, primaryImageUrl|null, brand|null, size|null, colour|null, condition|null, categorySlug|null, seller{ id, handle, storeName, avatarUrl|null } }` | MeiliSearch-backed browse endpoint with filters and sort, no full-text query. |
| `GET` | `/api/v1/store/search` | `public` | `searchQuerySchema`: `BrowseQuery + { q: string(1-200) }` | `200` `listingPageResponseSchema` | MeiliSearch-backed full-text search endpoint. |
| `GET` | `/api/v1/store/listings/:handle` | `public` | `params`: `{ handle: string(1-100) }` | `200`: `{ id, title, description|null, priceCents, currency, handle, status, publishedAt|null, images: Array<{ id, url, position, isPrimary }>, seller: seller object or null }` | Returns one active listing by handle or 26-char ULID. |
| `GET` | `/api/v1/store/sellers/:id` | `public` | `params`: `{ id: string(1-50) }` | `200` `storeSellerResponseSchema`: `{ id, handle, storeName, bio|null, avatarUrl|null, verifiedAt|null, createdAt }` | Returns the public seller profile by seller profile ULID or handle. |

### Buyer-auth store routes

Auth: Authenticated buyer (`buyer-auth`)

| Method | Path | Auth | Request Schema | Response Schema | Description |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/v1/addresses` | `buyer-auth` | `body` `createAddressSchema`: `{ label?: string<=50, line1, line2?: string<=255, suburb, state, postcode, country?: string(2)="AU", isDefault?: boolean=false }` | `201` `addressResponseSchema`: `{ id, userId, label|null, line1, line2|null, suburb, state, postcode, country, isDefault, createdAt, updatedAt }` | Creates an address owned by the authenticated user. |
| `GET` | `/api/v1/addresses` | `buyer-auth` | none | `200`: `Address[]` using `addressResponseSchema` | Lists the caller's non-soft-deleted addresses. |
| `GET` | `/api/v1/addresses/:id` | `buyer-auth` | `params`: `{ id: ULID }` | `200` `addressResponseSchema` | Fetches one owned, non-deleted address. |
| `PATCH` | `/api/v1/addresses/:id` | `buyer-auth` | `params`: `{ id: ULID }`<br>`body` `updateAddressSchema`: partial `CreateAddress` | `200` `addressResponseSchema` | Updates mutable address fields. |
| `DELETE` | `/api/v1/addresses/:id` | `buyer-auth` | `params`: `{ id: ULID }` | `204`: no content; schema is `z.null()` | Soft-deletes an address unless an active checkout references it. |
| `POST` | `/api/v1/store/cart/items` | `buyer-auth` | `body` `addToCartSchema`: `{ listingId: ULID }` | `200` `cartSchema`: `{ id, buyerId, channelId, sellerId, createdAt, updatedAt, items: Array<{ id, cartId, channelListingId, priceCents, currency, createdAt }> }` | Adds one listing to the buyer's cart. The service enforces one seller per cart. |
| `GET` | `/api/v1/store/cart` | `buyer-auth` | none | `200`: `cartSchema` or `null` | Returns the current cart for the resolved channel, or `null` if no cart exists. |
| `DELETE` | `/api/v1/store/cart/items/:id` | `buyer-auth` | `params`: `{ id: ULID }` | `204`: no content; schema is `z.null()` | Removes one item from the cart; deletes the cart row too if it becomes empty. |
| `DELETE` | `/api/v1/store/cart` | `buyer-auth` | none | `204`: no content; schema is `z.null()` | Clears the caller's cart for the current channel. |
| `POST` | `/api/v1/store/checkout` | `buyer-auth` | `body` `initiateCheckoutBody`: `{ shippingAddressId: string(min 1) }` | `200` `checkoutResponseSchema`: `{ sessionId, clientSecret|null, expiresAt|null, status, totals{ subtotalCents, shippingCents, platformFeeCents, sellerProceedsCents, totalCents, currency } }` | Reserves inventory, creates a checkout session, creates a Stripe PaymentIntent, and schedules expiry. |
| `GET` | `/api/v1/store/checkout/:id` | `buyer-auth` | `params` `checkoutIdParam`: `{ id: ULID }` | `200` `checkoutSessionFullSchema`: `{ id, cartId, buyerId, channelId, status, version, subtotalCents, shippingCents, platformFeeCents, sellerProceedsCents, totalCents, currency, stripePaymentIntentId|null, stripeClientSecret|null, shippingAddressId|null, expiresAt|null, createdAt, updatedAt }` | Fetches one checkout session owned by the buyer. |
| `POST` | `/api/v1/store/checkout/:id/cancel` | `buyer-auth` | `params`: `{ id: ULID }` | `200` `cancelCheckoutResponseSchema`: `{ cancelled: boolean }` | Cancels a checkout session from `created` or `payment_pending`, releases reservations, and cancels the PaymentIntent if present. |
| `POST` | `/api/v1/store/checkout-groups` | `buyer-auth` | `body` `createCheckoutGroupBody`: `{ shippingAddressId: string(min 1) }` | `200` `checkoutGroupQuoteResponseSchema`: `{ orderGroupId, clientSecret, chargeType: "destination"\|"sct", totals: { subtotalCents, shippingCents, platformFeeCents, sellerProceedsCents, totalCents, currency }, allocations: Array<{ sellerId, subtotalCents, shippingCents, platformFeeCents, sellerProceedsCents, totalCents, items: Array<{ channelListingId, priceCents }> }> }` | Multi-vendor checkout: reserves inventory across all sellers, creates an order group, and creates a Stripe PaymentIntent (destination for single-seller, SC&T transfer_group for multi-seller). Rate-limited 5/min per user. Idempotent. |
| `GET` | `/api/v1/store/checkout-groups/:id` | `buyer-auth` | `params`: `{ id: ULID }` | `200` `checkoutGroupStatusResponseSchema`: `{ orderGroupId, status, chargeType, totals, allocations, stripeClientSecret\|null, hasPendingReconciliation }` | Returns the current status and allocation summary for a checkout group owned by the buyer. |
| `POST` | `/api/v1/store/checkout-groups/:id/cancel` | `buyer-auth` | `params`: `{ id: ULID }` | `200` `cancelCheckoutGroupResponseSchema`: `{ cancelled: boolean }` | Cancels a checkout group from `created` or `payment_pending`, releases all reserved inventory, and cancels the PaymentIntent if present. Rate-limited 10/min per user. Idempotent. |
| `GET` | `/api/v1/store/orders` | `buyer-auth` | `querystring` `listOrdersQuerySchema`: `{ status?: "paid","shipped","delivered","completed","cancelled", limit?: int(1-100)=20, cursor?: string }` | `200`: `{ items: Order[], nextCursor|null }`, `Order = { id, checkoutSessionId, buyerId, sellerId, channelId, status, subtotalCents, shippingCents, platformFeeCents, sellerProceedsCents, totalCents, currency, shippingAddressSnapshot|null, senderAddressSnapshot|null, trackingNumber|null, trackingCarrier|null, stripePaymentIntentId|null, items: Array<{ id, orderId, channelListingId, priceCents, currency, createdAt }>, createdAt, updatedAt }` | Cursor-paginated order list for the authenticated buyer. |
| `GET` | `/api/v1/store/orders/:id` | `buyer-auth` | `params`: `{ id: ULID }` | `200` `orderResponseSchema` | Returns one order owned by the authenticated buyer. |

## Seller

Auth: Authenticated seller (`seller-auth`) for all seller routes.

### Inventory and images

| Method | Path | Auth | Request Schema | Response Schema | Description |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/v1/seller/inventory` | `seller-auth` | `body` `createInventoryItemSchema`: `{ title?: string<=255, description?: string<=5000, brand?: string<=100, categoryId?: ULID, size?: string<=20, colour?: string<=30, material?: string<=50, era?: string<=50, fit?: string<=50, condition?: "new_with_tags","like_new","good","fair","poor", conditionNotes?: string<=500, shippingClass?: "xs","s","m","l" }` | `201` `inventoryItemResponseSchema`: `{ id, ownerId, title|null, description|null, availabilityStatus, lifecycleState, version, brand|null, categoryId|null, size|null, colour|null, material|null, era|null, fit|null, condition|null, conditionNotes|null, shippingClass|null, images?: Image[], aiTitle?, aiDescription?, aiTags?, aiSuggestedCategory?, aiSuggestedColour?, aiSuggestedMaterial?, aiConfidence?, aiPromptVersion?, aiStatus?, aiEnrichedAt?, createdAt, updatedAt }` | Creates an inventory item owned by the seller. |
| `GET` | `/api/v1/seller/inventory` | `seller-auth` | `querystring` `listInventoryQuerySchema`: `{ limit?: int(1-100)=20, cursor?: ULID, lifecycleState?: "owned","for_sale","offer_only","inventory_only","sold","archived" }` | `200` `cursorResponseSchema(inventoryItemResponseSchema)`: `{ items: InventoryItem[], nextCursor|null }` | Cursor-paginated list of the seller's inventory items. |
| `GET` | `/api/v1/seller/inventory/:id` | `seller-auth` | `params`: `{ id: ULID }` | `200` `inventoryItemResponseSchema` | Returns one inventory item plus all images ordered by `position`. |
| `PATCH` | `/api/v1/seller/inventory/:id` | `seller-auth` | `params`: `{ id: ULID }`<br>`body` `updateInventoryItemSchema`: partial `CreateInventoryItem` + `{ version: int>=1 }` | `200` `inventoryItemResponseSchema` | Updates item attributes using optimistic versioning. |
| `PATCH` | `/api/v1/seller/inventory/:id/lifecycle` | `seller-auth` | `params`: `{ id: ULID }`<br>`body` `transitionLifecycleSchema`: `{ to: "owned","for_sale","offer_only","inventory_only","sold","archived", version: int>=1 }` | `200`: `{ id, lifecycleState, version }` | Transitions the item's lifecycle and cascades listing status changes in the same transaction. |
| `PATCH` | `/api/v1/seller/inventory/:id/archive` | `seller-auth` | `params`: `{ id: ULID }` | `204`: no content; schema is `z.null()` | Archives the item if it is not reserved; idempotent when already archived. |
| `POST` | `/api/v1/seller/inventory/:id/images/upload-url` | `seller-auth` | `params`: `{ id: ULID }`<br>`body` `uploadUrlRequestSchema`: `{ contentType: "image/jpeg","image/png","image/webp" }` | `200` `uploadUrlResponseSchema`: `{ uploadUrl, imageId, expiresAt }` | Creates a pending image row and returns a presigned PUT URL. |
| `POST` | `/api/v1/seller/inventory/:id/images/:imageId/confirm` | `seller-auth` | `params`: `{ id: ULID, imageId: ULID }`<br>`body` `confirmUploadSchema`: `{ position?: int>=0=0, isPrimary?: boolean=false }` | `200` `imageResponseSchema`: `{ id, url, contentType|null, sizeBytes|null, status, position, isPrimary, confirmedAt|null, createdAt }` | Verifies the object exists in R2, marks the image `ready`, and optionally enqueues AI enrichment. |
| `PATCH` | `/api/v1/seller/inventory/:id/images/order` | `seller-auth` | `params`: `{ id: ULID }`<br>`body` `batchReorderSchema`: `Array<{ imageId: ULID, position: int>=0, isPrimary?: boolean }>` with at least one entry | `200`: `Image[]` using `imageResponseSchema` | Batch-updates image order and the primary flag. |
| `DELETE` | `/api/v1/seller/inventory/:id/images/:imageId` | `seller-auth` | `params`: `{ id: ULID, imageId: ULID }` | `204`: no content; schema is `z.null()` | Deletes the image row and may auto-pause active listings if the item loses its last ready image. |

### Listings and orders

| Method | Path | Auth | Request Schema | Response Schema | Description |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/v1/seller/listings` | `seller-auth` | `body` `createListingSchema`: `{ inventoryItemId: ULID, channelId: ULID, title: string(1-255), description?: string<=5000, priceCents: int>=1, currency?: string(3)="AUD", handle?: string<=100 }` | `201` `channelListingResponseSchema`: `{ id, inventoryItemId, channelId, title, description|null, priceCents, currency, handle, status, publishedAt|null, version, createdAt, updatedAt }` | Creates a draft listing for one inventory item on one channel. |
| `GET` | `/api/v1/seller/listings` | `seller-auth` | `querystring` `listListingsQuerySchema`: `{ limit?: int(1-100)=20, cursor?: ULID, channelId?: ULID, status?: "draft","active","paused","sold","archived" }` | `200` `cursorListingResponseSchema`: `{ items: ChannelListing[], nextCursor|null }` | Cursor-paginated list of the seller's listings. |
| `GET` | `/api/v1/seller/listings/:id` | `seller-auth` | `params`: `{ id: ULID }` | `200` `channelListingResponseSchema` | Fetches one listing owned by the seller. |
| `PATCH` | `/api/v1/seller/listings/:id` | `seller-auth` | `params`: `{ id: ULID }`<br>`body` `updateListingSchema`: `{ title?: string(1-255), description?: string<=5000, priceCents?: int>=1, handle?: string<=100, version: int>=1 }` | `200` `channelListingResponseSchema` | Updates listing fields with optimistic versioning. |
| `PATCH` | `/api/v1/seller/listings/:id/status` | `seller-auth` | `params`: `{ id: ULID }`<br>`body` `transitionListingStatusSchema`: `{ to: "draft","active","paused","sold","archived", version: int>=1 }` | `200` `channelListingResponseSchema` | Transitions listing status; activation checks seller readiness, item lifecycle, and ready images. |
| `PATCH` | `/api/v1/seller/listings/:id/archive` | `seller-auth` | `params`: `{ id: ULID }` | `204`: no content; schema is `z.null()` | Archives a listing if it is not already archived. |
| `GET` | `/api/v1/seller/orders` | `seller-auth` | `querystring` `listOrdersQuerySchema`: `{ status?: "paid","shipped","delivered","completed","cancelled", limit?: int(1-100)=20, cursor?: string }` | `200`: `{ items: Order[], nextCursor|null }` using the same `orderResponseSchema` as buyer order routes | Cursor-paginated order list filtered to `orders.seller_id = request.user.id`. |
| `GET` | `/api/v1/seller/orders/:id` | `seller-auth` | `params`: `{ id: ULID }` | `200` `orderResponseSchema` | Returns one order that belongs to the seller. |
| `PATCH` | `/api/v1/seller/orders/:id/ship` | `seller-auth` | `params`: `{ id: ULID }`<br>`body` `markShippedBodySchema`: `{ trackingNumber: string(min 1), carrier: string(min 1) }` | `200` `orderResponseSchema` | Marks a paid order as shipped and stores tracking details. |

### Profile and Stripe

| Method | Path | Auth | Request Schema | Response Schema | Description |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/v1/seller/profile` | `seller-auth` | none | `200` `sellerProfileResponseSchema`: `{ id, userId, storeName, handle, bio|null, avatarUrl|null, vacationMode, stripeChargesEnabled, stripePayoutsEnabled, verifiedAt|null, createdAt, updatedAt }` | Returns the seller's own profile row. |
| `PATCH` | `/api/v1/seller/profile` | `seller-auth` | `body` `patchSellerProfileSchema`: `{ storeName?: string(1-100), bio?: string<=1000 or null, handle?: string(2-50, lowercase-hyphen regex), vacationMode?: boolean }` | `200` `sellerProfileResponseSchema` | Updates seller profile fields; emits `seller_profile.updated` when search-relevant fields change. |
| `POST` | `/api/v1/seller/profile/avatar/upload-url` | `seller-auth` | `body` `avatarUploadUrlRequestSchema`: `{ contentType: "image/jpeg","image/png","image/webp" }` | `200` `avatarUploadUrlResponseSchema`: `{ uploadUrl, storageKey, expiresIn }` | Returns a presigned PUT URL for the seller avatar. |
| `POST` | `/api/v1/seller/profile/avatar/confirm` | `seller-auth` | `body` `avatarConfirmRequestSchema`: `{ storageKey: string(min 1) }` | `200` `avatarConfirmResponseSchema`: `{ avatarUrl }` | Verifies the uploaded avatar exists and writes the public URL to `seller_profiles.avatar_url`. |
| `POST` | `/api/v1/seller/stripe/onboard` | `seller-auth` | none | `200` `stripeOnboardResponseSchema`: `{ url }` | Idempotently creates a Stripe Connect account if needed and returns an onboarding link. |
| `GET` | `/api/v1/seller/stripe/status` | `seller-auth` | none | `200` `stripeStatusResponseSchema`: `{ stripeAccountId|null, stripeOnboardingStatus|null, stripeChargesEnabled, stripePayoutsEnabled, onboardingComplete }` | Returns the seller's persisted Stripe readiness fields without calling Stripe. |
| `GET` | `/api/v1/seller/stripe/refresh` | `seller-auth` | none | `200` `stripeStatusResponseSchema` | Calls Stripe synchronously, updates `seller_profiles`, and returns the refreshed status. |

## Admin

Auth: Admin role (`admin-auth`) for all admin routes.

| Method | Path | Auth | Request Schema | Response Schema | Description |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/v1/admin/users` | `admin-auth` | `querystring`: `{ page?: int>=1=1, limit?: int(1-100)=20 }` | `200`: `{ items: Array<{ id, name, email, emailVerified, image|null, createdAt }>, total, page, limit, totalPages }` | Paginates all users ordered by newest first. |
| `POST` | `/api/v1/admin/orders/:id/cancel` | `admin-auth` | `params`: `{ id: ULID }` | `200`: `{ orderId, status, refundId|null }` | Cancels a paid order, attempts a Stripe refund, and moves a held payout to `refunded`. |
| `POST` | `/api/v1/admin/payouts/:holdId/release` | `admin-auth` | `params`: `{ holdId: ULID }` | `200`: `{ id, orderId, status, transferId|null, amountCents, currency }` | Releases a payout hold through Stripe transfer after re-checking seller transfer readiness. |

## Webhooks

Auth: Webhook signature verification (HMAC); no application session required.

| Method | Path | Auth | Request Schema | Response Schema | Description |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/v1/webhooks/stripe` | `webhook` | No Zod body schema. Handler requires raw request body and the `stripe-signature` header. | No explicit Fastify response schema. Runtime responses include success payloads like `{ received: true }` / `{ received: true, duplicate: true }` and error payloads like `{ error: string }`. | Verifies the Stripe signature, deduplicates events, then handles `account.updated`, `payment_intent.succeeded`, `payment_intent.requires_action`, and `payment_intent.payment_failed`. |
| `POST` | `/api/v1/webhooks/starshipit` | `webhook` | No Zod body schema. Handler requires raw request body and, when configured, `x-starshipit-hmac-sha256`. Parsed payload shape is `{ events?: Array<{ tracking_number?, status?, status_description?, order_number? }> }`. | No explicit Fastify response schema. Runtime responses include `{ received: true }` and `{ error: string }`. | Verifies HMAC when `STARSHIPIT_WEBHOOK_SECRET` is set, then updates shipped orders to `delivered` when Starshipit sends a delivered status. |

## Auth

Auth: Public for Better Auth passthrough (`/api/auth/*`); `buyer-auth` for `/api/v1/customer/me`.

| Method | Path | Auth | Request Schema | Response Schema | Description |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/v1/customer/me` | `buyer-auth` | none | `200`: `{ user: { id, email, name, image|null, emailVerified }, roles: string[], channel: { slug, name } }` | Returns the current session user, DB roles, and the resolved channel. |

Related auth surface outside `routes/v1`:

| Method | Path | Auth | Request Schema | Response Schema | Description |
| --- | --- | --- | --- | --- | --- |
| `ALL` | `/api/auth/*` | Better Auth handler | No local Zod schema; the Fastify plugin forwards method, headers, and JSON body to `auth.handler()` from Better Auth. | No local response schema; the plugin forwards the raw Better Auth response status, headers, and text body. | Mounted by `packages/api/src/plugins/auth.ts`, not by `packages/api/src/routes/v1`. |

## Customer

Auth: Authenticated buyer (`buyer-auth`) for all customer routes.

### Wishlist

| Method | Path | Auth | Request Schema | Response Schema | Description |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/v1/customer/wishlist` | `buyer-auth` | `body`: `{ listingId: ULID }` | `200`: `{ id, listingId, addedAt }` | Adds an active listing to the authenticated user's wishlist for the current channel. |
| `DELETE` | `/api/v1/customer/wishlist/:listingId` | `buyer-auth` | `params`: `{ listingId: ULID }` | `204`: no content; schema is `z.null()` | Removes a listing from the wishlist. |
| `GET` | `/api/v1/customer/wishlist` | `buyer-auth` | `querystring`: `{ cursor?: ULID, limit?: int(1-100)=20 }` | `200`: `{ items: Array<{ id, listingId, title, priceCents, currency, primaryImageUrl|null, sellerName, listingStatus, addedAt }>, nextCursor|null }` | Cursor-paginated list of the caller's wishlisted items for the current channel. |

### Saved Searches

| Method | Path | Auth | Request Schema | Response Schema | Description |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/v1/customer/saved-searches` | `buyer-auth` | `body` `createSavedSearchBody`: `{ query: string(min 1), filters?: Record<string, unknown>={}, channelId: ULID, name?: string<=100 }` | `201` `savedSearchResponse`: `{ id, name|null, query, filters, channelId, createdAt, updatedAt }` | Creates a saved search for the authenticated user. |
| `GET` | `/api/v1/customer/saved-searches` | `buyer-auth` | `querystring`: `{ channelId?: ULID }` | `200`: `{ items: SavedSearch[] }` using `savedSearchResponse` | Lists all saved searches for the caller; optionally filtered by channel. |
| `DELETE` | `/api/v1/customer/saved-searches/:id` | `buyer-auth` | `params`: `{ id: ULID }` | `204`: no content; schema is `z.null()` | Deletes a saved search owned by the caller. |

## Phase 3a Routes

### Store — Listing Reports

Auth: Authenticated buyer (`buyer-auth`).

| Method | Path | Auth | Request Schema | Response Schema | Description |
| --- | --- | --- | --- | --- | --- |
| `POST` | `/api/v1/store/listings/:id/report` | `buyer-auth` | `params`: `{ id: ULID }`<br>`body`: `{ reason: "counterfeit","inappropriate","misleading","prohibited","other", description?: string<=2000 }` | `201`: `{ id, status: "pending" }` | Submits a report against an active listing. Blocks self-reporting and enforces a 10-report-per-day cap per user. Throws `409 Conflict` on duplicate report (unique DB constraint). |

### Seller — Listing Score

Auth: Authenticated seller (`seller-auth`).

| Method | Path | Auth | Request Schema | Response Schema | Description |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/v1/seller/listings/:id/score` | `seller-auth` | `params`: `{ id: ULID }` | `200` `listingScoreResponseSchema`: `{ score, photoScore, descriptionScore, completenessScore, categoryScore, qualityTier: "bronze","silver","gold", nudgeKey|null, nudgeMessage|null }` | Returns a computed quality score and optional improvement nudge for a listing owned by the seller. |

### Admin — Reports

Auth: Admin role (`admin-auth`).

| Method | Path | Auth | Request Schema | Response Schema | Description |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/v1/admin/reports` | `admin-auth` | `querystring` `listReportsQuerySchema`: `{ channel_id?: string, status?: "pending","reviewed","actioned","dismissed", page?: int>=1=1, limit?: int(1-100)=20 }` | `200`: `{ items: Report[], total, page, limit, totalPages }`, `Report = { id, channelListingId, channelId, reporterId, reason, description|null, status, version, createdAt, updatedAt }` | Paginates all listing reports with optional channel and status filters. |
| `PATCH` | `/api/v1/admin/reports/:id` | `admin-auth` | `params`: `{ id: ULID }`<br>`body`: `{ status: "pending","reviewed","actioned","dismissed" }` | `200` `reportResponseSchema` | Updates the status of a listing report; records the acting admin ID. |

## Notes

- All `204` routes declare `z.null()` as the response schema, but the handlers call `reply.status(204).send()` with no body.
- `buyer-auth` routes are session-authenticated but do not use `requireRole("buyer")`; the repo defines the `buyer` role in `packages/types/src/roles.ts`, but these route handlers do not enforce it.
- Search and browse routes use MeiliSearch-backed service functions. Public listing detail (`/store/listings/:handle`) reads directly from Postgres and only returns listings whose stored status is `active`.
- `GET /api/v1/store/listings` and `GET /api/v1/store/search` do not read `request.channel`; `packages/api/src/routes/v1/store/search/service.ts` uses `process.env.CHANNEL_SLUG ?? "piklo"` to choose the MeiliSearch index.

---

## Error Code Reference

| Code | HTTP | Class | When |
|------|------|-------|------|
| `NOT_FOUND` | 404 | `NotFoundError` | Resource lookup misses |
| `UNAUTHORISED` | 401 | `UnauthorisedError` | Missing or invalid session |
| `FORBIDDEN` | 403 | `ForbiddenError` | Wrong role, CSRF failure |
| `CONFLICT` | 409 | `ConflictError` | Idempotency conflict, state transition race |
| `VALIDATION_ERROR` | 422 | `ValidationError` | Zod schema failure, business rule violation |
| `MULTI_SELLER_CHECKOUT_UNSUPPORTED` | 422 | `MultiSellerCheckoutNotSupportedError` | Cart has items from 2+ sellers but multi-seller checkout ships in Sprint 1b W2 (temporary W1 scaffold; removed W5) |
| `TOO_MANY_REQUESTS` | 429 | `TooManyRequestsError` | Rate limit exceeded |

Special error types (not extending `AppError` directly):
- `InvalidTransitionError` (409) — state machine transition refused

Retired in Sprint 1b W1:
- `SELLER_MISMATCH` (422) — cart is now multi-seller per ADR-015; single-seller enforcement moved from the cart layer to the checkout layer via `MULTI_SELLER_CHECKOUT_UNSUPPORTED`.

`ValidationError` may include field-level detail: `{ error, message, errors: Record<string, string[]> }`.

All errors serialised as: `{ error: string, message: string }`.

Source: [`packages/api/src/lib/errors.ts`](../packages/api/src/lib/errors.ts)

---

## Rate Limiting

Global limit: **100 requests/minute per IP** via `@fastify/rate-limit`.

The rate-limit plugin runs on the `onRequest` hook — this is **before** auth (`preHandler`). The key function `(req) => req.user?.id ?? req.ip` always falls back to IP because `req.user` is not yet populated at that point.

Checkout endpoints bypass rate-limiting in test environments via:
```ts
allowList: () => process.env.NODE_ENV === "test"
```

Source: [`packages/api/src/server.ts`](../packages/api/src/server.ts) (rate-limit registration)

---

## Idempotency

Any `POST`, `PUT`, or `PATCH` request can include an `Idempotency-Key` header.

### How it works

1. **First request** with a given key — inserts a `processing` row, executes the handler, and the `onSend` hook persists the response as `completed`.
2. **Duplicate while processing** — `409 Conflict`.
3. **Duplicate after completion** — replays the cached response with `x-idempotent-replayed: true` header.

### Scoping

Keys are scoped by a `(key, userId, operation)` triplet:
- `key` — the `Idempotency-Key` header value
- `userId` — from the authenticated session (or `"anonymous"`)
- `operation` — `"METHOD:/route/path"` (e.g. `"POST:/api/v1/store/checkout"`)

Different users cannot accidentally share a key.

### TTL

24 hours — matches Stripe's own idempotency key TTL.

### Which routes use it

Checkout (`POST /api/v1/store/checkout`) passes the checkout session ID as the idempotency key to ensure re-submissions are safe. Any `POST`/`PUT`/`PATCH` route benefits from client-supplied idempotency keys.

Source: [`packages/api/src/middleware/idempotency.ts`](../packages/api/src/middleware/idempotency.ts)
