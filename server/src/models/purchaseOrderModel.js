const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const pool = require("../config/db");
const orderModel = require("./orderModel");
const { matchItems } = require("../services/productMatchingService");

const MAX_QUANTITY = 100000;

class PurchaseOrderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const serverRoot = path.resolve(__dirname, "../..");
const uploadDirectory = path.resolve(serverRoot, "uploads", "purchase-orders");

const ensureUploadDirectory = () => {
  fs.mkdirSync(uploadDirectory, { recursive: true });
};

const removeUploadedFile = async (absolutePath) => {
  if (!absolutePath) {
    return;
  }

  const resolved = path.resolve(absolutePath);
  const relativeToUpload = path.relative(uploadDirectory, resolved);

  if (relativeToUpload.startsWith("..") || path.isAbsolute(relativeToUpload)) {
    return;
  }

  await fs.promises.unlink(resolved).catch(() => {});
};

const resolveStoredUpload = (storedPath) => {
  if (typeof storedPath !== "string" || storedPath.includes("\0")) {
    return null;
  }

  const normalized = path.normalize(storedPath).replace(/^([/\\])+/, "");
  const prefix = path.join("uploads", "purchase-orders");

  if (normalized !== prefix && !normalized.startsWith(`${prefix}${path.sep}`)) {
    return null;
  }

  const absolutePath = path.resolve(serverRoot, normalized);
  const relativeToUpload = path.relative(uploadDirectory, absolutePath);

  if (relativeToUpload.startsWith("..") || path.isAbsolute(relativeToUpload) || relativeToUpload === "") {
    return null;
  }

  return absolutePath;
};

const findPurchaseOrderFile = async (id, ownerUserId) => {
  const params = [id];
  let ownerClause = "";

  if (ownerUserId !== null && ownerUserId !== undefined) {
    params.push(ownerUserId);
    ownerClause = ` AND user_id = $${params.length}`;
  }

  const result = await pool.query(
    `SELECT file_name, file_path
     FROM purchase_orders
     WHERE id = $1${ownerClause}`,
    params
  );
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    fileName: row.file_name,
    absolutePath: resolveStoredUpload(row.file_path)
  };
};

const toRelativeUploadPath = (absolutePath) => {
  const resolved = path.resolve(absolutePath);
  const relativeToUpload = path.relative(uploadDirectory, resolved);

  if (relativeToUpload.startsWith("..") || path.isAbsolute(relativeToUpload) || relativeToUpload === "") {
    const error = new Error("Invalid upload path");
    error.code = "INVALID_UPLOAD_PATH";
    throw error;
  }

  return path.join("uploads", "purchase-orders", relativeToUpload).replace(/\\/g, "/");
};

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
      // The original error is the one the caller needs.
    }

    throw error;
  } finally {
    client.release();
  }
};

const purchaseOrderSelect = `
  po.id,
  po.po_number,
  po.user_id,
  users.name AS customer_name,
  users.email AS customer_email,
  users.phone AS customer_phone,
  users.company_name AS customer_company_name,
  po.file_name,
  po.file_type,
  po.file_size,
  po.status,
  po.extracted_data,
  po.processing_error,
  po.processed_at,
  po.converted_order_id,
  orders.order_number AS converted_order_number,
  po.created_at,
  po.updated_at
`;

const attachItems = async (purchaseOrder, client) => {
  const itemResult = await client.query(
    `SELECT
       id,
       line_number,
       extracted_name,
       extracted_sku,
       description,
       quantity,
       unit,
       unit_price,
       line_total,
       raw_extracted_data,
       converted_order_id,
       converted_quantity,
       converted_at,
       created_at
     FROM po_items
     WHERE purchase_order_id = $1
     ORDER BY line_number ASC, id ASC`,
    [purchaseOrder.id]
  );

  const items = itemResult.rows;

  if (items.length === 0) {
    return { ...purchaseOrder, items: [] };
  }

  const matchResult = await client.query(
    `SELECT
       po_matches.id,
       po_matches.po_item_id,
       po_matches.product_id,
       products.name AS product_name,
       products.sku AS product_sku,
       po_matches.match_score,
       po_matches.match_status,
       po_matches.match_method,
       po_matches.match_reason,
       po_matches.is_selected,
       po_matches.reviewed_by,
       po_matches.reviewed_at,
       products.image_url AS product_image_url,
       products.brand AS product_brand,
       products.category AS product_category,
       products.description AS product_description,
       products.unit AS product_unit,
       products.price AS product_price,
       products.currency AS product_currency,
       products.stock_quantity AS product_stock_quantity,
       products.reorder_level AS product_reorder_level,
       products.is_active AS product_is_active
     FROM po_matches
     JOIN products ON products.id = po_matches.product_id
     WHERE po_matches.po_item_id = ANY($1::bigint[])
     ORDER BY po_matches.match_score DESC, po_matches.id ASC`,
    [items.map((item) => item.id)]
  );

  const matchesByItem = new Map();

  matchResult.rows.forEach((match) => {
    const current = matchesByItem.get(match.po_item_id) || [];
    current.push(match);
    matchesByItem.set(match.po_item_id, current);
  });

  return {
    ...purchaseOrder,
    items: items.map((item) => {
      return {
        ...item,
        matches: matchesByItem.get(item.id) || []
      };
    })
  };
};

const attachOrders = async (purchaseOrder, client) => {
  const orderResult = await client.query(
    `SELECT
       orders.id,
       orders.order_number,
       orders.status,
       orders.subtotal,
       orders.tax_amount,
       orders.shipping_charge,
       orders.total_amount,
       orders.created_at,
       (
         SELECT COUNT(*)::int
         FROM po_items
         WHERE po_items.purchase_order_id = $1
           AND po_items.converted_order_id = orders.id
       ) AS converted_line_count,
       (
         SELECT COALESCE(SUM(po_items.converted_quantity), 0)::int
         FROM po_items
         WHERE po_items.purchase_order_id = $1
           AND po_items.converted_order_id = orders.id
       ) AS converted_quantity,
       (
         SELECT COALESCE(SUM(order_items.quantity), 0)::int
         FROM order_items
         WHERE order_items.order_id = orders.id
       ) AS item_quantity
     FROM purchase_order_orders
     JOIN orders ON orders.id = purchase_order_orders.order_id
     WHERE purchase_order_orders.purchase_order_id = $1
     ORDER BY orders.id ASC`,
    [purchaseOrder.id]
  );

  return {
    ...purchaseOrder,
    orders: orderResult.rows
  };
};

const findPurchaseOrder = async (id, ownerUserId, client = pool) => {
  const params = [id];
  let ownerClause = "";

  if (ownerUserId !== null && ownerUserId !== undefined) {
    params.push(ownerUserId);
    ownerClause = ` AND po.user_id = $${params.length}`;
  }

  const result = await client.query(
    `SELECT ${purchaseOrderSelect}
     FROM purchase_orders po
     JOIN users ON users.id = po.user_id
     LEFT JOIN orders ON orders.id = po.converted_order_id
     WHERE po.id = $1${ownerClause}`,
    params
  );

  if (!result.rows[0]) {
    return null;
  }

  const purchaseOrder = await attachItems(result.rows[0], client);
  return attachOrders(purchaseOrder, client);
};

const listPurchaseOrders = async ({
  ownerUserId,
  status = null,
  searchPattern = null,
  fromDate = null,
  toDate = null,
  limit,
  offset
}) => {
  const filters = [];
  const params = [];

  if (ownerUserId !== null && ownerUserId !== undefined) {
    params.push(ownerUserId);
    filters.push(`po.user_id = $${params.length}`);
  }

  params.push(status);
  filters.push(`($${params.length}::text IS NULL OR po.status = $${params.length})`);
  params.push(fromDate);
  filters.push(`($${params.length}::date IS NULL OR po.created_at >= $${params.length}::date)`);
  params.push(toDate);
  filters.push(`($${params.length}::date IS NULL OR po.created_at < ($${params.length}::date + INTERVAL '1 day'))`);
  params.push(searchPattern);
  const searchIndex = params.length;
  filters.push(`(
    $${searchIndex}::text IS NULL
    OR po.po_number ILIKE $${searchIndex} ESCAPE '\\'
    OR po.file_name ILIKE $${searchIndex} ESCAPE '\\'
    OR users.name ILIKE $${searchIndex} ESCAPE '\\'
    OR users.email ILIKE $${searchIndex} ESCAPE '\\'
    OR COALESCE(users.company_name, '') ILIKE $${searchIndex} ESCAPE '\\'
    OR COALESCE(users.phone, '') ILIKE $${searchIndex} ESCAPE '\\'
  )`);

  const where = `WHERE ${filters.join(" AND ")}`;
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM purchase_orders po
     JOIN users ON users.id = po.user_id
     ${where}`,
    params
  );

  const listParams = params.slice();
  listParams.push(limit, offset);

  const listResult = await pool.query(
    `SELECT
       po.id,
       po.po_number,
       po.user_id,
       users.name AS customer_name,
       users.email AS customer_email,
       users.phone AS customer_phone,
       users.company_name AS customer_company_name,
       po.file_name,
       po.file_type,
       po.file_size,
       po.status,
       po.processing_error,
       po.processed_at,
       po.converted_order_id,
       orders.order_number AS converted_order_number,
       po.created_at,
       po.updated_at,
       COALESCE(line_summary.item_count, 0) AS item_count,
       COALESCE(line_summary.accepted_count, 0) AS accepted_count,
       COALESCE(line_summary.rejected_count, 0) AS rejected_count,
       COALESCE(line_summary.pending_count, 0) AS pending_count,
       COALESCE(line_summary.converted_count, 0) AS converted_count,
       COALESCE(line_summary.accepted_quantity, 0) AS accepted_quantity,
       COALESCE(line_summary.converted_quantity, 0) AS converted_quantity
     FROM purchase_orders po
     JOIN users ON users.id = po.user_id
     LEFT JOIN orders ON orders.id = po.converted_order_id
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*)::int AS item_count,
         COUNT(*) FILTER (WHERE item.converted_order_id IS NOT NULL)::int AS converted_count,
         COALESCE(SUM(item.converted_quantity) FILTER (WHERE item.converted_order_id IS NOT NULL), 0)::int AS converted_quantity,
         COUNT(*) FILTER (
           WHERE item.converted_order_id IS NULL
             AND COALESCE(review.selected_count, 0) = 1
         )::int AS accepted_count,
         COALESCE(SUM(item.quantity) FILTER (
           WHERE item.converted_order_id IS NULL
             AND COALESCE(review.selected_count, 0) = 1
         ), 0)::int AS accepted_quantity,
         COUNT(*) FILTER (
           WHERE item.converted_order_id IS NULL
             AND COALESCE(review.selected_count, 0) <> 1
             AND COALESCE(review.suggested_count, 0) = 0
             AND COALESCE(review.rejected_count, 0) > 0
         )::int AS rejected_count,
         COUNT(*) FILTER (
           WHERE item.converted_order_id IS NULL
             AND COALESCE(review.selected_count, 0) <> 1
             AND NOT (
               COALESCE(review.suggested_count, 0) = 0
               AND COALESCE(review.rejected_count, 0) > 0
             )
         )::int AS pending_count
       FROM po_items AS item
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (
             WHERE match.is_selected = true AND match.match_status = 'accepted'
           )::int AS selected_count,
           COUNT(*) FILTER (WHERE match.match_status = 'suggested')::int AS suggested_count,
           COUNT(*) FILTER (WHERE match.match_status = 'rejected')::int AS rejected_count
         FROM po_matches AS match
         WHERE match.po_item_id = item.id
       ) AS review ON true
       WHERE item.purchase_order_id = po.id
     ) AS line_summary ON true
     ${where}
     ORDER BY po.created_at DESC, po.id DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  return {
    purchaseOrders: listResult.rows,
    total: countResult.rows[0].total
  };
};

const countPurchaseOrdersByStatus = async ({ ownerUserId }) => {
  const params = [];
  let where = "";

  if (ownerUserId !== null && ownerUserId !== undefined) {
    params.push(ownerUserId);
    where = "WHERE po.user_id = $1";
  }

  const result = await pool.query(
    `SELECT po.status, COUNT(*)::int AS total
     FROM purchase_orders po
     ${where}
     GROUP BY po.status`,
    params
  );

  return result.rows;
};

const lineTotal = (quantity, unitPrice) => {
  const [whole, fraction = "00"] = String(unitPrice).split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  const total = cents * BigInt(quantity);
  const totalWhole = total / 100n;
  const totalFraction = (total % 100n).toString().padStart(2, "0");
  return `${totalWhole.toString()}.${totalFraction}`;
};

const savePurchaseOrder = async ({
  userId,
  fileName,
  absolutePath,
  fileType,
  fileSize,
  status,
  extractedData,
  processingError
}) => {
  const relativePath = toRelativeUploadPath(absolutePath);

  return withTransaction(async (client) => {
    const temporaryNumber = `BNC-TMP-${crypto.randomBytes(8).toString("hex")}`;
    const inserted = await client.query(
      `INSERT INTO purchase_orders (
         po_number,
         user_id,
         file_name,
         file_path,
         file_type,
         file_size,
         status,
         extracted_data,
         processing_error,
         processed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, now())
       RETURNING id`,
      [
        temporaryNumber,
        userId,
        fileName,
        relativePath,
        fileType,
        fileSize,
        status,
        extractedData ? JSON.stringify(extractedData) : null,
        processingError
      ]
    );

    const purchaseOrderId = inserted.rows[0].id;

    await client.query(
      `UPDATE purchase_orders
       SET po_number = 'BNC-PO-' || lpad(id::text, GREATEST(6, length(id::text)), '0'),
           updated_at = now()
       WHERE id = $1`,
      [purchaseOrderId]
    );

    if (status === "review_required" && extractedData && Array.isArray(extractedData.items)) {
      const productResult = await client.query(
        `SELECT id, name, sku
         FROM products
         WHERE is_active = true
         ORDER BY id ASC`
      );
      const matchedItems = matchItems(extractedData.items, productResult.rows);

      for (const item of matchedItems) {
        const itemResult = await client.query(
          `INSERT INTO po_items (
             purchase_order_id,
             line_number,
             extracted_name,
             extracted_sku,
             description,
             quantity,
             unit,
             unit_price,
             line_total,
             raw_extracted_data
           )
           VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9::jsonb)
           RETURNING id`,
          [
            purchaseOrderId,
            item.line_number,
            item.product_name,
            item.sku,
            item.quantity,
            item.unit,
            item.unit_price,
            lineTotal(item.quantity, item.unit_price),
            JSON.stringify({
              mock: extractedData.mock === true,
              line_number: item.line_number,
              product_name: item.product_name,
              sku: item.sku,
              quantity: item.quantity,
              unit: item.unit,
              unit_price: item.unit_price
            })
          ]
        );

        for (const match of item.matches) {
          await client.query(
            `INSERT INTO po_matches (
               po_item_id,
               product_id,
               match_score,
               match_status,
               match_method,
               match_reason,
               is_selected
             )
             VALUES ($1, $2, $3, 'suggested', $4, $5, false)`,
            [
              itemResult.rows[0].id,
              match.productId,
              match.matchScore,
              match.matchMethod,
              match.matchReason
            ]
          );
        }
      }
    }

    return findPurchaseOrder(purchaseOrderId, userId, client);
  });
};

const lockPurchaseOrder = async (client, purchaseOrderId, ownerUserId) => {
  const params = [purchaseOrderId];
  let ownerClause = "";

  if (ownerUserId !== null && ownerUserId !== undefined) {
    params.push(ownerUserId);
    ownerClause = ` AND user_id = $${params.length}`;
  }

  const result = await client.query(
    `SELECT id, user_id, status, converted_order_id, po_number
     FROM purchase_orders
     WHERE id = $1${ownerClause}
     FOR UPDATE`,
    params
  );

  return result.rows[0] || null;
};

const assertReviewable = (purchaseOrder) => {
  if (!purchaseOrder) {
    throw new PurchaseOrderError(404, "Purchase order not found");
  }

  if (purchaseOrder.status !== "review_required" && purchaseOrder.status !== "partially_converted") {
    throw new PurchaseOrderError(409, "Purchase order cannot be reviewed");
  }
};

const lockPurchaseOrderItem = async (client, purchaseOrderId, itemId) => {
  const result = await client.query(
    `SELECT id, line_number, quantity, converted_order_id
     FROM po_items
     WHERE id = $1
       AND purchase_order_id = $2
     FOR UPDATE`,
    [itemId, purchaseOrderId]
  );

  return result.rows[0] || null;
};

const reviewMatch = async ({
  purchaseOrderId,
  itemId,
  ownerUserId,
  reviewerId,
  action,
  productId
}) => {
  return withTransaction(async (client) => {
    try {
      const purchaseOrder = await lockPurchaseOrder(client, purchaseOrderId, ownerUserId);
      assertReviewable(purchaseOrder);

      const item = await lockPurchaseOrderItem(client, purchaseOrderId, itemId);

      if (!item) {
        throw new PurchaseOrderError(404, "Purchase order item not found");
      }

      if (item.converted_order_id) {
        throw new PurchaseOrderError(409, "This line has already been converted");
      }

      if (action === "reject") {
        const rejected = await client.query(
          `UPDATE po_matches
           SET match_status = 'rejected',
               is_selected = false,
               reviewed_by = $3,
               reviewed_at = now()
           WHERE po_item_id = $1
             AND product_id = $2
           RETURNING id`,
          [itemId, productId, reviewerId]
        );

        if (!rejected.rows[0]) {
          throw new PurchaseOrderError(404, "Match not found");
        }
      } else {
        const product = await client.query(
          `SELECT id
           FROM products
           WHERE id = $1
             AND is_active = true`,
          [productId]
        );

        if (!product.rows[0]) {
          throw new PurchaseOrderError(400, "This product is no longer available. Please choose another product.");
        }

        await client.query(
          `UPDATE po_matches
           SET is_selected = false
           WHERE po_item_id = $1
             AND is_selected = true
             AND product_id <> $2`,
          [itemId, productId]
        );

        await client.query(
          `INSERT INTO po_matches (
             po_item_id,
             product_id,
             match_score,
             match_status,
             match_method,
             match_reason,
             is_selected,
             reviewed_by,
             reviewed_at
           )
           VALUES (
             $1,
             $2,
             NULL,
             'accepted',
             'manual',
             'Manually selected by the reviewer. This is the only selected product for the line.',
             true,
             $3,
             now()
           )
           ON CONFLICT (po_item_id, product_id) DO UPDATE
           SET match_status = 'accepted',
               is_selected = true,
               reviewed_by = EXCLUDED.reviewed_by,
               reviewed_at = now()`,
          [itemId, productId, reviewerId]
        );
      }

      return findPurchaseOrder(purchaseOrderId, ownerUserId, client);
    } catch (error) {
      if (error.code === "23505" && error.constraint === "idx_po_matches_one_selected_per_item") {
        throw new PurchaseOrderError(409, "Only one product can be selected for this line");
      }

      throw error;
    }
  });
};

const readItemQuantity = (item) => {
  const quantity = Number(item.quantity);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new PurchaseOrderError(400, "Purchase order item quantity is invalid");
  }

  return quantity;
};

const confirmPurchaseOrder = async ({
  purchaseOrderId,
  ownerUserId,
  shippingAddress,
  billingAddress,
  notes
}) => {
  return withTransaction(async (client) => {
    const purchaseOrder = await lockPurchaseOrder(client, purchaseOrderId, ownerUserId);

    if (!purchaseOrder) {
      throw new PurchaseOrderError(404, "Purchase order not found");
    }

    if (purchaseOrder.status === "confirmed") {
      throw new PurchaseOrderError(409, "Purchase order is already confirmed");
    }

    if (purchaseOrder.status !== "review_required" && purchaseOrder.status !== "partially_converted") {
      throw new PurchaseOrderError(409, "Purchase order cannot be confirmed");
    }

    const itemResult = await client.query(
      `SELECT id, line_number, quantity, converted_order_id
       FROM po_items
       WHERE purchase_order_id = $1
       ORDER BY line_number ASC, id ASC
       FOR UPDATE`,
      [purchaseOrderId]
    );
    const items = itemResult.rows;

    if (items.length === 0) {
      throw new PurchaseOrderError(400, "Purchase order has no items to confirm");
    }

    const matchResult = await client.query(
      `SELECT
         po_matches.po_item_id,
         po_matches.product_id,
         po_matches.is_selected,
         po_matches.match_status,
         products.is_active
       FROM po_matches
       LEFT JOIN products ON products.id = po_matches.product_id
       WHERE po_matches.po_item_id = ANY($1::bigint[])
       FOR UPDATE OF po_matches`,
      [items.map((item) => item.id)]
    );
    const quantitiesByProduct = new Map();
    const convertibleIds = [];

    items.forEach((item) => {
      if (item.converted_order_id) {
        return;
      }

      const matches = matchResult.rows.filter((match) => String(match.po_item_id) === String(item.id));
      const selected = matches.filter((match) => match.is_selected === true && match.match_status === "accepted");

      if (selected.length > 1) {
        throw new PurchaseOrderError(409, `Line ${item.line_number} has more than one selected product`);
      }

      if (selected.length === 1 && selected[0].is_active !== true) {
        throw new PurchaseOrderError(400, "This product is no longer available. Please choose another product.");
      }

      if (selected.length !== 1) {
        return;
      }

      const quantity = readItemQuantity(item);
      const productId = String(selected[0].product_id);
      const combined = (quantitiesByProduct.get(productId) || 0) + quantity;

      if (combined > MAX_QUANTITY) {
        throw new PurchaseOrderError(400, "Quantity is too large");
      }

      quantitiesByProduct.set(productId, combined);
      convertibleIds.push(item.id);
    });

    if (convertibleIds.length === 0) {
      const convertedCount = items.filter((item) => item.converted_order_id).length;

      if (convertedCount > 0) {
        throw new PurchaseOrderError(409, "These matched items have already been converted");
      }

      throw new PurchaseOrderError(400, "No accepted items are ready to convert.");
    }

    let order;

    try {
      order = await orderModel.createOrderInTransaction(client, {
        userId: String(purchaseOrder.user_id),
        items: [...quantitiesByProduct.entries()].map(([productId, quantity]) => {
          return { productId, quantity };
        }),
        shippingAddress,
        billingAddress,
        notes,
        paymentMethod: "pay_later",
        stockMovement: {
          type: "po_conversion_deduction",
          referenceType: "purchase_order",
          referenceId: String(purchaseOrderId),
          remarks: `Stock deducted for purchase order ${purchaseOrder.po_number}`
        }
      });
    } catch (error) {
      if (error instanceof orderModel.OrderError) {
        const message = /inactive or do not exist/i.test(error.message)
          ? "This product is no longer available. Please choose another product."
          : error.message;
        throw new PurchaseOrderError(error.status, message);
      }

      throw error;
    }

    const marked = await client.query(
      `UPDATE po_items
       SET converted_order_id = $2,
           converted_quantity = quantity,
           converted_at = now()
       WHERE purchase_order_id = $1
         AND id = ANY($3::bigint[])
         AND converted_order_id IS NULL
       RETURNING id`,
      [purchaseOrderId, order.id, convertibleIds]
    );

    if (marked.rowCount !== convertibleIds.length) {
      throw new PurchaseOrderError(409, "These matched items have already been converted");
    }

    await client.query(
      `INSERT INTO purchase_order_orders (purchase_order_id, order_id)
       VALUES ($1, $2)`,
      [purchaseOrderId, order.id]
    );

    const remainingResult = await client.query(
      `SELECT COUNT(*)::int AS remaining
       FROM po_items
       WHERE purchase_order_id = $1
         AND converted_order_id IS NULL`,
      [purchaseOrderId]
    );
    const remainingLineCount = remainingResult.rows[0].remaining;
    const nextStatus = remainingLineCount === 0 ? "confirmed" : "partially_converted";
    const linked = await client.query(
      `UPDATE purchase_orders
       SET status = $2,
           converted_order_id = $3,
           updated_at = now()
       WHERE id = $1
         AND status IN ('review_required', 'partially_converted')
       RETURNING id`,
      [purchaseOrderId, nextStatus, order.id]
    );

    if (!linked.rows[0]) {
      throw new PurchaseOrderError(409, "Purchase order is already confirmed");
    }

    return {
      purchaseOrder: await findPurchaseOrder(purchaseOrderId, ownerUserId, client),
      order,
      convertedLineCount: marked.rowCount,
      remainingLineCount
    };
  });
};

module.exports = {
  PurchaseOrderError,
  uploadDirectory,
  ensureUploadDirectory,
  removeUploadedFile,
  findPurchaseOrder,
  findPurchaseOrderFile,
  listPurchaseOrders,
  countPurchaseOrdersByStatus,
  savePurchaseOrder,
  reviewMatch,
  confirmPurchaseOrder
};
