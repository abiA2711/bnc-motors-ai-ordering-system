require("dotenv").config();

const {
  extractPurchaseOrder,
  normalizeGeminiPurchaseOrder,
  parseGeminiContent,
  ExtractionError
} = require("../src/services/poAiExtractionService");

const SAMPLE = [
  "PO Number: PO-1002",
  "Supplier: ABC Motors",
  "Date: 2026-11-16",
  "Currency: INR",
  "1 | Front Ceramic Brake Pad Set | BNC-BP-FR-01 | 2 | set | 500.00",
  "2 | Spin-On Engine Oil Filter | BNC-OF-220 | 3 | pcs | 349.00",
  "3 | Iridium Spark Plug Set | BNC-SP-IR4 | 2 | set | 899.00"
].join("\n");

const results = [];

const safeMessage = (value) => {
  return String(value || "").replace(/AIza[0-9A-Za-z_-]{10,}/g, "[redacted]");
};

const record = (name, ok, detail) => {
  results.push({ name, ok, detail: safeMessage(detail) });
};

const expectError = async (name, work, code) => {
  try {
    await work();
    record(name, false, "no error");
  } catch (error) {
    const extractionError = error instanceof ExtractionError;
    record(
      name,
      extractionError && error.code === code,
      extractionError ? `${error.code}: ${error.message}` : error.message
    );
  }
};

const run = async () => {
  const originalProvider = process.env.PO_EXTRACTION_PROVIDER;
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;

  try {
    process.env.PO_EXTRACTION_PROVIDER = "mock";
    const mockResult = await extractPurchaseOrder(SAMPLE);
    record(
      "mock provider",
      mockResult.mock === true
        && mockResult.provider === "mock"
        && mockResult.notice.includes("not real AI")
        && mockResult.data.po_number === "PO-1002"
        && mockResult.data.items.length === 3
        && mockResult.data.items[0].sku === "BNC-BP-FR-01"
        && mockResult.data.items[0].quantity === 2
        && mockResult.data.items[0].unit_price === "500.00",
      `${mockResult.provider} items=${mockResult.data.items.length}`
    );

    await expectError(
      "validation rejects empty items",
      async () => normalizeGeminiPurchaseOrder({
        po_number: "PO-1002",
        supplier_name: "ABC Motors",
        po_date: "2026-11-16",
        currency: "INR",
        items: []
      }),
      "VALIDATION"
    );

    await expectError(
      "validation rejects quantity zero",
      async () => normalizeGeminiPurchaseOrder({
        po_number: "PO-1002",
        supplier_name: "ABC Motors",
        po_date: "2026-11-16",
        currency: "INR",
        items: [{
          line_number: 1,
          product_name: "Front Ceramic Brake Pad Set",
          sku: "BNC-BP-FR-01",
          quantity: 0,
          unit: "set",
          unit_price: 500
        }]
      }),
      "VALIDATION"
    );

    const cleaned = normalizeGeminiPurchaseOrder({
      po_number: "PO-1002",
      supplier_name: "ABC Motors",
      po_date: "2026-11-16",
      currency: "inr",
      items: [{
        line_number: "1",
        product_name: "Front Ceramic Brake Pad Set",
        sku: "",
        quantity: 2,
        unit: "set",
        unit_price: 500,
        product_id: 99,
        match_score: 1
      }]
    });
    record(
      "model product ids are ignored",
      cleaned.items[0].sku === null
        && cleaned.items[0].unit_price === "500.00"
        && !Object.prototype.hasOwnProperty.call(cleaned.items[0], "product_id")
        && !Object.prototype.hasOwnProperty.call(cleaned.items[0], "match_score"),
      cleaned.items[0].sku === null ? "sku null" : "sku present"
    );

    await expectError(
      "invalid JSON is rejected",
      async () => parseGeminiContent("{not json"),
      "PARSE_FAILED"
    );

    process.env.PO_EXTRACTION_PROVIDER = "gemini";
    delete process.env.GEMINI_API_KEY;
    await expectError(
      "missing Gemini key makes no request",
      async () => extractPurchaseOrder(SAMPLE),
      "PROVIDER_UNAVAILABLE"
    );

    process.env.GEMINI_API_KEY = originalKey;
    delete process.env.GEMINI_MODEL;
    await expectError(
      "missing Gemini model makes no request",
      async () => extractPurchaseOrder(SAMPLE),
      "PROVIDER_UNAVAILABLE"
    );

    process.env.GEMINI_MODEL = originalModel;
    const keyConfigured = typeof originalKey === "string" && originalKey.trim().length > 0;
    const modelConfigured = typeof originalModel === "string" && originalModel.trim().length > 0;

    if (!keyConfigured || !modelConfigured) {
      record("live Gemini extraction", false, "not run because Gemini is not configured");
      return;
    }

    try {
      const live = await extractPurchaseOrder(SAMPLE);
      const items = live.data.items.map((item) => ({
        product_name: item.product_name,
        sku: item.sku,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price
      }));
      const expected = [
        ["Front Ceramic Brake Pad Set", "BNC-BP-FR-01", 2, "set", "500.00"],
        ["Spin-On Engine Oil Filter", "BNC-OF-220", 3, "pcs", "349.00"],
        ["Iridium Spark Plug Set", "BNC-SP-IR4", 2, "set", "899.00"]
      ];
      record(
        "live Gemini extraction",
        live.mock === false
          && live.provider === "gemini"
          && live.notice.includes("Google Gemini")
          && live.data.po_number === "PO-1002"
          && live.data.supplier_name === "ABC Motors"
          && live.data.po_date === "2026-11-16"
          && live.data.currency === "INR"
          && items.length === 3
          && expected.every((row, index) => {
            const item = items[index];
            return item
              && item.product_name === row[0]
              && item.sku === row[1]
              && item.quantity === row[2]
              && item.unit === row[3]
              && item.unit_price === row[4];
          }),
        JSON.stringify({
          provider: live.provider,
          mock: live.mock,
          po_number: live.data.po_number,
          supplier_name: live.data.supplier_name,
          po_date: live.data.po_date,
          currency: live.data.currency,
          items
        })
      );
    } catch (error) {
      record(
        "live Gemini extraction",
        false,
        error instanceof ExtractionError ? `${error.code}: ${error.message}` : "request failed"
      );
    }
  } finally {
    if (originalProvider === undefined) {
      delete process.env.PO_EXTRACTION_PROVIDER;
    } else {
      process.env.PO_EXTRACTION_PROVIDER = originalProvider;
    }
    if (originalKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalKey;
    }
    if (originalModel === undefined) {
      delete process.env.GEMINI_MODEL;
    } else {
      process.env.GEMINI_MODEL = originalModel;
    }
  }
};

run()
  .then(() => {
    console.log(JSON.stringify({ results }, null, 2));
    if (results.some((result) => !result.ok)) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.log(JSON.stringify({ error: safeMessage(error.message) }));
    process.exitCode = 1;
  });
