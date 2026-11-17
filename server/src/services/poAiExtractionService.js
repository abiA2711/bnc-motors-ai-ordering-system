const MOCK_NOTICE =
  "Mock extraction only. This is test data from a deterministic text parser, not real AI processing.";
const GEMINI_NOTICE =
  "Extracted by Google Gemini from the PDF text. Review the suggested product matches before creating an order.";
const PARSE_MESSAGE =
  "Mock extraction could not find a complete purchase order in the PDF text. No AI request was made.";
const GEMINI_PARSE_MESSAGE =
  "Gemini did not return a valid purchase order. No purchase order data was stored from the model output.";
const OPENAI_UNAVAILABLE_MESSAGE =
  "The OpenAI extraction provider is not enabled. No OpenAI request was made.";
const GEMINI_NOT_CONFIGURED_MESSAGE =
  "Gemini extraction is not configured. No Gemini request was made.";
const GEMINI_MODEL_MISSING_MESSAGE =
  "The Gemini model is not configured. No Gemini request was made.";

const MAX_ITEMS = 50;
const MAX_QUANTITY = 100000;
const MAX_MONEY_CENTS = 999999999999n;

class ExtractionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const formatMoney = (cents) => {
  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, "0");
  return `${whole.toString()}.${fraction}`;
};

const parseMoney = (value) => {
  const text = String(value).trim();

  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) {
    return null;
  }

  const [whole, fraction = ""] = text.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));

  if (cents > MAX_MONEY_CENTS) {
    return null;
  }

  return cents;
};

const isRealDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const validatePurchaseOrder = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ExtractionError("VALIDATION", "Extracted purchase order fields were invalid and were not stored.");
  }

  const poNumber = typeof value.po_number === "string" ? value.po_number.trim() : "";
  const supplierName = typeof value.supplier_name === "string" ? value.supplier_name.trim() : "";
  const poDate = typeof value.po_date === "string" ? value.po_date.trim() : "";
  const currency = typeof value.currency === "string" ? value.currency.trim().toUpperCase() : "";

  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/.test(poNumber)) {
    throw new ExtractionError("VALIDATION", "Extracted field po_number is invalid.");
  }

  if (supplierName.length < 1 || supplierName.length > 150) {
    throw new ExtractionError("VALIDATION", "Extracted field supplier_name is invalid.");
  }

  if (!isRealDate(poDate)) {
    throw new ExtractionError("VALIDATION", "Extracted field po_date is invalid.");
  }

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ExtractionError("VALIDATION", "Extracted field currency is invalid.");
  }

  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > MAX_ITEMS) {
    throw new ExtractionError("VALIDATION", "Extracted field items is invalid.");
  }

  const seenLines = new Set();
  const items = value.items.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ExtractionError("VALIDATION", "Extracted field items is invalid.");
    }

    const lineNumber = item.line_number;
    const productName = typeof item.product_name === "string" ? item.product_name.trim() : "";
    const rawSku = item.sku === null || item.sku === undefined || item.sku === ""
      ? null
      : String(item.sku).trim();
    const quantity = item.quantity;
    const unit = item.unit === null || item.unit === undefined || item.unit === ""
      ? null
      : String(item.unit).trim();
    const cents = parseMoney(item.unit_price);

    if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > 10000 || seenLines.has(lineNumber)) {
      throw new ExtractionError("VALIDATION", "Extracted field line_number is invalid.");
    }

    seenLines.add(lineNumber);

    if (productName.length < 1 || productName.length > 255) {
      throw new ExtractionError("VALIDATION", "Extracted field product_name is invalid.");
    }

    if (rawSku !== null && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(rawSku)) {
      throw new ExtractionError("VALIDATION", "Extracted field sku is invalid.");
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new ExtractionError("VALIDATION", "Extracted field quantity is invalid.");
    }

    if (unit !== null && !/^[A-Za-z]{1,20}$/.test(unit)) {
      throw new ExtractionError("VALIDATION", "Extracted field unit is invalid.");
    }

    if (cents === null) {
      throw new ExtractionError("VALIDATION", "Extracted field unit_price is invalid.");
    }

    return {
      line_number: lineNumber,
      product_name: productName,
      sku: rawSku,
      quantity,
      unit,
      unit_price: formatMoney(cents)
    };
  });

  return {
    po_number: poNumber,
    supplier_name: supplierName,
    po_date: poDate,
    currency,
    items
  };
};

const parseMockPurchaseOrder = (text) => {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let poNumber = "";
  let supplierName = "";
  let poDate = "";
  let currency = "";
  const items = [];

  lines.forEach((line) => {
    const poMatch = line.match(/^PO Number:\s*(.+)$/i);
    const supplierMatch = line.match(/^Supplier:\s*(.+)$/i);
    const dateMatch = line.match(/^Date:\s*(\d{4}-\d{2}-\d{2})$/i);
    const currencyMatch = line.match(/^Currency:\s*([A-Za-z]{3})$/i);
    const itemMatch = line.match(/^(\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(\d+)\s*\|\s*(.*?)\s*\|\s*(\d+(?:\.\d{1,2})?)$/);

    if (poMatch) {
      poNumber = poMatch[1].trim();
      return;
    }

    if (supplierMatch) {
      supplierName = supplierMatch[1].trim();
      return;
    }

    if (dateMatch) {
      poDate = dateMatch[1];
      return;
    }

    if (currencyMatch) {
      currency = currencyMatch[1].toUpperCase();
      return;
    }

    if (itemMatch) {
      items.push({
        line_number: Number(itemMatch[1]),
        product_name: itemMatch[2].trim(),
        sku: itemMatch[3].trim(),
        quantity: Number(itemMatch[4]),
        unit: itemMatch[5].trim(),
        unit_price: itemMatch[6]
      });
      return;
    }

    throw new ExtractionError("PARSE_FAILED", PARSE_MESSAGE);
  });

  if (!poNumber || !supplierName || !poDate || !currency || items.length === 0) {
    throw new ExtractionError("PARSE_FAILED", PARSE_MESSAGE);
  }

  return validatePurchaseOrder({
    po_number: poNumber,
    supplier_name: supplierName,
    po_date: poDate,
    currency,
    items
  });
};

const extractWithMockProvider = async (text) => {
  const data = parseMockPurchaseOrder(text);

  return {
    provider: "mock",
    mock: true,
    notice: MOCK_NOTICE,
    data
  };
};

const extractWithOpenAiProvider = async () => {
  throw new ExtractionError("PROVIDER_UNAVAILABLE", OPENAI_UNAVAILABLE_MESSAGE);
};

const readEnvironment = (name) => {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
};

const integerValue = (value) => {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && /^[1-9]\d*$/.test(value.trim())) {
    return Number(value.trim());
  }

  return value;
};

const priceValue = (value) => {
  if (typeof value === "number" && Number.isFinite(value) && !/e/i.test(String(value))) {
    return String(value);
  }

  return value;
};

const normalizeGeminiPurchaseOrder = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ExtractionError("VALIDATION", "Extracted purchase order fields were invalid and were not stored.");
  }

  const items = Array.isArray(value.items)
    ? value.items.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return item;
      }

      const sku = item.sku === null || item.sku === undefined || String(item.sku).trim() === ""
        ? null
        : String(item.sku).trim();
      const unit = item.unit === null || item.unit === undefined || String(item.unit).trim() === ""
        ? null
        : String(item.unit).trim();

      return {
        line_number: integerValue(item.line_number),
        product_name: item.product_name,
        sku,
        quantity: integerValue(item.quantity),
        unit,
        unit_price: priceValue(item.unit_price)
      };
    })
    : value.items;

  return validatePurchaseOrder({
    po_number: value.po_number,
    supplier_name: value.supplier_name,
    po_date: value.po_date,
    currency: value.currency,
    items
  });
};

const parseGeminiContent = (raw) => {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new ExtractionError("PARSE_FAILED", GEMINI_PARSE_MESSAGE);
  }

  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ExtractionError("PARSE_FAILED", GEMINI_PARSE_MESSAGE);
  }

  return normalizeGeminiPurchaseOrder(parsed);
};

const geminiResponseSchema = (Type) => {
  return {
    type: Type.OBJECT,
    properties: {
      po_number: {
        type: Type.STRING,
        description: "Purchase order number printed on the document."
      },
      supplier_name: {
        type: Type.STRING,
        description: "Supplier or vendor name printed on the document."
      },
      po_date: {
        type: Type.STRING,
        description: "Purchase order date in YYYY-MM-DD format."
      },
      currency: {
        type: Type.STRING,
        description: "ISO 4217 currency code, such as INR."
      },
      items: {
        type: Type.ARRAY,
        description: "Line items printed on the purchase order. Do not invent lines.",
        items: {
          type: Type.OBJECT,
          properties: {
            line_number: {
              type: Type.INTEGER,
              description: "Line number starting at 1."
            },
            product_name: {
              type: Type.STRING,
              description: "Product name printed on the line."
            },
            sku: {
              type: Type.STRING,
              nullable: true,
              description: "SKU printed on the line, or null when no SKU is printed."
            },
            quantity: {
              type: Type.INTEGER,
              description: "Positive whole-number quantity."
            },
            unit: {
              type: Type.STRING,
              nullable: true,
              description: "Unit printed on the line, or null when absent."
            },
            unit_price: {
              type: Type.NUMBER,
              description: "Non-negative unit price printed on the line."
            }
          },
          required: ["line_number", "product_name", "quantity", "unit_price"]
        }
      }
    },
    required: ["po_number", "supplier_name", "po_date", "currency", "items"]
  };
};

const buildGeminiPrompt = (text) => {
  return [
    "Extract the purchase order from the text below.",
    "Use only facts printed in the text. Do not invent lines, prices, SKUs, or dates.",
    "Return po_date as YYYY-MM-DD and currency as a 3-letter ISO code.",
    "Set sku to null when a line has no SKU.",
    "Do not return catalog product ids or match scores.",
    "",
    "PURCHASE ORDER TEXT:",
    text
  ].join("\n");
};

const mapGeminiError = (error) => {
  const status = error && Number.isInteger(error.status) ? error.status : 0;
  console.error("Gemini extraction failed", status || "network");

  if (status === 429) {
    return new ExtractionError(
      "PROVIDER_UNAVAILABLE",
      "Gemini API quota has been exceeded. No purchase order data was stored."
    );
  }

  if (status === 404) {
    return new ExtractionError(
      "PROVIDER_UNAVAILABLE",
      "The configured Gemini model is not available. No purchase order data was stored."
    );
  }

  if (status === 400) {
    return new ExtractionError(
      "PROVIDER_UNAVAILABLE",
      "Gemini rejected the extraction request. No purchase order data was stored."
    );
  }

  if (status === 401 || status === 403) {
    return new ExtractionError(
      "PROVIDER_UNAVAILABLE",
      "Gemini extraction is not authorized. No purchase order data was stored."
    );
  }

  if (status >= 500) {
    return new ExtractionError(
      "PROVIDER_UNAVAILABLE",
      "The Gemini extraction service is temporarily unavailable. No purchase order data was stored."
    );
  }

  if (!status) {
    return new ExtractionError(
      "PROVIDER_UNAVAILABLE",
      "The Gemini extraction service could not be reached. No purchase order data was stored."
    );
  }

  return new ExtractionError(
    "PROVIDER_UNAVAILABLE",
    "The Gemini extraction service could not complete the request. No purchase order data was stored."
  );
};

const extractWithGeminiProvider = async (text) => {
  const apiKey = readEnvironment("GEMINI_API_KEY");
  const model = readEnvironment("GEMINI_MODEL");

  if (!apiKey) {
    throw new ExtractionError("PROVIDER_UNAVAILABLE", GEMINI_NOT_CONFIGURED_MESSAGE);
  }

  if (!model) {
    throw new ExtractionError("PROVIDER_UNAVAILABLE", GEMINI_MODEL_MISSING_MESSAGE);
  }

  if (typeof text !== "string" || !text.trim()) {
    throw new ExtractionError("PARSE_FAILED", GEMINI_PARSE_MESSAGE);
  }

  let GoogleGenAI;
  let Type;

  try {
    ({ GoogleGenAI, Type } = require("@google/genai"));
  } catch (error) {
    console.error("Gemini SDK could not be loaded");
    throw new ExtractionError(
      "PROVIDER_UNAVAILABLE",
      "The Gemini extraction service is unavailable. No purchase order data was stored."
    );
  }

  const client = new GoogleGenAI({ apiKey });
  let response;

  try {
    response = await client.models.generateContent({
      model,
      contents: buildGeminiPrompt(text),
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: geminiResponseSchema(Type)
      }
    });
  } catch (error) {
    throw mapGeminiError(error);
  }

  const data = parseGeminiContent(response && response.text);
  console.info("Gemini extraction completed", { model, itemCount: data.items.length });

  return {
    provider: "gemini",
    mock: false,
    notice: GEMINI_NOTICE,
    data
  };
};

const providers = {
  mock: extractWithMockProvider,
  openai: extractWithOpenAiProvider,
  gemini: extractWithGeminiProvider
};

const extractPurchaseOrder = async (text) => {
  const providerName = (process.env.PO_EXTRACTION_PROVIDER || "mock").trim().toLowerCase();
  const provider = providers[providerName];

  if (!provider) {
    throw new ExtractionError(
      "PROVIDER_UNKNOWN",
      "The purchase order extraction provider is not recognized. No AI request was made."
    );
  }

  return provider(text);
};

module.exports = {
  extractPurchaseOrder,
  validatePurchaseOrder,
  normalizeGeminiPurchaseOrder,
  parseGeminiContent,
  ExtractionError,
  MOCK_NOTICE,
  GEMINI_NOTICE,
  PARSE_MESSAGE,
  GEMINI_PARSE_MESSAGE,
  OPENAI_UNAVAILABLE_MESSAGE
};
