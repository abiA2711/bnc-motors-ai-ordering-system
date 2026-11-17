const inventoryModel = require("../models/inventoryModel");
const { InventoryError } = inventoryModel;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MAX_INTEGER = 2147483647;
const MAX_SEARCH = 100;
const MAX_REMARKS = 500;
const STOCK_STATUSES = ["all", "in_stock", "low_stock", "out_of_stock", "inactive"];
const MOVEMENT_TYPES = [
  "stock_added",
  "stock_deducted",
  "order_deduction",
  "order_restoration",
  "po_conversion_deduction"
];

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

const parseProductId = (value) => {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  return value;
};

const parseUserId = (value) => {
  const text = typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === "string"
      ? value
      : "";

  if (!/^[1-9]\d*$/.test(text)) {
    return null;
  }

  return text;
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

const readSearch = (value) => {
  if (value === undefined) {
    return { value: "" };
  }

  if (typeof value !== "string") {
    return { error: "Search must be text" };
  }

  const search = value.trim();

  if (search.length > MAX_SEARCH) {
    return { error: `Search must be ${MAX_SEARCH} characters or fewer` };
  }

  return { value: search };
};

const readCategory = (value) => {
  if (value === undefined || value === "") {
    return { value: "" };
  }

  if (typeof value !== "string") {
    return { error: "Category must be text" };
  }

  const category = value.trim();

  if (category.length > 100) {
    return { error: "Category must be 100 characters or fewer" };
  }

  return { value: category };
};

const readMovementType = (value) => {
  if (value === undefined || value === "") {
    return { value: "" };
  }

  if (typeof value !== "string" || !MOVEMENT_TYPES.includes(value)) {
    return { error: "Movement type is not recognized" };
  }

  return { value };
};

const readDate = (value, label) => {
  if (value === undefined || value === "") {
    return { value: "" };
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

const readStockStatus = (value) => {
  if (value === undefined || value === "") {
    return { value: "all" };
  }

  if (typeof value !== "string" || !STOCK_STATUSES.includes(value)) {
    return { error: "Stock status must be all, in_stock, low_stock, out_of_stock, or inactive" };
  }

  return { value };
};

const readAdjustment = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Stock update must include a type and quantity" };
  }

  const keys = Object.keys(body);

  if (keys.some((key) => key !== "type" && key !== "quantity" && key !== "remarks")) {
    return { error: "Only type, quantity, and remarks can be submitted" };
  }

  if (body.type !== "add" && body.type !== "deduct") {
    return { error: "Update type must be add or deduct" };
  }

  if (typeof body.quantity !== "number" || !Number.isInteger(body.quantity) || body.quantity <= 0 || body.quantity > MAX_INTEGER) {
    return { error: "Quantity must be a positive whole number" };
  }

  let remarks = null;

  if (body.remarks !== undefined && body.remarks !== null) {
    if (typeof body.remarks !== "string") {
      return { error: "Remarks must be text" };
    }

    remarks = body.remarks.trim();

    if (remarks.length > MAX_REMARKS) {
      return { error: `Remarks must be ${MAX_REMARKS} characters or fewer` };
    }

    if (!remarks) {
      remarks = null;
    }
  }

  return {
    value: {
      type: body.type,
      quantity: body.quantity,
      remarks
    }
  };
};

const getInventory = async (req, res) => {
  try {
    if (
      Array.isArray(req.query.page) ||
      Array.isArray(req.query.limit) ||
      Array.isArray(req.query.search) ||
      Array.isArray(req.query.category) ||
      Array.isArray(req.query.stock_status)
    ) {
      return sendError(res, 400, "Filters must be single values");
    }

    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const search = readSearch(req.query.search);
    const category = readCategory(req.query.category);
    const stockStatus = readStockStatus(req.query.stock_status);

    if (page.error || limit.error || search.error || category.error || stockStatus.error) {
      return sendError(
        res,
        400,
        page.error || limit.error || search.error || category.error || stockStatus.error
      );
    }

    const result = await inventoryModel.getInventory({
      page: page.value,
      limit: limit.value,
      search: search.value,
      category: category.value,
      stockStatus: stockStatus.value
    });
    const summary = {
      total_products: Number(result.summary.total_products),
      in_stock: Number(result.summary.in_stock),
      low_stock: Number(result.summary.low_stock),
      out_of_stock: Number(result.summary.out_of_stock),
      last_adjustment_at: result.summary.last_adjustment_at
    };
    const counts = [summary.total_products, summary.in_stock, summary.low_stock, summary.out_of_stock, result.total];

    if (counts.some((count) => !Number.isInteger(count) || count < 0)) {
      console.error("Inventory list failed", "invalid aggregate");
      return sendError(res, 500, "Internal server error");
    }

    const totalPages = result.total === 0 ? 0 : Math.ceil(result.total / limit.value);

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      success: true,
      data: {
        products: result.products,
        total: result.total,
        page: page.value,
        limit: limit.value,
        totalPages,
        summary,
        categories: result.categories,
        alerts: result.alerts
      }
    });
  } catch (error) {
    if (databaseUnavailable(error)) {
      console.error("Inventory list failed", error.code || "connection failure");
      return sendError(res, 503, "Database is temporarily unavailable");
    }

    console.error("Inventory list failed", error && error.code ? error.code : "query failure");
    return sendError(res, 500, "Internal server error");
  }
};

const listMovements = async (req, res) => {
  try {
    if (
      Array.isArray(req.query.page) ||
      Array.isArray(req.query.limit) ||
      Array.isArray(req.query.movement_type) ||
      Array.isArray(req.query.from) ||
      Array.isArray(req.query.to)
    ) {
      return sendError(res, 400, "Filters must be single values");
    }

    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const movementType = readMovementType(req.query.movement_type);
    const fromDate = readDate(req.query.from, "Start date");
    const toDate = readDate(req.query.to, "End date");

    if (page.error || limit.error || movementType.error || fromDate.error || toDate.error) {
      return sendError(res, 400, page.error || limit.error || movementType.error || fromDate.error || toDate.error);
    }

    if (fromDate.value && toDate.value && fromDate.value > toDate.value) {
      return sendError(res, 400, "Start date must be on or before the end date");
    }

    const result = await inventoryModel.listMovements({
      page: page.value,
      limit: limit.value,
      movementType: movementType.value,
      fromDate: fromDate.value,
      toDate: toDate.value
    });
    const totalPages = result.total === 0 ? 0 : Math.ceil(result.total / limit.value);

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      success: true,
      data: {
        movements: result.movements,
        total: result.total,
        page: page.value,
        limit: limit.value,
        totalPages
      }
    });
  } catch (error) {
    if (databaseUnavailable(error)) {
      console.error("Inventory history failed", error.code || "connection failure");
      return sendError(res, 503, "Database is temporarily unavailable");
    }

    console.error("Inventory history failed", error && error.code ? error.code : "query failure");
    return sendError(res, 500, "Internal server error");
  }
};

const adjustStock = async (req, res) => {
  try {
    const productId = parseProductId(req.params.id);
    const userId = parseUserId(req.user && req.user.id);
    const adjustment = readAdjustment(req.body);

    if (!productId) {
      return sendError(res, 400, "A valid product id is required");
    }

    if (!userId) {
      return sendError(res, 401, "Authentication required");
    }

    if (adjustment.error) {
      return sendError(res, 400, adjustment.error);
    }

    const result = await inventoryModel.adjustStock({
      productId,
      userId,
      type: adjustment.value.type,
      quantity: adjustment.value.quantity,
      remarks: adjustment.value.remarks
    });

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      success: true,
      message: "Stock updated successfully",
      data: result
    });
  } catch (error) {
    if (error instanceof InventoryError) {
      return sendError(res, error.status, error.message);
    }

    if (error && (error.code === "23514" || error.code === "23503")) {
      return sendError(res, 409, "Stock could not be updated");
    }

    if (databaseUnavailable(error)) {
      console.error("Stock update failed", error.code || "connection failure");
      return sendError(res, 503, "Database is temporarily unavailable");
    }

    console.error("Stock update failed", error && error.code ? error.code : "query failure");
    return sendError(res, 500, "Internal server error");
  }
};

module.exports = {
  getInventory,
  listMovements,
  adjustStock
};
