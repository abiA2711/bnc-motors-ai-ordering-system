const hidePdfPolyfillMessage = (args) => {
  const message = args.map((value) => String(value)).join(" ");
  return message.includes("Cannot polyfill `DOMMatrix`") || message.includes("Cannot polyfill `Path2D`");
};

const originalWarn = console.warn;
console.warn = (...args) => {
  if (hidePdfPolyfillMessage(args)) {
    return;
  }

  originalWarn.apply(console, args);
};

const originalLog = console.log;
console.log = (...args) => {
  if (hidePdfPolyfillMessage(args)) {
    return;
  }

  originalLog.apply(console, args);
};
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");

const NO_TEXT_MESSAGE =
  "This PDF has no extractable text. Scanned PDF OCR is not supported yet.";
const UNREADABLE_MESSAGE = "The PDF could not be read. No text was extracted.";
const MAX_TEXT_LENGTH = 100000;
const MAX_PAGES = 20;

class PdfExtractionError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const readPageText = async (document, pageNumber) => {
  const page = await document.getPage(pageNumber);
  const content = await page.getTextContent();
  let text = "";
  let lastY = null;

  content.items.forEach((item) => {
    if (!item || typeof item.str !== "string" || item.str.length === 0) {
      return;
    }

    const y = item.transform ? item.transform[5] : null;

    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
      text += `\n${item.str}`;
    } else if (text.length > 0 && !text.endsWith("\n") && !item.str.startsWith(" ")) {
      text += item.str;
    } else {
      text += item.str;
    }

    if (y !== null) {
      lastY = y;
    }
  });

  return text;
};

const extractPdfText = async (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5 || buffer.subarray(0, 5).toString("utf8") !== "%PDF-") {
    throw new PdfExtractionError("PDF_INVALID", "Only PDF files are allowed");
  }

  let document;

  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      isEvalSupported: false,
      verbosity: 0
    });
    document = await loadingTask.promise;
    const pageCount = Math.min(document.numPages, MAX_PAGES);
    let text = "";

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      text += `${await readPageText(document, pageNumber)}\n`;
    }

    text = text.replace(/\u0000/g, "").trim();

    if (!text) {
      throw new PdfExtractionError("PDF_NO_TEXT", NO_TEXT_MESSAGE);
    }

    if (text.length > MAX_TEXT_LENGTH) {
      throw new PdfExtractionError("PDF_TEXT_TOO_LARGE", "The PDF text is too large to process.");
    }

    return text;
  } catch (error) {
    if (error instanceof PdfExtractionError) {
      throw error;
    }

    throw new PdfExtractionError("PDF_READ_FAILED", UNREADABLE_MESSAGE);
  } finally {
    if (document) {
      await document.destroy();
    }
  }
};

module.exports = {
  extractPdfText,
  PdfExtractionError,
  NO_TEXT_MESSAGE,
  UNREADABLE_MESSAGE
};
