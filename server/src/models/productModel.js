const pool = require("../config/db");

const PRODUCT_FIELDS = `
  id,
  name,
  sku,
  description,
  image_url,
  category,
  brand,
  unit,
  price,
  currency,
  stock_quantity,
  reorder_level,
  is_active,
  created_at,
  updated_at
`;

const UPDATABLE_COLUMNS = {
  name: "name",
  sku: "sku",
  description: "description",
  price: "price",
  stock_quantity: "stock_quantity",
  category: "category",
  brand: "brand",
  image_url: "image_url",
  unit: "unit",
  currency: "currency",
  reorder_level: "reorder_level"
};

const listActive = async ({ searchPattern, category, limit, offset, availability = "active" }) => {
  const availabilitySql = availability === "inactive"
    ? "is_active = false"
    : availability === "all"
      ? "TRUE"
      : "is_active = true";
  const filters = `
    WHERE ${availabilitySql}
      AND ($1::text IS NULL OR name ILIKE $1 ESCAPE '\\' OR sku ILIKE $1 ESCAPE '\\' OR COALESCE(brand, '') ILIKE $1 ESCAPE '\\')
      AND ($2::text IS NULL OR LOWER(category) = LOWER($2))
  `;
  const values = [searchPattern, category];

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM products
     ${filters}`,
    values
  );

  const listResult = await pool.query(
    `SELECT ${PRODUCT_FIELDS}
     FROM products
     ${filters}
     ORDER BY name ASC, id ASC
     LIMIT $3 OFFSET $4`,
    [...values, limit, offset]
  );

  return {
    total: countResult.rows[0].total,
    products: listResult.rows
  };
};

const findActiveById = async (id) => {
  const result = await pool.query(
    `SELECT ${PRODUCT_FIELDS}
     FROM products
     WHERE id = $1 AND is_active = true`,
    [id]
  );

  return result.rows[0] || null;
};

const findById = async (id) => {
  const result = await pool.query(
    `SELECT ${PRODUCT_FIELDS}
     FROM products
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
};

const findBySku = async (sku, excludeId = null) => {
  const result = await pool.query(
    `SELECT id
     FROM products
     WHERE sku = $1
       AND ($2::bigint IS NULL OR id <> $2::bigint)`,
    [sku, excludeId]
  );

  return result.rows[0] || null;
};

const create = async (product) => {
  const result = await pool.query(
    `INSERT INTO products (
       name,
       sku,
       description,
       image_url,
       category,
       brand,
       unit,
       price,
       currency,
       stock_quantity,
       reorder_level
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${PRODUCT_FIELDS}`,
    [
      product.name,
      product.sku,
      product.description,
      product.imageUrl,
      product.category,
      product.brand,
      product.unit,
      product.price,
      product.currency,
      product.stockQuantity,
      product.reorderLevel
    ]
  );

  return result.rows[0];
};

const update = async (id, fields) => {
  const values = [];
  const assignments = [];

  Object.entries(UPDATABLE_COLUMNS).forEach(([key, column]) => {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) {
      return;
    }

    values.push(fields[key]);
    assignments.push(`${column} = $${values.length}`);
  });

  values.push(id);
  assignments.push("updated_at = now()");

  const result = await pool.query(
    `UPDATE products
     SET ${assignments.join(", ")}
     WHERE id = $${values.length}
     RETURNING ${PRODUCT_FIELDS}`,
    values
  );

  return result.rows[0] || null;
};

const setStatus = async (id, isActive) => {
  const result = await pool.query(
    `UPDATE products
     SET is_active = $2,
         updated_at = now()
     WHERE id = $1
     RETURNING ${PRODUCT_FIELDS}`,
    [id, isActive]
  );

  return result.rows[0] || null;
};

const softDelete = async (id) => {
  const result = await pool.query(
    `UPDATE products
     SET is_active = false,
         updated_at = now()
     WHERE id = $1
     RETURNING ${PRODUCT_FIELDS}`,
    [id]
  );

  return result.rows[0] || null;
};

const RELATED_FIELDS = `
  id,
  name,
  sku,
  brand,
  category,
  image_url,
  price,
  currency,
  stock_quantity
`;

const RELATED_STOPWORDS = ["bnc", "set", "sets", "kit", "with", "and", "the", "for"];

const findRelated = async ({ id, name, sku, category, brand }, limit, db = pool) => {
  const result = await db.query(
    `WITH source_name_tokens AS (
       SELECT DISTINCT token
       FROM regexp_split_to_table(lower(coalesce($2::text, '')), '[^a-z0-9]+') AS token
       WHERE char_length(token) >= 3
         AND NOT (token = ANY($6::text[]))
     ),
     source_sku_tokens AS (
       SELECT DISTINCT token
       FROM regexp_split_to_table(lower(coalesce($3::text, '')), '[^a-z0-9]+') AS token
       WHERE char_length(token) >= 3
         AND NOT (token = ANY($6::text[]))
     ),
     ranked AS (
       SELECT
         p.id,
         p.name,
         p.sku,
         p.brand,
         p.category,
         p.image_url,
         p.price,
         p.currency,
         p.stock_quantity,
         (
           CASE
             WHEN NULLIF(btrim($4::text), '') IS NOT NULL
              AND lower(btrim(p.category)) = lower(btrim($4::text)) THEN 1000
             ELSE 0
           END
           + CASE
             WHEN NULLIF(btrim($5::text), '') IS NOT NULL
              AND lower(btrim(p.brand)) = lower(btrim($5::text)) THEN 100
             ELSE 0
           END
           + COALESCE((
               SELECT COUNT(DISTINCT candidate.token)::int * 10
               FROM regexp_split_to_table(lower(coalesce(p.name, '')), '[^a-z0-9]+') AS candidate(token)
               WHERE char_length(candidate.token) >= 3
                 AND candidate.token IN (SELECT token FROM source_name_tokens)
             ), 0)
           + COALESCE((
               SELECT COUNT(DISTINCT candidate.token)::int * 8
               FROM regexp_split_to_table(lower(coalesce(p.sku, '')), '[^a-z0-9]+') AS candidate(token)
               WHERE char_length(candidate.token) >= 3
                 AND candidate.token IN (SELECT token FROM source_sku_tokens)
             ), 0)
         ) AS relevance
       FROM products p
       WHERE p.is_active = true
         AND p.id <> $1::bigint
     )
     SELECT ${RELATED_FIELDS}
     FROM ranked
     WHERE relevance > 0
     ORDER BY relevance DESC, name ASC, id ASC
     LIMIT $7`,
    [id, name, sku, category, brand, RELATED_STOPWORDS, limit]
  );

  return result.rows;
};

module.exports = {
  listActive,
  findActiveById,
  findById,
  findBySku,
  create,
  update,
  setStatus,
  softDelete,
  findRelated
};
