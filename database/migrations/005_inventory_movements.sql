-- BNC Motors AI-Powered Product Ordering System
-- Migration 005: record manual inventory adjustments.
-- Does not change products, orders, order items, or purchase orders.
-- Safe to run again.

BEGIN;

CREATE TABLE IF NOT EXISTS inventory_movements (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id bigint NOT NULL REFERENCES products (id),
    adjustment_type character varying(10) NOT NULL,
    previous_quantity integer NOT NULL,
    adjustment_quantity integer NOT NULL,
    new_quantity integer NOT NULL,
    remarks text,
    updated_by bigint REFERENCES users (id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT inventory_movements_adjustment_type_check CHECK (
        adjustment_type::text = ANY (
            ARRAY['add'::character varying, 'deduct'::character varying]::text[]
        )
    ),
    CONSTRAINT inventory_movements_previous_quantity_check CHECK (previous_quantity >= 0),
    CONSTRAINT inventory_movements_adjustment_quantity_check CHECK (adjustment_quantity > 0),
    CONSTRAINT inventory_movements_new_quantity_check CHECK (new_quantity >= 0)
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id ON inventory_movements (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON inventory_movements (created_at DESC);

COMMIT;
