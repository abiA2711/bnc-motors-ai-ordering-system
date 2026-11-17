-- BNC Motors AI-Powered Product Ordering System
-- Fresh-database schema, including the finalized columns.
-- An existing database should use database/migrations/001_complete_database_design.sql.
-- This script does not drop or alter tables that are already present.
-- If any of these tables already exist, the transaction stops and rolls back.

BEGIN;

-- Accounts that sign in and own orders and uploaded purchase orders.
CREATE TABLE users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name character varying(100) NOT NULL,
    email character varying(150) NOT NULL UNIQUE,
    phone character varying(20),
    company_name character varying(150),
    country character varying(100),
    country_code character varying(2),
    state character varying(150),
    district character varying(150),
    password_hash text NOT NULL,
    role character varying(20) NOT NULL DEFAULT 'customer',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT users_role_check CHECK (
        role::text = ANY (
            ARRAY['customer'::character varying, 'admin'::character varying]::text[]
        )
    )
);

-- Catalog products that can be ordered and matched to purchase-order lines.
CREATE TABLE products (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name character varying(150) NOT NULL,
    sku character varying(50) NOT NULL UNIQUE,
    description text,
    image_url text,
    category character varying(100),
    brand character varying(100),
    unit character varying(20) NOT NULL DEFAULT 'pcs',
    price numeric(12,2) NOT NULL,
    currency character varying(3) NOT NULL DEFAULT 'INR',
    stock_quantity integer NOT NULL DEFAULT 0,
    reorder_level integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT products_price_check CHECK (price >= 0::numeric),
    CONSTRAINT products_stock_quantity_check CHECK (stock_quantity >= 0),
    CONSTRAINT products_reorder_level_check CHECK (reorder_level >= 0),
    CONSTRAINT products_currency_check CHECK (currency ~ '^[A-Z]{3}$')
);

-- Customer orders placed against the product catalog.
CREATE TABLE orders (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_number character varying(40) NOT NULL UNIQUE,
    user_id bigint NOT NULL REFERENCES users (id),
    subtotal numeric(12,2) NOT NULL DEFAULT 0,
    tax_amount numeric(12,2) NOT NULL DEFAULT 0,
    shipping_charge numeric(12,2) NOT NULL DEFAULT 0,
    total_amount numeric(12,2) NOT NULL DEFAULT 0,
    status character varying(30) NOT NULL DEFAULT 'pending',
    payment_method character varying(20) NOT NULL DEFAULT 'pay_later',
    payment_status character varying(20) NOT NULL DEFAULT 'pending',
    shipping_address jsonb,
    billing_address jsonb,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT orders_status_check CHECK (
        status::text = ANY (
            ARRAY[
                'pending'::character varying,
                'confirmed'::character varying,
                'processing'::character varying,
                'shipped'::character varying,
                'delivered'::character varying,
                'cancelled'::character varying
            ]::text[]
        )
    ),
    CONSTRAINT orders_subtotal_check CHECK (subtotal >= 0::numeric),
    CONSTRAINT orders_tax_amount_check CHECK (tax_amount >= 0::numeric),
    CONSTRAINT orders_shipping_charge_check CHECK (shipping_charge >= 0::numeric),
    CONSTRAINT orders_total_amount_check CHECK (total_amount >= 0::numeric),
    CONSTRAINT orders_payment_method_check CHECK (
        payment_method::text = ANY (
            ARRAY['pay_later'::character varying, 'cod'::character varying]::text[]
        )
    ),
    CONSTRAINT orders_payment_status_check CHECK (
        payment_status::text = ANY (
            ARRAY['pending'::character varying, 'paid'::character varying, 'failed'::character varying]::text[]
        )
    )
);

-- Individual products and quantities that make up an order.
-- product_name and product_sku keep the catalog values from the time of purchase.
CREATE TABLE order_items (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id bigint NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    product_id bigint NOT NULL REFERENCES products (id),
    product_name character varying(150) NOT NULL,
    product_sku character varying(50) NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    line_total numeric(12,2) NOT NULL,
    tax_amount numeric(12,2) NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
    CONSTRAINT order_items_unit_price_check CHECK (unit_price >= 0::numeric),
    CONSTRAINT order_items_line_total_check CHECK (line_total >= 0::numeric),
    CONSTRAINT order_items_tax_amount_check CHECK (tax_amount >= 0::numeric)
);

-- Uploaded purchase-order documents waiting for extraction and review.
CREATE TABLE purchase_orders (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    po_number character varying(40) NOT NULL UNIQUE,
    user_id bigint NOT NULL REFERENCES users (id),
    file_name character varying(255) NOT NULL,
    file_path text NOT NULL,
    file_type character varying(100),
    file_size bigint,
    status character varying(30) NOT NULL DEFAULT 'uploaded',
    extracted_data jsonb,
    processing_error text,
    processed_at timestamp with time zone,
    converted_order_id bigint REFERENCES orders (id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT purchase_orders_status_check CHECK (
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
    ),
    CONSTRAINT purchase_orders_file_size_check CHECK (file_size IS NULL OR file_size >= 0)
);

-- Line items extracted from an uploaded purchase-order document.
CREATE TABLE po_items (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    purchase_order_id bigint NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
    line_number integer NOT NULL,
    extracted_name character varying(255) NOT NULL,
    extracted_sku character varying(100),
    description text,
    quantity integer NOT NULL,
    unit character varying(20),
    unit_price numeric(12,2),
    line_total numeric(12,2),
    raw_extracted_data jsonb,
    converted_order_id bigint REFERENCES orders (id) ON DELETE RESTRICT,
    converted_quantity integer,
    converted_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT po_items_quantity_check CHECK (quantity > 0),
    CONSTRAINT po_items_converted_quantity_check CHECK (
        converted_quantity IS NULL OR (converted_quantity > 0 AND converted_quantity <= quantity)
    ),
    CONSTRAINT po_items_converted_check CHECK (
        (converted_order_id IS NULL AND converted_quantity IS NULL AND converted_at IS NULL)
        OR (converted_order_id IS NOT NULL AND converted_quantity IS NOT NULL AND converted_at IS NOT NULL)
    ),
    CONSTRAINT po_items_unit_price_check CHECK (unit_price IS NULL OR unit_price >= 0::numeric),
    CONSTRAINT po_items_line_number_check CHECK (line_number > 0),
    CONSTRAINT po_items_line_total_check CHECK (line_total IS NULL OR line_total >= 0::numeric),
    CONSTRAINT po_items_purchase_order_id_line_number_key UNIQUE (purchase_order_id, line_number)
);

-- Suggested or reviewed matches between an extracted PO line and a catalog product.
CREATE TABLE po_matches (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    po_item_id bigint NOT NULL REFERENCES po_items (id) ON DELETE CASCADE,
    product_id bigint NOT NULL REFERENCES products (id),
    match_score numeric(5,4),
    match_status character varying(20) NOT NULL DEFAULT 'suggested',
    match_method character varying(30),
    match_reason text,
    is_selected boolean NOT NULL DEFAULT false,
    reviewed_by bigint REFERENCES users (id) ON DELETE SET NULL,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT po_matches_match_score_check CHECK (
        match_score IS NULL OR
        (match_score >= 0 AND match_score <= 1)
    ),
    CONSTRAINT po_matches_match_status_check CHECK (
        match_status::text = ANY (
            ARRAY[
                'suggested'::character varying,
                'accepted'::character varying,
                'rejected'::character varying
            ]::text[]
        )
    ),
    CONSTRAINT po_matches_po_item_id_product_id_key UNIQUE (po_item_id, product_id)
);

-- Orders created from one purchase order. A purchase order can produce more than one order.
CREATE TABLE purchase_order_orders (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    purchase_order_id bigint NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
    order_id bigint NOT NULL UNIQUE REFERENCES orders (id) ON DELETE CASCADE,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT purchase_order_orders_purchase_order_id_order_id_key UNIQUE (purchase_order_id, order_id)
);

-- Every stock change: manual adjustments, customer orders, cancellations, and purchase-order conversions.
CREATE TABLE inventory_movements (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id bigint NOT NULL REFERENCES products (id),
    adjustment_type character varying(30) NOT NULL,
    previous_quantity integer NOT NULL,
    adjustment_quantity integer NOT NULL,
    new_quantity integer NOT NULL,
    remarks text,
    reference_type character varying(20),
    reference_id bigint,
    related_order_id bigint REFERENCES orders (id) ON DELETE SET NULL,
    updated_by bigint REFERENCES users (id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT inventory_movements_adjustment_type_check CHECK (
        adjustment_type::text = ANY (
            ARRAY[
                'stock_added'::character varying,
                'stock_deducted'::character varying,
                'order_deduction'::character varying,
                'order_restoration'::character varying,
                'po_conversion_deduction'::character varying
            ]::text[]
        )
    ),
    CONSTRAINT inventory_movements_previous_quantity_check CHECK (previous_quantity >= 0),
    CONSTRAINT inventory_movements_adjustment_quantity_check CHECK (adjustment_quantity > 0),
    CONSTRAINT inventory_movements_new_quantity_check CHECK (new_quantity >= 0),
    CONSTRAINT inventory_movements_reference_type_check CHECK (
        reference_type IS NULL OR reference_type::text = ANY (
            ARRAY['order'::character varying, 'purchase_order'::character varying]::text[]
        )
    ),
    CONSTRAINT inventory_movements_reference_pair_check CHECK (
        (reference_type IS NULL AND reference_id IS NULL)
        OR (reference_type IS NOT NULL AND reference_id IS NOT NULL)
    )
);

-- Lookup indexes. Primary keys and unique constraints already have indexes.
CREATE INDEX idx_orders_user_id ON orders (user_id);
CREATE INDEX idx_orders_status ON orders (status);
CREATE INDEX idx_order_items_order_id ON order_items (order_id);
CREATE INDEX idx_order_items_product_id ON order_items (product_id);
CREATE INDEX idx_products_category ON products (category);
CREATE INDEX idx_purchase_orders_user_id ON purchase_orders (user_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders (status);
CREATE INDEX idx_purchase_orders_converted_order_id ON purchase_orders (converted_order_id);
CREATE INDEX idx_po_items_converted_order_id ON po_items (converted_order_id);
CREATE INDEX idx_purchase_order_orders_purchase_order_id ON purchase_order_orders (purchase_order_id);
CREATE INDEX idx_po_matches_product_id ON po_matches (product_id);
CREATE INDEX idx_po_matches_reviewed_by ON po_matches (reviewed_by);

CREATE UNIQUE INDEX IF NOT EXISTS
idx_po_matches_one_selected_per_item
ON po_matches (po_item_id)
WHERE is_selected = TRUE;
CREATE INDEX idx_inventory_movements_product_id ON inventory_movements (product_id);
CREATE INDEX idx_inventory_movements_created_at ON inventory_movements (created_at DESC);
CREATE INDEX idx_inventory_movements_type_created ON inventory_movements (adjustment_type, created_at DESC);
CREATE UNIQUE INDEX idx_inventory_movements_related_order
    ON inventory_movements (product_id, adjustment_type, related_order_id)
    WHERE related_order_id IS NOT NULL;

COMMIT;
