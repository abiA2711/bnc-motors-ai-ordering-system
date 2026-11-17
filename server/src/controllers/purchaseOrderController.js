const fs = require("fs");
const path = require("path");

const purchaseOrderModel = require("../models/purchaseOrderModel");
const { extractPdfText, PdfExtractionError, NO_TEXT_MESSAGE } = require("../services/pdfExtractionService");
const {
  extractPurchaseOrder,
  validatePurchaseOrder,
  ExtractionError,
  MOCK_NOTICE
} = require("../services/poAiExtractionService");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DOCUMENT_FAILURE_CODES = new Set([
  "PDF_NO_TEXT",
  "PDF_READ_FAILED",
  "PDF_TEXT_TOO_LARGE",
  "PARSE_FAILED",
  "VALIDATION"
]);

const sendError = (res, status, message, extra) => {
  return res.status(status).json({
    success: false,
    message,
    ...(extra || {})
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

const displayFileName = (originalName) => {
  const base = path.basename(typeof originalName === "string" ? originalName : "");
  const cleaned = base.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 255);

  if (!cleaned || !cleaned.toLowerCase().endsWith(".pdf")) {
    return "purchase-order.pdf";
  }

  return cleaned;
};

const isDatabaseUnavailable = (error) => {
  const code = error && error.code;
  const message = error && typeof error.message === "string" ? error.message : "";

  return code === "53300"
    || code === "57P03"
    || code === "ECONNREFUSED"
    || code === "ECONNRESET"
    || code === "ETIMEDOUT"
    || code === "ENOTFOUND"
    || message.includes("timeout exceeded when trying to connect")
    || message.includes("too many clients")
    || message.includes("Connection terminated");
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

const handleError = (res, error, logLabel) => {
  if (error instanceof purchaseOrderModel.PurchaseOrderError) {
    return sendError(res, error.status, error.message);
  }

  if (isDatabaseUnavailable(error)) {
    console.error(logLabel, error.code || "database unavailable");
    return sendError(res, 503, "Database is temporarily unavailable");
  }

  console.error(logLabel, error && error.code ? error.code : "unexpected");
  return sendError(res, 500, "Internal server error");
};

const ownerFilter = (user) => {
  if (!user || (user.role !== "admin" && user.role !== "customer")) {
    return { error: "You are not allowed to perform this action" };
  }

  if (user.role === "admin") {
    return { ownerUserId: null };
  }

  const userId = parsePositiveId(user.id);

  if (!userId) {
    return { error: "You are not allowed to perform this action" };
  }

  return { ownerUserId: userId };
};

const uploadPurchaseOrder = async (req, res) => {
  const uploadedPath = req.file && req.file.path;
  let saved = false;

  try {
    const userId = parsePositiveId(req.user && req.user.id);

    if (!userId) {
      await purchaseOrderModel.removeUploadedFile(uploadedPath);
      return sendError(res, 401, "Authentication is required");
    }

    if (!req.file) {
      return sendError(res, 400, "A PDF file is required");
    }

    const buffer = await fs.promises.readFile(uploadedPath);

    if (buffer.length < 5 || buffer.subarray(0, 5).toString("utf8") !== "%PDF-") {
      await purchaseOrderModel.removeUploadedFile(uploadedPath);
      return sendError(res, 400, "Only PDF files are allowed");
    }

    let failureMessage = null;
    let extracted = null;

    try {
      const text = await extractPdfText(buffer);
      const result = await extractPurchaseOrder(text);
      const data = validatePurchaseOrder(result.data);

      extracted = {
        mock: result.mock === true,
        provider: typeof result.provider === "string" ? result.provider : "unknown",
        notice: typeof result.notice === "string" ? result.notice : "",
        po_number: data.po_number,
        supplier_name: data.supplier_name,
        po_date: data.po_date,
        currency: data.currency,
        items: data.items
      };
    } catch (error) {
      if (error instanceof PdfExtractionError || error instanceof ExtractionError) {
        if (error.code === "PROVIDER_UNAVAILABLE" || error.code === "PROVIDER_UNKNOWN") {
          await purchaseOrderModel.removeUploadedFile(uploadedPath);
          return sendError(res, 503, error.message);
        }

        if (DOCUMENT_FAILURE_CODES.has(error.code)) {
          failureMessage = error.code === "PDF_NO_TEXT" ? NO_TEXT_MESSAGE : error.message;
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    const purchaseOrder = await purchaseOrderModel.savePurchaseOrder({
      userId,
      fileName: displayFileName(req.file.originalname),
      absolutePath: uploadedPath,
      fileType: "application/pdf",
      fileSize: req.file.size,
      status: extracted ? "review_required" : "failed",
      extractedData: extracted,
      processingError: failureMessage
    });
    saved = true;

    if (!extracted) {
      return sendError(res, 422, failureMessage, {
        data: { purchase_order: purchaseOrder }
      });
    }

    const mockExtraction = extracted.mock === true;

    return res.status(201).json({
      success: true,
      message: mockExtraction
        ? "Purchase order processed with mock extraction. Review the suggested product matches before creating an order."
        : "Purchase order processed. Review the suggested product matches before creating an order.",
      data: {
        purchase_order: purchaseOrder,
        extraction: {
          provider: extracted.provider,
          mock: mockExtraction,
          notice: extracted.notice || (mockExtraction ? MOCK_NOTICE : "")
        }
      }
    });
  } catch (error) {
    if (!saved) {
      await purchaseOrderModel.removeUploadedFile(uploadedPath);
    }

    return handleError(res, error, "Purchase order upload failed");
  }
};

const PURCHASE_ORDER_STATUSES = ["uploaded", "processing", "review_required", "partially_converted", "confirmed", "failed"];

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

const listPurchaseOrders = async (req, res) => {
  try {
    const access = ownerFilter(req.user);
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const status = req.query.status;
    const search = readSearch(req.query.search);
    const fromDate = readDate(req.query.from, "Start date");
    const toDate = readDate(req.query.to, "End date");

    if (access.error) {
      return sendError(res, 403, access.error);
    }

    if (page.error) {
      return sendError(res, 400, page.error);
    }

    if (limit.error) {
      return sendError(res, 400, limit.error);
    }

    if (Array.isArray(status) || Array.isArray(req.query.search) || Array.isArray(req.query.from) || Array.isArray(req.query.to)) {
      return sendError(res, 400, "Filters must be single values");
    }

    if (status !== undefined && status !== "" && !PURCHASE_ORDER_STATUSES.includes(status)) {
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

    const result = await purchaseOrderModel.listPurchaseOrders({
      ownerUserId: access.ownerUserId,
      status: status || null,
      searchPattern: search.value,
      fromDate: fromDate.value,
      toDate: toDate.value,
      limit: limit.value,
      offset: (page.value - 1) * limit.value
    });
    const grouped = await purchaseOrderModel.countPurchaseOrdersByStatus({
      ownerUserId: access.ownerUserId
    });
    const counts = { all: 0 };

    PURCHASE_ORDER_STATUSES.forEach((item) => {
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
        purchase_orders: result.purchaseOrders,
        total: result.total,
        page: page.value,
        limit: limit.value,
        totalPages: result.total === 0 ? 0 : Math.ceil(result.total / limit.value),
        counts
      }
    });
  } catch (error) {
    return handleError(res, error, "List purchase orders failed");
  }
};

const downloadName = (value) => {
  const cleaned = typeof value === "string"
    ? value.trim().replace(/[\r\n"]/g, "").replace(/[^A-Za-z0-9._ ()-]/g, "")
    : "";

  if (!cleaned) {
    return "purchase-order.pdf";
  }

  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned}.pdf`;
};

const downloadPurchaseOrderFile = async (req, res) => {
  try {
    const access = ownerFilter(req.user);
    const purchaseOrderId = parsePositiveId(req.params.id);

    if (access.error) {
      return sendError(res, 403, access.error);
    }

    if (!purchaseOrderId) {
      return sendError(res, 400, "Purchase order id must be a positive whole number");
    }

    const file = await purchaseOrderModel.findPurchaseOrderFile(purchaseOrderId, access.ownerUserId);

    if (!file || !file.absolutePath) {
      return sendError(res, 404, file ? "The original PDF is unavailable" : "Purchase order not found");
    }

    let header = Buffer.alloc(0);

    try {
      const handle = await fs.promises.open(file.absolutePath, "r");

      try {
        header = Buffer.alloc(5);
        await handle.read(header, 0, 5, 0);
      } finally {
        await handle.close();
      }
    } catch {
      return sendError(res, 404, "The original PDF is unavailable");
    }

    if (header.toString("utf8") !== "%PDF-") {
      return sendError(res, 404, "The original PDF is unavailable");
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${downloadName(file.fileName)}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");

    const stream = fs.createReadStream(file.absolutePath);

    stream.on("error", () => {
      if (!res.headersSent) {
        sendError(res, 404, "The original PDF is unavailable");
        return;
      }

      res.destroy();
    });

    return stream.pipe(res);
  } catch (error) {
    return handleError(res, error, "Purchase order file failed");
  }
};

const getPurchaseOrder = async (req, res) => {
  try {
    const access = ownerFilter(req.user);
    const purchaseOrderId = parsePositiveId(req.params.id);

    if (access.error) {
      return sendError(res, 403, access.error);
    }

    if (!purchaseOrderId) {
      return sendError(res, 400, "Purchase order id must be a positive whole number");
    }

    const purchaseOrder = await purchaseOrderModel.findPurchaseOrder(
      purchaseOrderId,
      access.ownerUserId
    );

    if (!purchaseOrder) {
      return sendError(res, 404, "Purchase order not found");
    }

    return res.status(200).json({
      success: true,
      data: { purchase_order: purchaseOrder }
    });
  } catch (error) {
    return handleError(res, error, "Get purchase order failed");
  }
};

const reviewMatch = async (req, res) => {
  try {
    const access = ownerFilter(req.user);
    const reviewerId = parsePositiveId(req.user && req.user.id);
    const purchaseOrderId = parsePositiveId(req.params.id);
    const itemId = parsePositiveId(req.params.itemId);
    const action = req.body && req.body.action;
    const productId = parsePositiveId(req.body && req.body.product_id);

    if (access.error || !reviewerId) {
      return sendError(res, access.error ? 403 : 401, access.error || "Authentication required");
    }

    if (!purchaseOrderId) {
      return sendError(res, 400, "Purchase order id must be a positive whole number");
    }

    if (!itemId) {
      return sendError(res, 400, "Purchase order item id must be a positive whole number");
    }

    if (action !== "select" && action !== "reject") {
      return sendError(res, 400, "Action must be select or reject");
    }

    if (!productId) {
      return sendError(res, 400, "Product id must be a positive whole number");
    }

    const purchaseOrder = await purchaseOrderModel.reviewMatch({
      purchaseOrderId,
      itemId,
      ownerUserId: access.ownerUserId,
      reviewerId,
      action,
      productId
    });

    return res.status(200).json({
      success: true,
      message: action === "select"
        ? "Product selected successfully."
        : "Suggested product rejected. Please choose the correct catalogue product.",
      data: { purchase_order: purchaseOrder }
    });
  } catch (error) {
    return handleError(res, error, "Review purchase order match failed");
  }
};

const confirmPurchaseOrder = async (req, res) => {
  try {
    const userId = parsePositiveId(req.user && req.user.id);
    const purchaseOrderId = parsePositiveId(req.params.id);
    const shippingAddress = readAddress(req.body && req.body.shipping_address, "Shipping address");
    const billingAddress = readAddress(req.body && req.body.billing_address, "Billing address");
    const notes = readNotes(req.body && req.body.notes);

    if (!userId) {
      return sendError(res, 401, "Authentication required");
    }

    if (!purchaseOrderId) {
      return sendError(res, 400, "Purchase order id must be a positive whole number");
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

    const result = await purchaseOrderModel.confirmPurchaseOrder({
      purchaseOrderId,
      ownerUserId: userId,
      shippingAddress: shippingAddress.value,
      billingAddress: billingAddress.value,
      notes: notes.value
    });

    const fullyConverted = result.remainingLineCount === 0;

    return res.status(201).json({
      success: true,
      message: fullyConverted
        ? "Purchase order confirmed and order created"
        : "Matched items converted and order created",
      data: {
        purchase_order: result.purchaseOrder,
        order: result.order,
        converted_line_count: result.convertedLineCount,
        remaining_line_count: result.remainingLineCount
      }
    });
  } catch (error) {
    return handleError(res, error, "Confirm purchase order failed");
  }
};

module.exports = {
  uploadPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrder,
  downloadPurchaseOrderFile,
  reviewMatch,
  confirmPurchaseOrder
};
