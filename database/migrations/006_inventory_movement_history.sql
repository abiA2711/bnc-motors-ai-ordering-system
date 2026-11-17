-- BNC Motors AI-Powered Product Ordering System
-- Migration 006: record order, cancellation, and purchase-order stock changes
-- in the existing inventory movement history.
-- Does not change order totals, statuses, or stock formulas.
-- Safe to run again.

BEGIN;

ALTER TABLE inventory_movements
    ALTER COLUMN adjustment_type TYPE character varying(30);

ALTER TABLE inventory_movements
    DROP CONSTRAINT IF EXISTS inventory_movements_adjustment_type_check;

UPDATE inventory_movements
SET adjustment_type = 'stock_added'
WHERE adjustment_type = 'add';

UPDATE inventory_movements
SET adjustment_type = 'stock_deducted'
WHERE adjustment_type = 'deduct';

ALTER TABLE inventory_movements
    ADD CONSTRAINT inventory_movements_adjustment_type_check
    CHECK (
        adjustment_type::text = ANY (
            ARRAY[
                'stock_added'::character varying,
                'stock_deducted'::character varying,
                'order_deduction'::character varying,
                'order_restoration'::character varying,
                'po_conversion_deduction'::character varying
            ]::text[]
        )
    );

ALTER TABLE inventory_movements
    ADD COLUMN IF NOT EXISTS reference_type character varying(20);

ALTER TABLE inventory_movements
    ADD COLUMN IF NOT EXISTS reference_id bigint;

ALTER TABLE inventory_movements
    ADD COLUMN IF NOT EXISTS related_order_id bigint;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'inventory_movements_reference_type_check'
          AND conrelid = 'public.inventory_movements'::regclass
    ) THEN
        ALTER TABLE inventory_movements
            ADD CONSTRAINT inventory_movements_reference_type_check
            CHECK (
                reference_type IS NULL OR reference_type::text = ANY (
                    ARRAY['order'::character varying, 'purchase_order'::character varying]::text[]
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'inventory_movements_reference_pair_check'
          AND conrelid = 'public.inventory_movements'::regclass
    ) THEN
        ALTER TABLE inventory_movements
            ADD CONSTRAINT inventory_movements_reference_pair_check
            CHECK (
                (reference_type IS NULL AND reference_id IS NULL)
                OR (reference_type IS NOT NULL AND reference_id IS NOT NULL)
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'inventory_movements_related_order_id_fkey'
          AND conrelid = 'public.inventory_movements'::regclass
    ) THEN
        ALTER TABLE inventory_movements
            ADD CONSTRAINT inventory_movements_related_order_id_fkey
            FOREIGN KEY (related_order_id) REFERENCES orders (id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_type_created
    ON inventory_movements (adjustment_type, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_movements_related_order
    ON inventory_movements (product_id, adjustment_type, related_order_id)
    WHERE related_order_id IS NOT NULL;

COMMIT;
