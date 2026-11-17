-- BNC Motors AI-Powered Product Ordering System
-- Migration 004: record how an order will be paid and whether that payment is settled.
-- Existing orders stay in place and default to pay_later / pending.
-- Does not change order status, totals, items, or stock.
-- Safe to run again.

BEGIN;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method character varying(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status character varying(20);

UPDATE orders
SET payment_method = 'pay_later'
WHERE payment_method IS NULL;

UPDATE orders
SET payment_status = 'pending'
WHERE payment_status IS NULL;

ALTER TABLE orders ALTER COLUMN payment_method SET DEFAULT 'pay_later';
ALTER TABLE orders ALTER COLUMN payment_status SET DEFAULT 'pending';
ALTER TABLE orders ALTER COLUMN payment_method SET NOT NULL;
ALTER TABLE orders ALTER COLUMN payment_status SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'orders_payment_method_check'
          AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE orders
            ADD CONSTRAINT orders_payment_method_check
            CHECK (
                payment_method::text = ANY (
                    ARRAY['pay_later'::character varying, 'cod'::character varying]::text[]
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'orders_payment_status_check'
          AND conrelid = 'public.orders'::regclass
    ) THEN
        ALTER TABLE orders
            ADD CONSTRAINT orders_payment_status_check
            CHECK (
                payment_status::text = ANY (
                    ARRAY['pending'::character varying, 'paid'::character varying, 'failed'::character varying]::text[]
                )
            );
    END IF;
END $$;

COMMIT;
