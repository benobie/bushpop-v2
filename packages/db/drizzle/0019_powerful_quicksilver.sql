-- ============================================================================
-- Sprint 1b W1 follow-up — ADR-015 schema invariants (PR 12 follow-up)
-- ============================================================================
-- Three related fixes to the W1 multi-vendor scaffold from 0018:
--
-- 1. Composite FK (allocation_id, order_group_id) on both child tables so the
--    denormalised order_group_id is guaranteed to match the allocation's
--    parent group — prevents silent data corruption from mismatched writes.
--    Requires a supporting UNIQUE(id, order_group_id) on the parent.
--
-- 2. Per-item refund support on allocation_refunds:
--      - Add nullable allocation_item_id FK to order_group_allocation_items.
--      - Replace the allocation-scoped active-refund partial unique index
--        (which blocked a second item refund once any refund reached
--        'processed') with two partial indexes: one item-scoped, one
--        whole-allocation-scoped. Matches ADR-015 SC&T per-item refund intent.
--
-- Applied additively on top of 0018. Safe to roll back via a 0020 that reverses
-- each statement in reverse order.
-- ============================================================================

-- Parent-side uniqueness needed to support the composite FKs below.
ALTER TABLE "order_group_seller_allocations"
  ADD CONSTRAINT "allocations_id_group_unique" UNIQUE ("id", "order_group_id");
--> statement-breakpoint

-- Drop the independent single-column FKs that duplicate the coming composite.
ALTER TABLE "order_group_allocation_items"
  DROP CONSTRAINT "order_group_allocation_items_allocation_id_order_group_seller_allocations_id_fk";
--> statement-breakpoint
ALTER TABLE "order_group_allocation_items"
  DROP CONSTRAINT "order_group_allocation_items_order_group_id_order_groups_id_fk";
--> statement-breakpoint
ALTER TABLE "allocation_refunds"
  DROP CONSTRAINT "allocation_refunds_allocation_id_order_group_seller_allocations_id_fk";
--> statement-breakpoint
ALTER TABLE "allocation_refunds"
  DROP CONSTRAINT "allocation_refunds_order_group_id_order_groups_id_fk";
--> statement-breakpoint

-- Composite FKs — enforce denormalised order_group_id consistency.
ALTER TABLE "order_group_allocation_items"
  ADD CONSTRAINT "allocation_items_allocation_group_fk"
  FOREIGN KEY ("allocation_id", "order_group_id")
  REFERENCES "public"."order_group_seller_allocations" ("id", "order_group_id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "allocation_refunds"
  ADD CONSTRAINT "allocation_refunds_allocation_group_fk"
  FOREIGN KEY ("allocation_id", "order_group_id")
  REFERENCES "public"."order_group_seller_allocations" ("id", "order_group_id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Per-item refund column + FK. ON DELETE SET NULL so refund audit survives any
-- future soft/hard-delete of the allocation item.
ALTER TABLE "allocation_refunds"
  ADD COLUMN "allocation_item_id" varchar(26);
--> statement-breakpoint
ALTER TABLE "allocation_refunds"
  ADD CONSTRAINT "allocation_refunds_allocation_item_id_order_group_allocation_items_id_fk"
  FOREIGN KEY ("allocation_item_id")
  REFERENCES "public"."order_group_allocation_items" ("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "allocation_refunds_allocation_item_id_idx"
  ON "allocation_refunds" USING btree ("allocation_item_id");
--> statement-breakpoint

-- ============================================================================
-- HAND-EDITED: partial unique index replacement (preserve on regeneration)
-- ============================================================================
-- Drop the 0018 allocation-scoped active-refund unique index. Its predicate
-- (status IN pending|pending_reversal|processed) incorrectly blocked a second
-- item refund in the same allocation once any item had reached 'processed'.

DROP INDEX IF EXISTS "allocation_refunds_allocation_active_unique";
--> statement-breakpoint

-- Item-scoped: at most one active refund per allocation_item.
CREATE UNIQUE INDEX IF NOT EXISTS "allocation_refunds_item_active_unique"
  ON "allocation_refunds" ("allocation_item_id")
  WHERE "allocation_item_id" IS NOT NULL
    AND "status" IN ('pending', 'pending_reversal', 'processed');
--> statement-breakpoint

-- Whole-allocation-scoped: at most one active full refund per allocation (only
-- applies when allocation_item_id IS NULL, i.e. a seller-level full refund).
CREATE UNIQUE INDEX IF NOT EXISTS "allocation_refunds_allocation_full_active_unique"
  ON "allocation_refunds" ("allocation_id")
  WHERE "allocation_item_id" IS NULL
    AND "status" IN ('pending', 'pending_reversal', 'processed');
