-- BNC Motors AI-Powered Product Ordering System
-- Migration 003: allow one purchase order to create more than one order.
-- Adds partially_converted. Does not change uploaded, processing, review_required,
-- confirmed, or failed rows except to record orders that were already confirmed.
-- Safe to run again.

BEGIN;

ALTER TABLE po_items ADD COLUMN IF NOT EXISTS converted_order_id bigint;
ALTER TABLE po_items ADD COLUMN IF NOT EXISTS converted_quantity integer;
ALTER TABLE po_items ADD COLUMN IF NOT EXISTS converted_at timestamp with time zone;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'po_items_converted_order_id_fkey'
          AND conrelid = 'public.po_items'::regclass
    ) THEN
        ALTER TABLE po_items
            ADD CONSTRAINT po_items_converted_order_id_fkey
            FOREIGN KEY (converted_order_id) REFERENCES orders (id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'po_items_converted_quantity_check'
          AND conrelid = 'public.po_items'::regclass
    ) THEN
        ALTER TABLE po_items
            ADD CONSTRAINT po_items_converted_quantity_check
            CHECK (converted_quantity IS NULL OR (converted_quantity > 0 AND converted_quantity <= quantity));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'po_items_converted_check'
          AND conrelid = 'public.po_items'::regclass
    ) THEN
        ALTER TABLE po_items
            ADD CONSTRAINT po_items_converted_check
            CHECK (
                (converted_order_id IS NULL AND converted_quantity IS NULL AND converted_at IS NULL)
                OR (converted_order_id IS NOT NULL AND converted_quantity IS NOT NULL AND converted_at IS NOT NULL)
            );
    END IF;
END $$;

DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.purchase_orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%';

    IF constraint_name IS NOT NULL
       AND pg_get_constraintdef(
            (SELECT oid FROM pg_constraint WHERE conname = constraint_name AND conrelid = 'public.purchase_orders'::regclass)
          ) NOT ILIKE '%partially_converted%' THEN
        EXECUTE format('ALTER TABLE purchase_orders DROP CONSTRAINT %I', constraint_name);
        ALTER TABLE purchase_orders
            ADD CONSTRAINT purchase_orders_status_check CHECK (
                status::text = ANY (
                    ARRAY[
                        'uploaded'::character varying,
                        'processing'::character varying,
                        'review_required'::character varying,
                        'partially_converted'::character varying,
                        'confirmed'::character varying,
                        'failed'::character varying
                    ]::text[]
                )
            );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS purchase_order_orders (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    purchase_order_id bigint NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
    order_id bigint NOT NULL UNIQUE REFERENCES orders (id) ON DELETE CASCADE,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT purchase_order_orders_purchase_order_id_order_id_key UNIQUE (purchase_order_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_po_items_converted_order_id ON po_items (converted_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_orders_purchase_order_id ON purchase_order_orders (purchase_order_id);

UPDATE po_items AS item
SET converted_order_id = purchase_orders.converted_order_id,
    converted_quantity = item.quantity,
    converted_at = COALESCE(purchase_orders.updated_at, now())
FROM purchase_orders
WHERE item.purchase_order_id = purchase_orders.id
  AND purchase_orders.status = 'confirmed'
  AND purchase_orders.converted_order_id IS NOT NULL
  AND item.converted_order_id IS NULL;

INSERT INTO purchase_order_orders (purchase_order_id, order_id)
SELECT id, converted_order_id
FROM purchase_orders
WHERE converted_order_id IS NOT NULL
ON CONFLICT (order_id) DO NOTHING;

COMMIT;
