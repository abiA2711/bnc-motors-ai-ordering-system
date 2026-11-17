-- BNC Motors AI-Powered Product Ordering System
-- Migration 002: store the country, state, and district chosen at registration.
-- Does not drop columns or change existing product, order, or purchase-order rows.
-- Existing users keep NULL location values.
-- Safe to run again: each column is added only when it is missing.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS country character varying(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS country_code character varying(2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS state character varying(150);
ALTER TABLE users ADD COLUMN IF NOT EXISTS district character varying(150);

COMMIT;
