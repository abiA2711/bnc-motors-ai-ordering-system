const crypto = require("crypto");

const pool = require("../config/db");
const inventoryModel = require("./inventoryModel");

// The schema stores tax and shipping, but it has no rate table.
// Both are calculated in PostgreSQL NUMERIC. The current rates are zero.
const TAX_RATE = "0.00";
const SHIPPING_CHARGE = "0.00";
const STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: []
};

const ORDER_FIELDS = `
  o.id,
  o.order_number,
  o.user_id,
  o.subtotal,
  o.tax_amount,
  o.shipping_charge,
  o.total_amount,
  o.status,
  o.payment_method,
  o.payment_status,
  o.shipping_address,
  o.billing_address,
  o.notes,
  o.created_at,
  o.updated_at
`;

class OrderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const withTransaction = async (work) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Order rollback failed");
    }

    throw error;
  } finally {
    client.release();
  }
};

const mapOrder = (row) => {
  const order = {
    id: row.id,
    order_number: row.order_number,
    user_id: row.user_id,
    subtotal: row.subtotal,
    tax_amount: row.tax_amount,
    shipping_charge: row.shipping_charge,
    total_amount: row.total_amount,
    status: row.status,
    payment_method: row.payment_method,
    payment_status: row.payment_status,
    shipping_address: row.shipping_address,
    billing_address: row.billing_address,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    items: row.items || []
  };

  if (row.customer_id) {
    order.customer = {
      id: row.customer_id,
      name: row.customer_name,
      email: row.customer_email,
      phone: row.customer_phone,
      company_name: row.customer_company_name
    };
  }

  if (Object.prototype.hasOwnProperty.call(row, "linked_purchase_order_id")) {
    if (row.linked_purchase_order_id) {
      order.source = "purchase_order";
      order.purchase_order = {
        id: row.linked_purchase_order_id,
        po_number: row.linked_po_number
      };
    } else {
      order.source = "cart_checkout";
      order.purchase_order = null;
    }
  }

  return order;
};

const PURCHASE_ORDER_JOIN = `
  LEFT JOIN purchase_order_orders AS po_link ON po_link.order_id = o.id
  LEFT JOIN purchase_orders AS linked_po ON linked_po.id = po_link.purchase_order_id
`;

const PURCHASE_ORDER_FIELDS = `,
  linked_po.id AS linked_purchase_order_id,
  linked_po.po_number AS linked_po_number`;

const attachItems = async (orders, queryable = pool) => {
  if (orders.length === 0) {
    return [];
  }

  const result = await queryable.query(
    `SELECT
       id,
       order_id,
       product_id,
       product_name,
       product_sku,
       quantity,
       unit_price,
       line_total,
       tax_amount,
       created_at
     FROM order_items
     WHERE order_id = ANY($1::bigint[])
     ORDER BY id ASC`,
    [orders.map((order) => order.id)]
  );
  const itemsByOrder = new Map();

  result.rows.forEach((item) => {
    const key = String(item.order_id);
    const items = itemsByOrder.get(key) || [];
    items.push(item);
    itemsByOrder.set(key, items);
  });

  return orders.map((order) => ({
    ...mapOrder(order),
    items: itemsByOrder.get(String(order.id)) || []
  }));
};

const createOrderInTransaction = async (client, { userId, items, shippingAddress, billingAddress, notes, paymentMethod, stockMovement = null }) => {
    const method = paymentMethod === undefined || paymentMethod === null || paymentMethod === ""
      ? "pay_later"
      : paymentMethod;

    if (method !== "pay_later" && method !== "cod") {
      throw new OrderError(400, "Payment method must be pay_later or cod");
    }

    const userResult = await client.query(
      `SELECT id, is_active
       FROM users
       WHERE id = $1`,
      [userId]
    );
    const user = userResult.rows[0];

    if (!user || !user.is_active) {
      throw new OrderError(403, "Account is inactive");
    }

    const productIds = items.map((item) => item.productId);
    const quantities = items.map((item) => item.quantity);
    const locked = await client.query(
      `SELECT id, name, sku, price, stock_quantity, is_active
       FROM products
       WHERE id = ANY($1::bigint[])
       ORDER BY id
       FOR UPDATE`,
      [productIds]
    );
    const productsById = new Map(locked.rows.map((product) => [String(product.id), product]));

    items.forEach((item) => {
      const product = productsById.get(item.productId);

      if (!product || !product.is_active) {
        throw new OrderError(400, "One or more products are inactive or do not exist");
      }

      if (product.stock_quantity < item.quantity) {
        throw new OrderError(400, `Insufficient stock for ${product.name}`);
      }
    });

    const temporaryNumber = `BNC-TMP-${crypto.randomBytes(8).toString("hex")}`;
    const inserted = await client.query(
      `INSERT INTO orders (
         order_number,
         user_id,
         subtotal,
         tax_amount,
         shipping_charge,
         total_amount,
         status,
         payment_method,
         payment_status,
         shipping_address,
         billing_address,
         notes
       )
       VALUES ($1, $2, 0, 0, 0, 0, 'pending', $3, 'pending', $4::jsonb, $5::jsonb, $6)
       RETURNING id`,
      [
        temporaryNumber,
        userId,
        method,
        shippingAddress === null ? null : JSON.stringify(shippingAddress),
        billingAddress === null ? null : JSON.stringify(billingAddress),
        notes
      ]
    );
    const orderId = inserted.rows[0].id;

    await client.query(
      `INSERT INTO order_items (
         order_id,
         product_id,
         product_name,
         product_sku,
         quantity,
         unit_price,
         line_total,
         tax_amount
       )
       SELECT
         $1,
         product.id,
         product.name,
         product.sku,
         line.quantity,
         product.price,
         round(product.price * line.quantity, 2),
         round(round(product.price * line.quantity, 2) * $4::numeric, 2)
       FROM unnest($2::bigint[], $3::int[]) AS line(product_id, quantity)
       JOIN products AS product ON product.id = line.product_id`,
      [orderId, productIds, quantities, TAX_RATE]
    );

    const stockUpdate = await client.query(
      `UPDATE products AS product
       SET stock_quantity = product.stock_quantity - line.quantity,
           updated_at = now()
       FROM unnest($1::bigint[], $2::int[]) AS line(product_id, quantity)
       WHERE product.id = line.product_id
         AND product.is_active = true
         AND product.stock_quantity >= line.quantity`,
      [productIds, quantities]
    );

    if (stockUpdate.rowCount !== items.length) {
      throw new OrderError(400, "Insufficient stock");
    }

    const updated = await client.query(
      `UPDATE orders AS current_order
       SET
         order_number = 'BNC-ORD-' || lpad(current_order.id::text, GREATEST(6, length(current_order.id::text)), '0'),
         subtotal = totals.subtotal,
         tax_amount = totals.tax_amount,
         shipping_charge = totals.shipping_charge,
         total_amount = totals.subtotal + totals.tax_amount + totals.shipping_charge,
         updated_at = now()
       FROM (
         SELECT
           round(COALESCE(sum(line_total), 0), 2)::numeric(12,2) AS subtotal,
           round(COALESCE(sum(tax_amount), 0), 2)::numeric(12,2) AS tax_amount,
           $2::numeric(12,2) AS shipping_charge
         FROM order_items
         WHERE order_id = $1
       ) AS totals
       WHERE current_order.id = $1
       RETURNING
         current_order.id,
         current_order.order_number,
         current_order.user_id,
         current_order.subtotal,
         current_order.tax_amount,
         current_order.shipping_charge,
         current_order.total_amount,
         current_order.status,
         current_order.payment_method,
         current_order.payment_status,
         current_order.shipping_address,
         current_order.billing_address,
         current_order.notes,
         current_order.created_at,
         current_order.updated_at`,
      [orderId, SHIPPING_CHARGE]
    );

    const orderNumber = updated.rows[0].order_number;
    const movementType = stockMovement && stockMovement.type ? stockMovement.type : "order_deduction";
    const referenceType = stockMovement && stockMovement.referenceType ? stockMovement.referenceType : "order";
    const referenceId = stockMovement && stockMovement.referenceId ? stockMovement.referenceId : orderId;
    const remarks = stockMovement && stockMovement.remarks
      ? stockMovement.remarks
      : `Stock deducted for order ${orderNumber}`;

    await inventoryModel.recordMovements(client, items.map((item) => {
      const product = productsById.get(item.productId);
      const previous = Number(product.stock_quantity);
      const quantity = Number(item.quantity);

      return {
        productId: item.productId,
        type: movementType,
        previous,
        quantity,
        next: previous - quantity,
        remarks,
        referenceType,
        referenceId,
        relatedOrderId: orderId,
        userId
      };
    }));

    const [order] = await attachItems(updated.rows, client);
    return order;
};

const createOrder = async (params) => {
  return withTransaction((client) => createOrderInTransaction(client, params));
};

const listOrders = async ({
  userId,
  status,
  limit,
  offset,
  includeCustomer,
  searchPattern = null,
  fromDate = null,
  toDate = null,
  searchItems = false,
  source = null
}) => {
  const filters = [
    "($1::bigint IS NULL OR o.user_id = $1)",
    "($2::text IS NULL OR o.status = $2)",
    "($3::date IS NULL OR o.created_at >= $3::date)",
    "($4::date IS NULL OR o.created_at < ($4::date + INTERVAL '1 day'))"
  ];
  const values = [userId, status, fromDate, toDate];

  if (includeCustomer) {
    values.push(searchPattern);
    const searchIndex = values.length;
    filters.push(`(
      $${searchIndex}::text IS NULL
      OR o.order_number ILIKE $${searchIndex} ESCAPE '\\'
      OR customer.name ILIKE $${searchIndex} ESCAPE '\\'
      OR customer.email ILIKE $${searchIndex} ESCAPE '\\'
      OR COALESCE(customer.company_name, '') ILIKE $${searchIndex} ESCAPE '\\'
      OR COALESCE(customer.phone, '') ILIKE $${searchIndex} ESCAPE '\\'
    )`);

    if (source) {
      values.push(source);
      const sourceIndex = values.length;
      filters.push(`(
        ($${sourceIndex}::text = 'purchase_order' AND po_link.order_id IS NOT NULL)
        OR ($${sourceIndex}::text = 'cart_checkout' AND po_link.order_id IS NULL)
      )`);
    }
  } else if (searchItems && searchPattern) {
    values.push(searchPattern);
    const searchIndex = values.length;
    filters.push(`(
      o.order_number ILIKE $${searchIndex} ESCAPE '\\'
      OR EXISTS (
        SELECT 1
        FROM order_items AS item
        WHERE item.order_id = o.id
          AND (
            item.product_name ILIKE $${searchIndex} ESCAPE '\\'
            OR COALESCE(item.product_sku, '') ILIKE $${searchIndex} ESCAPE '\\'
          )
      )
    )`);
  }

  const where = `WHERE ${filters.join(" AND ")}`;
  const limitIndex = values.length + 1;
  const offsetIndex = values.length + 2;
  const customerFields = includeCustomer
    ? `,
      customer.id AS customer_id,
      customer.name AS customer_name,
      customer.email AS customer_email,
      customer.phone AS customer_phone,
      customer.company_name AS customer_company_name`
    : "";
  const customerJoin = includeCustomer
    ? "JOIN users AS customer ON customer.id = o.user_id"
    : "";
  const sourceJoin = includeCustomer ? PURCHASE_ORDER_JOIN : "";
  const sourceFields = includeCustomer ? PURCHASE_ORDER_FIELDS : "";

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM orders AS o
     ${customerJoin}
     ${sourceJoin}
     ${where}`,
    values
  );
  const listResult = await pool.query(
    `SELECT ${ORDER_FIELDS}
            ${customerFields}
            ${sourceFields}
     FROM orders AS o
     ${customerJoin}
     ${sourceJoin}
     ${where}
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    [...values, limit, offset]
  );
  const orders = await attachItems(listResult.rows);

  return {
    total: countResult.rows[0].total,
    orders
  };
};

const countOrderStatuses = async () => {
  const result = await pool.query(
    `SELECT status, COUNT(*)::int AS total
     FROM orders
     GROUP BY status`
  );

  return result.rows;
};

const countOrderSources = async () => {
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE po_link.order_id IS NULL)::int AS cart_checkout,
       COUNT(*) FILTER (WHERE po_link.order_id IS NOT NULL)::int AS purchase_order
     FROM orders AS o
     LEFT JOIN purchase_order_orders AS po_link ON po_link.order_id = o.id`
  );

  return result.rows[0];
};

const countMyOrderStatuses = async ({ userId, searchPattern = null, fromDate = null, toDate = null }) => {
  const filters = [
    "o.user_id = $1",
    "($2::date IS NULL OR o.created_at >= $2::date)",
    "($3::date IS NULL OR o.created_at < ($3::date + INTERVAL '1 day'))"
  ];
  const values = [userId, fromDate, toDate];

  if (searchPattern) {
    values.push(searchPattern);
    const searchIndex = values.length;
    filters.push(`(
      o.order_number ILIKE $${searchIndex} ESCAPE '\\'
      OR EXISTS (
        SELECT 1
        FROM order_items AS item
        WHERE item.order_id = o.id
          AND (
            item.product_name ILIKE $${searchIndex} ESCAPE '\\'
            OR COALESCE(item.product_sku, '') ILIKE $${searchIndex} ESCAPE '\\'
          )
      )
    )`);
  }

  const result = await pool.query(
    `SELECT o.status, COUNT(*)::int AS total
     FROM orders AS o
     WHERE ${filters.join(" AND ")}
     GROUP BY o.status`,
    values
  );

  return result.rows;
};

const findOrder = async ({ orderId, userId }) => {
  const result = await pool.query(
    `SELECT ${ORDER_FIELDS},
            customer.id AS customer_id,
            customer.name AS customer_name,
            customer.email AS customer_email,
            customer.phone AS customer_phone,
            customer.company_name AS customer_company_name
            ${PURCHASE_ORDER_FIELDS}
     FROM orders AS o
     JOIN users AS customer ON customer.id = o.user_id
     ${PURCHASE_ORDER_JOIN}
     WHERE o.id = $1
       AND ($2::bigint IS NULL OR o.user_id = $2)`,
    [orderId, userId]
  );

  if (!result.rows[0]) {
    return null;
  }

  const [order] = await attachItems(result.rows);
  return order;
};

const updateStatus = async ({ orderId, status, updatedBy = null }) => {
  return withTransaction(async (client) => {
    const currentResult = await client.query(
      `SELECT id, status, order_number
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [orderId]
    );
    const current = currentResult.rows[0];

    if (!current) {
      throw new OrderError(404, "Order not found");
    }

    const allowed = STATUS_TRANSITIONS[current.status] || [];

    if (!allowed.includes(status)) {
      throw new OrderError(400, `Cannot change an order from ${current.status} to ${status}`);
    }

    if (status === "cancelled") {
      const items = await client.query(
        `SELECT product_id, quantity
         FROM order_items
         WHERE order_id = $1
         ORDER BY product_id`,
        [orderId]
      );
      const productIds = items.rows.map((item) => item.product_id);
      const quantities = items.rows.map((item) => item.quantity);

      if (productIds.length > 0) {
        const lockedProducts = await client.query(
          `SELECT id, stock_quantity
           FROM products
           WHERE id = ANY($1::bigint[])
           ORDER BY id
           FOR UPDATE`,
          [productIds]
        );
        const restored = await client.query(
          `UPDATE products AS product
           SET stock_quantity = product.stock_quantity + line.quantity,
               updated_at = now()
           FROM unnest($1::bigint[], $2::int[]) AS line(product_id, quantity)
           WHERE product.id = line.product_id`,
          [productIds, quantities]
        );

        if (restored.rowCount !== productIds.length) {
          throw new OrderError(409, "Stock could not be restored for this order");
        }

        const quantityByProduct = new Map(items.rows.map((item) => [String(item.product_id), Number(item.quantity)]));

        await inventoryModel.recordMovements(client, lockedProducts.rows.map((product) => {
          const previous = Number(product.stock_quantity);
          const quantity = quantityByProduct.get(String(product.id));

          return {
            productId: product.id,
            type: "order_restoration",
            previous,
            quantity,
            next: previous + quantity,
            remarks: `Stock restored after cancelling order ${current.order_number}`,
            referenceType: "order",
            referenceId: orderId,
            relatedOrderId: orderId,
            userId: updatedBy
          };
        }));
      }
    }

    const updated = await client.query(
      `UPDATE orders
       SET status = $2,
           updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [orderId, status]
    );

    if (!updated.rows[0]) {
      throw new OrderError(404, "Order not found");
    }

    return findOrderWithClient(client, orderId);
  });
};

const findOrderWithClient = async (client, orderId) => {
  const result = await client.query(
    `SELECT ${ORDER_FIELDS},
            customer.id AS customer_id,
            customer.name AS customer_name,
            customer.email AS customer_email,
            customer.phone AS customer_phone,
            customer.company_name AS customer_company_name
            ${PURCHASE_ORDER_FIELDS}
     FROM orders AS o
     JOIN users AS customer ON customer.id = o.user_id
     ${PURCHASE_ORDER_JOIN}
     WHERE o.id = $1`,
    [orderId]
  );
  const [order] = await attachItems(result.rows, client);
  return order;
};

module.exports = {
  OrderError,
  withTransaction,
  createOrder,
  createOrderInTransaction,
  listOrders,
  countOrderStatuses,
  countOrderSources,
  countMyOrderStatuses,
  findOrder,
  updateStatus,
  TAX_RATE,
  SHIPPING_CHARGE,
  STATUS_TRANSITIONS
};
