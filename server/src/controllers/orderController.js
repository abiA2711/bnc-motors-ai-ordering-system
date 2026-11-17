const orderModel = require("../models/orderModel");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MAX_ITEMS = 50;
const MAX_QUANTITY = 100000;
const ORDER_STATUSES = Object.keys(orderModel.STATUS_TRANSITIONS);

const sendError = (res, status, message) => {
  return res.status(status).json({
    success: false,
    message
  });
};

const parsePositiveId = (value) => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }

  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    return value;
  }

  return null;
};

const parsePage = (value) => {
  if (value === undefined) {
    return { value: DEFAULT_PAGE };
  }

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return { error: "Page must be a positive whole number" };
  }

  const page = Number(value);

  if (!Number.isSafeInteger(page)) {
    return { error: "Page must be a positive whole number" };
  }

  return { value: page };
};

const parseLimit = (value) => {
  if (value === undefined) {
    return { value: DEFAULT_LIMIT };
  }

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return { error: "Limit must be a positive whole number" };
  }

  const limit = Number(value);

  if (!Number.isSafeInteger(limit) || limit > MAX_LIMIT) {
    return { error: `Limit cannot exceed ${MAX_LIMIT}` };
  }

  return { value: limit };
};

const readAddress = (value, label) => {
  if (value === undefined || value === null) {
    return { value: null };
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return { error: `${label} must be an object` };
  }

  let json = "";

  try {
    json = JSON.stringify(value);
  } catch (error) {
    return { error: `${label} must be an object` };
  }

  if (json.length > 5000) {
    return { error: `${label} is too large` };
  }

  return { value };
};

const readPaymentMethod = (value) => {
  if (value === undefined || value === null || value === "") {
    return { value: "pay_later" };
  }

  if (typeof value !== "string") {
    return { error: "Payment method must be pay_later or cod" };
  }

  const method = value.trim();

  if (!method) {
    return { value: "pay_later" };
  }

  if (method !== "pay_later" && method !== "cod") {
    return { error: "Payment method must be pay_later or cod" };
  }

  return { value: method };
};

const readNotes = (value) => {
  if (value === undefined || value === null || value === "") {
    return { value: null };
  }

  if (typeof value !== "string") {
    return { error: "Notes must be text" };
  }

  const notes = value.trim();

  if (!notes) {
    return { value: null };
  }

  if (notes.length > 2000) {
    return { error: "Notes must be 2000 characters or fewer" };
  }

  return { value: notes };
};

const validateItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "At least one order item is required" };
  }

  if (items.length > MAX_ITEMS) {
    return { error: `An order cannot contain more than ${MAX_ITEMS} items` };
  }

  const seen = new Set();
  const normalized = [];

  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { error: "Each order item must include a product id and quantity" };
    }

    const productId = parsePositiveId(item.product_id);

    if (!productId) {
      return { error: "Each product id must be a positive whole number" };
    }

    if (seen.has(productId)) {
      return { error: "Duplicate product ids are not allowed" };
    }

    seen.add(productId);

    const quantity = item.quantity;

    if (typeof quantity === "number") {
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
        return { error: "Quantity must be a positive whole number" };
      }
    } else if (typeof quantity === "string" && /^[1-9]\d*$/.test(quantity)) {
      if (Number(quantity) > MAX_QUANTITY) {
        return { error: "Quantity is too large" };
      }
    } else {
      return { error: "Quantity must be a positive whole number" };
    }

    normalized.push({
      productId,
      quantity: Number(quantity)
    });
  }

  normalized.sort((left, right) => Number(left.productId) - Number(right.productId));

  return { value: normalized };
};

const isDatabaseUnavailable = (error) => {
  const code = error && error.code;
  const message = error && typeof error.message === "string" ? error.message : "";

  return (
    code === "53300" ||
    code === "57P03" ||
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND" ||
    message.includes("timeout exceeded when trying to connect") ||
    message.includes("too many clients") ||
    message.includes("Connection terminated")
  );
};

const handleError = (res, error, label) => {
  if (error instanceof orderModel.OrderError) {
    return sendError(res, error.status, error.message);
  }

  if (isDatabaseUnavailable(error)) {
    console.error(label, error.code || "connection failure");
    return sendError(res, 503, "Database is temporarily unavailable");
  }

  console.error(label);
  return sendError(res, 500, "Internal server error");
};

const createOrder = async (req, res) => {
  try {
    const userId = parsePositiveId(req.user && req.user.id);

    if (!userId) {
      return sendError(res, 401, "Authentication required");
    }

    const items = validateItems(req.body && req.body.items);
    const shippingAddress = readAddress(req.body && req.body.shipping_address, "Shipping address");
    const billingAddress = readAddress(req.body && req.body.billing_address, "Billing address");
    const notes = readNotes(req.body && req.body.notes);
    const paymentMethod = readPaymentMethod(req.body && req.body.payment_method);

    if (items.error) {
      return sendError(res, 400, items.error);
    }

    if (shippingAddress.error) {
      return sendError(res, 400, shippingAddress.error);
    }

    if (billingAddress.error) {
      return sendError(res, 400, billingAddress.error);
    }

    if (notes.error) {
      return sendError(res, 400, notes.error);
    }

    if (paymentMethod.error) {
      return sendError(res, 400, paymentMethod.error);
    }

    const order = await orderModel.createOrder({
      userId,
      items: items.value,
      shippingAddress: shippingAddress.value,
      billingAddress: billingAddress.value,
      notes: notes.value,
      paymentMethod: paymentMethod.value
    });

    return res.status(201).json({
      success: true,
      message: "Order created",
      data: { order }
    });
  } catch (error) {
    return handleError(res, error, "Create order failed");
  }
};

const listMyOrders = async (req, res) => {
  try {
    const userId = parsePositiveId(req.user && req.user.id);
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);

    if (!userId) {
      return sendError(res, 401, "Authentication required");
    }

    if (page.error) {
      return sendError(res, 400, page.error);
    }

    if (limit.error) {
      return sendError(res, 400, limit.error);
    }

    const status = req.query.status;
    const search = readSearch(req.query.search);
    const fromDate = readDate(req.query.from, "Start date");
    const toDate = readDate(req.query.to, "End date");

    if (Array.isArray(status) || Array.isArray(req.query.search) || Array.isArray(req.query.from) || Array.isArray(req.query.to)) {
      return sendError(res, 400, "Filters must be single values");
    }

    if (status !== undefined && status !== "" && !ORDER_STATUSES.includes(status)) {
      return sendError(res, 400, "Status filter is not valid");
    }

    if (search.error) {
      return sendError(res, 400, search.error);
    }

    if (fromDate.error) {
      return sendError(res, 400, fromDate.error);
    }

    if (toDate.error) {
      return sendError(res, 400, toDate.error);
    }

    if (fromDate.value && toDate.value && fromDate.value > toDate.value) {
      return sendError(res, 400, "The start date cannot be after the end date");
    }

    const result = await orderModel.listOrders({
      userId,
      status: status || null,
      limit: limit.value,
      offset: (page.value - 1) * limit.value,
      includeCustomer: false,
      searchPattern: search.value,
      fromDate: fromDate.value,
      toDate: toDate.value,
      searchItems: true
    });
    const grouped = await orderModel.countMyOrderStatuses({
      userId,
      searchPattern: search.value,
      fromDate: fromDate.value,
      toDate: toDate.value
    });
    const counts = { all: 0 };

    ORDER_STATUSES.forEach((item) => {
      counts[item] = 0;
    });
    grouped.forEach((row) => {
      if (Object.prototype.hasOwnProperty.call(counts, row.status)) {
        counts[row.status] = row.total;
        counts.all += row.total;
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        orders: result.orders,
        total: result.total,
        page: page.value,
        limit: limit.value,
        totalPages: result.total === 0 ? 0 : Math.ceil(result.total / limit.value),
        counts
      }
    });
  } catch (error) {
    return handleError(res, error, "List my orders failed");
  }
};

const getOrder = async (req, res) => {
  try {
    const orderId = parsePositiveId(req.params.id);
    const userId = parsePositiveId(req.user && req.user.id);
    const role = req.user && req.user.role;

    if (!userId) {
      return sendError(res, 401, "Authentication required");
    }

    if (!orderId) {
      return sendError(res, 400, "A valid order id is required");
    }

    if (role !== "admin" && role !== "customer") {
      return sendError(res, 404, "Order not found");
    }

    const order = await orderModel.findOrder({
      orderId,
      userId: role === "admin" ? null : userId
    });

    if (!order) {
      return sendError(res, 404, "Order not found");
    }

    return res.status(200).json({
      success: true,
      data: { order }
    });
  } catch (error) {
    return handleError(res, error, "Get order failed");
  }
};

const escapeLike = (value) => value.replace(/[\\%_]/g, "\\$&");

const readSearch = (value) => {
  if (value === undefined || value === "") {
    return { value: null };
  }

  if (typeof value !== "string") {
    return { error: "Search must be text" };
  }

  const text = value.trim();

  if (text.length > 100) {
    return { error: "Search must be 100 characters or fewer" };
  }

  return { value: text ? `%${escapeLike(text)}%` : null };
};

const readSource = (value) => {
  if (value === undefined || value === "") {
    return { value: null };
  }

  if (value !== "cart_checkout" && value !== "purchase_order") {
    return { error: "Source filter is not valid" };
  }

  return { value };
};

const readDate = (value, label) => {
  if (value === undefined || value === "") {
    return { value: null };
  }

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { error: `${label} must be a YYYY-MM-DD date` };
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { error: `${label} must be a YYYY-MM-DD date` };
  }

  return { value };
};

const listOrders = async (req, res) => {
  try {
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const status = req.query.status;
    const search = readSearch(req.query.search);
    const source = readSource(req.query.source);
    const fromDate = readDate(req.query.from, "Start date");
    const toDate = readDate(req.query.to, "End date");

    if (page.error) {
      return sendError(res, 400, page.error);
    }

    if (limit.error) {
      return sendError(res, 400, limit.error);
    }

    if (
      Array.isArray(status)
      || Array.isArray(req.query.search)
      || Array.isArray(req.query.source)
      || Array.isArray(req.query.from)
      || Array.isArray(req.query.to)
    ) {
      return sendError(res, 400, "Filters must be single values");
    }

    if (status !== undefined && status !== "" && !ORDER_STATUSES.includes(status)) {
      return sendError(res, 400, "Status filter is not valid");
    }

    if (search.error) {
      return sendError(res, 400, search.error);
    }

    if (source.error) {
      return sendError(res, 400, source.error);
    }

    if (fromDate.error) {
      return sendError(res, 400, fromDate.error);
    }

    if (toDate.error) {
      return sendError(res, 400, toDate.error);
    }

    if (fromDate.value && toDate.value && fromDate.value > toDate.value) {
      return sendError(res, 400, "The start date cannot be after the end date");
    }

    const result = await orderModel.listOrders({
      userId: null,
      status: status || null,
      limit: limit.value,
      offset: (page.value - 1) * limit.value,
      includeCustomer: true,
      searchPattern: search.value,
      fromDate: fromDate.value,
      toDate: toDate.value,
      source: source.value
    });
    const grouped = await orderModel.countOrderStatuses();
    const sources = await orderModel.countOrderSources();
    const counts = { all: 0 };

    ORDER_STATUSES.forEach((item) => {
      counts[item] = 0;
    });
    grouped.forEach((row) => {
      if (Object.prototype.hasOwnProperty.call(counts, row.status)) {
        counts[row.status] = row.total;
        counts.all += row.total;
      }
    });
    counts.cart_checkout = sources.cart_checkout;
    counts.purchase_order = sources.purchase_order;

    return res.status(200).json({
      success: true,
      data: {
        orders: result.orders,
        total: result.total,
        page: page.value,
        limit: limit.value,
        totalPages: result.total === 0 ? 0 : Math.ceil(result.total / limit.value),
        counts
      }
    });
  } catch (error) {
    return handleError(res, error, "List orders failed");
  }
};

const updateStatus = async (req, res) => {
  try {
    const orderId = parsePositiveId(req.params.id);
    const status = req.body && req.body.status;

    if (!orderId) {
      return sendError(res, 400, "A valid order id is required");
    }

    if (!ORDER_STATUSES.includes(status)) {
      return sendError(res, 400, "Status must be pending, confirmed, processing, shipped, delivered, or cancelled");
    }

    const order = await orderModel.updateStatus({
      orderId,
      status,
      updatedBy: parsePositiveId(req.user && req.user.id)
    });

    return res.status(200).json({
      success: true,
      message: "Order status updated",
      data: { order }
    });
  } catch (error) {
    return handleError(res, error, "Update order status failed");
  }
};

module.exports = {
  createOrder,
  listMyOrders,
  getOrder,
  listOrders,
  updateStatus,
  ORDER_STATUSES
};
