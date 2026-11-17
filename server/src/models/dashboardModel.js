const pool = require("../config/db");

const RANGES = new Set([7, 30, 90]);
const RECENT_LIMIT = 5;

const summarySql = `
  SELECT
    (SELECT COUNT(*)::int FROM users WHERE role = 'customer') AS total_customers,
    (SELECT COUNT(*)::int FROM products WHERE is_active IS TRUE) AS active_products,
    (SELECT COUNT(*)::int FROM orders) AS total_orders,
    (SELECT COUNT(*)::int FROM orders WHERE status = 'pending') AS pending_orders,
    (SELECT COUNT(*)::int FROM purchase_orders) AS total_purchase_orders,
    (SELECT COUNT(*)::int FROM purchase_orders WHERE status = 'partially_converted') AS partially_converted_purchase_orders
`;

// Buckets use the Asia/Kolkata calendar so an order stays on the local day it was placed.
const trendSql = `
  WITH days AS (
    SELECT generate_series(
      (timezone('Asia/Kolkata', now()))::date - ($1::int - 1),
      (timezone('Asia/Kolkata', now()))::date,
      interval '1 day'
    )::date AS day
  ),
  counts AS (
    SELECT (timezone('Asia/Kolkata', created_at))::date AS day,
           COUNT(*)::int AS total
    FROM orders
    WHERE (timezone('Asia/Kolkata', created_at))::date
          >= (timezone('Asia/Kolkata', now()))::date - ($1::int - 1)
    GROUP BY 1
  )
  SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
         COALESCE(counts.total, 0)::int AS count
  FROM days
  LEFT JOIN counts ON counts.day = days.day
  ORDER BY days.day
`;

const statusSql = `
  SELECT statuses.status,
         COALESCE(counts.total, 0)::int AS count
  FROM (
    VALUES
      ('uploaded'::varchar),
      ('processing'::varchar),
      ('review_required'::varchar),
      ('partially_converted'::varchar),
      ('confirmed'::varchar),
      ('failed'::varchar)
  ) AS statuses(status)
  LEFT JOIN (
    SELECT status, COUNT(*)::int AS total
    FROM purchase_orders
    GROUP BY status
  ) AS counts ON counts.status = statuses.status
`;

const recentOrdersSql = `
  SELECT
    o.id,
    o.order_number,
    customer.name AS customer_name,
    o.total_amount,
    o.status,
    o.created_at,
    COALESCE((
      SELECT SUM(item.quantity)::int
      FROM order_items AS item
      WHERE item.order_id = o.id
    ), 0) AS item_count
  FROM orders AS o
  JOIN users AS customer ON customer.id = o.user_id
  ORDER BY o.created_at DESC, o.id DESC
  LIMIT $1
`;

const recentPurchaseOrdersSql = `
  SELECT
    po.id,
    po.po_number,
    customer.name AS customer_name,
    po.status,
    po.created_at,
    COALESCE((
      SELECT SUM(item.quantity)::int
      FROM po_items AS item
      WHERE item.purchase_order_id = po.id
    ), 0) AS item_count,
    COALESCE((
      SELECT SUM(item.converted_quantity)::int
      FROM po_items AS item
      WHERE item.purchase_order_id = po.id
    ), 0) AS converted_item_count
  FROM purchase_orders AS po
  JOIN users AS customer ON customer.id = po.user_id
  ORDER BY po.created_at DESC, po.id DESC
  LIMIT $1
`;

const getDashboard = async (rangeDays) => {
  if (!RANGES.has(rangeDays)) {
    throw new Error("Unsupported dashboard range");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const summary = await client.query(summarySql);
    const trend = await client.query(trendSql, [rangeDays]);
    const statuses = await client.query(statusSql);
    const recentOrders = await client.query(recentOrdersSql, [RECENT_LIMIT]);
    const recentPurchaseOrders = await client.query(recentPurchaseOrdersSql, [RECENT_LIMIT]);
    await client.query("COMMIT");

    return {
      summary: summary.rows[0],
      ordersTrend: trend.rows,
      purchaseOrdersByStatus: statuses.rows,
      recentOrders: recentOrders.rows,
      recentPurchaseOrders: recentPurchaseOrders.rows
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      // The original query error is the one the caller needs.
    }

    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  getDashboard
};
