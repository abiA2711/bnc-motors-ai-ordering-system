const pool = require("../config/db");

const MAX_INTEGER = 2147483647;
const ALERT_LIMIT = 8;
const MOVEMENT_TYPES = {
  add: "stock_added",
  deduct: "stock_deducted"
};
const INCREASE_TYPES = new Set(["stock_added", "order_restoration"]);

const LIST_FIELDS = `
  id,
  name,
  sku,
  image_url,
  category,
  brand,
  unit,
  stock_quantity,
  reorder_level,
  is_active,
  CASE
    WHEN is_active = false THEN 'inactive'
    WHEN stock_quantity = 0 THEN 'out_of_stock'
    WHEN stock_quantity <= reorder_level THEN 'low_stock'
    ELSE 'in_stock'
  END AS stock_status
`;

const STATUS_SQL = {
  in_stock: "is_active = true AND stock_quantity > reorder_level",
  low_stock: "is_active = true AND stock_quantity > 0 AND stock_quantity <= reorder_level",
  out_of_stock: "is_active = true AND stock_quantity = 0",
  inactive: "is_active = false"
};

class InventoryError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "InventoryError";
    this.status = status;
  }
}

const escapeLike = (value) => value.replace(/[\\%_]/g, "\\$&");

const filtersFor = ({ search, category, stockStatus }) => {
  const params = [];
  const clauses = [];

  if (search) {
    params.push(`%${escapeLike(search)}%`);
    const placeholder = `$${params.length}`;
    clauses.push(
      `(name ILIKE ${placeholder} ESCAPE '\\' OR sku ILIKE ${placeholder} ESCAPE '\\' OR COALESCE(brand, '') ILIKE ${placeholder} ESCAPE '\\')`
    );
  }

  if (category) {
    params.push(category);
    clauses.push(`LOWER(COALESCE(category, '')) = LOWER($${params.length})`);
  }

  if (STATUS_SQL[stockStatus]) {
    clauses.push(STATUS_SQL[stockStatus]);
  }

  return {
    params,
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
  };
};

const getSummary = async () => {
  const result = await pool.query(
    `SELECT
       COUNT(*)::int AS total_products,
       COUNT(*) FILTER (
         WHERE is_active = true AND stock_quantity > reorder_level
       )::int AS in_stock,
       COUNT(*) FILTER (
         WHERE is_active = true AND stock_quantity > 0 AND stock_quantity <= reorder_level
       )::int AS low_stock,
       COUNT(*) FILTER (
         WHERE is_active = true AND stock_quantity = 0
       )::int AS out_of_stock,
       (SELECT MAX(created_at) FROM inventory_movements) AS last_adjustment_at
     FROM products`
  );

  return result.rows[0];
};

const listProducts = async ({ page, limit, search, category, stockStatus }) => {
  const filters = filtersFor({ search, category, stockStatus });
  const count = await pool.query(
    `SELECT COUNT(*)::int AS total FROM products ${filters.where}`,
    filters.params
  );
  const offset = (page - 1) * limit;
  const rows = await pool.query(
    `SELECT ${LIST_FIELDS}
     FROM products
     ${filters.where}
     ORDER BY name ASC, id ASC
     LIMIT $${filters.params.length + 1}
     OFFSET $${filters.params.length + 2}`,
    filters.params.concat([limit, offset])
  );

  return {
    products: rows.rows,
    total: count.rows[0].total
  };
};

const listAlerts = async () => {
  const result = await pool.query(
    `SELECT ${LIST_FIELDS}
     FROM products
     WHERE is_active = true
       AND stock_quantity > 0
       AND stock_quantity <= reorder_level
     ORDER BY stock_quantity ASC, name ASC, id ASC
     LIMIT $1`,
    [ALERT_LIMIT]
  );

  return result.rows;
};

const movementFilters = ({ movementType, fromDate, toDate }) => {
  const params = [];
  const clauses = [];

  if (movementType) {
    params.push(movementType);
    clauses.push(`m.adjustment_type = $${params.length}`);
  }

  if (fromDate) {
    params.push(fromDate);
    clauses.push(`m.created_at >= $${params.length}::date`);
  }

  if (toDate) {
    params.push(toDate);
    clauses.push(`m.created_at < ($${params.length}::date + INTERVAL '1 day')`);
  }

  return {
    params,
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
  };
};

const MOVEMENT_FIELDS = `
  m.id,
  m.product_id,
  p.name AS product_name,
  p.sku,
  m.adjustment_type AS movement_type,
  m.previous_quantity,
  m.adjustment_quantity,
  m.new_quantity,
  m.remarks,
  m.reference_type,
  m.reference_id,
  CASE
    WHEN m.reference_type = 'order' THEN orders.order_number
    WHEN m.reference_type = 'purchase_order' THEN purchase_orders.po_number
    ELSE NULL
  END AS reference_number,
  u.name AS updated_by_name,
  m.created_at
`;

const listMovements = async ({ page, limit, movementType, fromDate, toDate }) => {
  const filters = movementFilters({ movementType, fromDate, toDate });
  const count = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM inventory_movements m
     ${filters.where}`,
    filters.params
  );
  const offset = (page - 1) * limit;
  const rows = await pool.query(
    `SELECT ${MOVEMENT_FIELDS}
     FROM inventory_movements m
     JOIN products p ON p.id = m.product_id
     LEFT JOIN users u ON u.id = m.updated_by
     LEFT JOIN orders ON m.reference_type = 'order' AND orders.id = m.reference_id
     LEFT JOIN purchase_orders ON m.reference_type = 'purchase_order' AND purchase_orders.id = m.reference_id
     ${filters.where}
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT $${filters.params.length + 1}
     OFFSET $${filters.params.length + 2}`,
    filters.params.concat([limit, offset])
  );

  return {
    movements: rows.rows,
    total: count.rows[0].total
  };
};

const recordMovements = async (client, movements) => {
  if (!Array.isArray(movements) || movements.length === 0) {
    return;
  }

  const productIds = [];
  const types = [];
  const previousQuantities = [];
  const quantities = [];
  const newQuantities = [];
  const remarks = [];
  const referenceTypes = [];
  const referenceIds = [];
  const relatedOrderIds = [];
  const userIds = [];

  movements.forEach((movement) => {
    const previous = Number(movement.previous);
    const quantity = Number(movement.quantity);
    const next = Number(movement.next);
    const increases = INCREASE_TYPES.has(movement.type);
    const expected = increases ? previous + quantity : previous - quantity;

    if (!Number.isInteger(previous) || !Number.isInteger(quantity) || !Number.isInteger(next) || expected !== next || quantity <= 0 || previous < 0 || next < 0) {
      throw new InventoryError(409, "Stock movement does not match the stock update");
    }

    productIds.push(movement.productId);
    types.push(movement.type);
    previousQuantities.push(previous);
    quantities.push(quantity);
    newQuantities.push(next);
    remarks.push(movement.remarks || null);
    referenceTypes.push(movement.referenceType || null);
    referenceIds.push(movement.referenceId || null);
    relatedOrderIds.push(movement.relatedOrderId || null);
    userIds.push(movement.userId || null);
  });

  await client.query(
    `INSERT INTO inventory_movements (
       product_id,
       adjustment_type,
       previous_quantity,
       adjustment_quantity,
       new_quantity,
       remarks,
       reference_type,
       reference_id,
       related_order_id,
       updated_by
     )
     SELECT *
     FROM unnest(
       $1::bigint[],
       $2::varchar[],
       $3::int[],
       $4::int[],
       $5::int[],
       $6::text[],
       $7::varchar[],
       $8::bigint[],
       $9::bigint[],
       $10::bigint[]
     )`,
    [
      productIds,
      types,
      previousQuantities,
      quantities,
      newQuantities,
      remarks,
      referenceTypes,
      referenceIds,
      relatedOrderIds,
      userIds
    ]
  );
};

const listCategories = async () => {
  const result = await pool.query(
    `SELECT DISTINCT category
     FROM products
     WHERE category IS NOT NULL
       AND btrim(category) <> ''
     ORDER BY category ASC`
  );

  return result.rows.map((row) => row.category);
};

const getInventory = async (filters) => {
  const [summary, list, alerts, categories] = await Promise.all([
    getSummary(),
    listProducts(filters),
    listAlerts(),
    listCategories()
  ]);

  return {
    summary,
    products: list.products,
    total: list.total,
    alerts,
    categories
  };
};

const adjustStock = async ({ productId, type, quantity, remarks, userId }) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT id, stock_quantity
       FROM products
       WHERE id = $1
       FOR UPDATE`,
      [productId]
    );

    if (!locked.rows[0]) {
      throw new InventoryError(404, "Product not found");
    }

    const previous = Number(locked.rows[0].stock_quantity);
    const next = type === "add" ? previous + quantity : previous - quantity;

    if (next < 0) {
      throw new InventoryError(409, "Deduction is greater than available stock");
    }

    if (next > MAX_INTEGER) {
      throw new InventoryError(409, "Stock quantity is too large");
    }

    const updated = await client.query(
      `UPDATE products
       SET stock_quantity = $2,
           updated_at = now()
       WHERE id = $1
         AND stock_quantity = $3
         AND $2::bigint BETWEEN 0 AND $4
       RETURNING id, stock_quantity`,
      [productId, next, previous, MAX_INTEGER]
    );

    if (updated.rowCount !== 1) {
      throw new InventoryError(409, "Stock changed before the update could be saved");
    }

    await recordMovements(client, [{
      productId,
      type: MOVEMENT_TYPES[type],
      previous,
      quantity,
      next,
      remarks,
      userId
    }]);

    await client.query("COMMIT");

    return {
      product_id: updated.rows[0].id,
      previous_stock: previous,
      adjustment: quantity,
      current_stock: Number(updated.rows[0].stock_quantity),
      type
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Inventory rollback failed");
    }

    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  InventoryError,
  getInventory,
  listMovements,
  recordMovements,
  adjustStock
};
