-- BNC Motors AI-Powered Product Ordering System
-- Migration 001: add the finalized columns to the existing seven tables.
-- Does not drop or recreate tables, and does not remove existing data.
-- Safe to run again: new columns, constraints, and indexes are skipped once present.
-- Backfills run only where the new value is still NULL.
-- Do not run database/schema.sql against a database that already has these tables.

BEGIN;

-- Accounts: contact details, active flag, and last-update time.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone character varying(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name character varying(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

-- Catalog: merchandising fields and stock replenishment threshold.
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category character varying(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand character varying(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit character varying(20) NOT NULL DEFAULT 'pcs';
ALTER TABLE products ADD COLUMN IF NOT EXISTS currency character varying(3) NOT NULL DEFAULT 'INR';
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_level integer NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'products_reorder_level_check'
          AND conrelid = 'public.products'::regclass
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT products_reorder_level_check CHECK (reorder_level >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'products_currency_check'
          AND conrelid = 'public.products'::regclass
    ) THEN
        ALTER TABLE products
            ADD CONSTRAINT products_currency_check CHECK (currency ~ '^[A-Z]{3}$');
    END IF;
END $$;

-- Orders: business number, price breakdown, addresses, and notes.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number character varying(40);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_charge numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_address jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes text;

UPDATE orders
SET order_number = 'BNC-ORD-' || lpad(id::text, GREATEST(6, length(id::text)), '0')
WHERE order_number IS NULL;

ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'orders_order_number_key'
          AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE orders
            ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'orders_subtotal_check'
          AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE orders
            ADD CONSTRAINT orders_subtotal_check CHECK (subtotal >= 0::numeric);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'orders_tax_amount_check'
          AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE orders
            ADD CONSTRAINT orders_tax_amount_check CHECK (tax_amount >= 0::numeric);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'orders_shipping_charge_check'
          AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE orders
            ADD CONSTRAINT orders_shipping_charge_check CHECK (shipping_charge >= 0::numeric);
    END IF;
END $$;

-- Order lines: catalog snapshot and line amounts.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name character varying(150);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_sku character varying(50);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS line_total numeric(12,2);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tax_amount numeric(12,2) NOT NULL DEFAULT 0;

UPDATE order_items AS item
SET
    product_name = product.name,
    product_sku = product.sku
FROM products AS product
WHERE item.product_id = product.id
  AND (item.product_name IS NULL OR item.product_sku IS NULL);

UPDATE order_items
SET line_total = quantity * unit_price
WHERE line_total IS NULL;

ALTER TABLE order_items ALTER COLUMN product_name SET NOT NULL;
ALTER TABLE order_items ALTER COLUMN product_sku SET NOT NULL;
ALTER TABLE order_items ALTER COLUMN line_total SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'order_items_line_total_check'
          AND conrelid = 'public.order_items'::regclass
    ) THEN
        ALTER TABLE order_items
            ADD CONSTRAINT order_items_line_total_check CHECK (line_total >= 0::numeric);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'order_items_tax_amount_check'
          AND conrelid = 'public.order_items'::regclass
    ) THEN
        ALTER TABLE order_items
            ADD CONSTRAINT order_items_tax_amount_check CHECK (tax_amount >= 0::numeric);
    END IF;
END $$;

-- Purchase orders: document metadata, extraction result, and the order it became.
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_number character varying(40);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS file_type character varying(100);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS file_size bigint;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS extracted_data jsonb;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS processing_error text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS processed_at timestamp with time zone;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS converted_order_id bigint;

UPDATE purchase_orders
SET po_number = 'BNC-PO-' || lpad(id::text, GREATEST(6, length(id::text)), '0')
WHERE po_number IS NULL;

ALTER TABLE purchase_orders ALTER COLUMN po_number SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'purchase_orders_po_number_key'
          AND conrelid = 'public.purchase_orders'::regclass
    ) THEN
        ALTER TABLE purchase_orders
            ADD CONSTRAINT purchase_orders_po_number_key UNIQUE (po_number);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'purchase_orders_file_size_check'
          AND conrelid = 'public.purchase_orders'::regclass
    ) THEN
        ALTER TABLE purchase_orders
            ADD CONSTRAINT purchase_orders_file_size_check
            CHECK (file_size IS NULL OR file_size >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'purchase_orders_converted_order_id_fkey'
          AND conrelid = 'public.purchase_orders'::regclass
    ) THEN
        ALTER TABLE purchase_orders
            ADD CONSTRAINT purchase_orders_converted_order_id_fkey
            FOREIGN KEY (converted_order_id) REFERENCES orders (id) ON DELETE SET NULL;
    END IF;
END $$;

-- Extracted PO lines: source position, description, and raw extractor payload.
ALTER TABLE po_items ADD COLUMN IF NOT EXISTS line_number integer;
ALTER TABLE po_items ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE po_items ADD COLUMN IF NOT EXISTS unit character varying(20);
ALTER TABLE po_items ADD COLUMN IF NOT EXISTS line_total numeric(12,2);
ALTER TABLE po_items ADD COLUMN IF NOT EXISTS raw_extracted_data jsonb;

WITH missing AS (
    SELECT
        id,
        purchase_order_id,
        row_number() OVER (PARTITION BY purchase_order_id ORDER BY id) AS rn
    FROM po_items
    WHERE line_number IS NULL
),
maxes AS (
    SELECT purchase_order_id, COALESCE(MAX(line_number), 0) AS max_line
    FROM po_items
    GROUP BY purchase_order_id
)
UPDATE po_items AS item
SET line_number = maxes.max_line + missing.rn
FROM missing
JOIN maxes ON maxes.purchase_order_id = missing.purchase_order_id
WHERE item.id = missing.id;

ALTER TABLE po_items ALTER COLUMN line_number SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'po_items_line_number_check'
          AND conrelid = 'public.po_items'::regclass
    ) THEN
        ALTER TABLE po_items
            ADD CONSTRAINT po_items_line_number_check CHECK (line_number > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'po_items_line_total_check'
          AND conrelid = 'public.po_items'::regclass
    ) THEN
        ALTER TABLE po_items
            ADD CONSTRAINT po_items_line_total_check
            CHECK (line_total IS NULL OR line_total >= 0::numeric);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'po_items_purchase_order_id_line_number_key'
          AND conrelid = 'public.po_items'::regclass
    ) THEN
        ALTER TABLE po_items
            ADD CONSTRAINT po_items_purchase_order_id_line_number_key
            UNIQUE (purchase_order_id, line_number);
    END IF;
END $$;

-- Match review: how a suggestion was made and who accepted it.
ALTER TABLE po_matches ADD COLUMN IF NOT EXISTS match_method character varying(30);
ALTER TABLE po_matches ADD COLUMN IF NOT EXISTS match_reason text;
ALTER TABLE po_matches ADD COLUMN IF NOT EXISTS is_selected boolean NOT NULL DEFAULT false;
ALTER TABLE po_matches ADD COLUMN IF NOT EXISTS reviewed_by bigint;
ALTER TABLE po_matches ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'po_matches_reviewed_by_fkey'
          AND conrelid = 'public.po_matches'::regclass
    ) THEN
        ALTER TABLE po_matches
            ADD CONSTRAINT po_matches_reviewed_by_fkey
            FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL;
    END IF;
END $$;

-- Lookup indexes. Unique business keys are already indexed by their constraints.
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_user_id ON purchase_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders (status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_converted_order_id ON purchase_orders (converted_order_id);
CREATE INDEX IF NOT EXISTS idx_po_matches_product_id ON po_matches (product_id);
CREATE INDEX IF NOT EXISTS idx_po_matches_reviewed_by ON po_matches (reviewed_by);

CREATE UNIQUE INDEX IF NOT EXISTS
idx_po_matches_one_selected_per_item
ON po_matches (po_item_id)
WHERE is_selected = TRUE;

COMMIT;
