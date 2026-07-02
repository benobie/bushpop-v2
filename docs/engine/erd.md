> **Provenance:** engine doc copied from `benobie/piklo-v2` @ `2419a38` at fork time (02/07/2026), with `@bushpop/*` renamed `@bushpop/*`. May drift from upstream — see `docs/engine/FORK.md`.

---
last-verified: 2026-05-03
source: packages/db/src/schema/
---

# Entity Relationship Diagram

Authoritative source: every `pgTable(...)` declaration under [`packages/db/src/schema/`](../packages/db/src/schema/). When the schema changes, regenerate this file in the same PR (Working Rule #11 in [`AGENTS.md`](../AGENTS.md)).

## Regen procedure

This doc is a build artifact. To regenerate:

1. `ls packages/db/src/schema/*.ts` — enumerate every schema file.
2. For each file, walk every `pgTable("name", { ... })` declaration. Transcribe the columns (Drizzle type → ERD type per the key below) and the foreign keys (`.references(() => other.id)`).
3. Group tables by domain using the [`AGENTS.md`](../AGENTS.md) "Multi-channel model" taxonomy (global / channel-scoped / inherited). Mermaid `erDiagram` does not support `subgraph`; use `%%` section comments to group instead.
4. For every nullable FK (no `.notNull()`, or `onDelete: "set null"`), use the `o|--o{` cardinality on the parent side. For required FKs, use `||--o{`. For unique FKs, use `||--||`.
5. Refresh the **Table scoping**, **Indexes**, and **Relationship notes** sections to match current code. Document partial unique indexes in comments — Drizzle 0.45.x cannot express them in code; they live in raw SQL inside the migrations.
6. Bump `last-verified` in the frontmatter.

A `pnpm db:erd` script that drives this from Drizzle metadata is on the wishlist but not yet wired up — manual regen is the contract for now.

## Intro

The schema has 34 tables across 13 logical domains. The biggest recent shifts:

- **ADR-015 multi-vendor cart cluster.** The single-seller `checkout_sessions` → `orders` flow is being replaced by a `order_groups` → `order_group_seller_allocations` → `order_group_allocation_items` (+ `allocation_refunds`) flow that lets one buyer pay multiple sellers in one PaymentIntent. `checkout_sessions` is still active until the W5 frontend cutover, then it becomes legacy.
- **Phase 2B WAL.** `payment_operations` is a write-ahead log for every Stripe call (charge / refund / transfer / reversal). It carries dual nullable FKs to both `orders` and `order_groups` so the same WAL serves single-seller and multi-vendor flows.
- **Refunds split.** `refunds` is the order-level refund table (single-seller). `allocation_refunds` is the seller-scoped multi-vendor parallel — granular at the line-item level for SC&T flows.
- **New domain tables since the last regen:** `notifications` + `notification_preferences`, `wishlists`, `saved_searches`, `listing_scores`, `listing_reports`.

## Type normalisation

Drizzle column type → ERD type used inside the Mermaid block:

- `varchar26` ⇒ `varchar("...", { length: 26 })` (ULID PK / FK)
- `varchar{N}` ⇒ `varchar("...", { length: N })`
- `timestamptz` ⇒ `timestamp("...", { withTimezone: true })`
- `timestamp` ⇒ `timestamp("...")` (no timezone — used by `channel_listings.hidden_at`)
- `numeric` ⇒ `numeric("...")` (used by `inventory_item_images.aspect_ratio`)
- `bool`, `int`, `real`, `text`, `jsonb` map directly to the Drizzle column types.

```mermaid
erDiagram

  %% ------------------------------------------------------------------
  %% Auth (Better Auth tables — global)
  %% ------------------------------------------------------------------

  user {
    varchar26 id PK
    varchar100 name
    varchar255 email UK
    bool email_verified
    text image
    timestamptz created_at
    timestamptz updated_at
  }

  session {
    varchar26 id PK
    varchar26 user_id FK
    varchar255 token UK
    timestamptz expires_at
    varchar45 ip_address
    text user_agent
    timestamptz created_at
    timestamptz updated_at
  }

  account {
    varchar26 id PK
    varchar26 user_id FK
    varchar255 account_id
    varchar255 provider_id
    text access_token
    text refresh_token
    timestamptz access_token_expires_at
    timestamptz refresh_token_expires_at
    text scope
    text id_token
    text password
    timestamptz created_at
    timestamptz updated_at
  }

  verification {
    varchar26 id PK
    varchar255 identifier
    text value
    timestamptz expires_at
    timestamptz created_at
    timestamptz updated_at
  }

  %% ------------------------------------------------------------------
  %% Channels (multi-channel anchor — global)
  %% ------------------------------------------------------------------

  channels {
    varchar26 id PK
    varchar50 slug UK
    varchar100 name
    varchar255 domain
    int platform_fee_bps
    varchar3 currency
    varchar50 shipping_provider
    varchar255 support_email
    text logo_url
    text favicon_url
    jsonb theme
    bool is_active
    timestamptz created_at
    timestamptz updated_at
  }

  %% ------------------------------------------------------------------
  %% Users (roles, addresses, seller profiles — global)
  %% ------------------------------------------------------------------

  user_roles {
    varchar26 id PK
    varchar26 user_id FK
    varchar20 role
    timestamptz created_at
  }

  addresses {
    varchar26 id PK
    varchar26 user_id FK
    varchar50 label
    varchar255 line_1
    varchar255 line_2
    varchar100 suburb
    varchar50 state
    varchar10 postcode
    varchar2 country
    bool is_default
    timestamptz deleted_at
    timestamptz created_at
    timestamptz updated_at
  }

  seller_profiles {
    varchar26 id PK
    varchar26 user_id FK
    varchar100 store_name
    varchar50 handle UK
    text bio
    text avatar_url
    varchar255 stripe_account_id
    bool stripe_charges_enabled
    bool stripe_payouts_enabled
    varchar50 stripe_onboarding_status
    bool vacation_mode
    varchar26 default_shipping_address_id FK
    timestamptz verified_at
    timestamptz created_at
    timestamptz updated_at
  }

  %% ------------------------------------------------------------------
  %% Categories (mixed scope: channel_id nullable for global rows)
  %% ------------------------------------------------------------------

  categories {
    varchar26 id PK
    varchar26 channel_id FK
    varchar100 name
    varchar100 slug
    varchar26 parent_id FK
    timestamptz created_at
    timestamptz updated_at
  }

  %% ------------------------------------------------------------------
  %% Inventory (global — items live before any channel listing)
  %% ------------------------------------------------------------------

  inventory_items {
    varchar26 id PK
    varchar26 owner_id FK
    varchar255 title
    text description
    varchar20 availability_status
    varchar20 lifecycle_state
    int version
    varchar100 brand
    varchar26 category_id FK
    varchar20 size
    varchar30 colour
    varchar50 material
    varchar50 era
    varchar50 fit
    varchar20 condition
    text condition_notes
    varchar255 ai_title
    text ai_description
    jsonb ai_tags
    varchar100 ai_suggested_category
    varchar30 ai_suggested_colour
    varchar50 ai_suggested_material
    real ai_confidence
    varchar20 ai_prompt_version
    varchar50 ai_model
    varchar20 ai_status
    timestamptz ai_enriched_at
    text ai_last_error
    varchar64 ai_image_hash
    varchar5 shipping_class
    timestamptz created_at
    timestamptz updated_at
  }

  inventory_item_images {
    varchar26 id PK
    varchar26 inventory_item_id FK
    varchar500 storage_key
    varchar50 content_type
    int size_bytes
    varchar20 status
    int position
    bool is_primary
    timestamptz confirmed_at
    numeric aspect_ratio
    varchar30 backfill_status
    timestamptz created_at
  }

  %% ------------------------------------------------------------------
  %% Listings (channel-scoped — one row per (item, channel))
  %% ------------------------------------------------------------------

  channel_listings {
    varchar26 id PK
    varchar26 inventory_item_id FK
    varchar26 channel_id FK
    varchar255 title
    text description
    int price_cents
    varchar3 currency
    varchar100 handle
    varchar20 status
    timestamptz published_at
    timestamp hidden_at
    int version
    timestamptz created_at
    timestamptz updated_at
  }

  %% ------------------------------------------------------------------
  %% Commerce — single-seller flow (carts, checkout, orders, payouts)
  %% checkout_sessions becomes legacy at W5 cutover (ADR-015)
  %% ------------------------------------------------------------------

  carts {
    varchar26 id PK
    varchar26 buyer_id FK
    varchar26 channel_id FK
    timestamptz created_at
    timestamptz updated_at
  }

  cart_items {
    varchar26 id PK
    varchar26 cart_id FK
    varchar26 channel_listing_id FK
    int price_cents
    varchar3 currency
    timestamptz created_at
  }

  checkout_sessions {
    varchar26 id PK
    varchar26 cart_id FK
    varchar26 buyer_id FK
    varchar26 channel_id FK
    varchar30 status
    int version
    int subtotal_cents
    int shipping_cents
    int platform_fee_cents
    int seller_proceeds_cents
    int total_cents
    varchar3 currency
    varchar255 stripe_payment_intent_id
    varchar500 stripe_client_secret
    varchar26 shipping_address_id FK
    timestamptz expires_at
    timestamptz created_at
    timestamptz updated_at
  }

  orders {
    varchar26 id PK
    varchar26 checkout_session_id FK
    varchar26 buyer_id FK
    varchar26 seller_id FK
    varchar26 channel_id FK
    varchar30 status
    int subtotal_cents
    int shipping_cents
    int platform_fee_cents
    int seller_proceeds_cents
    int total_cents
    varchar3 currency
    jsonb shipping_address_snapshot
    jsonb sender_address_snapshot
    varchar255 tracking_number
    varchar100 tracking_carrier
    varchar255 shipping_label_id
    varchar100 last_tracking_status
    timestamptz last_tracking_event_at
    timestamptz delivery_confirmed_at
    timestamptz sla_deadline_at
    bool is_international
    timestamptz jobs_enqueued_at
    varchar255 stripe_payment_intent_id
    varchar255 stripe_transfer_id
    timestamptz created_at
    timestamptz updated_at
  }

  order_items {
    varchar26 id PK
    varchar26 order_id FK
    varchar26 channel_listing_id FK
    int price_cents
    varchar3 currency
    timestamptz created_at
  }

  payout_holds {
    varchar26 id PK
    varchar26 order_id FK
    varchar255 seller_stripe_account_id
    int amount_cents
    varchar3 currency
    varchar255 transfer_id
    int version
    varchar30 status
    timestamptz frozen_at
    timestamptz next_retry_at
    varchar500 failure_reason
    timestamptz buyer_confirmed_at
    varchar100 hold_policy_applied
    timestamptz delivery_confirmed_at
    timestamptz created_at
    timestamptz updated_at
  }

  refunds {
    varchar26 id PK
    varchar26 order_id FK
    varchar26 initiated_by FK
    varchar20 type
    int amount_cents
    int platform_fee_refunded_cents
    varchar500 reason
    varchar255 stripe_refund_id
    varchar30 status
    timestamptz created_at
    timestamptz updated_at
  }

  %% ------------------------------------------------------------------
  %% Commerce — multi-vendor cluster (ADR-015, Sprint 1b W1)
  %% Buyer pays one PaymentIntent → many sellers receive transfers.
  %% ------------------------------------------------------------------

  order_groups {
    varchar26 id PK
    varchar26 buyer_id FK
    varchar26 channel_id FK
    varchar26 cart_id FK
    varchar30 status
    int version
    varchar20 charge_type
    varchar64 quote_hash
    int subtotal_cents
    int shipping_cents
    int platform_fee_cents
    int seller_proceeds_cents
    int total_cents
    varchar3 currency
    varchar255 stripe_payment_intent_id
    varchar500 stripe_client_secret
    varchar255 stripe_transfer_group
    varchar26 shipping_address_id FK
    jsonb shipping_address_snapshot
    bool has_pending_reconciliation
    timestamptz reconciliation_locked_until
    timestamptz expires_at
    timestamptz created_at
    timestamptz updated_at
  }

  order_group_seller_allocations {
    varchar26 id PK
    varchar26 order_group_id FK
    varchar26 seller_id FK
    varchar30 status
    int version
    int subtotal_cents
    int shipping_cents
    int platform_fee_cents
    int seller_proceeds_cents
    int total_cents
    varchar3 currency
    varchar255 stripe_transfer_id
    varchar255 stripe_transfer_idempotency_key
    varchar26 order_id FK
    int transfer_attempts
    varchar1000 last_transfer_error
    timestamptz frozen_at
    timestamptz created_at
    timestamptz updated_at
  }

  order_group_allocation_items {
    varchar26 id PK
    varchar26 allocation_id FK
    varchar26 order_group_id FK
    varchar26 channel_listing_id FK
    int price_cents
    varchar3 currency
    timestamptz created_at
  }

  allocation_refunds {
    varchar26 id PK
    varchar26 allocation_id FK
    varchar26 order_group_id FK
    varchar26 allocation_item_id FK
    varchar26 initiated_by FK
    varchar20 type
    int amount_cents
    int platform_fee_refunded_cents
    varchar500 reason
    varchar255 stripe_refund_id
    varchar255 stripe_transfer_reversal_id
    varchar30 status
    timestamptz created_at
    timestamptz updated_at
  }

  payment_operations {
    varchar26 id PK
    varchar26 order_id FK
    varchar26 order_group_id FK
    varchar30 type
    varchar30 provider
    varchar255 provider_object_id
    varchar255 idempotency_key
    varchar20 status
    varchar1000 last_error
    int amount_cents
    varchar40 failure_provenance
    timestamptz resurrected_at
    timestamptz created_at
    timestamptz updated_at
  }

  %% ------------------------------------------------------------------
  %% Notifications (global — user-scoped delivery state + prefs)
  %% ------------------------------------------------------------------

  notifications {
    varchar26 id PK
    varchar26 user_id FK
    varchar20 channel
    varchar100 type
    varchar20 priority
    jsonb payload
    varchar64 dedup_key UK
    varchar20 status
    timestamptz sent_at
    timestamptz sending_at
    timestamptz failed_at
    int attempt_count
    text last_error
    varchar255 provider_message_id
    timestamptz created_at
  }

  notification_preferences {
    varchar26 id PK
    varchar26 user_id FK
    varchar100 type
    varchar20 channel
    bool enabled
    timestamptz created_at
    timestamptz updated_at
  }

  %% ------------------------------------------------------------------
  %% Customer prefs (channel-scoped engagement artifacts)
  %% ------------------------------------------------------------------

  wishlists {
    varchar26 id PK
    varchar26 user_id FK
    varchar26 channel_listing_id FK
    timestamptz created_at
  }

  saved_searches {
    varchar26 id PK
    varchar26 user_id FK
    varchar26 channel_id FK
    varchar100 name
    text query
    jsonb filters
    varchar64 query_hash
    int version
    timestamptz created_at
    timestamptz updated_at
  }

  %% ------------------------------------------------------------------
  %% Events (analytics / audit — channel_id stored as loose identifier)
  %% ------------------------------------------------------------------

  marketplace_events {
    varchar26 id PK
    varchar100 event_name
    varchar50 category
    varchar26 actor_id
    varchar50 entity_type
    varchar26 entity_id
    varchar26 channel_id
    jsonb metadata
    varchar20 delivery_status
    timestamptz created_at
  }

  %% ------------------------------------------------------------------
  %% Quality (listing scores, moderation reports)
  %% ------------------------------------------------------------------

  listing_scores {
    varchar26 id PK
    varchar26 channel_listing_id FK,UK
    int score
    int photo_score
    int description_score
    int completeness_score
    int category_score
    int pricing_score
    varchar50 nudge_key
    int scored_from_version
    varchar20 score_version
    int version
    timestamptz created_at
    timestamptz updated_at
  }

  listing_reports {
    varchar26 id PK
    varchar26 channel_listing_id FK
    varchar26 reporter_id FK
    varchar50 reason
    text description
    varchar20 status
    int version
    timestamptz created_at
    timestamptz updated_at
  }

  %% ------------------------------------------------------------------
  %% Infrastructure (global — request idempotency, webhook bookkeeping)
  %% ------------------------------------------------------------------

  idempotency_keys {
    varchar26 id PK
    varchar255 key
    varchar26 user_id
    varchar100 operation
    varchar20 status
    int response_status
    text response_body
    timestamptz expires_at
    timestamptz created_at
  }

  processed_webhook_events {
    varchar26 id PK
    varchar50 provider
    varchar255 event_id
    timestamptz processed_at
  }

  webhook_dead_letters {
    varchar26 id PK
    varchar50 source
    varchar100 event_type
    jsonb payload
    text error_message
    int retries
    varchar20 status
    timestamptz created_at
    timestamptz updated_at
  }

  %% ==================================================================
  %% Relationships
  %% ==================================================================

  %% Auth
  user ||--o{ session : "user_id"
  user ||--o{ account : "user_id"

  %% Users
  user ||--o{ user_roles : "user_id"
  user ||--o{ addresses : "user_id"
  user ||--|| seller_profiles : "user_id"
  addresses o|--o{ seller_profiles : "default_shipping_address_id"

  %% Categories
  channels o|--o{ categories : "channel_id"
  categories o|--o{ categories : "parent_id"
  categories o|--o{ inventory_items : "category_id"

  %% Inventory
  user ||--o{ inventory_items : "owner_id"
  inventory_items ||--o{ inventory_item_images : "inventory_item_id"

  %% Listings
  inventory_items ||--o{ channel_listings : "inventory_item_id"
  channels ||--o{ channel_listings : "channel_id"

  %% Commerce — single-seller
  user ||--o{ carts : "buyer_id"
  channels ||--o{ carts : "channel_id"
  carts ||--o{ cart_items : "cart_id"
  channel_listings ||--o{ cart_items : "channel_listing_id"
  carts ||--o{ checkout_sessions : "cart_id"
  user ||--o{ checkout_sessions : "buyer_id"
  channels ||--o{ checkout_sessions : "channel_id"
  addresses o|--o{ checkout_sessions : "shipping_address_id"
  checkout_sessions ||--o{ orders : "checkout_session_id"
  user ||--o{ orders : "buyer_id"
  user ||--o{ orders : "seller_id"
  channels ||--o{ orders : "channel_id"
  orders ||--o{ order_items : "order_id"
  channel_listings ||--o{ order_items : "channel_listing_id"
  orders ||--o{ payout_holds : "order_id"
  orders ||--o{ refunds : "order_id"
  user o|--o{ refunds : "initiated_by"

  %% Commerce — multi-vendor (ADR-015)
  user ||--o{ order_groups : "buyer_id"
  channels ||--o{ order_groups : "channel_id"
  carts ||--o{ order_groups : "cart_id"
  addresses o|--o{ order_groups : "shipping_address_id"
  order_groups ||--o{ order_group_seller_allocations : "order_group_id"
  user ||--o{ order_group_seller_allocations : "seller_id"
  orders o|--o{ order_group_seller_allocations : "order_id"
  order_group_seller_allocations ||--o{ order_group_allocation_items : "(allocation_id, order_group_id)"
  channel_listings ||--o{ order_group_allocation_items : "channel_listing_id"
  order_group_seller_allocations ||--o{ allocation_refunds : "(allocation_id, order_group_id)"
  order_group_allocation_items o|--o{ allocation_refunds : "allocation_item_id"
  user o|--o{ allocation_refunds : "initiated_by"
  orders o|--o{ payment_operations : "order_id"
  order_groups o|--o{ payment_operations : "order_group_id"

  %% Notifications
  user ||--o{ notifications : "user_id"
  user ||--o{ notification_preferences : "user_id"

  %% Customer prefs
  user ||--o{ wishlists : "user_id"
  channel_listings ||--o{ wishlists : "channel_listing_id"
  user ||--o{ saved_searches : "user_id"
  channels ||--o{ saved_searches : "channel_id"

  %% Quality
  channel_listings ||--|| listing_scores : "channel_listing_id"
  channel_listings ||--o{ listing_reports : "channel_listing_id"
  user ||--o{ listing_reports : "reporter_id"
```

## Table scoping

Per [`AGENTS.md`](../AGENTS.md) "Multi-channel model" section.

- **Global tables** (no `channel_id`, or `channel_id` is loose): `user`, `session`, `account`, `verification`, `channels`, `user_roles`, `addresses`, `seller_profiles`, `inventory_items`, `inventory_item_images`, `notifications`, `notification_preferences`, `idempotency_keys`, `processed_webhook_events`, `webhook_dead_letters`.
- **Mixed-scope tables**: `categories` (`channel_id` nullable — rows can be global or channel-specific; partial unique index `categories_slug_global_unique` enforces uniqueness for global rows), `marketplace_events` (`channel_id`, `actor_id`, `entity_id` are loose identifier columns without FKs).
- **Channel-scoped tables** (rows belong to exactly one channel): `channel_listings`, `carts`, `checkout_sessions` (legacy, retiring at ADR-015 W5), `order_groups`, `orders`, `saved_searches`.
- **Inherited from channel-scoped parents**: `cart_items`, `order_items`, `order_group_seller_allocations`, `order_group_allocation_items`, `allocation_refunds`, `payout_holds`, `refunds`, `payment_operations`, `wishlists`, `listing_scores`, `listing_reports`.

## Indexes, unique constraints, and checks

### Auth
- `user`: unique `email`.
- `session`: unique `token`.
- `account`, `verification`: no extra indexes.

### Channels & Users
- `channels`: unique `slug`.
- `user_roles`: unique `(user_id, role)`.
- `addresses`: no extra indexes.
- `seller_profiles`: unique `user_id`, unique `handle`.

### Categories & Inventory
- `categories`: unique `(slug, channel_id)`; partial unique index `categories_slug_global_unique` on `slug` where `channel_id IS NULL`.
- `inventory_items`: indexes on `owner_id`, `lifecycle_state`, `category_id`.
- `inventory_item_images`: index on `inventory_item_id`.

### Listings
- `channel_listings`: unique `(inventory_item_id, channel_id)`, unique `(handle, channel_id)`, indexes on `status` and `channel_id`, check `price_cents > 0`.

### Commerce — single-seller
- `carts`: unique `(buyer_id, channel_id)`, index on `buyer_id`.
- `cart_items`: unique `(cart_id, channel_listing_id)`, index on `cart_id`, check `price_cents > 0`.
- `checkout_sessions`: indexes on `cart_id`, `buyer_id`, `status`, `stripe_payment_intent_id`; check `total_cents > 0`. **Partial unique index `checkout_sessions_cart_active_unique` on `cart_id` where `status IN ('created','payment_pending','requires_action')`** lives in raw SQL inside the migration (Drizzle 0.45.x cannot express it).
- `orders`: indexes on `buyer_id`, `seller_id`, `status`, `channel_id`, `(status, created_at)` (Phase 2B SLA worker query path); unique `checkout_session_id`; check `total_cents > 0`.
- `order_items`: index on `order_id`, unique `(order_id, channel_listing_id)`.
- `payout_holds`: unique `order_id`; indexes on `status`, `seller_stripe_account_id`, `(status, frozen_at, delivery_confirmed_at, buyer_confirmed_at)` (release eligibility), `(status, next_retry_at)` (retry sweep); check `amount_cents > 0`.
- `refunds`: indexes on `order_id`, `status`. **Partial unique index `refunds_order_active_unique` on `order_id` where `status IN ('pending','pending_reversal','processed')`** lives in raw SQL.

### Commerce — multi-vendor (ADR-015)
- `order_groups`: indexes on `buyer_id`, `cart_id`, `status`, `stripe_payment_intent_id`, `(status, created_at)`; checks `total_cents > 0`, `charge_type IN ('destination','sct')`, `currency = 'AUD'`. **Partial unique `order_groups_cart_active_unique` on `cart_id` where `status IN ('created','payment_pending','requires_action','confirming')`** in raw SQL.
- `order_group_seller_allocations`: unique `(order_group_id, seller_id)`, unique `(id, order_group_id)` (target of composite FKs from children); indexes on `order_group_id`, `seller_id`, `status`, `stripe_transfer_id`; check `total_cents > 0`. **Partial unique `allocation_transfer_idem_unique` on `stripe_transfer_idempotency_key` where it is `NOT NULL`** in raw SQL.
- `order_group_allocation_items`: composite FK `(allocation_id, order_group_id)` → `order_group_seller_allocations(id, order_group_id)` with `ON DELETE CASCADE`; indexes on `allocation_id`, `order_group_id`; unique `(allocation_id, channel_listing_id)`; check `price_cents > 0`.
- `allocation_refunds`: composite FK `(allocation_id, order_group_id)` → `order_group_seller_allocations(id, order_group_id)` (no cascade — refund audit must survive); indexes on `allocation_id`, `order_group_id`, `allocation_item_id`, `status`; check `amount_cents > 0`. **Partial unique indexes** in raw SQL: `allocation_refunds_item_active_unique` (per-item refunds, where `allocation_item_id IS NOT NULL` and status active) and `allocation_refunds_allocation_full_active_unique` (whole-allocation refunds, where `allocation_item_id IS NULL` and status active).
- `payment_operations`: indexes on `order_id`, `order_group_id`, `status`.

### Notifications
- `notifications`: unique `dedup_key`.
- `notification_preferences`: unique `(user_id, type, channel)`.

### Customer prefs
- `wishlists`: unique `(user_id, channel_listing_id)`; indexes on `user_id`, `channel_listing_id`.
- `saved_searches`: unique `(user_id, channel_id, query_hash)`; indexes on `user_id`, `channel_id`.

### Events
- `marketplace_events`: no extra indexes (PK only).

### Quality
- `listing_scores`: unique `channel_listing_id` (1:1 with listing).
- `listing_reports`: indexes on `channel_listing_id`, `status`, `reporter_id`. **Partial unique `listing_reports_active_unique` on `(reporter_id, channel_listing_id)` where `status NOT IN ('dismissed')`** (one open report per reporter per listing; dismissed reports allow re-reporting).

### Infrastructure
- `idempotency_keys`: unique `(key, user_id, operation)`.
- `processed_webhook_events`: unique `(provider, event_id)`.
- `webhook_dead_letters`: no extra indexes.

## Relationship notes

- `seller_profiles.default_shipping_address_id` — nullable, `onDelete: "set null"`. Required for listing activation (Phase 2A).
- `checkout_sessions.shipping_address_id` and `order_groups.shipping_address_id` — nullable, both `onDelete: "set null"`.
- `checkout_sessions.cart_id` and `order_groups.cart_id` — references `carts.id` without cascade. The checkout/order flow keeps cart rows alive after `cart_items` are removed so the audit trail survives. `commerce.ts` notes a future relaxation to `ON DELETE SET NULL` once W2+ makes `cart_id` nullable.
- `marketplace_events.actor_id`, `entity_id`, `channel_id` — plain identifier columns, **not** foreign keys. `idempotency_keys.user_id` is also a loose identifier, not an FK.
- `order_group_allocation_items` and `allocation_refunds` — both carry a denormalised `order_group_id` and use a **composite foreign key** `(allocation_id, order_group_id)` → `order_group_seller_allocations(id, order_group_id)`. The composite FK guarantees at the DB layer that a child's `order_group_id` matches its allocation's parent group; targets the `allocations_id_group_unique` index on the parent.
  - `order_group_allocation_items` — composite FK cascades on delete (item rows are tightly bound to their allocation).
  - `allocation_refunds` — composite FK does **not** cascade. Refund audit rows survive any future hard-delete of the allocation (soft-delete is the preferred path per Working Rule #4).
- `allocation_refunds.allocation_item_id` — `NULL` ⇒ whole-allocation refund; `NOT NULL` ⇒ per-item refund (ADR-015 SC&T refund granularity). `onDelete: "set null"` so item soft-delete preserves the refund audit trail.
- `payment_operations.order_id` and `order_group_id` — both nullable; rows must reference at least one (legacy single-seller rows reference `order_id`; multi-vendor W2+ rows reference `order_group_id`). The WAL serves both flows.
- `order_group_seller_allocations.order_id` — nullable; populated by W4 once a per-allocation `orders` row is created post-transfer.
- `refunds.initiated_by` and `allocation_refunds.initiated_by` — nullable, `onDelete: "set null"` so refund history outlives a deleted user.
- `listing_scores.channel_listing_id` — unique, modelled as `||--||` (one score row per listing). Cascades on listing delete.
- `listing_reports.reporter_id` — `onDelete: "cascade"`. The active-uniqueness predicate excludes `dismissed`, so a reporter can submit a fresh report after a dismissal.
