const dashboardModel = require("../models/dashboardModel");

const ORDER_STATUSES = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
const PURCHASE_ORDER_STATUSES = ["uploaded", "processing", "review_required", "partially_converted", "confirmed", "failed"];

const sendError = (res, status, message) => {
  return res.status(status).json({
    success: false,
    message
  });
};

const databaseUnavailable = (error) => {
  const code = error && error.code;
  const message = error && typeof error.message === "string" ? error.message : "";

  return (
    code === "53300" ||
    code === "57P03" ||
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    message.includes("too many clients") ||
    message.includes("timeout exceeded when trying to connect")
  );
};

const readRange = (value) => {
  if (value === undefined || value === "") {
    return { value: 30 };
  }

  if (typeof value !== "string" || !/^(7|30|90)$/.test(value)) {
    return { error: "Date range must be 7, 30, or 90 days" };
  }

  return { value: Number(value) };
};

const asCount = (value) => {
  const number = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(number) || number < 0) {
    return null;
  }

  return number;
};

const asId = (value) => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }

  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    return value;
  }

  return null;
};

const asMoney = (value) => {
  const text = typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(2)
    : String(value ?? "");

  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return null;
  }

  const [whole, fraction = ""] = text.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
};

const asTimestamp = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

const asName = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const mapSummary = (row) => {
  const summary = {
    totalCustomers: asCount(row && row.total_customers),
    activeProducts: asCount(row && row.active_products),
    totalOrders: asCount(row && row.total_orders),
    pendingOrders: asCount(row && row.pending_orders),
    totalPurchaseOrders: asCount(row && row.total_purchase_orders),
    partiallyConvertedPurchaseOrders: asCount(row && row.partially_converted_purchase_orders)
  };

  if (Object.values(summary).some((value) => value === null)) {
    return null;
  }

  if (summary.pendingOrders > summary.totalOrders) {
    return null;
  }

  if (summary.partiallyConvertedPurchaseOrders > summary.totalPurchaseOrders) {
    return null;
  }

  return summary;
};

const mapTrend = (rows, rangeDays) => {
  if (!Array.isArray(rows) || rows.length !== rangeDays) {
    return null;
  }

  const points = [];

  for (const row of rows) {
    const count = asCount(row.count);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || count === null) {
      return null;
    }

    points.push({ date: row.date, count });
  }

  return points;
};

const mapStatuses = (rows) => {
  if (!Array.isArray(rows)) {
    return null;
  }

  const counts = new Map();

  for (const row of rows) {
    const count = asCount(row.count);

    if (!PURCHASE_ORDER_STATUSES.includes(row.status) || count === null || counts.has(row.status)) {
      return null;
    }

    counts.set(row.status, count);
  }

  if (counts.size !== PURCHASE_ORDER_STATUSES.length) {
    return null;
  }

  return PURCHASE_ORDER_STATUSES.map((status) => ({
    status,
    count: counts.get(status)
  }));
};

const mapRecentOrders = (rows) => {
  if (!Array.isArray(rows) || rows.length > 5) {
    return null;
  }

  const orders = [];

  for (const row of rows) {
    const id = asId(row.id);
    const itemCount = asCount(row.item_count);
    const totalAmount = asMoney(row.total_amount);
    const createdAt = asTimestamp(row.created_at);

    if (!id || itemCount === null || !totalAmount || !createdAt || !ORDER_STATUSES.includes(row.status)) {
      return null;
    }

    if (typeof row.order_number !== "string" || !row.order_number.trim()) {
      return null;
    }

    orders.push({
      id,
      orderNumber: row.order_number,
      customerName: asName(row.customer_name),
      itemCount,
      totalAmount,
      currency: "INR",
      status: row.status,
      createdAt
    });
  }

  return orders;
};

const mapRecentPurchaseOrders = (rows) => {
  if (!Array.isArray(rows) || rows.length > 5) {
    return null;
  }

  const purchaseOrders = [];

  for (const row of rows) {
    const id = asId(row.id);
    const itemCount = asCount(row.item_count);
    const convertedItemCount = asCount(row.converted_item_count);
    const createdAt = asTimestamp(row.created_at);

    if (!id || itemCount === null || convertedItemCount === null || convertedItemCount > itemCount || !createdAt) {
      return null;
    }

    if (!PURCHASE_ORDER_STATUSES.includes(row.status)) {
      return null;
    }

    if (typeof row.po_number !== "string" || !row.po_number.trim()) {
      return null;
    }

    purchaseOrders.push({
      id,
      poNumber: row.po_number,
      customerName: asName(row.customer_name),
      itemCount,
      convertedItemCount,
      status: row.status,
      createdAt
    });
  }

  return purchaseOrders;
};

const getStats = async (req, res) => {
  try {
    if (Array.isArray(req.query.range)) {
      return sendError(res, 400, "Date range must be a single value");
    }

    const range = readRange(req.query.range);

    if (range.error) {
      return sendError(res, 400, range.error);
    }

    const result = await dashboardModel.getDashboard(range.value);
    const summary = mapSummary(result.summary);
    const ordersTrend = mapTrend(result.ordersTrend, range.value);
    const purchaseOrdersByStatus = mapStatuses(result.purchaseOrdersByStatus);
    const recentOrders = mapRecentOrders(result.recentOrders);
    const recentPurchaseOrders = mapRecentPurchaseOrders(result.recentPurchaseOrders);
    const statusTotal = purchaseOrdersByStatus
      ? purchaseOrdersByStatus.reduce((total, item) => total + item.count, 0)
      : null;
    const partial = purchaseOrdersByStatus
      ? purchaseOrdersByStatus.find((item) => item.status === "partially_converted")
      : null;
    const partialCount = partial ? partial.count : 0;

    if (
      !summary ||
      !ordersTrend ||
      !purchaseOrdersByStatus ||
      !recentOrders ||
      !recentPurchaseOrders ||
      statusTotal !== summary.totalPurchaseOrders ||
      partialCount !== summary.partiallyConvertedPurchaseOrders
    ) {
      console.error("Dashboard stats failed", "invalid aggregate");
      return sendError(res, 500, "Internal server error");
    }

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      success: true,
      data: {
        summary,
        rangeDays: range.value,
        ordersTrend,
        purchaseOrdersByStatus,
        recentOrders,
        recentPurchaseOrders
      }
    });
  } catch (error) {
    if (databaseUnavailable(error)) {
      console.error("Dashboard stats failed", error.code || "connection failure");
      return sendError(res, 503, "Database is temporarily unavailable");
    }

    console.error("Dashboard stats failed", error && error.code ? error.code : "query failure");
    return sendError(res, 500, "Internal server error");
  }
};

module.exports = {
  getStats
};
