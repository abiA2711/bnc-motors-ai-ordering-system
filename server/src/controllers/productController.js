const productModel = require("../models/productModel");
const { readRequestUser } = require("../middleware/authMiddleware");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MAX_PRICE = 9999999999.99;
const MAX_INTEGER = 2147483647;

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

const sendListError = (res, error) => {
  if (databaseUnavailable(error)) {
    console.error("Product list failed", error.code || "connection failure");
    return sendError(res, 503, "Database is temporarily unavailable");
  }

  console.error("Product list failed", error && error.code ? error.code : "query failure");
  return sendError(res, 500, "Internal server error");
};

const readText = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const escapeLike = (value) => value.replace(/[\\%_]/g, "\\$&");

const parseProductId = (value) => {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  return value;
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

const parseMoney = (value, label) => {
  const text = typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : typeof value === "string"
      ? value.trim()
      : "";

  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return { error: `${label} must be a nonnegative amount with up to 2 decimal places` };
  }

  if (Number(text) > MAX_PRICE) {
    return { error: `${label} is too large` };
  }

  return { value: text };
};

const parseWholeNumber = (value, label) => {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > MAX_INTEGER) {
      return { error: `${label} must be a nonnegative whole number` };
    }

    return { value };
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const number = Number(value.trim());

    if (number > MAX_INTEGER) {
      return { error: `${label} is too large` };
    }

    return { value: number };
  }

  return { error: `${label} must be a nonnegative whole number` };
};

const optionalText = (value, maxLength, label) => {
  if (value === undefined || value === null || value === "") {
    return { value: null };
  }

  if (typeof value !== "string") {
    return { error: `${label} must be text` };
  }

  const text = value.trim();

  if (!text) {
    return { value: null };
  }

  if (text.length > maxLength) {
    return { error: `${label} must be ${maxLength} characters or fewer` };
  }

  return { value: text };
};

const validateCreate = (body) => {
  const name = readText(body.name);
  const sku = readText(body.sku);

  if (!name || !sku || body.price === undefined || body.price === null || body.price === "") {
    return { error: "Name, SKU, and price are required" };
  }

  if (name.length > 150) {
    return { error: "Name must be 150 characters or fewer" };
  }

  if (sku.length > 50) {
    return { error: "SKU must be 50 characters or fewer" };
  }

  const price = parseMoney(body.price, "Price");

  if (price.error) {
    return price;
  }

  const stockQuantity = body.stock_quantity === undefined
    ? { value: 0 }
    : parseWholeNumber(body.stock_quantity, "Stock quantity");

  if (stockQuantity.error) {
    return stockQuantity;
  }

  const reorderLevel = body.reorder_level === undefined
    ? { value: 0 }
    : parseWholeNumber(body.reorder_level, "Reorder level");

  if (reorderLevel.error) {
    return reorderLevel;
  }

  const description = optionalText(body.description, 5000, "Description");
  const category = optionalText(body.category, 100, "Category");
  const brand = optionalText(body.brand, 100, "Brand");
  const imageUrl = optionalText(body.image_url, 2048, "Image URL");
  const unitText = optionalText(body.unit, 20, "Unit");

  if (description.error || category.error || brand.error || imageUrl.error || unitText.error) {
    return description.error
      ? description
      : category.error
        ? category
        : brand.error
          ? brand
          : imageUrl.error
            ? imageUrl
            : unitText;
  }

  let currency = "INR";

  if (body.currency !== undefined && body.currency !== null && body.currency !== "") {
    if (typeof body.currency !== "string" || !/^[A-Za-z]{3}$/.test(body.currency.trim())) {
      return { error: "Currency must be a 3-letter code" };
    }

    currency = body.currency.trim().toUpperCase();
  }

  return {
    value: {
      name,
      sku,
      description: description.value,
      price: price.value,
      stockQuantity: stockQuantity.value,
      category: category.value,
      brand: brand.value,
      imageUrl: imageUrl.value,
      unit: unitText.value || "pcs",
      currency,
      reorderLevel: reorderLevel.value
    }
  };
};

const validateUpdate = (body) => {
  const source = body || {};
  const fields = {};
  const allowed = [
    "name",
    "sku",
    "description",
    "price",
    "stock_quantity",
    "category",
    "brand",
    "image_url",
    "unit",
    "currency",
    "reorder_level"
  ];
  const hasUpdate = allowed.some((key) => Object.prototype.hasOwnProperty.call(source, key));

  if (!hasUpdate) {
    return { error: "No product fields to update" };
  }

  if (Object.prototype.hasOwnProperty.call(source, "name")) {
    const name = readText(source.name);

    if (!name || name.length > 150) {
      return { error: "Name must be between 1 and 150 characters" };
    }

    fields.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(source, "sku")) {
    const sku = readText(source.sku);

    if (!sku || sku.length > 50) {
      return { error: "SKU must be between 1 and 50 characters" };
    }

    fields.sku = sku;
  }

  if (Object.prototype.hasOwnProperty.call(source, "price")) {
    const price = parseMoney(source.price, "Price");

    if (price.error) {
      return price;
    }

    fields.price = price.value;
  }

  if (Object.prototype.hasOwnProperty.call(source, "stock_quantity")) {
    const stockQuantity = parseWholeNumber(source.stock_quantity, "Stock quantity");

    if (stockQuantity.error) {
      return stockQuantity;
    }

    fields.stock_quantity = stockQuantity.value;
  }

  if (Object.prototype.hasOwnProperty.call(source, "reorder_level")) {
    const reorderLevel = parseWholeNumber(source.reorder_level, "Reorder level");

    if (reorderLevel.error) {
      return reorderLevel;
    }

    fields.reorder_level = reorderLevel.value;
  }

  const optionalFields = [
    ["description", 5000, "Description"],
    ["category", 100, "Category"],
    ["brand", 100, "Brand"],
    ["image_url", 2048, "Image URL"],
    ["unit", 20, "Unit"]
  ];

  for (const [key, maxLength, label] of optionalFields) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }

    const parsed = optionalText(source[key], maxLength, label);

    if (parsed.error) {
      return parsed;
    }

    if (key === "unit" && !parsed.value) {
      return { error: "Unit must be between 1 and 20 characters" };
    }

    fields[key] = parsed.value;
  }

  if (Object.prototype.hasOwnProperty.call(source, "currency")) {
    if (typeof source.currency !== "string" || !/^[A-Za-z]{3}$/.test(source.currency.trim())) {
      return { error: "Currency must be a 3-letter code" };
    }

    fields.currency = source.currency.trim().toUpperCase();
  }

  return { value: fields };
};

const readAvailability = (value) => {
  if (value === undefined || value === "" || value === "active") {
    return { value: "active", restricted: false };
  }

  if (value === "inactive" || value === "all") {
    return { value, restricted: true };
  }

  return { error: "Status filter is not valid" };
};

const listProducts = async (req, res) => {
  try {
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const availability = readAvailability(req.query.status);

    if (page.error) {
      return sendError(res, 400, page.error);
    }

    if (limit.error) {
      return sendError(res, 400, limit.error);
    }

    if (availability.error) {
      return sendError(res, 400, availability.error);
    }

    if (Array.isArray(req.query.search) || Array.isArray(req.query.category) || Array.isArray(req.query.status)) {
      return sendError(res, 400, "Search, category, and status must be single values");
    }

    if (availability.restricted) {
      const user = readRequestUser(req);

      if (!user) {
        return sendError(res, 401, "Authentication required");
      }

      if (user.role !== "admin") {
        return sendError(res, 403, "You are not allowed to perform this action");
      }
    }

    const search = readText(req.query.search);
    const category = readText(req.query.category);
    const result = await productModel.listActive({
      searchPattern: search ? `%${escapeLike(search)}%` : null,
      category: category || null,
      limit: limit.value,
      offset: (page.value - 1) * limit.value,
      availability: availability.value
    });
    const totalPages = result.total === 0 ? 0 : Math.ceil(result.total / limit.value);

    return res.status(200).json({
      success: true,
      data: {
        products: result.products,
        total: result.total,
        page: page.value,
        limit: limit.value,
        totalPages
      }
    });
  } catch (error) {
    return sendListError(res, error);
  }
};

const parseRelatedLimit = (value) => {
  if (value === undefined) {
    return { value: 4 };
  }

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return { error: "Limit must be a positive whole number" };
  }

  const limit = Number(value);

  if (!Number.isSafeInteger(limit) || limit > 4) {
    return { error: "Limit cannot exceed 4" };
  }

  return { value: limit };
};

const getRelatedProducts = async (req, res) => {
  try {
    const id = parseProductId(req.params.id);

    if (!id) {
      return sendError(res, 400, "A valid product id is required");
    }

    if (Array.isArray(req.query.limit)) {
      return sendError(res, 400, "Limit must be a single value");
    }

    const limit = parseRelatedLimit(req.query.limit);

    if (limit.error) {
      return sendError(res, 400, limit.error);
    }

    let product = await productModel.findActiveById(id);

    if (!product) {
      const user = readRequestUser(req);

      if (user && user.role === "admin") {
        product = await productModel.findById(id);
      }
    }

    if (!product) {
      return sendError(res, 404, "Product not found");
    }

    const products = await productModel.findRelated({
      id: product.id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      brand: product.brand
    }, limit.value);

    return res.status(200).json({
      success: true,
      data: {
        products,
        limit: limit.value
      }
    });
  } catch (error) {
    return sendListError(res, error);
  }
};

const getProduct = async (req, res) => {
  try {
    const id = parseProductId(req.params.id);

    if (!id) {
      return sendError(res, 400, "A valid product id is required");
    }

    let product = await productModel.findActiveById(id);

    if (!product) {
      const user = readRequestUser(req);

      if (user && user.role === "admin") {
        product = await productModel.findById(id);
      }
    }

    if (!product) {
      return sendError(res, 404, "Product not found");
    }

    return res.status(200).json({
      success: true,
      data: { product }
    });
  } catch (error) {
    console.error("Product lookup failed");
    return sendError(res, 500, "Internal server error");
  }
};

const createProduct = async (req, res) => {
  try {
    const validation = validateCreate(req.body || {});

    if (validation.error) {
      return sendError(res, 400, validation.error);
    }

    const existingSku = await productModel.findBySku(validation.value.sku);

    if (existingSku) {
      return sendError(res, 409, "A product with this SKU already exists");
    }

    const product = await productModel.create(validation.value);

    return res.status(201).json({
      success: true,
      message: "Product created",
      data: { product }
    });
  } catch (error) {
    if (error.code === "23505") {
      return sendError(res, 409, "A product with this SKU already exists");
    }

    console.error("Product create failed");
    return sendError(res, 500, "Internal server error");
  }
};

const updateProduct = async (req, res) => {
  try {
    const id = parseProductId(req.params.id);

    if (!id) {
      return sendError(res, 400, "A valid product id is required");
    }

    const validation = validateUpdate(req.body || {});

    if (validation.error) {
      return sendError(res, 400, validation.error);
    }

    const existingProduct = await productModel.findById(id);

    if (!existingProduct) {
      return sendError(res, 404, "Product not found");
    }

    if (validation.value.sku) {
      const existingSku = await productModel.findBySku(validation.value.sku, id);

      if (existingSku) {
        return sendError(res, 409, "A product with this SKU already exists");
      }
    }

    if (Object.prototype.hasOwnProperty.call(validation.value, "stock_quantity")) {
      const requestedStock = Number(validation.value.stock_quantity);
      const currentStock = Number(existingProduct.stock_quantity);
      delete validation.value.stock_quantity;

      if (requestedStock !== currentStock) {
        return sendError(res, 400, "Stock quantity can only be changed from Inventory");
      }
    }

    if (Object.keys(validation.value).length === 0) {
      return sendError(res, 400, "No product fields to update");
    }

    const product = await productModel.update(id, validation.value);

    return res.status(200).json({
      success: true,
      message: "Product updated",
      data: { product }
    });
  } catch (error) {
    if (error.code === "23505") {
      return sendError(res, 409, "A product with this SKU already exists");
    }

    console.error("Product update failed");
    return sendError(res, 500, "Internal server error");
  }
};

const readActiveFlag = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "is_active must be true or false" };
  }

  const keys = Object.keys(body);

  if (keys.length !== 1 || keys[0] !== "is_active" || typeof body.is_active !== "boolean") {
    return { error: "is_active must be true or false" };
  }

  return { value: body.is_active };
};

const updateProductStatus = async (req, res) => {
  try {
    const id = parseProductId(req.params.id);
    const isActive = readActiveFlag(req.body);

    if (!id) {
      return sendError(res, 400, "A valid product id is required");
    }

    if (isActive.error) {
      return sendError(res, 400, isActive.error);
    }

    const product = await productModel.setStatus(id, isActive.value);

    if (!product) {
      return sendError(res, 404, "Product not found");
    }

    return res.status(200).json({
      success: true,
      message: isActive.value ? "Product activated" : "Product deactivated",
      data: { product }
    });
  } catch (error) {
    console.error("Product status update failed");
    return sendError(res, 500, "Internal server error");
  }
};

const deleteProduct = async (req, res) => {
  try {
    const id = parseProductId(req.params.id);

    if (!id) {
      return sendError(res, 400, "A valid product id is required");
    }

    const product = await productModel.softDelete(id);

    if (!product) {
      return sendError(res, 404, "Product not found");
    }

    return res.status(200).json({
      success: true,
      message: "Product deactivated",
      data: { product }
    });
  } catch (error) {
    console.error("Product delete failed");
    return sendError(res, 500, "Internal server error");
  }
};

module.exports = {
  listProducts,
  getRelatedProducts,
  getProduct,
  createProduct,
  updateProduct,
  updateProductStatus,
  deleteProduct
};
